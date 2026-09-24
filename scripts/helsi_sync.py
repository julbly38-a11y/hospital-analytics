#!/usr/bin/env python3
"""
helsi_sync.py — повний автоматичний цикл helsi.pro -> lpz-канон для ЛШМД (43342788).

Єдина умова: у Chrome є сесія helsi.pro під ЛШМД (логін робить користувач; скрипт
пароль не вводить і не бачить). Якщо сесії нема — скрипт чекає, поки ви залогінитесь.

Кроки (кожен можна пропустити через --skip):
  extract        вивантаження з helsi (закриті/відкриті картки, епізоди, результат лікування)
  load_raw       JSON -> lpz_raw_hospitalizations_closed/open, lpz_raw_episodes
  load_disp      результат лікування -> lpz_raw_discharge_disposition
  canon          scripts/sql/raw_to_canon_{hospitalizations,episodes,patients_enrich,discharge_disposition}.sql
                 (кожен спершу в ROLLBACK, потім COMMIT)
  verify         фінальні перевірки канону

Запуск:
  python3 scripts/helsi_sync.py                     # повний цикл
  python3 scripts/helsi_sync.py --dry-run           # усе, крім запису в БД (SQL — лише ROLLBACK)
  python3 scripts/helsi_sync.py --skip extract,load_raw   # лише SQL-частина з файлів, що вже на диску
  python3 scripts/helsi_sync.py --transport manual  # без AppleScript: скрипт покаже, що вставити в консоль helsi
  python3 scripts/helsi_sync.py --transport claude  # Claude відкриває вкладку helsi у своїй сесії Chrome, ви лише логінитесь у ній

Транспорт «applescript» (за замовчуванням, якщо доступний) потребує ОДИН раз увімкнути в Chrome:
  Перегляд -> Для розробників -> Дозволити JavaScript від подій Apple.
Без цього автоматично перемикається на «manual».

Захист: скрипт працює лише з БД проєкту qwerty (ubjnztanehqlsrqphdqy), лише з org 43342788;
нові файли спершу валідуються (кількість не менша 90% від попереднього знімку) і лише потім
замінюють старі (попередні копіюються в raw/lsmd/_prev_<дата>).

Виключення (не змінювати без користувача): у raw_to_canon_hospitalizations.sql свідомо
відрізані госпіталізації ЛШМД за квітень-травень 2026 (артефакт запуску «Стаціонару»).
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
from datetime import datetime
from pathlib import Path

ORG = "43342788"
EXPECTED_DB_REF = "ubjnztanehqlsrqphdqy"
REPO = Path(__file__).resolve().parent.parent
SQL_DIR = REPO / "scripts" / "sql"
RAW_DIR = Path("~/Documents/LSMD/raw/lsmd").expanduser()
LOG_DIR = Path("~/Documents/LSMD/logs").expanduser()
DBURL_FILE = Path(os.environ.get("HELSI_SYNC_DBURL_FILE", "~/hospital-analytics/db-export/.dburl")).expanduser()
PORT = int(os.environ.get("HELSI_SYNC_PORT", "8765"))
HELSI_HOME = "https://helsi.pro/hospital-booking"

# ім'я набору з браузера -> (файл на диску, мінімальна частка від попереднього знімку)
DATASETS = {
    "closed": "hospitalizations_closed_2026.json",
    "open": "hospitalizations_open.json",
    "episodes": "episodes.json",
    "disp": "discharge_disposition_2026.json",
}
MIN_RATIO = {"closed": 0.9, "open": 0.5, "episodes": 0.9, "disp": 0.9}  # відкритих природно може бути менше

STEPS = ["extract", "load_raw", "load_disp", "canon", "verify"]
CANON_SQL = [
    "raw_to_canon_hospitalizations.sql",
    "raw_to_canon_episodes.sql",
    "raw_to_canon_patients_enrich.sql",
    "raw_to_canon_discharge_disposition.sql",
]

_log_fh = None


def log(msg=""):
    line = f"[{datetime.now():%H:%M:%S}] {msg}"
    print(line, flush=True)
    if _log_fh:
        _log_fh.write(line + "\n")
        _log_fh.flush()


def die(msg):
    log(f"ПОМИЛКА: {msg}")
    sys.exit(1)


# ───────────────────────── БД / psql ─────────────────────────

def find_psql():
    p = shutil.which("psql") or "/opt/homebrew/opt/libpq/bin/psql"
    if not Path(p).exists():
        die("psql не знайдено (brew install libpq)")
    return p


def db_url():
    env = os.environ.get("HELSI_SYNC_DB_URL")
    if env:
        url = env.strip()
    elif DBURL_FILE.exists():
        url = DBURL_FILE.read_text().strip()
    else:
        die(f"нема рядка підключення до БД ({DBURL_FILE} або HELSI_SYNC_DB_URL)")
    if EXPECTED_DB_REF not in url:
        die(f"рядок підключення не веде на проєкт qwerty ({EXPECTED_DB_REF}) — зупинка для безпеки")
    return url


def psql(args, stdin=None, check=True):
    cmd = [find_psql(), db_url(), "-X", "-q", "-v", "ON_ERROR_STOP=1"] + args
    r = subprocess.run(cmd, input=stdin, capture_output=True, text=True)
    if check and r.returncode != 0:
        die(f"psql: {r.stderr.strip() or r.stdout.strip()}")
    return r


def query(sql):
    r = psql(["-At", "-F", "|", "-c", sql])
    return [line.split("|") for line in r.stdout.strip().splitlines() if line]


def run_sql_file(path, commit):
    text = path.read_text()
    has_tx = re.search(r"^\s*BEGIN;", text, re.M) and re.search(r"^\s*COMMIT;", text, re.M)
    end = "COMMIT" if commit else "ROLLBACK"
    if has_tx:
        body = text if commit else re.sub(r"^\s*COMMIT;", "ROLLBACK;", text, flags=re.M)
    else:
        body = f"BEGIN;\n{text}\n{end};\n"
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as f:
        f.write(body)
        tmp = f.name
    try:
        r = psql(["-f", tmp])
    finally:
        os.unlink(tmp)
    return r.stdout.strip()


# ───────────────────────── приймач даних з браузера ─────────────────────────

class Receiver:
    def __init__(self, token, incoming):
        self.token, self.incoming, self.received = token, incoming, {}
        outer = self

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _cors(self):
                self.send_header("Access-Control-Allow-Origin", "https://helsi.pro")
                self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
                self.send_header("Access-Control-Allow-Private-Network", "true")

            def do_OPTIONS(self):
                self.send_response(204)
                self._cors()
                self.end_headers()

            def do_POST(self):
                from urllib.parse import urlparse, parse_qs
                q = parse_qs(urlparse(self.path).query)
                name, tok = (q.get("name") or [""])[0], (q.get("token") or [""])[0]
                if tok != outer.token or name not in DATASETS:
                    self.send_response(403)
                    self._cors()
                    self.end_headers()
                    return
                n = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(n)
                try:
                    data = json.loads(raw)
                    (outer.incoming / DATASETS[name]).write_bytes(raw)
                    outer.received[name] = len(data["data"] if isinstance(data, dict) else data)
                    code = 200
                except Exception:
                    code = 400
                self.send_response(code)
                self._cors()
                self.end_headers()
                self.wfile.write(b"{}")

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def stop(self):
        self.server.shutdown()


# ───────────────────────── Chrome (AppleScript) ─────────────────────────

def osa(script):
    r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()


def chrome_js_allowed():
    rc, out, err = osa('tell application "Google Chrome" to return (count of windows)')
    if rc != 0:
        return False
    rc, out, err = osa('tell application "Google Chrome" to execute (active tab of front window) javascript "1+1"')
    return rc == 0 and out == "2"


def chrome_exec(tab_ref, js):
    """tab_ref = (window_id, tab_id). Повертає рядок результату або кидає RuntimeError."""
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
        f.write(js)
        tmp = f.name
    wid, tid = tab_ref
    script = f'''
set jsCode to (do shell script "cat " & quoted form of "{tmp}" without altering line endings)
tell application "Google Chrome"
  repeat with w in windows
    if (id of w) is {wid} then
      repeat with t in tabs of w
        if (id of t) is {tid} then return execute t javascript jsCode
      end repeat
    end if
  end repeat
end tell
return "NO_TAB"
'''
    try:
        rc, out, err = osa(script)
    finally:
        os.unlink(tmp)
    if rc != 0:
        raise RuntimeError(err)
    return out


def chrome_find_helsi_tab():
    script = '''
tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) starts with "https://helsi.pro/" then return ((id of w) as text) & "," & ((id of t) as text)
    end repeat
  end repeat
end tell
return ""
'''
    rc, out, _ = osa(script)
    return tuple(int(x) for x in out.split(",")) if rc == 0 and "," in out else None


def chrome_open_tab():
    script = f'''
tell application "Google Chrome"
  if (count of windows) is 0 then make new window
  set w to front window
  set t to make new tab at end of tabs of w with properties {{URL:"{HELSI_HOME}"}}
  return ((id of w) as text) & "," & ((id of t) as text)
end tell
'''
    rc, out, err = osa(script)
    if rc != 0:
        raise RuntimeError(err)
    return tuple(int(x) for x in out.split(","))


def chrome_close_tab(tab_ref):
    wid, tid = tab_ref
    osa(f'''tell application "Google Chrome"
  repeat with w in windows
    if (id of w) is {wid} then
      repeat with t in tabs of w
        if (id of t) is {tid} then close t
      end repeat
    end if
  end repeat
end tell''')


LOGIN_CHECK_JS = ("(function(){try{if(location.hostname!=='helsi.pro')return 'OFF:'+location.hostname;"
                  "var x=new XMLHttpRequest();x.open('GET','/api/hospital/api/v1/encounter_cases/?limit=1',false);"
                  "x.withCredentials=true;x.send();return 'S:'+x.status;}catch(e){return 'ERR:'+e}})()")


def wait_for_login(tab, timeout):
    t0, told = time.time(), False
    while time.time() - t0 < timeout:
        try:
            res = chrome_exec(tab, LOGIN_CHECK_JS)
        except RuntimeError as e:
            res = f"ERR:{e}"
        if res == "S:200":
            return True
        if not told:
            log(f"Сесія helsi не активна ({res}). Залогіньтесь у вкладці helsi.pro — чекаю до {timeout // 60} хв…")
            told = True
        time.sleep(5)
    return False


# ───────────────────────── крок extract ─────────────────────────

def validate_and_promote(incoming, stamp):
    """Порівнює нові файли з поточними; лише якщо все ок — робить копію старих і підміняє."""
    problems, info = [], {}
    for name, fname in DATASETS.items():
        new_p, old_p = incoming / fname, RAW_DIR / fname
        if not new_p.exists():
            problems.append(f"{name}: файл не отримано")
            continue
        new = json.loads(new_p.read_text())
        new_rows = new["data"] if isinstance(new, dict) else new
        old_n = None
        if old_p.exists():
            old = json.loads(old_p.read_text())
            old_n = len(old["data"] if isinstance(old, dict) else old)
        info[name] = (len(new_rows), old_n)
        if not new_rows:
            problems.append(f"{name}: порожній набір")
        elif old_n and len(new_rows) < old_n * MIN_RATIO[name]:
            problems.append(f"{name}: {len(new_rows)} рядків проти {old_n} раніше (поріг {int(MIN_RATIO[name]*100)}%) — схоже на неповне вивантаження")
    for name, (n, o) in info.items():
        log(f"  {name:9s} нових={n:6d}  було={o if o is not None else '—'}")
    if problems:
        die("валідація не пройдена, старі файли НЕ чіпаю:\n  - " + "\n  - ".join(problems))
    prev = RAW_DIR / f"_prev_{stamp}"
    prev.mkdir(parents=True, exist_ok=True)
    for fname in DATASETS.values():
        if (RAW_DIR / fname).exists():
            shutil.copy2(RAW_DIR / fname, prev / fname)
        shutil.move(str(incoming / fname), str(RAW_DIR / fname))
    log(f"  попередні файли збережено: {prev}")
    old_prevs = sorted(p for p in RAW_DIR.glob("_prev_*") if p.is_dir())
    for p in old_prevs[:-3]:  # лишаємо 3 останні резервні копії
        shutil.rmtree(p, ignore_errors=True)
        log(f"  прибрано стару резервну копію: {p.name}")


def step_extract(args, stamp):
    js = (REPO / "scripts" / "helsi_sync_extract.js").read_text(encoding="utf-8")
    token = secrets.token_hex(8)
    js = js.replace("__PORT__", str(PORT)).replace("__TOKEN__", token)
    incoming = Path(tempfile.mkdtemp(prefix="helsi_sync_"))
    rx = Receiver(token, incoming)
    tab, created = None, False
    try:
        transport = args.transport
        if transport == "auto":
            transport = "applescript" if chrome_js_allowed() else "manual"
            if transport == "manual":
                log("AppleScript-керування Chrome вимкнене → режим manual "
                    "(щоб було повністю автоматично: Chrome → Перегляд → Для розробників → Дозволити JavaScript від подій Apple)")
        log(f"extract: транспорт = {transport}")

        if transport == "applescript":
            tab = chrome_find_helsi_tab()
            if tab and chrome_exec(tab, LOGIN_CHECK_JS) != "S:200":
                tab = None
            if not tab:
                tab, created = chrome_open_tab(), True
                time.sleep(6)
            if not wait_for_login(tab, args.login_timeout):
                die("сесія helsi так і не стала активною")
            log("Сесія helsi активна, запускаю вивантаження…")
            out = chrome_exec(tab, js)
            if out not in ("started", "already running"):
                die(f"не вдалося запустити вивантаження у вкладці: {out}")
            t0 = time.time()
            while time.time() - t0 < args.extract_timeout:
                time.sleep(10)
                try:
                    st = json.loads(chrome_exec(tab, "JSON.stringify(window.__helsiSync)"))
                except Exception as e:
                    log(f"  (опитування: {e})")
                    continue
                log(f"  closed={st['closed']} open={st['open']} episodes={st['episodes']} disp={st['disp']} "
                    f"надіслано={list(st['sent'])} помилки={st['err'] or '—'}")
                if st["err"]:
                    die(f"помилка вивантаження в браузері: {st['err']}")
                if st["done"] and len(rx.received) == len(DATASETS):
                    break
            else:
                die("таймаут вивантаження")
        else:
            snippet = Path("/tmp/helsi_sync_snippet.js")
            snippet.write_text(js)
            if transport == "claude":
                log(f"claude-режим: фрагмент JS у {snippet}; Claude виконує його у вкладці helsi.pro своєї сесії Chrome.")
            else:
                try:
                    subprocess.run(["pbcopy"], input=js, text=True)
                    log("Фрагмент JS СКОПІЙОВАНО В БУФЕР ОБМІНУ (також у " + str(snippet) + ").")
                except Exception:
                    log(f"Фрагмент збережено в {snippet}")
                log("Зробіть: відкрийте https://helsi.pro (залогінені як ЛШМД) → F12 → Console → вставте (⌘V) → Enter.")
            log("Скрипт чекає на дані…")
            t0 = time.time()
            while time.time() - t0 < args.extract_timeout:
                time.sleep(10)
                log(f"  отримано: {rx.received or '—'}")
                if len(rx.received) == len(DATASETS):
                    break
            else:
                die("таймаут очікування даних")
        log("Усі набори отримано, валідую…")
        validate_and_promote(incoming, stamp)
    finally:
        rx.stop()
        if tab and created:
            chrome_close_tab(tab)
        shutil.rmtree(incoming, ignore_errors=True)


# ───────────────────────── крок load_raw / load_disp ─────────────────────────

def step_load_raw():
    files = [str(RAW_DIR / DATASETS[k]) for k in ("closed", "open", "episodes")]
    log("load_raw: JSON → lpz_raw_* (це кілька хвилин)…")
    r = subprocess.run([sys.executable, str(REPO / "scripts" / "load_all_raw.py"), *files, "--org-edrpou", ORG],
                       capture_output=True, text=True)
    tail = "\n".join((r.stdout or "").strip().splitlines()[-6:])
    log(tail)
    if r.returncode != 0 or "FAIL" in (r.stdout or ""):
        die(f"load_all_raw не завершився успішно:\n{r.stderr[-800:]}")


def step_load_disp():
    path = RAW_DIR / DATASETS["disp"]
    log("load_disp: результат лікування → lpz_raw_discharge_disposition…")
    sql = f"""
CREATE TABLE IF NOT EXISTS lpz.lpz_raw_discharge_disposition (
  org_edrpou text NOT NULL, helsi_record_id uuid NOT NULL, number text, disposition_id int,
  loaded_at timestamptz DEFAULT now(), PRIMARY KEY (org_edrpou, helsi_record_id));
\\set content `cat '{path}'`
INSERT INTO lpz.lpz_raw_discharge_disposition (org_edrpou, helsi_record_id, number, disposition_id)
SELECT '{ORG}', (e->>'id')::uuid, e->>'number', NULLIF(e->>'disp','')::int
FROM json_array_elements(:'content'::json) e
ON CONFLICT (org_edrpou, helsi_record_id) DO UPDATE
  SET number = EXCLUDED.number, disposition_id = EXCLUDED.disposition_id, loaded_at = now();
SELECT count(*) AS raw_disp_rows, count(disposition_id) AS with_value FROM lpz.lpz_raw_discharge_disposition WHERE org_edrpou = '{ORG}';
"""
    r = psql([], stdin=sql)
    log(r.stdout.strip())


# ───────────────────────── крок canon ─────────────────────────

def step_canon(dry_run):
    for name in CANON_SQL:
        path = SQL_DIR / name
        if not path.exists():
            die(f"нема {path}")
        log(f"canon: {name} — пробний прогін (ROLLBACK)…")
        out = run_sql_file(path, commit=False)
        log(out)
        if dry_run:
            continue
        log(f"canon: {name} — застосовую (COMMIT)…")
        run_sql_file(path, commit=True)


# ───────────────────────── крок verify ─────────────────────────

def step_verify():
    log("verify: перевірки канону…")
    bad = []
    r = query(f"select max(admission_date), count(*) from lpz.lpz_hospitalizations where org_edrpou='{ORG}'")[0]
    log(f"  госпіталізацій: {r[1]}, остання admission_date = {r[0]}")
    lag = (datetime.now().date() - datetime.strptime(r[0], "%Y-%m-%d").date()).days
    if lag > 2:
        bad.append(f"канон відстає на {lag} дн.")
    n = int(query(f"select count(*) from lpz.lpz_hospitalizations where org_edrpou='{ORG}' "
                  "and admission_date >= '2026-04-01' and admission_date < '2026-06-01'")[0][0])
    log(f"  квітень–травень 2026 у каноні: {n} (має бути 0)")
    if n:
        bad.append(f"квітень–травень повернувся в канон: {n}")
    n = int(query(f"select count(*) from lpz.lpz_hospitalizations where org_edrpou='{ORG}' and helsi_record_id is not null "
                  "and age is null and birth_date is not null")[0][0])
    log(f"  рядків з birth_date, але без age: {n} (має бути 0)")
    if n:
        bad.append(f"age порожній у {n} рядках")
    r = query(f"select count(*) filter (where status='Закритий'), count(*) filter (where status='Закритий' and discharge_disposition_id is null) "
              f"from lpz.lpz_hospitalizations where org_edrpou='{ORG}' and admission_date >= '2026-01-01'")[0]
    log(f"  закритих у 2026: {r[0]}, без результату лікування: {r[1]}")
    if bad:
        log("УВАГА, перевірки виявили проблеми:\n  - " + "\n  - ".join(bad))
        return False
    log("Усі перевірки пройдено.")
    return True


# ───────────────────────── main ─────────────────────────

def main():
    global _log_fh
    ap = argparse.ArgumentParser(description="Повний цикл helsi.pro → lpz (ЛШМД)")
    ap.add_argument("--dry-run", action="store_true", help="не писати в БД: raw не вантажиться, SQL лише ROLLBACK")
    ap.add_argument("--skip", default="", help=f"кроки, які пропустити: {','.join(STEPS)}")
    ap.add_argument("--transport", choices=["auto", "applescript", "manual", "claude"], default="auto")
    ap.add_argument("--login-timeout", type=int, default=900, help="сек очікування логіну користувача")
    ap.add_argument("--extract-timeout", type=int, default=1200, help="сек на вивантаження")
    args = ap.parse_args()
    skip = {s.strip() for s in args.skip.split(",") if s.strip()}
    unknown = skip - set(STEPS)
    if unknown:
        die(f"невідомі кроки в --skip: {unknown}")

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    _log_fh = open(LOG_DIR / f"helsi_sync_{stamp}.log", "a", encoding="utf-8")
    log(f"helsi_sync для org {ORG}; dry-run={args.dry_run}; пропуск={sorted(skip) or '—'}")
    db_url()  # рання перевірка підключення/проєкту
    log(f"БД: проєкт {EXPECTED_DB_REF} ✔, max(admission_date) до запуску = "
        f"{query(f'select max(admission_date) from lpz.lpz_hospitalizations where org_edrpou={chr(39)}{ORG}{chr(39)}')[0][0]}")
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    if "extract" not in skip:
        step_extract(args, stamp)
    if not args.dry_run:
        if "load_raw" not in skip:
            step_load_raw()
        if "load_disp" not in skip:
            step_load_disp()
    if "canon" not in skip:
        step_canon(args.dry_run)
    ok = True
    if "verify" not in skip:
        ok = step_verify()
    log(f"Готово. Журнал: {LOG_DIR / f'helsi_sync_{stamp}.log'}")
    sys.exit(0 if ok else 2)


if __name__ == "__main__":
    main()
