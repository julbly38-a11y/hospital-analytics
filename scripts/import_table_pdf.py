#!/usr/bin/env python3
"""
Імпорт випадків госпіталізації з нових PDF-таблиць helsi
(формат «Стаціонар → Випадки госпіталізації», сторінки по 50 випадків)
у таблиці lsmd / patients_best.

ВИКОРИСТАННЯ:
    python scripts/import_table_pdf.py file.pdf            # CSV для перевірки
    python scripts/import_table_pdf.py /папка/*.pdf        # кілька файлів
    python scripts/import_table_pdf.py file.pdf --check   # dry-run у БД (відкат)
    python scripts/import_table_pdf.py file.pdf --commit  # запис у БД
"""
import sys, re, csv, os, argparse, glob

try:
    import logging
    logging.getLogger("pypdf").setLevel(logging.ERROR)
    from pypdf import PdfReader
except ImportError:
    sys.exit("pip install pypdf")

ROW_RE = re.compile(
    r'(\d{4,6})\s+'
    r'((?:[А-ЯІЇЄҐ\-][а-яіїєґʼ\'\-А-ЯІЇЄҐ]*\s+){1,4}?)'
    r'(\d{2}\.\d{2}\.\d{4})\s*\(\s*(\d+)\s*р\.\)'
)

STATUS_LIST = [
    "Зареєстровано в ЕСОЗ",
    "Очікує на реєстрацію в ЕСОЗ",
    "На виписці",
    "Відкритий",
    "Закритий",
]
STATUS_RE = re.compile(
    r'((?:' + '|'.join(re.escape(s) for s in STATUS_LIST) + r')(?:\s*/\s*ЕН)?)'
)
DATE_TIME_RE = re.compile(r'(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})')
ICD_RE = re.compile(r'^([A-Z]\d{2}(?:\.\d{1,2})?)\b')

CARD_FIX = {104339: 10439}

DEPT_MAP = {
    "Центр невідкладної неврології з інсультним блоком": "Центр невідкладної неврології",
}


def normalize_dept(dept):
    d = re.sub(r"\s+", " ", (dept or "")).strip()
    return DEPT_MAP.get(d, d)


def iso(d):
    dd, mm, yy = d.split("."); return f"{yy}-{mm}-{dd}"


def gender_from_parental(par):
    p = (par or "").lower()
    return "Ж" if p.endswith(("вна", "на")) else ("Ч" if p.endswith(("ич", "іч")) else "")


def pdf_text(path):
    return re.sub(r"\s+", " ",
                  " ".join((pg.extract_text() or "") for pg in PdfReader(path).pages))


def parse_tail(tail):
    tail = tail.strip()
    sm = STATUS_RE.match(tail)
    status = sm.group(1).strip() if sm else "Відкритий"
    en = "ЕН" in status
    status = re.sub(r"\s*/\s*ЕН", "", status).strip()
    rest = tail[sm.end():].strip() if sm else tail

    adm_date = adm_time = ""
    dm = DATE_TIME_RE.match(rest)
    if dm:
        adm_date, adm_time = dm.group(1), dm.group(2)
        rest = rest[dm.end():].strip()
    elif rest.startswith("Не призначено"):
        rest = rest[len("Не призначено"):].strip()

    dis_date = dis_time = ""
    dm = DATE_TIME_RE.match(rest)
    if dm:
        dis_date, dis_time = dm.group(1), dm.group(2)
        rest = rest[dm.end():].strip()
    elif rest.startswith("Не призначено"):
        rest = rest[len("Не призначено"):].strip()

    doc = ""
    doc_m = re.match(r'([А-ЯІЇЄҐ][а-яіїєґ\-]+(?:-[А-ЯІЇЄҐ][а-яіїєґ\-]+)*\s+[А-ЯІЇЄҐ]\.\s*[А-ЯІЇЄҐ]\.'
                     r'(?:\s+[А-ЯІЇЄҐ]\.)?)', rest)
    if doc_m:
        doc = doc_m.group(1).strip()
        rest = rest[doc_m.end():].strip()
    elif rest.startswith("Не призначено"):
        rest = rest[len("Не призначено"):].strip()

    icd = ""
    first = rest.strip().split()[0] if rest.strip() else ""
    im = ICD_RE.match(first)
    if im:
        icd = im.group(1)

    return status, en, adm_date, adm_time, dis_date, dis_time, doc, icd


def is_valid_helsi_no(n):
    """helsi_no повинен бути в розумному діапазоні (не рік, не красиве число)."""
    if n < 100:
        return False
    # Підозрілі «красиві» числа
    if n in (12345, 456789, 123456):
        return False
    # Рік (2020–2030)
    if 2020 <= n <= 2030:
        return False
    return True


def parse_pdf(path, dept_override="", debug=False):
    text = pdf_text(path)
    matches = list(ROW_RE.finditer(text))
    rows = []
    skipped = []

    for i, m in enumerate(matches):
        helsi_raw = int(m.group(1))
        helsi_no = CARD_FIX.get(helsi_raw, helsi_raw)

        if not is_valid_helsi_no(helsi_no):
            skipped.append((helsi_raw, m.group(2).strip(), m.group(3)))
            continue

        pib = re.sub(r"\s+", " ", m.group(2)).strip()
        bday = m.group(3)
        age = int(m.group(4))

        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        tail = text[m.end():end]

        status, en, adm_date, adm_time, dis_date, dis_time, doc, icd = parse_tail(tail)

        parts = pib.split()
        while len(parts) < 3: parts.append("")
        parts = [w.title() if w.isupper() and len(w) > 1 else w for w in parts]

        rows.append({
            "helsi_no": helsi_no,
            "піб": " ".join(parts).strip(),
            "прізвище": parts[0],
            "імʼя": parts[1] if len(parts) > 1 else "",
            "побатькові": parts[2] if len(parts) > 2 else "",
            "стать": gender_from_parental(parts[2] if len(parts) > 2 else ""),
            "дата_народження": bday,
            "вік": age,
            "статус": status,
            "тип": "Екстренна" if en else "Планова",
            "пост_дата": adm_date,
            "пост_час": adm_time,
            "вип_дата": dis_date,
            "вип_час": dis_time,
            "відділення": normalize_dept(dept_override),
            "doc_name": doc,
            "icd": icd,
        })

    if debug and skipped:
        print(f"  ПРОПУЩЕНО (невалідний helsi_no): {skipped}")

    return _dedup(rows), skipped


def _dedup(rows):
    def score(r):
        return (4 if r["вип_дата"] else 0) + (2 if r["icd"] else 0) + (1 if r["doc_name"] else 0)
    best = {}
    for r in rows:
        h = r["helsi_no"]
        if h not in best or score(r) > score(best[h]):
            best[h] = r
    seen, out = set(), []
    for r in rows:
        if r["helsi_no"] not in seen:
            seen.add(r["helsi_no"]); out.append(best[r["helsi_no"]])
    return out


# ── БД ────────────────────────────────────────────────────────────────────────

def _norm(col):
    return ("regexp_replace(regexp_replace(lower(btrim(" + col + ")), "
            "$q$[ʼ'''`]$q$, '', 'g'), '\\s+', ' ', 'g')")


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
  admission_department, current_department, icd_primary, doc_name, doctor_id, patient_id,
  length_of_stay, helsi_status, admission_type)
SELECT (SELECT COALESCE(MAX(id_case),0) FROM lsmd) + ROW_NUMBER() OVER (ORDER BY v.helsi_no),
  v.helsi_no, v.full_name, v.birthday_txt, NULLIF(v.gender,''), v.age, v.birth_d::date,
  v.adm_raw, v.adm_d::date, v.adm_ts::timestamp, v.adm_time,
  v.dis_raw, v.dis_d::date, v.dis_ts::timestamp,
  v.dept, v.dept, NULLIF(v.icd,''),
  (SELECT e.emp_name FROM empl e WHERE e.emp_name=NULLIF(v.doc_name,'') LIMIT 1),
  (SELECT min(d.doctor_id) FROM lsmd_doctors d WHERE d.doc_name=NULLIF(v.doc_name,'')),
  (SELECT min(p.patient_id) FROM patients_best p
     WHERE """ + _norm("p.full_name") + "=" + _norm("v.full_name") + """
       AND COALESCE(p.birthday,'')=COALESCE(v.birthday_txt,'')),
  CASE WHEN v.dis_d IS NOT NULL THEN (v.dis_d::date - v.adm_d::date) END,
  NULLIF(v.helsi_status,''), NULLIF(v.adm_type,'')
FROM ( {cv} ) AS v(helsi_no, full_name, birthday_txt, gender, age, birth_d, adm_raw, adm_d, adm_ts,
       adm_time, dis_raw, dis_d, dis_ts, dept, icd, doc_name, helsi_status, adm_type)
WHERE NOT EXISTS (SELECT 1 FROM lsmd l WHERE l.helsi_no=v.helsi_no);
""")


def values_block(rows, cols, rowfn):
    ph = "(" + ",".join(["%s"] * cols) + ")"
    params = []
    for r in rows: params.extend(rowfn(r))
    return "VALUES " + ",".join([ph] * len(rows)), params


def pat_row(r):
    return [r["піб"], r["прізвище"], r["імʼя"], r["побатькові"],
            r["стать"], r["вік"], r["дата_народження"]]


def case_row(r):
    bd = iso(r["дата_народження"]) if r["дата_народження"] else None
    adm_d = iso(r["пост_дата"]) if r["пост_дата"] else None
    adm_ts = f"{adm_d} {r['пост_час']}:00" if adm_d and r["пост_час"] else None
    dis_d = iso(r["вип_дата"]) if r["вип_дата"] else None
    dis_ts = f"{dis_d} {r['вип_час']}:00" if dis_d and r["вип_час"] else None
    return [r["helsi_no"], r["піб"], r["дата_народження"], r["стать"], str(r["вік"]), bd,
            (r["пост_дата"] + " " + r["пост_час"]).strip() or None, adm_d, adm_ts, r["пост_час"] or None,
            (r["вип_дата"] + " " + r["вип_час"]).strip() or None, dis_d, dis_ts,
            r["відділення"], r["icd"], r["doc_name"], r["статус"], r["тип"]]


def run_db(all_rows, commit):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try:
        import psycopg
        from lsmd_db import DB_URL
    except ImportError as e:
        sys.exit(f"Залежності/конект: {e}")

    conn = psycopg.connect(DB_URL)
    try:
        cur = conn.cursor()
        cur.execute("SELECT (SELECT COUNT(*) FROM patients_best),(SELECT COUNT(*) FROM lsmd)")
        pb0, l0 = cur.fetchone()

        BATCH = 200
        by_doc = by_icd = st_filled = tp_filled = 0

        for start in range(0, len(all_rows), BATCH):
            batch = all_rows[start:start + BATCH]
            pv, pparams = values_block(batch, 7, pat_row)
            cv, cparams = values_block(batch, 18, case_row)
            cur.execute(PAT_SQL.format(pv=pv), pparams)
            cur.execute(CASE_SQL.format(cv=cv), cparams)

            helsi_ids = [r["helsi_no"] for r in batch]
            hv = "VALUES " + ",".join(["(%s)"] * len(helsi_ids))

            cur.execute(f"""
                UPDATE lsmd l
                SET admission_department = e.department, current_department = e.department
                FROM lsmd_doctors d JOIN empl e ON e.name_id = d.empl_name_id
                WHERE l.doctor_id = d.doctor_id
                  AND l.helsi_no IN (SELECT * FROM ({hv}) AS t(helsi_no))
                  AND COALESCE(NULLIF(btrim(l.admission_department),''),'') = ''
                  AND COALESCE(NULLIF(btrim(e.department),''),'') <> ''
            """, helsi_ids)
            by_doc += cur.rowcount

            cur.execute(f"""
                UPDATE lsmd l
                SET admission_department = m.dept, current_department = m.dept
                FROM (
                  SELECT icd3, dept FROM (
                    SELECT LEFT(icd_primary,3) AS icd3, admission_department AS dept,
                           ROW_NUMBER() OVER (PARTITION BY LEFT(icd_primary,3) ORDER BY count(*) DESC) rn
                    FROM lsmd
                    WHERE COALESCE(admission_department,'')<>'' AND COALESCE(icd_primary,'')<>''
                    GROUP BY LEFT(icd_primary,3), admission_department
                  ) t WHERE rn=1
                ) m
                WHERE LEFT(l.icd_primary,3) = m.icd3
                  AND l.helsi_no IN (SELECT * FROM ({hv}) AS t(helsi_no))
                  AND COALESCE(NULLIF(btrim(l.admission_department),''),'') = ''
                  AND COALESCE(l.icd_primary,'')<>''
            """, helsi_ids)
            by_icd += cur.rowcount

            st_rows = [r for r in batch if (r["статус"] or "").strip()]
            if st_rows:
                sv = "VALUES " + ",".join(["(%s,%s)"] * len(st_rows))
                sparams = []
                for r in st_rows: sparams.extend([r["helsi_no"], r["статус"]])
                cur.execute(f"""
                    UPDATE lsmd l SET helsi_status = v.st
                    FROM ({sv}) AS v(helsi_no, st)
                    WHERE l.helsi_no = v.helsi_no AND COALESCE(l.helsi_status,'') <> v.st
                """, sparams)
                st_filled += cur.rowcount

            tp_rows = [r for r in batch if (r["тип"] or "").strip()]
            if tp_rows:
                tv = "VALUES " + ",".join(["(%s,%s)"] * len(tp_rows))
                tparams = []
                for r in tp_rows: tparams.extend([r["helsi_no"], r["тип"]])
                cur.execute(f"""
                    UPDATE lsmd l SET admission_type = v.tp
                    FROM ({tv}) AS v(helsi_no, tp)
                    WHERE l.helsi_no = v.helsi_no AND COALESCE(NULLIF(btrim(l.admission_type),''),'') = ''
                """, tparams)
                tp_filled += cur.rowcount

        cur.execute("SELECT (SELECT COUNT(*) FROM patients_best),(SELECT COUNT(*) FROM lsmd)")
        pb1, l1 = cur.fetchone()
        print(f"Нових пацієнтів: {pb1 - pb0} | нових випадків: {l1 - l0} "
              f"| відділень(лікар): {by_doc} | відділень(діагноз): {by_icd} "
              f"| статусів: {st_filled} | типів: {tp_filled}")
        if commit:
            conn.commit(); print("✅ ЗАПИСАНО в БД.")
        else:
            conn.rollback(); print("DRY-RUN: відкочено. Для запису додай --commit.")
    finally:
        conn.close()


def main():
    ap = argparse.ArgumentParser(description="Імпорт таблиць helsi (PDF) у lsmd/patients_best")
    ap.add_argument("pdfs", nargs="+", help="PDF-файл(и) або шаблон glob")
    ap.add_argument("--dept", default="", help="назва відділення")
    ap.add_argument("--csv", help="шлях для CSV (лише 1 файл)")
    ap.add_argument("--check", action="store_true", help="dry-run у БД (відкат)")
    ap.add_argument("--commit", action="store_true", help="записати в БД")
    ap.add_argument("--debug", action="store_true", help="показати пропущені записи")
    a = ap.parse_args()

    files = []
    for p in a.pdfs:
        expanded = glob.glob(p)
        files.extend(sorted(expanded) if expanded else [p])

    all_rows = []
    all_skipped = []
    for path in files:
        rows, skipped = parse_pdf(path, dept_override=a.dept, debug=a.debug)
        all_skipped.extend(skipped)
        print(f"{os.path.basename(path)}: {len(rows)} записів "
              f"| МКХ: {sum(1 for r in rows if r['icd'])} "
              f"| лікар: {sum(1 for r in rows if r['doc_name'])} "
              f"| виписаних: {sum(1 for r in rows if r['вип_дата'])} "
              f"| екстрених: {sum(1 for r in rows if r['тип'] == 'Екстренна')}"
              + (f" | пропущено: {len(skipped)}" if skipped else ""))
        all_rows.extend(rows)

    all_rows = _dedup(all_rows)

    if all_skipped:
        print(f"\n⚠️  Пропущено {len(all_skipped)} записів з невалідним helsi_no:")
        for helsi_raw, pib, bday in all_skipped:
            print(f"   helsi_no={helsi_raw}  ПІБ={pib}  ДН={bday}")

    print(f"\nВсього унікальних записів: {len(all_rows)}")

    if len(files) == 1 and not (a.check or a.commit):
        csv_path = a.csv or os.path.splitext(files[0])[0] + "_cases.csv"
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(all_rows[0].keys()))
            w.writeheader(); w.writerows(all_rows)
        print(f"CSV: {csv_path}")

    if a.check or a.commit:
        run_db(all_rows, commit=a.commit)


if __name__ == "__main__":
    main()
