#!/usr/bin/env python3
"""
load_nszu_payments.py — виплати НСЗУ за програмою медичних гарантій -> lpz.lpz_nszu_payments.

Джерело: відкритий набір data.gov.ua «Оплати медичним закладам за ПМГ та іншими джерелами»
(payments_on_contracts_pmg_<рік>.csv, оновлюється щотижня). Файл великий (≈60 МБ, ≈140 тис. рядків, усі заклади
країни), тому відбираються лише заклади з lpz.lpz_organizations (або --orgs).

Запис у БД: DELETE рядків цих закладів за роки з файлу + COPY + перевірка кількості в ОДНІЙ транзакції
(через psql, як load_json_raw.py), тож повторний запуск безпечний, а обрив не лишає напівзавантаженого стану.

Запуск:
  python3 scripts/load_nszu_payments.py --dry-run                 # завантажить файл, покаже підсумок, нічого не запише
  python3 scripts/load_nszu_payments.py                           # завантажить і запише
  python3 scripts/load_nszu_payments.py --file /шлях/до.csv       # з локального файлу
  python3 scripts/load_nszu_payments.py --orgs 43288621,43342788  # лише ці заклади
"""

import argparse
import csv
import decimal
import os
import subprocess
import sys
import tempfile
import urllib.request
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
from load_json_raw import PgUnavailable, pg_target  # noqa: E402

D = decimal.Decimal
DEFAULT_URL = ("https://data.gov.ua/dataset/9ebd7456-2992-450f-bd9f-fdaf083bab20/resource/"
               "455986d6-89b0-4f66-90eb-b8e12967d055/download/payments_on_contracts_pmg_2026.csv")
SRC_COLS = ["legal_entity_edrpou", "period_month", "period_year", "package_id", "pay_package", "pay_all",
            "contract_number", "pay_date", "legal_entity_name", "doc_parent", "pay_type", "kekv", "referral"]
DB_COLS = ["org_edrpou", "period_year", "period_month", "package_id", "pay_package", "pay_all", "contract_number",
           "pay_date", "doc_parent", "pay_type", "kekv", "referral", "legal_entity_name", "source_file"]
KEY = ("org_edrpou", "doc_parent", "package_id", "period_year", "period_month", "pay_type", "pay_date")


def die(msg):
    print(f"ПОМИЛКА: {msg}", file=sys.stderr)
    sys.exit(1)


def psql_run(args, stdin=None):
    try:
        psql, url = pg_target()
    except PgUnavailable as e:
        die(f"нема прямого підключення до БД: {e}")
    r = subprocess.run([psql, url, "-X", "-q", "-v", "ON_ERROR_STOP=1"] + args, input=stdin, capture_output=True,
                       text=True, env={**os.environ, "PGCLIENTENCODING": "UTF8"})
    if r.returncode != 0:
        die((r.stderr or r.stdout).strip()[-600:])
    return r.stdout


def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "hospital-analytics/1.0"})
    with urllib.request.urlopen(req, timeout=300) as resp, open(dest, "wb") as f:
        total = 0
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            total += len(chunk)
        print(f"Завантажено {total / 1e6:.1f} МБ; Last-Modified: {resp.headers.get('Last-Modified', '—')}")


def main():
    ap = argparse.ArgumentParser(description="Виплати НСЗУ (data.gov.ua) -> lpz.lpz_nszu_payments")
    ap.add_argument("--file", help="локальний CSV (інакше завантажується за --url)")
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--orgs", help="ЄДРПОУ через кому (за замовчуванням усі з lpz.lpz_organizations)")
    ap.add_argument("--dry-run", action="store_true", help="нічого не писати в БД")
    args = ap.parse_args()

    orgs = [o.strip() for o in args.orgs.split(",")] if args.orgs else \
        [x for x in psql_run(["-At", "-c", "select edrpou from lpz.lpz_organizations order by 1"]).split() if x]
    if not orgs:
        die("порожній список закладів")
    print("Заклади:", ", ".join(orgs))

    tmp = Path(tempfile.mkdtemp(prefix="nszu_"))
    src = Path(args.file).expanduser() if args.file else tmp / "payments.csv"
    if not args.file:
        download(args.url, src)
    source_name = src.name if args.file else Path(args.url).name

    rows = []
    with open(src, encoding="utf-8", newline="") as f:
        rd = csv.DictReader(f)
        missing = [c for c in SRC_COLS if c not in (rd.fieldnames or [])]
        if missing:
            die(f"у файлі нема колонок: {missing}")
        for r in rd:
            if r["legal_entity_edrpou"] in orgs:
                rows.append({
                    "org_edrpou": r["legal_entity_edrpou"], "period_year": r["period_year"], "period_month": r["period_month"],
                    "package_id": r["package_id"], "pay_package": r["pay_package"], "pay_all": r["pay_all"],
                    "contract_number": r["contract_number"], "pay_date": r["pay_date"], "doc_parent": r["doc_parent"],
                    "pay_type": r["pay_type"], "kekv": r["kekv"], "referral": r["referral"],
                    "legal_entity_name": r["legal_entity_name"], "source_file": source_name})
    if not rows:
        die("у файлі нема рядків для цих закладів")

    # перевірки до запису
    keys = defaultdict(int)
    for r in rows:
        keys[tuple(r[k] for k in KEY)] += 1
        if not 1 <= int(r["period_month"]) <= 12:
            die(f"некоректний місяць: {r['period_month']}")
    dups = sum(1 for v in keys.values() if v > 1)
    if dups:
        die(f"{dups} ключів повторюються (org, документ, пакет, період, тип, дата) — запис зупинено")
    docs_sum, docs_all = defaultdict(D), {}
    for r in rows:
        k = (r["org_edrpou"], r["doc_parent"])
        docs_sum[k] += D(r["pay_package"])
        docs_all[k] = D(r["pay_all"])
    bad_docs = sum(1 for k in docs_sum if abs(docs_sum[k] - docs_all[k]) > D("0.05"))
    print(f"Рядків для закладів: {len(rows)}; платіжних документів: {len(docs_sum)}; "
          f"документів, де сума за пакетами ≠ pay_all: {bad_docs}")

    per_org = defaultdict(lambda: [0, D(0), set()])
    for r in rows:
        e = per_org[r["org_edrpou"]]
        e[0] += 1
        e[1] += D(r["pay_package"])
        e[2].add(int(r["period_month"]))
    for org in orgs:
        n, s, months = per_org.get(org, [0, D(0), set()])
        print(f"  {org}: рядків {n:4d} | місяці періоду {sorted(months) or '—'} | сума {s:>16,.2f} грн")

    years = sorted({int(r["period_year"]) for r in rows})
    if args.dry_run:
        print("--dry-run: у БД нічого не записано.")
        return

    out = tmp / "load.csv"
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(DB_COLS)
        for r in rows:
            w.writerow([r[c] for c in DB_COLS])
    q = lambda v: "'" + str(v).replace("'", "''") + "'"
    org_list = ", ".join(q(o) for o in orgs)
    sql = (
        "BEGIN;\n"
        "SET LOCAL statement_timeout = '300s';\n"
        f"DELETE FROM lpz.lpz_nszu_payments WHERE org_edrpou IN ({org_list}) AND period_year IN ({', '.join(map(str, years))});\n"
        f"\\copy lpz.lpz_nszu_payments ({', '.join(DB_COLS)}) FROM {q(out)} WITH (FORMAT csv, HEADER true)\n"
        "DO $chk$ BEGIN\n"
        f"  IF (SELECT count(*) FROM lpz.lpz_nszu_payments WHERE org_edrpou IN ({org_list}) AND period_year IN ({', '.join(map(str, years))})) <> {len(rows)} THEN\n"
        f"    RAISE EXCEPTION 'після COPY у таблиці не {len(rows)} рядків';\n"
        "  END IF;\n"
        "END $chk$;\n"
        "COMMIT;\n")
    sql_file = tmp / "load.sql"
    sql_file.write_text(sql, encoding="utf-8")
    psql_run(["-f", str(sql_file)])
    print(f"Готово: {len(rows)} рядків у lpz.lpz_nszu_payments (заклади: {', '.join(orgs)}, роки: {years}).")


if __name__ == "__main__":
    main()
