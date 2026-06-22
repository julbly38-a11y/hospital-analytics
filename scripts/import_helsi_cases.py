#!/usr/bin/env python3
"""
Імпорт випадків госпіталізації з PDF-експорту helsi (Стаціонар → Випадки госпіталізації)
у таблиці lsmd / patients_best. Кросплатформно (Mac/Windows/Linux), запускається з репо.

НАЛАШТУВАННЯ (один раз на машині):
    pip install -r scripts/requirements.txt
    Створи .env поряд (як для решти скриптів проєкту):
        SUPABASE_DB_URL=postgresql://postgres:[ПАРОЛЬ]@db.wnyfrckxhwujsjcfxqou.supabase.co:5432/postgres
    Рядок брати: Supabase → Project Settings → Database → Connection string.
    .env у git НЕ комітиться (пароль лишається локально).

ВИКОРИСТАННЯ:
    python scripts/import_helsi_cases.py file.pdf            # → CSV для звірки (у БД нічого)
    python scripts/import_helsi_cases.py file.pdf --check    # dry-run у БД (рахує, потім відкат)
    python scripts/import_helsi_cases.py file.pdf --commit   # запис у БД (ідемпотентно по helsi_no)

Повторний запуск того ж файлу нічого не дублює (фільтр по helsi_no).
"""
import sys, re, csv, os, argparse

try:
    from pypdf import PdfReader
except ImportError:
    try:
        from PyPDF2 import PdfReader
    except ImportError:
        sys.exit("Встанови залежності:  pip install -r scripts/requirements.txt")

ANCHOR = re.compile(r"№(\d+?)(\d{2}\.\d{2}\.\d{4})\s*\((\d+)\s*р\.\)\s*(Відкритий|Закритий)")
DEPT_RE = re.compile(r"Відділення:\s*(.*?)\s*Фільтри")
ICD_RE = re.compile(r"\b([A-Z]\d{2}(?:\.\d{1,2})?)\b")


def pdf_text(path):
    return re.sub(r"\s+", " ", " ".join((pg.extract_text() or "") for pg in PdfReader(path).pages))


def short_doc(full):
    p = full.split(",")[0].strip().split()
    return f"{p[0]} {p[1][0]}. {p[2][0]}." if len(p) >= 3 else " ".join(p)


def gender_from_parental(par):
    p = (par or "").lower()
    return "Ж" if p.endswith(("вна", "на")) else ("Ч" if p.endswith(("ич", "іч")) else "")


def iso(d):  # '24.03.1969' -> '1969-03-24'
    dd, mm, yy = d.split("."); return f"{yy}-{mm}-{dd}"


def parse(text):
    dept = (DEPT_RE.search(text).group(1).strip() if DEPT_RE.search(text) else "")
    ms = list(ANCHOR.finditer(text))
    out = []
    for i, m in enumerate(ms):
        before = text[(ms[i - 1].end() if i > 0 else 0):m.start()]
        words = re.findall(r"[А-ЯІЇЄҐ][а-яіїєґʼ'’\-]+|[А-ЯІЇЄҐʼ'’\-]{2,}", before)
        parts = [w.title() if w.isupper() else w for w in words[-3:]]
        while len(parts) < 3:
            parts.append("")
        seg = text[m.end():(ms[i + 1].start() if i + 1 < len(ms) else len(text))]
        adm = re.search(r"Госпіталізовано\s*(\d{2}\.\d{2}\.\d{4})\s*(\d{2}:\d{2})", seg)
        dis = re.search(r"Виписано\s*(\d{2}\.\d{2}\.\d{4})\s*(\d{2}:\d{2})", seg)
        doc = re.search(r"Лікуючий лікар\s*(.*?)Діагноз", seg)
        dx = re.search(r"Діагноз\s*(.*?)(?:Призначення|$)", seg)
        doc_full = (doc.group(1).strip() if doc else "")
        doc_full = "" if doc_full.startswith("Не призначено") else doc_full
        dx_txt = (dx.group(1).strip() if dx else "")
        dx_txt = "" if dx_txt.startswith("Не призначено") else dx_txt
        icd = ICD_RE.match(dx_txt).group(1) if ICD_RE.match(dx_txt) else ""
        out.append({
            "helsi_no": int(m.group(1)), "піб": " ".join(parts).strip(),
            "прізвище": parts[0], "імʼя": parts[1], "побатькові": parts[2],
            "стать": gender_from_parental(parts[2]),
            "дата_народження": m.group(2), "вік": int(m.group(3)), "статус": m.group(4),
            "пост_дата": adm.group(1) if adm else "", "пост_час": adm.group(2) if adm else "",
            "вип_дата": dis.group(1) if dis else "", "вип_час": dis.group(2) if dis else "",
            "відділення": dept, "doc_name": short_doc(doc_full) if doc_full else "",
            "icd": icd, "діагноз": dx_txt[len(icd):].strip() if icd else dx_txt,
        })
    return out


# ── Запис у БД (параметризовано, через psycopg2) ───────────────────────────────
PAT_SQL = """
INSERT INTO patients_best (patient_id, full_name, patient_name, patient_prename, parental, gender, age, birthday, short_name)
SELECT (SELECT COALESCE(MAX(patient_id),0) FROM patients_best) + ROW_NUMBER() OVER (ORDER BY v.full_name),
       v.full_name, v.sname, v.fname, v.parental, NULLIF(v.gender,''), v.age, v.birthday, v.short_name
FROM ( {pv} ) AS v(full_name, sname, fname, parental, gender, age, birthday, short_name)
WHERE NOT EXISTS (SELECT 1 FROM patients_best p WHERE p.full_name=v.full_name AND COALESCE(p.birthday,'')=v.birthday);
"""
CASE_SQL = """
INSERT INTO lsmd (id_case, helsi_no, patient_name, birth_date, gender, age, birth_date_d,
  admission_date, admission_date_d, admission_ts, admission_time,
  discharge_date, discharge_date_d, discharge_ts,
  admission_department, current_department, icd_primary, doc_name, doctor_id, patient_id, length_of_stay)
SELECT (SELECT COALESCE(MAX(id_case),0) FROM lsmd) + ROW_NUMBER() OVER (ORDER BY v.helsi_no),
  v.helsi_no, v.full_name, v.birthday_txt, NULLIF(v.gender,''), v.age, v.birth_d,
  v.adm_raw, v.adm_d, v.adm_ts, v.adm_time,
  v.dis_raw, v.dis_d, v.dis_ts,
  v.dept, v.dept, NULLIF(v.icd,''), NULLIF(v.doc_name,''), d.doctor_id, p.patient_id,
  CASE WHEN v.dis_d IS NOT NULL THEN (v.dis_d - v.adm_d) END
FROM ( {cv} ) AS v(helsi_no, full_name, birthday_txt, gender, age, birth_d, adm_raw, adm_d, adm_ts, adm_time, dis_raw, dis_d, dis_ts, dept, icd, doc_name)
LEFT JOIN patients_best p ON p.full_name=v.full_name AND COALESCE(p.birthday,'')=v.birthday_txt
LEFT JOIN lsmd_doctors d ON d.doc_name=NULLIF(v.doc_name,'')
WHERE NOT EXISTS (SELECT 1 FROM lsmd l WHERE l.helsi_no=v.helsi_no)
ON CONFLICT (helsi_no) DO NOTHING;
"""


def values_block(rows, cols, rowfn):
    """Будує 'VALUES (%s,..),(..)' + плаский список параметрів."""
    ph = "(" + ",".join(["%s"] * cols) + ")"
    params = []
    for r in rows:
        params.extend(rowfn(r))
    return "VALUES " + ",".join([ph] * len(rows)), params


def pat_row(r):
    sn = f"{r['прізвище']} {r['імʼя'][:1]}. {r['побатькові'][:1]}." if r['імʼя'] else r['прізвище']
    return [r['піб'], r['прізвище'], r['імʼя'], r['побатькові'], r['стать'], r['вік'], r['дата_народження'], sn]


def case_row(r):
    bd = iso(r['дата_народження'])
    adm_d = iso(r['пост_дата']) if r['пост_дата'] else None
    adm_ts = f"{adm_d} {r['пост_час']}:00" if adm_d else None
    dis_d = iso(r['вип_дата']) if r['вип_дата'] else None
    dis_ts = f"{dis_d} {r['вип_час']}:00" if dis_d else None
    return [r['helsi_no'], r['піб'], r['дата_народження'], r['стать'], str(r['вік']), bd,
            (r['пост_дата'] + ' ' + r['пост_час']).strip(), adm_d, adm_ts, r['пост_час'] or None,
            (r['вип_дата'] + ' ' + r['вип_час']).strip() or None, dis_d, dis_ts,
            r['відділення'], r['icd'], r['doc_name']]


def run_db(rows, commit):
    # той самий патерн підключення, що й решта скриптів проєкту (lsmd_db / psycopg3 / SUPABASE_DB_URL)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try:
        import psycopg
        from lsmd_db import DB_URL
    except ImportError as e:
        sys.exit(f"Залежності/конект: {e}\n  pip install -r scripts/requirements.txt + SUPABASE_DB_URL у .env")
    pv, pparams = values_block(rows, 8, pat_row)
    cv, cparams = values_block(rows, 16, case_row)
    conn = psycopg.connect(DB_URL)
    try:
        cur = conn.cursor()
        cur.execute("SELECT (SELECT COUNT(*) FROM patients_best),(SELECT COUNT(*) FROM lsmd)")
        pb0, l0 = cur.fetchone()
        cur.execute(PAT_SQL.format(pv=pv), pparams)
        cur.execute(CASE_SQL.format(cv=cv), cparams)
        cur.execute("SELECT (SELECT COUNT(*) FROM patients_best),(SELECT COUNT(*) FROM lsmd)")
        pb1, l1 = cur.fetchone()
        print(f"Нових пацієнтів: {pb1 - pb0} | нових випадків: {l1 - l0}")
        if commit:
            conn.commit(); print("✅ ЗАПИСАНО в БД.")
        else:
            conn.rollback(); print("DRY-RUN: відкочено, у БД нічого не змінено (для запису додай --commit).")
    finally:
        conn.close()


def main():
    ap = argparse.ArgumentParser(description="Імпорт випадків helsi (PDF) у lsmd/patients_best")
    ap.add_argument("pdf")
    ap.add_argument("--csv", help="шлях до CSV (за замовч. поряд із PDF)")
    ap.add_argument("--check", action="store_true", help="dry-run у БД (відкат)")
    ap.add_argument("--commit", action="store_true", help="записати в БД")
    a = ap.parse_args()
    rows = parse(pdf_text(a.pdf))
    csv_path = a.csv or os.path.splitext(a.pdf)[0] + "_cases.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    print(f"Випадків: {len(rows)} | відділення: {rows[0]['відділення'] if rows else '—'}")
    print(f"З діагнозом: {sum(1 for r in rows if r['icd'])} | з лікарем: {sum(1 for r in rows if r['doc_name'])} "
          f"| виписаних: {sum(1 for r in rows if r['вип_дата'])} | стать: {sum(1 for r in rows if r['стать'])}/{len(rows)}")
    print(f"CSV: {csv_path}")
    if a.check or a.commit:
        run_db(rows, commit=a.commit)


if __name__ == "__main__":
    main()
