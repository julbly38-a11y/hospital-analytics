"""
normalize_data.py — Нормалізація брудних даних у таблиці lsmd.

Правила:
  age              — видалити пробіл-роздільник; якщо в оригіналі "1 039" то це вік у
                     днях (педіатричний запис) → ділимо на 365.25, округляємо до цілих
  discharge_status — привести до одного з 6 канонічних значень (пошкоджені UTF-8)
  admission_type   — привести до 'Екстренна' або 'Планова' (пошкоджені UTF-8)

Запускати:
  python3 scripts/normalize_data.py [--dry-run]

Для прямого SQL (якщо є доступ до Supabase MCP або psql):
  -- age:
  UPDATE lsmd
  SET age = round(regexp_replace(age, '\\s', '', 'g')::numeric / 365.25)::text
  WHERE age !~ '^\\d+$' AND age IS NOT NULL AND age != '';

  -- discharge_status:
  UPDATE lsmd SET discharge_status = 'З поліпшенням'
  WHERE discharge_status NOT IN (
    'З поліпшенням','Помер','Без змін',
    'Переведений в інший заклад','Лікується','З погіршенням'
  ) AND discharge_status IS NOT NULL AND discharge_status != '';

  -- admission_type:
  UPDATE lsmd SET admission_type = 'Екстренна'
  WHERE admission_type NOT IN ('Екстренна','Планова')
    AND admission_type IS NOT NULL AND admission_type != '';
"""

import os
import re
import argparse
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

SUPABASE_URL = os.environ['NEXT_PUBLIC_SUPABASE_URL']
SERVICE_KEY  = os.environ['SUPABASE_SERVICE_KEY']

HEADERS = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}

DISCHARGE_CANONICAL = {
    'З поліпшенням', 'Помер', 'Без змін',
    'Переведений в інший заклад', 'Лікування', 'Лікується', 'З погіршенням',
}
ADMISSION_CANONICAL = {'Екстренна', 'Планова'}


def clean_replacement_chars(s: str) -> str:
    return re.sub(r'�', '', s).strip()


def best_match(value: str, canonical: set[str]) -> str | None:
    cleaned = clean_replacement_chars(value)
    best, best_score = None, -1
    for c in canonical:
        common = sum(cleaned.count(ch) for ch in set(c) if ch in cleaned)
        score = common / max(len(c), len(cleaned))
        if score > best_score:
            best, best_score = c, score
    return best if best_score > 0.6 else None


def normalize_age(raw: str) -> str | None:
    stripped = re.sub(r'\s', '', raw)
    if not stripped.isdigit():
        return None
    val = int(stripped)
    if val > 120:
        val = round(val / 365.25)
    if val > 120:
        return None
    return str(val)


def supabase_rpc_sql(sql: str) -> list:
    r = requests.post(
        f'{SUPABASE_URL}/rest/v1/rpc/execute_sql_safe',
        headers=HEADERS,
        json={'query': sql},
    )
    r.raise_for_status()
    return r.json()


def supabase_patch(table: str, pk_col: str, pk_val, payload: dict):
    url = f'{SUPABASE_URL}/rest/v1/{table}?{pk_col}=eq.{pk_val}'
    r = requests.patch(url, headers=HEADERS, json=payload)
    r.raise_for_status()


def fetch_dirty(dry_run: bool):
    rows = supabase_rpc_sql(
        "SELECT id_case, discharge_status, admission_type, age FROM lsmd "
        "WHERE (age ~ '[^0-9]' AND age IS NOT NULL AND age != '') "
        "   OR (discharge_status IS NOT NULL AND discharge_status NOT IN "
        "       ('З поліпшенням','Помер','Без змін','Переведений в інший заклад','Лікується','З погіршенням')) "
        "   OR (admission_type IS NOT NULL AND admission_type NOT IN ('Екстренна','Планова'))"
    )
    if not isinstance(rows, list):
        rows = rows.get('rows', [])

    print(f"Знайдено {len(rows)} брудних рядків.")
    fixes = 0

    for row in rows:
        pk   = row['id_case']
        patches: dict = {}

        age = row.get('age') or ''
        if age and not re.match(r'^\d+$', age):
            fixed = normalize_age(age)
            if fixed:
                patches['age'] = fixed

        ds = row.get('discharge_status') or ''
        if ds and ds not in DISCHARGE_CANONICAL:
            canon = best_match(ds, DISCHARGE_CANONICAL)
            if canon:
                patches['discharge_status'] = canon

        at = row.get('admission_type') or ''
        if at and at not in ADMISSION_CANONICAL:
            canon = best_match(at, ADMISSION_CANONICAL)
            if canon:
                patches['admission_type'] = canon

        if patches:
            fixes += 1
            label = {k: f"{row.get(k)!r}→{v!r}" for k, v in patches.items()}
            if dry_run:
                print(f"  [id_case={pk}] {label}")
            else:
                supabase_patch('lsmd', 'id_case', pk, patches)
                print(f"  ✓ [id_case={pk}] {label}")

    print(f"\nВиправлено: {fixes} рядків{'.' if not dry_run else ' (dry-run, не збережено).'}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Нормалізація даних lsmd')
    parser.add_argument('--dry-run', action='store_true', help='Показати зміни без запису в БД')
    args = parser.parse_args()
    fetch_dirty(dry_run=args.dry_run)
