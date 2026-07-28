#!/usr/bin/env python3
"""
load_json_raw.py — Заливає БУДЬ-ЯКИЙ helsi JSON-дамп у raw-таблицю lpz-схеми,
поряд з очищеним каноном (lpz_hospitalizations/lpz_patients/...), нічого не
видаляючи і не спрощуючи — кожне листове поле з JSON стає окремою TEXT-колонкою.

Універсально для будь-якої лікарні: сама таблиця спільна для всіх org_edrpou,
розрізнення — по колонці org_edrpou. Ім'я таблиці визначається з типу ресурсу
(назва файлу без року), тому hospitalizations_closed_2024.json і
hospitalizations_closed_2026.json з різних лікарень ідуть в одну таблицю.

ОБМЕЖЕННЯ: DDL (CREATE TABLE / ALTER TABLE) через PostgREST неможливий — для
цього немає прямого підключення до БД (SUPABASE_DB_URL не налаштований).
Якщо потрібної таблиці або колонки ще нема, скрипт друкує готовий SQL і
зупиняється — цей SQL треба один раз застосувати через Supabase-міграцію.

Запускати:
  python3 scripts/load_json_raw.py <шлях-до-json>
  python3 scripts/load_json_raw.py <шлях-до-json> --table lpz_raw_episodes --dry-run
"""

import argparse
import json
import os
import re
import sys
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

    del_url = f"{SUPABASE_URL}/rest/v1/{table}"
    r = requests.delete(
        del_url,
        headers={**HEADERS, "Content-Profile": "lpz"},
        params={"org_edrpou": f"eq.{org_edrpou}", "source_file": f"eq.{src.name}"},
    )
    r.raise_for_status()

    ins_url = f"{SUPABASE_URL}/rest/v1/{table}"
    for i in range(0, len(flat_rows), BATCH_SIZE):
        batch = flat_rows[i : i + BATCH_SIZE]
        r = requests.post(ins_url, headers={**HEADERS, "Content-Profile": "lpz"}, json=batch)
        if not r.ok:
            print(f"Помилка на batch {i}-{i+len(batch)}: {r.status_code} {r.text[:500]}", file=sys.stderr)
            r.raise_for_status()
        print(f"  завантажено {min(i+BATCH_SIZE, len(flat_rows))}/{len(flat_rows)}")

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
