#!/usr/bin/env python3
"""
load_json_raw.py — Заливає БУДЬ-ЯКИЙ helsi JSON-дамп у raw-таблицю lpz-схеми,
поряд з очищеним каноном (lpz_hospitalizations/lpz_patients/...), нічого не
видаляючи і не спрощуючи — кожне листове поле з JSON стає окремою TEXT-колонкою.

Універсально для будь-якої лікарні: сама таблиця спільна для всіх org_edrpou,
розрізнення — по колонці org_edrpou. Ім'я таблиці визначається з типу ресурсу
(назва файлу без року), тому hospitalizations_closed_2024.json і
hospitalizations_closed_2026.json з різних лікарень ідуть в одну таблицю.

ЗАВАНТАЖЕННЯ: за замовчуванням psql \copy в одній транзакції (потрібен рядок підключення
до БД, див. pg_target); без нього або при HELSI_RAW_LOADER=rest — PostgREST пакетами.

ОБМЕЖЕННЯ: DDL (CREATE TABLE / ALTER TABLE) через PostgREST неможливий — для
цього немає прямого підключення до БД (SUPABASE_DB_URL не налаштований).
Якщо потрібної таблиці або колонки ще нема, скрипт друкує готовий SQL і
зупиняється — цей SQL треба один раз застосувати через Supabase-міграцію.

Запускати:
  python3 scripts/load_json_raw.py <шлях-до-json>
  python3 scripts/load_json_raw.py <шлях-до-json> --table lpz_raw_episodes --dry-run
"""

import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))
from flatten_json import build_column_map, extract_records, flatten

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}
BATCH_SIZE = 200
# Скільки рядків видаляти за один запит. Одним DELETE на всі рядки файлу
# (7.5 тис. широких рядків) PostgREST не встигає за statement_timeout
# Supabase (8 с) і повертає 500 — тому чистимо пакетами.
DELETE_BATCH_SIZE = 500
LOAD_ATTEMPTS = 3


def insert_rows(table: str, rows: list) -> None:
    ins_url = f"{SUPABASE_URL}/rest/v1/{table}"
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        r = requests.post(ins_url, headers={**HEADERS, "Content-Profile": "lpz"}, json=batch, timeout=120)
        if not r.ok:
            print(f"Помилка на batch {i}-{i+len(batch)}: {r.status_code} {r.text[:500]}", file=sys.stderr)
            r.raise_for_status()
        print(f"  завантажено {min(i+BATCH_SIZE, len(rows))}/{len(rows)}")


def delete_existing(table: str, org_edrpou: str, source_file: str) -> int:
    """Видаляє попередній вміст цього файлу пакетами по id. Повертає скільки видалено."""
    base = f"{SUPABASE_URL}/rest/v1/{table}"
    scope = {"org_edrpou": f"eq.{org_edrpou}", "source_file": f"eq.{source_file}"}
    headers = {**HEADERS, "Content-Profile": "lpz", "Accept-Profile": "lpz"}
    deleted = 0

    while True:
        r = requests.get(base, headers=headers, params={**scope, "select": "id", "id": "not.is.null", "limit": DELETE_BATCH_SIZE})
        r.raise_for_status()
        ids = [row["id"] for row in (r.json() or []) if row.get("id")]
        if not ids:
            break
        quoted = ",".join('"' + str(i).replace('"', '""') + '"' for i in ids)
        d = requests.delete(base, headers=headers, params={**scope, "id": f"in.({quoted})"})
        d.raise_for_status()
        deleted += len(ids)
        print(f"  очищено {deleted}")

    # Рядки без id (якщо такі є) — окремим запитом, їх зазвичай одиниці.
    d = requests.delete(base, headers=headers, params={**scope, "id": "is.null"})
    d.raise_for_status()
    return deleted


def drop_identical_duplicates(records: list, name: str) -> list:
    """Прибирає з вибірки записи, ІДЕНТИЧНІ вже наявним (побайтово однаковий JSON).

    helsi віддає списки посторінково зі зсувом (skip), а список росте під час
    вивантаження, тож сусідні сторінки перекриваються й один запис приходить
    двічі (наприклад, ~600 повторів з 15.9 тис. епізодів). Ідентичні копії
    відкидаємо без втрат. Якщо ж однаковий id має РІЗНИЙ вміст — нічого не
    викидаємо, лише попереджаємо (канон бере найсвіжіший last_updated_at).
    """
    seen = set()
    unique = []
    for rec in records:
        key = json.dumps(rec, sort_keys=True, ensure_ascii=False)
        if key in seen:
            continue
        seen.add(key)
        unique.append(rec)
    dropped = len(records) - len(unique)
    if dropped:
        print(f"  прибрано ідентичних дублікатів: {dropped} ({len(records)} -> {len(unique)})")

    ids = [r.get("id") for r in unique if isinstance(r, dict) and r.get("id")]
    if len(ids) != len(set(ids)):
        print(f"  УВАГА [{name}]: {len(ids) - len(set(ids))} записів мають повторний id, але РІЗНИЙ вміст — лишено як є", file=sys.stderr)
    return unique


# ───────────── пряме завантаження в Postgres (psql \copy, одна транзакція) ─────────────
# Замість сотень пакетів через PostgREST: DELETE + COPY + перевірка кількості в ОДНІЙ
# транзакції. Або таблиця повністю оновилась, або взагалі не змінилась (жодних
# "напівзавантажених" файлів після обриву). Якщо рядка підключення до БД нема —
# працює старий шлях через PostgREST.
DBURL_FILE = Path(os.environ.get("HELSI_SYNC_DBURL_FILE", "~/hospital-analytics/db-export/.dburl")).expanduser()
NULL_MARK = "NULL_9f3a1c7e"  # маркер NULL у CSV: порожній рядок ('') лишається порожнім рядком, а не NULL


class PgUnavailable(Exception):
    pass


def pg_target():
    """(psql, url) або PgUnavailable. Захист: URL мусить вести на той самий проєкт, що й SUPABASE_URL."""
    psql = shutil.which("psql") or "/opt/homebrew/opt/libpq/bin/psql"
    if not Path(psql).exists():
        raise PgUnavailable("psql не знайдено")
    url = (os.environ.get("HELSI_SYNC_DB_URL") or (DBURL_FILE.read_text().strip() if DBURL_FILE.exists() else "")).strip()
    if not url:
        raise PgUnavailable("нема рядка підключення до БД")
    m = re.match(r"https?://([a-z0-9]+)\.supabase\.co", SUPABASE_URL)
    if not m or m.group(1) not in url:
        raise PgUnavailable("рядок підключення не веде на той самий проєкт, що NEXT_PUBLIC_SUPABASE_URL")
    return psql, url


def load_via_psql(table: str, columns: list, rows: list, org_edrpou: str, source_file: str, schema: str = "lpz") -> None:
    """Атомарно замінює рядки (org_edrpou, source_file) у schema.table. RuntimeError при збої (БД не змінена)."""
    psql, url = pg_target()
    for r in rows:
        if NULL_MARK in {v for v in r.values() if isinstance(v, str)}:
            raise RuntimeError("у даних трапився службовий маркер NULL")
    ident = lambda c: '"' + c.replace('"', '""') + '"'
    cols_sql = ", ".join(ident(c) for c in columns)
    q = lambda v: "'" + v.replace("'", "''") + "'"
    tbl = f"{ident(schema)}.{ident(table)}"

    with tempfile.TemporaryDirectory() as tmp:
        csv_path = Path(tmp) / "data.csv"
        with open(csv_path, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
            for r in rows:
                w.writerow([NULL_MARK if r.get(c) is None else r[c] for c in columns])
        sql_path = Path(tmp) / "load.sql"
        sql_path.write_text(
            "\\set ON_ERROR_STOP on\n"
            "BEGIN;\n"
            "SET LOCAL statement_timeout = '600s';\n"
            f"DELETE FROM {tbl} WHERE org_edrpou = {q(org_edrpou)} AND source_file = {q(source_file)};\n"
            f"\\copy {tbl} ({cols_sql}) FROM {q(str(csv_path))} WITH (FORMAT csv, NULL {q(NULL_MARK)})\n"
            "DO $chk$ BEGIN\n"
            f"  IF (SELECT count(*) FROM {tbl} WHERE org_edrpou = {q(org_edrpou)} AND source_file = {q(source_file)}) <> {len(rows)} THEN\n"
            f"    RAISE EXCEPTION 'після COPY у таблиці не {len(rows)} рядків';\n"
            "  END IF;\n"
            "END $chk$;\n"
            "COMMIT;\n",
            encoding="utf-8",
        )
        env = {**os.environ, "PGCLIENTENCODING": "UTF8"}
        r = subprocess.run([psql, url, "-X", "-q", "-f", str(sql_path)], capture_output=True, text=True, env=env)
        if r.returncode != 0:
            raise RuntimeError((r.stderr or r.stdout).strip()[-600:])
    print(f"  завантажено {len(rows)}/{len(rows)} (psql \\copy, одна транзакція)")


def derive_table_name(src: Path) -> str:
    stem = re.sub(r"_\d{4}$", "", src.stem)
    return f"lpz_raw_{stem}"


def fetch_remote_columns(table: str):
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/",
        headers={**HEADERS, "Accept-Profile": "lpz"},
    )
    r.raise_for_status()
    spec = r.json()
    schemas = spec.get("definitions") or spec.get("components", {}).get("schemas", {})
    if table not in schemas:
        return None
    props = schemas[table].get("properties", {})
    return set(props.keys())


def build_ddl(table: str, sql_columns: list[str]) -> str:
    cols_sql = ",\n  ".join(f"{c} text" for c in sql_columns)
    return f"""CREATE TABLE lpz.{table} (
  org_edrpou text NOT NULL,
  source_file text NOT NULL,
  extracted_at timestamptz,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  {cols_sql}
);

ALTER TABLE lpz.{table} ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON lpz.{table}
  FOR ALL USING (current_user_org_edrpou() IS NULL OR org_edrpou = current_user_org_edrpou());

CREATE INDEX idx_{table}_lookup ON lpz.{table} (org_edrpou, source_file);
"""


def load_generic(src: Path, org_edrpou=None, table=None, dry_run=False, limit=None) -> bool:
    """Розгортає й заливає один JSON-файл у відповідну lpz_raw_* таблицю.

    limit: якщо задано, бере лише перші N записів з файлу (тестовий прогін).
    Повертає True при успіху (або dry-run без проблем), False якщо таблиця/колонки
    ще не створені (SQL для міграції друкується в stdout) або org_edrpou невідомий.
    """
    with open(src, "r", encoding="utf-8") as f:
        data = json.load(f)
    records, meta = extract_records(data)
    meta = meta or {}
    if limit:
        records = records[:limit]
    records = drop_identical_duplicates(records, src.name)

    org_edrpou = org_edrpou or meta.get("org_edrpou")
    if not org_edrpou:
        print(f"[{src.name}] Не вказано org_edrpou (нема в meta файлу і не передано явно)", file=sys.stderr)
        return False

    table = table or derive_table_name(src)
    suffix = f" (LIMIT {limit})" if limit else ""
    print(f"Файл: {src.name}  →  таблиця: lpz.{table}  (org_edrpou={org_edrpou}){suffix}")
    print(f"Записів у файлі: {len(records)}")

    raw_rows = []
    all_paths = set()
    for rec in records:
        raw_row = {}
        flatten(rec, "", raw_row)
        raw_row.pop("", None)
        raw_rows.append(raw_row)
        all_paths.update(raw_row.keys())

    col_map = build_column_map(all_paths)
    sql_columns = sorted(set(col_map.values()))
    print(f"Колонок (листових шляхів): {len(sql_columns)}")

    # PostgREST вимагає однаковий набір ключів у КОЖНОМУ об'єкті batch-insert-у,
    # тому доповнюємо кожен рядок повним набором колонок (None, де немає значення).
    flat_rows = []
    for raw_row in raw_rows:
        sql_row = dict.fromkeys(sql_columns)
        for path, value in raw_row.items():
            sql_row[col_map[path]] = None if value is None else str(value)
        flat_rows.append(sql_row)

    remote_columns = fetch_remote_columns(table)
    if remote_columns is None:
        print(f"\nТаблиці lpz.{table} ще нема. Спершу застосуй цей SQL (одноразова міграція):\n")
        print(build_ddl(table, sql_columns))
        return False

    fixed_cols = {"org_edrpou", "source_file", "extracted_at", "loaded_at"}
    missing = sorted(set(sql_columns) - remote_columns - fixed_cols)
    if missing:
        print(f"\nУ таблиці lpz.{table} бракує {len(missing)} колонок. Спершу застосуй:\n")
        print(f"ALTER TABLE lpz.{table}")
        print(",\n".join(f"  ADD COLUMN IF NOT EXISTS {c} text" for c in missing) + ";")
        return False

    if dry_run:
        print("\n--dry-run: дані не записувались.")
        return True

    for row in flat_rows:
        row["org_edrpou"] = org_edrpou
        row["source_file"] = src.name
        if meta.get("extractedAt"):
            row["extracted_at"] = meta["extractedAt"]

    columns = sql_columns + ["org_edrpou", "source_file", "extracted_at"]
    if os.environ.get("HELSI_RAW_LOADER", "psql") != "rest":
        try:
            load_via_psql(table, columns, flat_rows, org_edrpou, src.name)
            print(f"\nГотово: {len(flat_rows)} записів у lpz.{table}")
            return True
        except PgUnavailable as e:
            print(f"  прямий psql недоступний ({e}) — використовую PostgREST", file=sys.stderr)
        except RuntimeError as e:
            print(f"  psql-завантаження не вдалось, БД не змінено ({e}) — пробую PostgREST", file=sys.stderr)

    # Обрив зв'язку посеред файлу (Connection reset) лишає таблицю неповною. Повтор
    # окремого пакета міг би задублювати рядки, якщо сервер його вже зберіг, тому при
    # мережевому збої повторюємо файл ЦІЛКОМ: видалення + вставка (ідемпотентно).
    for attempt in range(1, LOAD_ATTEMPTS + 1):
        try:
            delete_existing(table, org_edrpou, src.name)
            insert_rows(table, flat_rows)
            break
        except (requests.ConnectionError, requests.Timeout) as e:
            if attempt == LOAD_ATTEMPTS:
                raise
            print(f"  мережевий збій ({e.__class__.__name__}), повтор файлу {attempt + 1}/{LOAD_ATTEMPTS} за {5 * attempt} с…", file=sys.stderr)
            time.sleep(5 * attempt)

    print(f"\nГотово: {len(flat_rows)} записів у lpz.{table}")
    return True


def main():
    parser = argparse.ArgumentParser(description="Заливає helsi JSON у raw-таблицю lpz-схеми (усі поля, без втрат).")
    parser.add_argument("json_path")
    parser.add_argument("--table", help="Ім'я таблиці (за замовчуванням lpz_raw_<тип ресурсу з назви файлу>)")
    parser.add_argument("--org-edrpou", help="ЄДРПОУ, якщо його нема в meta.org_edrpou файлу")
    parser.add_argument("--dry-run", action="store_true", help="Тільки показати план, нічого не писати в БД")
    parser.add_argument("--limit", type=int, help="Взяти лише перші N записів (тестовий прогін)")
    args = parser.parse_args()

    src = Path(args.json_path).expanduser()
    if not src.exists():
        print(f"Файл не знайдено: {src}", file=sys.stderr)
        sys.exit(1)

    ok = load_generic(src, org_edrpou=args.org_edrpou, table=args.table, dry_run=args.dry_run, limit=args.limit)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
