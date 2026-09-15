#!/usr/bin/env python3
"""
flatten_json.py — Універсальний розгортач JSON у пласку таблицю.

Працює з БУДЬ-ЯКИМ JSON-дампом з raw/lsmd (helsi-експорти), незалежно від
лікарні — усі вони приходять з одного джерела (helsi/eHealth) і мають однаковий
характер структури (вкладені об'єкти + масиви). Скрипт рекурсивно проходить
кожен запис до найглибших (кінцевих, "листових") значень і записує кожне
знайдене значення в окрему колонку — так, щоб жодне поле не загубилося.

Автовизначення масиву записів на корені:
  {"meta": {...}, "data": [...]}   → бере data
  [...]                            → бере як є
  {...list-valued ключ...}         → бере єдиний список-значення
  {...просто об'єкт...}            → трактує весь об'єкт як один запис

Вкладеність розгортається так:
  patientData.addresses[0].addressText
  admissionEncounter.diagnoses[1].condition.code.icd10Am.code

Запускати:
  python3 scripts/flatten_json.py <шлях-до-json>
  python3 scripts/flatten_json.py <шлях-до-json> --out-dir ~/Documents --format both

Результат пишеться пласко в ~/Documents (без підпапок), ім'я файлу —
<оригінальна-назва>_flat.csv (і/або .json).
"""

import argparse
import csv
import hashlib
import json
import os
import re
import sys
from pathlib import Path

# Скорочення для довгих сегментів шляху — щоб SQL-імена колонок (safe_column_name)
# лишались читабельними і вкладались у ліміт Postgres (63 байти на ідентифікатор).
PATH_ABBREVIATIONS = [
    ("Diagnosis", "Dx"),
    ("diagnoses", "dx"),
    ("Diagnoses", "Dx"),
    ("Encounter", "Enc"),
    ("Condition", "Cond"),
    ("condition", "cond"),
    ("Coordinator", "Coord"),
]


# Postgres-зарезервовані слова, які трапляються як імена полів у helsi JSON.
RESERVED_SQL_WORDS = {"end", "start", "user", "order", "group", "select", "table", "column", "check", "default"}


def safe_column_name(path):
    """leaf-шлях (a.b[0].c) -> безпечне SQL-імʼя колонки (snake_case, <=63 символи)."""
    s = path
    for full, short in PATH_ABBREVIATIONS:
        s = s.replace(full, short)
    # acronym-обізнаний camelCase -> snake_case (addressIdAPI -> address_id_api, не address_id_a_p_i)
    s = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", s)
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s)
    s = s.replace(".", "_").replace("[", "_").replace("]", "")
    s = re.sub(r"_+", "_", s).lower().strip("_")
    s = s[:63]
    if s in RESERVED_SQL_WORDS:
        s = s + "_"
    return s


def build_column_map(paths):
    """Усі leaf-шляхи файлу -> {шлях: унікальне SQL-імʼя}.

    safe_column_name() сама по собі не гарантує унікальність — при глибоко
    вкладених масивах (наприклад searchTagsSpeciality[0..23]) спільний префікс
    з'їдає весь ліміт у 63 символи і різні поля труncate-яться в одне й те саме
    імʼя. Тут перевіряємо колізії глобально і для тих, що зіткнулись, додаємо
    короткий хеш-суфікс від повного шляху (гарантована унікальність).
    """
    base_names = {p: safe_column_name(p) for p in paths}
    groups = {}
    for p, name in base_names.items():
        groups.setdefault(name, []).append(p)

    result = {}
    for name, group in groups.items():
        if len(group) == 1:
            result[group[0]] = name
        else:
            for p in sorted(group):
                h = hashlib.md5(p.encode()).hexdigest()[:6]
                result[p] = f"{name[:56].rstrip('_')}_{h}"
    return result


def flatten(obj, prefix, out):
    if isinstance(obj, dict):
        if not obj:
            out[prefix] = None
            return
        for key, value in obj.items():
            path = f"{prefix}.{key}" if prefix else key
            flatten(value, path, out)
    elif isinstance(obj, list):
        if not obj:
            out[prefix] = None
            return
        for i, value in enumerate(obj):
            flatten(value, f"{prefix}[{i}]", out)
    else:
        out[prefix] = obj


def extract_records(data):
    if isinstance(data, list):
        return data, None
    if isinstance(data, dict):
        meta = data.get("meta")
        if isinstance(data.get("data"), list):
            return data["data"], meta
        list_valued = [(k, v) for k, v in data.items() if isinstance(v, list) and k != "meta"]
        if list_valued:
            # кілька списків на корені (напр. structure + resources) -> беремо найбільший,
            # це майже завжди і є справжня колекція записів, а не допоміжні службові списки
            key, records = max(list_valued, key=lambda kv: len(kv[1]))
            return records, meta
        return [data], meta
    return [data], None


def main():
    parser = argparse.ArgumentParser(description="Розгортає будь-який helsi JSON у пласку таблицю (усі поля до найглибшого рівня).")
    parser.add_argument("json_path", help="Шлях до вхідного JSON-файлу")
    parser.add_argument("--out-dir", default=str(Path.home() / "Documents"), help="Куди писати результат (за замовчуванням ~/Documents)")
    parser.add_argument("--format", choices=["csv", "json", "both"], default="csv", help="Формат виводу")
    args = parser.parse_args()

    src = Path(args.json_path).expanduser()
    if not src.exists():
        print(f"Файл не знайдено: {src}", file=sys.stderr)
        sys.exit(1)

    with open(src, "r", encoding="utf-8") as f:
        data = json.load(f)

    records, meta = extract_records(data)
    if meta:
        print(f"meta: {json.dumps(meta, ensure_ascii=False)}")
    print(f"Записів знайдено: {len(records)}")

    flat_rows = []
    for record in records:
        row = {}
        flatten(record, "", row)
        row.pop("", None)
        flat_rows.append(row)

    fieldnames = sorted({key for row in flat_rows for key in row.keys()})
    print(f"Колонок (унікальних листових шляхів): {len(fieldnames)}")

    out_dir = Path(args.out_dir).expanduser()
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = src.stem

    if args.format in ("csv", "both"):
        out_csv = out_dir / f"{stem}_flat.csv"
        with open(out_csv, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            for row in flat_rows:
                writer.writerow(row)
        print(f"CSV: {out_csv}")

    if args.format in ("json", "both"):
        out_json = out_dir / f"{stem}_flat.json"
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(flat_rows, f, ensure_ascii=False, indent=2)
        print(f"JSON: {out_json}")


if __name__ == "__main__":
    main()
