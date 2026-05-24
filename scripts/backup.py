"""
backup.py — бекап таблиць ЛСМД у CSV (захист від втрати даних).

ВИКОРИСТАННЯ:
    python backup.py                 # бекап ключових таблиць
    python backup.py --all           # усі таблиці
    python backup.py --table lsmd    # одна таблиця

Створює папку backups/YYYY-MM-DD/ з CSV-файлами.
ВАЖЛИВО: запускай ПЕРЕД будь-яким DELETE/TRUNCATE/масовим UPDATE!
"""

import os
import sys
import datetime
from lsmd_db import query, DB_URL
import psycopg

KEY_TABLES = ["lsmd", "patients_best", "empl", "lsmd_doctors", "departments",
              "operations", "doctor_shifts", "doctor_stats", "localities"]


def all_tables():
    rows = query("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_type='BASE TABLE'
        ORDER BY table_name
    """)
    return [r["table_name"] for r in rows]


def backup_table(table, outdir):
    """Експорт однієї таблиці у CSV через COPY (швидко)."""
    path = os.path.join(outdir, f"{table}.csv")
    with psycopg.connect(DB_URL) as conn:
        with conn.cursor() as cur:
            with open(path, "w", encoding="utf-8") as f:
                with cur.copy(f"COPY {table} TO STDOUT WITH CSV HEADER") as copy:
                    for data in copy:
                        f.write(data.tobytes().decode("utf-8"))
    size = os.path.getsize(path)
    print(f"  OK {table}: {size:,} байт -> {path}")


def main():
    today = datetime.date.today().isoformat()
    outdir = os.path.join("backups", today)
    os.makedirs(outdir, exist_ok=True)

    if "--all" in sys.argv:
        tables = all_tables()
    elif "--table" in sys.argv:
        idx = sys.argv.index("--table")
        tables = [sys.argv[idx + 1]]
    else:
        tables = KEY_TABLES

    print(f"Бекап {len(tables)} таблиць -> {outdir}/")
    for t in tables:
        try:
            backup_table(t, outdir)
        except Exception as e:
            print(f"  ERROR {t}: {e}")
    print("Готово.")


if __name__ == "__main__":
    main()
