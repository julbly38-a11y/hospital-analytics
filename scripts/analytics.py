"""
analytics.py — готові аналітичні запити по базі ЛСМД.

ВИКОРИСТАННЯ:
    from analytics import *
    print(morbidity_by_chapter())
    print(doctor_profile(912))
"""

from lsmd_db import query, query_one


# ---------- ЗАХВОРЮВАНІСТЬ ----------

def morbidity_by_chapter():
    """Розподіл захворюваності по главах МКХ-10 (%)."""
    return query("""
        SELECT c.letters, c.name AS chapter,
          sum(i.usage_count)::int AS cases,
          round(100.0 * sum(i.usage_count) / (SELECT sum(usage_count) FROM icd_10), 2) AS pct
        FROM icd_chapters c
        JOIN icd_blocks b ON b.chapter_id = c.id
        JOIN icd_10 i ON i.block_id = b.id
        GROUP BY c.id, c.letters, c.name
        ORDER BY cases DESC NULLS LAST
    """)


def subcategories(chapter_letter):
    """Підкатегорії (блоки) в межах глави."""
    return query("""
        SELECT b.block_range, b.block_name,
          (SELECT count(*) FROM icd_10 i2 WHERE i2.block_id = b.id) AS diagnoses,
          (SELECT sum(usage_count) FROM icd_10 i3 WHERE i3.block_id = b.id) AS cases
        FROM icd_blocks b JOIN icd_chapters c ON c.id = b.chapter_id
        WHERE c.letters LIKE %s
        ORDER BY cases DESC NULLS LAST
    """, (f"%{chapter_letter}%",))


def diagnoses_in_block(block_range):
    """Конкретні діагнози в підкатегорії."""
    return query("""
        SELECT i.icd_code, i.diagnosis_level3, i.usage_count AS cases
        FROM icd_10 i JOIN icd_blocks b ON b.id = i.block_id
        WHERE b.block_range = %s AND i.usage_count > 0
        ORDER BY i.usage_count DESC
    """, (block_range,))


# ---------- ЛІКАРІ ----------

def doctor_profile(doctor_id):
    """Повний профіль лікаря: статистика + топ діагнози."""
    stats = query_one("SELECT * FROM doctor_stats WHERE doctor_id = %s", (doctor_id,))
    diagnoses = query("""
        SELECT icd_code, diagnosis, cases, deaths
        FROM doctor_diagnoses WHERE doctor_id = %s
        ORDER BY cases DESC LIMIT 10
    """, (doctor_id,))
    return {"stats": stats, "top_diagnoses": diagnoses}


def top_doctors(limit=10, by="total_cases"):
    """Топ лікарів за метрикою (total_cases/night_cases/deaths/avg_los)."""
    allowed = {"total_cases", "night_cases", "weekend_cases", "deaths", "avg_los", "unique_patients"}
    if by not in allowed:
        by = "total_cases"
    return query(f"""
        SELECT e.full_name, e.specialization, ds.{by}
        FROM doctor_stats ds JOIN empl e ON e.name_id = ds.doctor_id
        ORDER BY ds.{by} DESC NULLS LAST LIMIT %s
    """, (limit,))


def doctor_patients(doctor_id, limit=100):
    """Усі пацієнти лікаря."""
    return query("""
        SELECT patient_name, visits_count, first_visit, last_visit, diagnoses
        FROM doctor_patient_links WHERE doctor_id = %s
        ORDER BY visits_count DESC LIMIT %s
    """, (doctor_id, limit))


# ---------- ВІДДІЛЕННЯ ----------

def department_stats():
    """Зведення по всіх відділеннях."""
    return query("SELECT * FROM mv_dept_stats ORDER BY total_cases DESC NULLS LAST")


def transfers_matrix(limit=15):
    """Топ маршрутів переведень між відділеннями."""
    return query("""
        SELECT di.dept_name AS from_dept, do_.dept_name AS to_dept, m.cases, m.avg_los
        FROM dept_transfers_matrix m
        JOIN departments di ON di.id = m.dept_in_id
        JOIN departments do_ ON do_.id = m.dept_out_id
        WHERE m.dept_in_id <> m.dept_out_id
        ORDER BY m.cases DESC LIMIT %s
    """, (limit,))


# ---------- ПОТІК / ЧАС ----------

def daily_flow(days=30):
    """Денний потік за останні N днів."""
    return query("""
        SELECT date, total_cases, night_cases, deaths, surgeries
        FROM mv_daily_stats ORDER BY date DESC LIMIT %s
    """, (days,))


def monthly_trend():
    """Місячний тренд госпіталізацій."""
    return query("""
        SELECT date_trunc('month', admission_date_d) AS month, count(*) AS cases
        FROM lsmd WHERE admission_date_d IS NOT NULL
        GROUP BY 1 ORDER BY 1
    """)


def shift_distribution():
    """Розподіл денних/нічних/вихідних поступлень."""
    return query("""
        SELECT shift_time, day_type, count(*) AS cases
        FROM lsmd WHERE shift_time IS NOT NULL
        GROUP BY shift_time, day_type ORDER BY cases DESC
    """)


# ---------- ОПЕРАЦІЇ ----------

def top_surgeons(limit=10):
    """Топ хірургів за втручаннями."""
    return query("""
        SELECT surgeon_name, surgeon_spec,
          count(*) AS interventions, sum(оперативні_процедури) AS procedures
        FROM interventions WHERE surgeon_id IS NOT NULL
        GROUP BY surgeon_name, surgeon_spec
        ORDER BY interventions DESC LIMIT %s
    """, (limit,))


# ---------- СМЕРТНІСТЬ ----------

def deaths_24h_by_dept():
    """Смерті в першу добу по відділеннях."""
    return query("""
        SELECT admission_department, count(*) AS deaths,
          round(avg(hours_survived)::numeric, 1) AS avg_hours
        FROM lsmd_deaths_24h GROUP BY 1 ORDER BY 2 DESC
    """)


if __name__ == "__main__":
    print("=== Захворюваність по главах ===")
    for r in morbidity_by_chapter()[:5]:
        print(f"  {r['letters']:5} {r['chapter'][:40]:40} {r['pct']}%")
