"""
lsmd_db.py — ядро підключення до Supabase (ЛСМД Чернівці).
Project: wnyfrckxhwujsjcfxqou

УСТАНОВКА:
    pip install "psycopg[binary]>=3.2.0" python-dotenv

НАЛАШТУВАННЯ:
    Створи файл .env поряд:
        SUPABASE_DB_URL=postgresql://postgres:[ПАРОЛЬ]@db.wnyfrckxhwujsjcfxqou.supabase.co:5432/postgres

ВИКОРИСТАННЯ:
    from lsmd_db import query, execute, query_one
    rows = query("SELECT * FROM departments LIMIT 5")
"""

import os
import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    raise RuntimeError("Не задано SUPABASE_DB_URL у .env")


def query(sql, params=None):
    """SELECT - список словників."""
    with psycopg.connect(DB_URL) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            return cur.fetchall()


def query_one(sql, params=None):
    """SELECT - один словник або None."""
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql, params=None):
    """INSERT/UPDATE/DELETE/DDL - к-сть змінених рядків."""
    with psycopg.connect(DB_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            conn.commit()
            return cur.rowcount


def execute_many(sql, params_list):
    """Пакетне виконання (швидко для багатьох рядків)."""
    with psycopg.connect(DB_URL) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, params_list)
            conn.commit()
            return cur.rowcount


def table_count(table):
    """Швидкий підрахунок рядків таблиці."""
    return query_one(f"SELECT count(*) AS n FROM {table}")["n"]


if __name__ == "__main__":
    print("Перевірка підключення до ЛСМД...")
    for t in ["lsmd", "patients_best", "empl", "departments", "icd_10"]:
        print(f"  {t}: {table_count(t):,} рядків")
    print("OK")
