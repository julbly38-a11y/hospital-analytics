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
    import logging
    logging.getLogger("pypdf").setLevel(logging.ERROR)  # глушимо спам "Ignoring wrong pointing object"
    from pypdf import PdfReader
except ImportError:
    try:
        from PyPDF2 import PdfReader
    except ImportError:
        sys.exit("Встанови залежності:  pip install -r scripts/requirements.txt")

# Толерантно до пробілів: pypdf розділяє поля пробілами, PyPDF2 склеює.
# Номер картки може бути з дефісом (№-8553) або без (№8552).
# Статус (Відкритий/Закритий/На виписці/Зареєстровано в ЕСОЗ/…) беремо як будь-який текст
# між «(вік р.)» і «Госпіталізовано» — стійко до нових значень helsi, жоден запис не губиться.
ANCHOR = re.compile(r"№\s*-?\s*(\d+)\s*(\d{2}\.\d{2}\.\d{4})\s*\(\s*(\d+)\s*р\.\)\s*(.*?)(?=\s*Госпіталізовано)")
DEPT_RE = re.compile(r"Відділення:\s*(.*?)\s*Фільтри")
ICD_RE = re.compile(r"\b([A-Z]\d{2}(?:\.\d{1,2})?)\b")

# Мапінг назв відділень: helsi-PDF → стандарт у БД/кабінеті.
# helsi іноді дає розширену назву («…з інсультним блоком»), а в lsmd прийнятий короткий стандарт.
# Ключі звіряються після нормалізації пробілів (без урахування початкових/кінцевих пробілів).
# TODO: перевірити решту відділень на розбіжності і дописати сюди.
DEPT_MAP = {
    "Центр невідкладної неврології з інсультним блоком": "Центр невідкладної неврології",
}


def normalize_dept(dept):
    """helsi-назву відділення приводимо до стандарту БД (мапінг + чистка пробілів)."""
    d = re.sub(r"\s+", " ", (dept or "")).strip()
    return DEPT_MAP.get(d, d)


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


def parse(text, dept_override=""):
    # У вигляді «Випадки госпіталізації» є рядок «Відділення: … Фільтри»; у вигляді «Мої пацієнти» його немає.
    # Тоді відділення передаємо вручну через dept_override (--dept).
    dept = normalize_dept(DEPT_RE.search(text).group(1) if DEPT_RE.search(text) else "")
    if not dept:
        dept = normalize_dept(dept_override)
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
        raw_status = m.group(4).strip()
        adm_type = "Екстренна" if re.search(r"\bЕН\b", raw_status) else "Планова"
        out.append({
            "helsi_no": int(m.group(1)), "піб": " ".join(parts).strip(),
            "прізвище": parts[0], "імʼя": parts[1], "побатькові": parts[2],
            "стать": gender_from_parental(parts[2]),
            "дата_народження": m.group(2), "вік": int(m.group(3)),
            "статус": re.sub(r"\s*ЕН$", "", raw_status).strip(), "тип": adm_type,
            "пост_дата": adm.group(1) if adm else "", "пост_час": adm.group(2) if adm else "",
            "вип_дата": dis.group(1) if dis else "", "вип_час": dis.group(2) if dis else "",
            "відділення": dept, "doc_name": short_doc(doc_full) if doc_full else "",
            "icd": icd, "діагноз": dx_txt[len(icd):].strip() if icd else dx_txt,
        })
    return out


# ── Запис у БД (параметризовано, через psycopg2) ───────────────────────────────
# Нормалізація ПІБ для звірки: нижній регістр, без апострофів, схлопнуті пробіли.
# Захищає від дублів через дрібні розбіжності написання (пробіли/регістр/'/ʼ/’).
def _norm(col):
    return ("regexp_replace(regexp_replace(lower(btrim(" + col + ")), "
            "'[ʼ''’`]', '', 'g'), '\\s+', ' ', 'g')")

# Пацієнт «існує», якщо нормалізований ПІБ + дата народження вже є.
# DISTINCT ON прибирає дублі того самого пацієнта в межах однієї партії.
PAT_SQL = ("""
INSERT INTO patients_best (patient_id, full_name, patient_name, patient_prename, parental, gender, age, birthday)
SELECT (SELECT COALESCE(MAX(patient_id),0) FROM patients_best) + ROW_NUMBER() OVER (ORDER BY full_name),
       full_name, sname, fname, parental, NULLIF(gender,''), age, birthday
FROM (
  SELECT DISTINCT ON (""" + _norm("full_name") + """, COALESCE(birthday,''))
         full_name, sname, fname, parental, gender, age, birthday
  FROM ( {pv} ) AS v(full_name, sname, fname, parental, gender, age, birthday)
  WHERE NOT EXISTS (
    SELECT 1 FROM patients_best p
    WHERE """ + _norm("p.full_name") + "=" + _norm("v.full_name") + """
      AND COALESCE(p.birthday,'')=COALESCE(v.birthday,'')
  )
) d;
""")
CASE_SQL = ("""
INSERT INTO lsmd (id_case, helsi_no, patient_name, birth_date, gender, age, birth_date_d,
  admission_date, admission_date_d, admission_ts, admission_time,
  discharge_date, discharge_date_d, discharge_ts,
  admission_department, current_department, icd_primary, doc_name, doctor_id, patient_id, length_of_stay, helsi_status, admission_type)
SELECT (SELECT COALESCE(MAX(id_case),0) FROM lsmd) + ROW_NUMBER() OVER (ORDER BY v.helsi_no),
  v.helsi_no, v.full_name, v.birthday_txt, NULLIF(v.gender,''), v.age, v.birth_d::date,
  v.adm_raw, v.adm_d::date, v.adm_ts::timestamp, v.adm_time,
  v.dis_raw, v.dis_d::date, v.dis_ts::timestamp,
  v.dept, v.dept, NULLIF(v.icd,''), NULLIF(v.doc_name,''),
  (SELECT min(d.doctor_id) FROM lsmd_doctors d WHERE d.doc_name=NULLIF(v.doc_name,'')),
  (SELECT min(p.patient_id) FROM patients_best p
     WHERE """ + _norm("p.full_name") + "=" + _norm("v.full_name") + """
       AND COALESCE(p.birthday,'')=COALESCE(v.birthday_txt,'')),
  CASE WHEN v.dis_d IS NOT NULL THEN (v.dis_d::date - v.adm_d::date) END,
  NULLIF(v.helsi_status,''), NULLIF(v.adm_type,'')
FROM ( {cv} ) AS v(helsi_no, full_name, birthday_txt, gender, age, birth_d, adm_raw, adm_d, adm_ts, adm_time, dis_raw, dis_d, dis_ts, dept, icd, doc_name, helsi_status, adm_type)
WHERE NOT EXISTS (SELECT 1 FROM lsmd l WHERE l.helsi_no=v.helsi_no);
""")


def values_block(rows, cols, rowfn):
    """Будує 'VALUES (%s,..),(..)' + плаский список параметрів."""
    ph = "(" + ",".join(["%s"] * cols) + ")"
    params = []
    for r in rows:
        params.extend(rowfn(r))
    return "VALUES " + ",".join([ph] * len(rows)), params


def pat_row(r):
    return [r['піб'], r['прізвище'], r['імʼя'], r['побатькові'], r['стать'], r['вік'], r['дата_народження']]


def case_row(r):
    bd = iso(r['дата_народження'])
    adm_d = iso(r['пост_дата']) if r['пост_дата'] else None
    adm_ts = f"{adm_d} {r['пост_час']}:00" if adm_d else None
    dis_d = iso(r['вип_дата']) if r['вип_дата'] else None
    dis_ts = f"{dis_d} {r['вип_час']}:00" if dis_d else None
    return [r['helsi_no'], r['піб'], r['дата_народження'], r['стать'], str(r['вік']), bd,
            (r['пост_дата'] + ' ' + r['пост_час']).strip(), adm_d, adm_ts, r['пост_час'] or None,
            (r['вип_дата'] + ' ' + r['вип_час']).strip() or None, dis_d, dis_ts,
            r['відділення'], r['icd'], r['doc_name'], r['статус'], r['тип']]


def run_db(rows, commit):
    # той самий патерн підключення, що й решта скриптів проєкту (lsmd_db / psycopg3 / SUPABASE_DB_URL)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try:
        import psycopg
        from lsmd_db import DB_URL
    except ImportError as e:
        sys.exit(f"Залежності/конект: {e}\n  pip install -r scripts/requirements.txt + SUPABASE_DB_URL у .env")
    pv, pparams = values_block(rows, 7, pat_row)
    cv, cparams = values_block(rows, 18, case_row)
    conn = psycopg.connect(DB_URL)
    try:
        cur = conn.cursor()
        cur.execute("SELECT (SELECT COUNT(*) FROM patients_best),(SELECT COUNT(*) FROM lsmd)")
        pb0, l0 = cur.fetchone()
        cur.execute(PAT_SQL.format(pv=pv), pparams)
        cur.execute(CASE_SQL.format(cv=cv), cparams)
        # Дозаповнення відділення: якщо випадок уже є в БД з порожнім відділенням,
        # а повторний файл дає назву — проставити її (наявні непорожні не чіпаємо).
        dept_rows = [r for r in rows if (r['відділення'] or '').strip()]
        filled = 0
        if dept_rows:
            dv = "VALUES " + ",".join(["(%s,%s)"] * len(dept_rows))
            dparams = []
            for r in dept_rows:
                dparams.extend([r['helsi_no'], r['відділення']])
            cur.execute(f"""
                UPDATE lsmd l
                SET admission_department = v.dept, current_department = v.dept
                FROM ( {dv} ) AS v(helsi_no, dept)
                WHERE l.helsi_no = v.helsi_no
                  AND COALESCE(NULLIF(btrim(l.admission_department),''),'') = ''
            """, dparams)
            filled = cur.rowcount
        # Дозаповнення/оновлення helsi-статусу для наявних випадків (статус змінюється з часом:
        # Відкритий → На виписці → Закритий), тож оновлюємо завжди, коли файл дає значення.
        st_rows = [r for r in rows if (r['статус'] or '').strip()]
        st_filled = 0
        if st_rows:
            sv = "VALUES " + ",".join(["(%s,%s)"] * len(st_rows))
            sparams = []
            for r in st_rows:
                sparams.extend([r['helsi_no'], r['статус']])
            cur.execute(f"""
                UPDATE lsmd l
                SET helsi_status = v.st
                FROM ( {sv} ) AS v(helsi_no, st)
                WHERE l.helsi_no = v.helsi_no
                  AND COALESCE(l.helsi_status,'') <> v.st
            """, sparams)
            st_filled = cur.rowcount
        # Дозаповнення типу госпіталізації (Екстренна/Планова) для наявних випадків з порожнім типом.
        tp_rows = [r for r in rows if (r['тип'] or '').strip()]
        tp_filled = 0
        if tp_rows:
            tv = "VALUES " + ",".join(["(%s,%s)"] * len(tp_rows))
            tparams = []
            for r in tp_rows:
                tparams.extend([r['helsi_no'], r['тип']])
            cur.execute(f"""
                UPDATE lsmd l
                SET admission_type = v.tp
                FROM ( {tv} ) AS v(helsi_no, tp)
                WHERE l.helsi_no = v.helsi_no
                  AND COALESCE(NULLIF(btrim(l.admission_type),''),'') = ''
            """, tparams)
            tp_filled = cur.rowcount
        cur.execute("SELECT (SELECT COUNT(*) FROM patients_best),(SELECT COUNT(*) FROM lsmd)")
        pb1, l1 = cur.fetchone()
        print(f"Нових пацієнтів: {pb1 - pb0} | нових випадків: {l1 - l0} "
              f"| відділень: {filled} | статусів: {st_filled} | типів: {tp_filled}")
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
    ap.add_argument("--dept", default="", help="назва відділення для файлів без рядка «Відділення:» (вигляд «Мої пацієнти»)")
    ap.add_argument("--check", action="store_true", help="dry-run у БД (відкат)")
    ap.add_argument("--commit", action="store_true", help="записати в БД")
    a = ap.parse_args()
    rows = parse(pdf_text(a.pdf), dept_override=a.dept)
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
