#!/usr/bin/env python3
"""
helsi_evening.py — вечірній прогін активності/якості ЛШМД (43342788).

Що робить: запускає scripts/helsi_quality_daily.js у вкладці helsi.pro (ПОВНИЙ прогін
open+closed, 5 статусів) → результат іде на локальний dev-сервер
(pages/api/local-quality-ingest.js) → lpz_case_quality_snapshot (+ журнал змін hints.__track).
Наприкінці друкує звіт активності: що лікарі змінили/закрили/виправили від попереднього прогону.

Єдина умова — активна сесія helsi під ЛШМД (логін робить користувач; скрипт пароль не вводить
і, якщо сесії нема, чекає). ВАЖЛИВО: dev-сервер (`npm run dev`, порт 3000) має працювати —
ingest-ендпоінт навмисно вимкнено на проді.

Запуск:
  python3 scripts/helsi_evening.py                       # повний прогін
  python3 scripts/helsi_evening.py --dry-run             # зібрати й перевірити, НЕ писати в БД
  python3 scripts/helsi_evening.py --transport claude    # Claude відкриває вкладку helsi у своїй сесії Chrome
  python3 scripts/helsi_evening.py --transport manual    # JS у буфер обміну → вставити в консоль helsi.pro
  python3 scripts/helsi_evening.py --closed-since 2026-09-01 --concurrency 5

Транспорти (--transport, за замовчуванням auto = applescript → cdp → manual):
  cdp          скрипт сам запускає ОКРЕМИЙ Chrome зі своїм профілем (~/Library/Application Support/
               helsi-sync-chrome); вхід у helsi робите ОДИН раз у його вікні, далі — одна команда
               без консолі й без налаштувань. Дані забирає з вкладки сам і шле на dev-сервер.
  applescript  керує ВАШИМ Chrome; потрібно один раз увімкнути «Перегляд → Для розробників →
               Дозволити JavaScript від подій Apple».
  manual       JS у буфер обміну, вставити в консоль helsi.pro
  claude       Claude відкриває вкладку у своїй сесії Chrome
Режими cdp та applescript самі відновлюють прогін після обриву сесії helsi (продовження з
window.__qd); у claude/manual при обриві треба повторно виконати той самий фрагмент.

Не входить у цей прогін (окремі процеси): ранкова синхронізація канону — scripts/helsi_sync.py;
ціни НСЗУ для нових епізодів (collect_lpz_episode_facts.js / collect_package_validation.js).
"""

import argparse
import http.server
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import helsi_sync as hs  # спільний транспорт (Chrome/AppleScript), підключення до БД, журнал

ORG = hs.ORG
REPO = hs.REPO
LOG_DIR = hs.LOG_DIR
DEV_PORT = int(os.environ.get("HELSI_DEV_PORT", "3000"))
SINK_PORT = int(os.environ.get("HELSI_EVENING_PORT", "8766"))
INGEST_URL = f"http://localhost:{DEV_PORT}/api/local-quality-ingest"
log, die = hs.log, hs.die


# ───────────────────────── допоміжне ─────────────────────────

def ascii_js(src):
    """AppleScript псує не-ASCII: усі такі символи → \\uXXXX (валідно в рядках/шаблонах/коментарях JS)."""
    def esc(m):
        b = m.group().encode("utf-16-le")
        return "".join("\\u%04x" % int.from_bytes(b[i:i + 2], "little") for i in range(0, len(b), 2))
    return re.sub(r"[^\x00-\x7f]", esc, src)


def build_snippet(params):
    src = (REPO / "scripts" / "helsi_quality_daily.js").read_text(encoding="utf-8")
    return src + "\nwindow.runQualityDaily(" + json.dumps(params) + "); 'started'\n"


def dev_server_ok():
    try:
        req = urllib.request.Request(INGEST_URL, method="OPTIONS")
        return urllib.request.urlopen(req, timeout=5).status in (200, 204)
    except Exception:
        return False


def state_js():
    return ("(function(q){return JSON.stringify({stage:q.stage,listed:q.listed,detailed:q.detailed,total:q.total,"
            "done:q.done,err:q.err,result:q.result,resumed:q.resumed})})(window.__qd||{})")


def metrics():
    r = hs.query(
        "select count(*), count(*) filter (where is_open), count(*) filter (where cardinality(flags)+cardinality(warnings)>0), "
        "count(*) filter (where jsonb_array_length(coalesce(hints->'__track'->'history','[]'::jsonb))>0), "
        "coalesce(max(snapshot_at)::text,'—') "
        f"from lpz.lpz_case_quality_snapshot where org_edrpou='{ORG}'")[0]
    return {"total": int(r[0]), "open": int(r[1]), "with_remarks": int(r[2]), "with_history": int(r[3]), "last": r[4]}


# ───────────────────────── приймач для --dry-run ─────────────────────────

class Sink:
    """Замість dev-сервера: приймає payload з браузера, нічого не пише в БД."""

    def __init__(self, token, path, dry_run=True):
        self.token, self.path, self.payload, self.snippet = token, path, None, ""
        self.dry_run = dry_run  # False → приймач лише віддає фрагмент JS (payload іде на dev-сервер)
        outer = self

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _cors(self):
                self.send_header("Access-Control-Allow-Origin", "https://helsi.pro")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
                self.send_header("Access-Control-Allow-Private-Network", "true")

            def do_OPTIONS(self):
                self.send_response(204)
                self._cors()
                self.end_headers()

            def do_GET(self):
                # фрагмент JS для claude-режиму: fetch(...).then(r => r.text()).then(t => new Function(t)())
                if f"token={outer.token}" not in self.path or not self.path.startswith("/snippet.js"):
                    self.send_response(403)
                    self._cors()
                    self.end_headers()
                    return
                data = outer.snippet.encode("utf-8")
                self.send_response(200)
                self._cors()
                self.send_header("Content-Type", "text/javascript; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_POST(self):
                if f"token={outer.token}" not in self.path:
                    self.send_response(403)
                    self._cors()
                    self.end_headers()
                    return
                raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
                try:
                    outer.payload = json.loads(raw)
                    outer.path.write_bytes(raw)
                    body = json.dumps({"dry_run": True, "upserted": len(outer.payload.get("rows", []))}).encode()
                    code = 200
                except Exception:
                    body, code = b"{}", 400
                self.send_response(code)
                self._cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(body)

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", SINK_PORT), H)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def stop(self):
        self.server.shutdown()


# ───────────────────────── Chrome ─────────────────────────

def post_ingest(payload):
    """POST зі скрипта (не зі сторінки) на dev-сервер: {org, rows, runStartedAt} → {http, body}."""
    import urllib.error
    req = urllib.request.Request(INGEST_URL, data=json.dumps(payload).encode("utf-8"),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            return {"http": r.status, "body": json.loads(r.read() or b"null")}
    except urllib.error.HTTPError as e:
        return {"http": e.code, "body": e.read().decode("utf-8", "replace")[:500]}


def run_via_browser(args, params, sink, dump):
    """applescript / cdp: скрипт сам керує вкладкою helsi. Повертає {"result": ..., "payload": ...}."""
    tab, created = hs.acquire_tab(args.transport, args.login_timeout)
    js = ascii_js(build_snippet(params))
    try:
        log("Сесія helsi активна, запускаю прогін якості (це ~10–20 хв)…")
        out = hs.chrome_exec(tab, js)
        if out not in ("started", "already running"):
            die(f"не вдалося запустити прогін у вкладці: {out}")
        t0, attempts, last = time.time(), 0, None
        while time.time() - t0 < args.timeout:
            time.sleep(10)
            try:
                st = json.loads(hs.chrome_exec(tab, state_js()))
            except Exception as e:
                log(f"  (опитування: {e})")
                continue
            line = f"  етап={st.get('stage')} перелічено={st.get('listed')} деталі={st.get('detailed')}/{st.get('total')}"
            if line != last:
                log(line)
                last = line
            if st.get("done"):
                if st.get("err"):
                    attempts += 1
                    if attempts > args.max_resume:
                        die(f"прогін перервано помилкою й не вдалося відновити: {st['err']}")
                    log(f"Помилка в прогоні: {st['err']}. Відновлюю (спроба {attempts}/{args.max_resume}) — уже зібрані епізоди не перезапитуються.")
                    if not hs.wait_for_login(tab, args.login_timeout):
                        die("сесія helsi не відновилась")
                    hs.chrome_exec(tab, js)
                    continue
                if args.transport == "cdp":
                    log("Прогін у вкладці завершено, забираю результат через канал налагодження…")
                    payload = hs.cdp_pull_json(tab, "{org: window.__qd.org, rows: window.__qd.rows, runStartedAt: window.__qd.runStartedAt}")
                    if not payload.get("rows"):
                        die("у вкладці немає жодного епізоду (rows порожній) — нічого надсилати")
                    if args.dry_run:
                        dump.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
                        log(f"dry-run: дані збережено в {dump}, у БД нічого не надсилаю")
                        return {"result": None, "payload": payload}
                    log(f"Надсилаю {len(payload['rows'])} епізодів на dev-сервер…")
                    return {"result": post_ingest(payload), "payload": payload}
                return {"result": st.get("result"), "payload": None}
        die("таймаут прогону")
    finally:
        if created:
            hs.chrome_close_tab(tab)


def run_external(args, params, sink, start_iso):
    """claude / manual: браузер запускає хтось інший; чекаємо результат (sink або зміни в БД)."""
    snippet = Path("/tmp/helsi_evening_snippet.js")
    snippet.write_text(build_snippet(params), encoding="utf-8")
    if args.transport == "claude":
        sink.snippet = build_snippet(params)
        log(f"claude-режим: фрагмент JS віддає приймач; у вкладці helsi.pro своєї сесії Chrome Claude виконує:")
        log(f"  fetch('http://localhost:{SINK_PORT}/snippet.js?token={sink.token}').then(r=>r.text()).then(t=>new Function(t)())")
        log("(потім опитує window.__qd; при обриві сесії — повторно виконує цей самий рядок: прогін продовжиться)")
    else:
        try:
            subprocess.run(["pbcopy"], input=build_snippet(params), text=True)
            log(f"Фрагмент JS СКОПІЙОВАНО В БУФЕР ОБМІНУ (також у {snippet}).")
        except Exception:
            log(f"Фрагмент збережено в {snippet}")
        log("Зробіть: відкрийте https://helsi.pro (залогінені як ЛШМД) → F12 → Console → вставте (⌘V) → Enter.")
    log("Скрипт чекає на завершення…")
    t0, stable, last_cnt = time.time(), 0, None
    while time.time() - t0 < args.timeout:
        time.sleep(15)
        if sink is not None and sink.dry_run:
            if sink.payload is not None:
                return {"http": 200, "body": {"dry_run": True}}
            continue
        r = hs.query(f"select count(*) from lpz.lpz_case_quality_snapshot where org_edrpou='{ORG}' and snapshot_at >= '{start_iso}'")[0]
        cnt = int(r[0])
        log(f"  оновлено рядків у знімку: {cnt}")
        if cnt > 0 and cnt == last_cnt:
            stable += 1
            if stable >= 2:
                time.sleep(15)  # ingest ще видаляє застарілі відкриті — дати закінчити
                return None
        else:
            stable = 0
        last_cnt = cnt
    die("таймаут очікування: даних немає (можливо, сесія helsi завершилась — виконайте фрагмент ще раз, він продовжить)")


# ───────────────────────── звіт ─────────────────────────

def activity_report(start_iso):
    log("─── Звіт активності за цей прогін ───")
    ev = hs.query(
        "select c->>'field', count(*) from lpz.lpz_case_quality_snapshot s, "
        "jsonb_array_elements(coalesce(s.hints->'__track'->'history','[]'::jsonb)) e, jsonb_array_elements(e->'changes') c "
        f"where s.org_edrpou='{ORG}' and (e->>'at')::timestamptz >= '{start_iso}' group by 1 order by 2 desc")
    names = {"primary": "основний діагноз", "dx_codes": "діагнози", "procs_count": "втручання/процедури",
             "operations_count": "операції", "doctor": "лікуючий лікар", "disposition": "результат лікування",
             "discharge_status": "статус виписки", "is_open": "відкритий→закритий (виписано)"}
    total_events = sum(int(x[1]) for x in ev)
    log(f"  подій змін: {total_events}")
    for f, n in ev:
        log(f"    • {names.get(f, f)}: {n}")
    r = hs.query(
        f"select count(distinct s.id), count(*) filter (where (e->>'after_close')::boolean) "
        "from lpz.lpz_case_quality_snapshot s, "
        "jsonb_array_elements(coalesce(s.hints->'__track'->'history','[]'::jsonb)) e "
        f"where s.org_edrpou='{ORG}' and (e->>'at')::timestamptz >= '{start_iso}'")[0]
    log(f"  епізодів зі змінами: {r[0]}; з них виправлень ПІСЛЯ виписки (події): {r[1]}")
    closed = hs.query(
        "select count(distinct s.id) from lpz.lpz_case_quality_snapshot s, "
        "jsonb_array_elements(coalesce(s.hints->'__track'->'history','[]'::jsonb)) e, jsonb_array_elements(e->'changes') c "
        f"where s.org_edrpou='{ORG}' and (e->>'at')::timestamptz >= '{start_iso}' "
        "and c->>'field'='is_open' and c->'to'='false'::jsonb")[0][0]
    log(f"  закрито (виписано) з попереднього прогону: {closed}")
    r = hs.query(
        "select count(*) filter (where first_flagged_at >= '%s'), count(*) filter (where resolved_at >= '%s') "
        f"from lpz.lpz_case_quality_snapshot where org_edrpou='{ORG}'" % (start_iso, start_iso))[0]
    log(f"  нових зауважень: {r[0]}; виправлено (зауваження зникли): {r[1]}")
    top = hs.query(
        "select coalesce(s.doctor_name,'(без лікаря)'), count(distinct s.id) from lpz.lpz_case_quality_snapshot s, "
        "jsonb_array_elements(coalesce(s.hints->'__track'->'history','[]'::jsonb)) e "
        f"where s.org_edrpou='{ORG}' and (e->>'at')::timestamptz >= '{start_iso}' group by 1 order by 2 desc limit 10")
    if top:
        log("  найактивніші (епізодів зі змінами):")
        for name, n in top:
            log(f"    {n:4s}  {name}")


def dry_run_report(payload):
    rows = payload.get("rows", [])
    log("─── Пробний прогін: що було б записано (БД не змінювалась) ───")
    log(f"  епізодів у payload: {len(rows)} (відкритих {sum(1 for r in rows if r.get('is_open'))}, закритих {sum(1 for r in rows if not r.get('is_open'))})")
    with_rem = sum(1 for r in rows if r.get("flags") or r.get("warnings"))
    log(f"  із зауваженнями: {with_rem}")
    codes = {}
    for r in rows:
        for c in (r.get("flags") or []) + (r.get("warnings") or []):
            codes[c] = codes.get(c, 0) + 1
    for c, n in sorted(codes.items(), key=lambda x: -x[1])[:8]:
        log(f"    • {c}: {n}")
    ids = [r["case_id"] for r in rows if r.get("case_id")]
    known = 0
    for i in range(0, len(ids), 500):
        lst = ",".join("'%s'" % x for x in ids[i:i + 500] if re.fullmatch(r"[0-9a-f-]{36}", x))
        if lst:
            known += int(hs.query(f"select count(*) from lpz.lpz_case_quality_snapshot where org_edrpou='{ORG}' and helsi_case_id in ({lst})")[0][0])
    log(f"  уже є в знімку (буде оновлено): {known}; нових епізодів: {len(ids) - known}")


# ───────────────────────── main ─────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Вечірній прогін активності/якості helsi → lpz (ЛШМД)")
    ap.add_argument("--dry-run", action="store_true", help="не писати в БД: payload іде в локальний приймач і лише аналізується")
    ap.add_argument("--transport", choices=["auto", "applescript", "cdp", "manual", "claude"], default="auto",
                    help="auto: applescript (якщо дозволено) → cdp (окремий Chrome скрипта) → manual")
    ap.add_argument("--closed-since", help="закриті епізоди з цієї дати (YYYY-MM-DD); за замовч. — 1-ше число попереднього місяця")
    ap.add_argument("--concurrency", type=int, default=5)
    ap.add_argument("--login-timeout", type=int, default=900)
    ap.add_argument("--timeout", type=int, default=2700, help="сек на весь прогін")
    ap.add_argument("--max-resume", type=int, default=3, help="скільки разів відновлювати прогін після обриву (applescript)")
    args = ap.parse_args()

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    hs._log_fh = open(LOG_DIR / f"helsi_evening_{stamp}.log", "a", encoding="utf-8")
    log(f"helsi_evening для org {ORG}; dry-run={args.dry_run}; transport={args.transport}")
    hs.db_url()
    before = metrics()
    log(f"БД ✔. Знімок до запуску: епізодів {before['total']} (відкритих {before['open']}, із зауваженнями {before['with_remarks']}, "
        f"із журналом змін {before['with_history']}), останній знімок {before['last']}")

    transport = hs.pick_transport(args.transport)
    args.transport = transport
    log(f"транспорт = {transport}")

    sink = None
    token = secrets.token_hex(8)
    dump = Path("~/Documents/LSMD/raw/lsmd").expanduser() / f"quality_dryrun_{stamp}.json"
    if not args.dry_run and not dev_server_ok():
        die(f"dev-сервер не відповідає на {INGEST_URL}. Запустіть `npm run dev` (порт {DEV_PORT}) і повторіть — "
            "ingest-ендпоінт працює лише в dev-режимі.")
    if transport == "cdp":
        ingest = None  # сторінка нічого не шле: результат забирає й надсилає скрипт
    elif args.dry_run:
        sink = Sink(token, dump, dry_run=True)
        ingest = f"http://localhost:{SINK_PORT}/quality-ingest?token={token}"
        log(f"dry-run: дані підуть у локальний приймач, файл: {dump}")
    else:
        ingest = INGEST_URL
        if transport == "claude":
            sink = Sink(token, dump, dry_run=False)  # лише віддає фрагмент JS одним рядком

    params = {"org": ORG, "ingestUrl": ingest, "concurrency": args.concurrency}
    if args.closed_since:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.closed_since):
            die("--closed-since має бути YYYY-MM-DD")
        params["closedSince"] = args.closed_since

    start_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
    payload = None
    try:
        if transport in ("applescript", "cdp"):
            out = run_via_browser(args, params, sink, dump)
            result, payload = out["result"], out["payload"]
        else:
            result = run_external(args, params, sink, start_iso)
        if args.dry_run and payload is None and sink is not None:
            payload = sink.payload
        if args.dry_run and payload is None:
            die("прогін завершився, але дані не дійшли (dry-run)")
    finally:
        if sink:
            sink.stop()

    ok = True
    if args.dry_run:
        dry_run_report(payload)
        log("Готово (dry-run): у БД нічого не змінено.")
    else:
        body = (result or {}).get("body") if isinstance(result, dict) else None
        if body:
            log(f"Ingest: оновлено {body.get('upserted')} (відкритих {body.get('open')}, закритих {body.get('closed')}), "
                f"нових зауважень {body.get('newly_flagged')}, виправлено {body.get('resolved')}, "
                f"прибрано застарілих відкритих {body.get('removed_stale_open')}; "
                f"адресовано лікарю {body.get('addressed_to_doctor')}, завідувачу {body.get('addressed_to_head')}")
            # None = епізод без відділення в самому helsi (це дані, а не збій): лише повідомляємо.
            unmatched = [d for d in (body.get("dept_unmatched") or []) if d]
            if unmatched:
                log(f"УВАГА: відділення без відповідності в lpz_departments: {unmatched}")
                ok = False
            if None in (body.get("dept_unmatched") or []):
                n = hs.query(f"select count(*) from lpz.lpz_case_quality_snapshot where org_edrpou='{ORG}' "
                             f"and snapshot_at >= '{start_iso}' and department_name is null")[0][0]
                log(f"Увага (дані helsi, не збій): {n} епізодів без відділення в самому helsi (department_structure_id порожній)")
        elif isinstance(result, dict) and result.get("http") not in (None, 200):
            die(f"ingest відповів {result.get('http')}: {result}")
        after = metrics()
        log(f"Знімок після: епізодів {after['total']} (відкритих {after['open']}, із зауваженнями {after['with_remarks']}, "
            f"із журналом змін {after['with_history']})")
        upd = int(hs.query(f"select count(*) from lpz.lpz_case_quality_snapshot where org_edrpou='{ORG}' and snapshot_at >= '{start_iso}'")[0][0])
        if upd == 0:
            log("ПОМИЛКА: жоден рядок знімку не оновився")
            ok = False
        if before["open"] and after["open"] < 0.5 * before["open"]:
            log(f"УВАГА: відкритих стало {after['open']} проти {before['open']} — схоже на неповний прогін")
            ok = False
        activity_report(start_iso)
        log("Усі перевірки пройдено." if ok else "Є застереження — див. вище.")
    log(f"Журнал: {LOG_DIR / f'helsi_evening_{stamp}.log'}")
    sys.exit(0 if ok else 2)


if __name__ == "__main__":
    main()
