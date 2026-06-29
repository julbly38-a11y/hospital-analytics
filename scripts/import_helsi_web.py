#!/usr/bin/env python3
"""
Імпорт випадків госпіталізації з тексту веб-сторінки helsi.pro
(Стаціонар → Випадки госпіталізації), отриманого через Chrome (get_page_text).

Це заміна старого флоу cowork (Chrome → raw_txt/PDF → import_raw_txt.py):
тепер текст сторінки парситься напряму, без проміжних PDF.

ФОРМАТ запису (рядки innerText, через порожні рядки):
    ПІБ
    №NNNNN
    DD.MM.YYYY (NN р.)
    Статус            (Відкритий / Закритий / На виписці / Зареєстровано… / Очікує…)
    [ЕН]              (опціонально, окремий рядок — ознака екстреної)
    Госпіталізовано
    DD.MM.YYYY HH:MM  (або «Не призначено»)
    Виписано
    DD.MM.YYYY HH:MM  (або «Не призначено»)
    Місце надання послуг
    …                 (зазвичай «Не призначено»)
    Лікуючий лікар
    Прізвище Ім'я Побатькові, Лікар-спеціальність   (або «Не призначено»)
    Діагноз
    ICD Опис…         (або «Не призначено»)
    Призначення
    Дн, DD.MM.YYYY

ВИКОРИСТАННЯ:
    python scripts/import_helsi_web.py page1.txt page2.txt ...           # CSV-перевірка
    python scripts/import_helsi_web.py *.txt --min-date 27.06.2026       # фільтр по даті госпіталізації
    python scripts/import_helsi_web.py *.txt --min-date 27.06.2026 --check   # dry-run у БД
    python scripts/import_helsi_web.py *.txt --min-date 27.06.2026 --commit  # запис у БД

Ідемпотентно по helsi_no. Дублікати helsi_no для РІЗНИХ пацієнтів (буває в helsi)
виявляються і виводяться окремо — БД-INSERT по helsi_no залишить лише один,
тож вони потребують ручного рішення.
"""
import sys, re, csv, os, argparse, glob
from datetime import datetime

CARD_FIX = {104339: 10439}

DEPT_MAP = {
    "Центр невідкладної неврології з інсультним блоком": "Центр невідкладної неврології",
}

STATUSES = {
    "Відкритий", "Закритий", "На виписці",
    "Зареєстровано в ЕСОЗ", "Очікує на реєстрацію в ЕСОЗ",
}

DATE_TIME_RE = re.compile(r"(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})")
DOB_RE = re.compile(r"(\d{2}\.\d{2}\.\d{4})\s*\(\s*(\d+)\s*р\.?\)")
HELSI_RE = re.compile(r"^№\s*(\d+)$")
ICD_RE = re.compile(r"^([A-Z]\d{2}(?:\.\d{1,2})?)\b")


def normalize_dept(dept):
    d = re.sub(r"\s+", " ", (dept or "")).strip()
    return DEPT_MAP.get(d, d)


def iso(d):
    dd, mm, yy = d.split("."); return f"{yy}-{mm}-{dd}"


def short_doc(full):
    """«Савицька Юлія Анатоліївна» → «Савицька Ю. А.» (формат empl.emp_name)."""
    full = full.split(",")[0].strip()       # відкинути «, Лікар-уролог»
    p = full.split()
    if not p:
        return ""
    while len(p) < 3:
        p.append("")
    return f"{p[0]} {p[1][0] if p[1] else ''}. {p[2][0] if p[2] else ''}.".strip()


def gender_from_parental(par):
    p = (par or "").lower()
    return "Ж" if p.endswith(("вна", "на")) else ("Ч" if p.endswith(("ич", "іч")) else "")


def read_field(lines, i, label):
    """Якщо lines[i] == label → значення = наступний непорожній рядок."""
    if i < len(lines) and lines[i] == label:
        return (lines[i + 1] if i + 1 < len(lines) else ""), i + 2
    return None, i


def parse_text(text):
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    records = []
    # Якорі — позиції рядків «№NNNNN»
    helsi_idx = [i for i, l in enumerate(lines) if HELSI_RE.match(l)]

    for k, hi in enumerate(helsi_idx):
        m = HELSI_RE.match(lines[hi])
        helsi_raw = int(m.group(1))
        helsi_no = CARD_FIX.get(helsi_raw, helsi_raw)

        # ПІБ — рядок безпосередньо перед №
        pib = lines[hi - 1] if hi > 0 else ""

        # Далі: дата народж., статус, [ЕН], Госпіталізовано…
        j = hi + 1
        dob = age = ""
        if j < len(lines):
            dm = DOB_RE.match(lines[j])
            if dm:
                dob, age = dm.group(1), int(dm.group(2))
                j += 1

        status = ""
        if j < len(lines) and lines[j] in STATUSES:
            status = lines[j]
            j += 1

        en = False
        if j < len(lines) and lines[j] == "ЕН":
            en = True
            j += 1

        # Поля з мітками (можуть йти в довільному порядку, але зазвичай так):
        adm_date = adm_time = dis_date = dis_time = ""
        doc = icd = ""
        # Скануємо до наступного якоря (або кінця)
        end = helsi_idx[k + 1] - 1 if k + 1 < len(helsi_idx) else len(lines)
        # -1 бо рядок перед наступним № — це ПІБ наступного запису
        seg = lines[j:end]
        for s in range(len(seg)):
            if seg[s] == "Госпіталізовано" and s + 1 < len(seg):
                dtm = DATE_TIME_RE.match(seg[s + 1])
                if dtm:
                    adm_date, adm_time = dtm.group(1), dtm.group(2)
            elif seg[s] == "Виписано" and s + 1 < len(seg):
                dtm = DATE_TIME_RE.match(seg[s + 1])
                if dtm:
                    dis_date, dis_time = dtm.group(1), dtm.group(2)
            elif seg[s] == "Лікуючий лікар" and s + 1 < len(seg):
                val = seg[s + 1]
                if val and val != "Не призначено":
                    doc = short_doc(val)
            elif seg[s] == "Діагноз" and s + 1 < len(seg):
                val = seg[s + 1]
                if val and val != "Не призначено":
                    im = ICD_RE.match(val)
                    icd = im.group(1) if im else ""

        parts = pib.split()
        parts = [w.title() if w.isupper() and len(w) > 1 else w for w in parts]
        while len(parts) < 3:
            parts.append("")

        records.append({
            "helsi_no": helsi_no,
            "піб": " ".join(parts).strip(),
            "прізвище": parts[0],
            "імʼя": parts[1] if len(parts) > 1 else "",
            "побатькові": parts[2] if len(parts) > 2 else "",
            "стать": gender_from_parental(parts[2] if len(parts) > 2 else ""),
            "дата_народження": dob,
            "вік": age,
            "статус": status,
            "тип": "Екстренна" if en else "Планова",
            "пост_дата": adm_date,
            "пост_час": adm_time,
            "вип_дата": dis_date,
            "вип_час": dis_time,
            "відділення": "",
            "doc_name": doc,
            "icd": icd,
        })
    return records


def _dedup(rows):
    """Дедуп по helsi_no АЛЕ лише якщо це той самий пацієнт (ПІБ+ДН).
    Різні пацієнти з тим самим helsi_no — лишаємо обох (із позначкою)."""
    def score(r):
        return (4 if r["вип_дата"] else 0) + (2 if r["icd"] else 0) + (1 if r["doc_name"] else 0)
    best = {}
    for r in rows:
        key = (r["helsi_no"], r["піб"], r["дата_народження"])
        if key not in best or score(r) > score(best[key]):
            best[key] = r
    seen, out = set(), []
    for r in rows:
        key = (r["helsi_no"], r["піб"], r["дата_народження"])
        if key not in seen:
            seen.add(key); out.append(best[key])
    return out


def find_helsi_collisions(rows):
    """helsi_no, під яким >1 різного пацієнта."""
    by_no = {}
    for r in rows:
        by_no.setdefault(r["helsi_no"], set()).add((r["піб"], r["дата_народження"]))
    return {h: pats for h, pats in by_no.items() if len(pats) > 1}


def filter_min_date(rows, min_date):
    """Лишити записи з пост_дата >= min_date (формат DD.MM.YYYY)."""
    md = datetime.strptime(min_date, "%d.%m.%Y").date()
    out = []
    for r in rows:
        if not r["пост_дата"]:
            continue
        d = datetime.strptime(r["пост_дата"], "%d.%m.%Y").date()
        if d >= md:
            out.append(r)
    return out


def last_db_date():
    """Остання дата госпіталізації в lsmd (DD.MM.YYYY) — джерело правди для --since-db.
    Беремо >= цієї дати; записи того ж дня, що вже є, відсіє дедуп на вставці."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import psycopg
    from lsmd_db import DB_URL
    conn = psycopg.connect(DB_URL)
    try:
        cur = conn.cursor()
        cur.execute("SELECT MAX(admission_date_d) FROM lsmd")
        d = cur.fetchone()[0]
        return d.strftime("%d.%m.%Y") if d else None
    finally:
        conn.close()


# ── БД (той самий SQL-патерн, що в import_raw_txt.py) ───────────────────────────

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
-- Випадок «існує», якщо збігається helsi_no + пацієнт (ПІБ+ДН).
-- helsi_no може дублюватись для РІЗНИХ пацієнтів (helsi перевикористовує номер),
-- тож дедуп по трійці, а не лише по номеру.
WHERE NOT EXISTS (
  SELECT 1 FROM lsmd l
  WHERE l.helsi_no = v.helsi_no
    AND """ + _norm("l.patient_name") + "=" + _norm("v.full_name") + """
    AND COALESCE(l.birth_date,'') = COALESCE(v.birthday_txt,'')
);
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

            # ВАЖЛИВО: матч по helsi_no + ПІБ + ДН (а не лише helsi_no), бо номер
            # може дублюватись для різних пацієнтів — інакше статуси/типи плутаються навхрест.
            st_rows = [r for r in batch if (r["статус"] or "").strip()]
            if st_rows:
                sv = "VALUES " + ",".join(["(%s,%s,%s,%s)"] * len(st_rows))
                sparams = []
                for r in st_rows: sparams.extend([r["helsi_no"], r["піб"], r["дата_народження"], r["статус"]])
                cur.execute(f"""
                    UPDATE lsmd l SET helsi_status = v.st
                    FROM ({sv}) AS v(helsi_no, pib, dob, st)
                    WHERE l.helsi_no = v.helsi_no
                      AND {_norm("l.patient_name")} = {_norm("v.pib")}
                      AND COALESCE(l.birth_date,'') = COALESCE(v.dob,'')
                      AND COALESCE(l.helsi_status,'') <> v.st
                """, sparams)
                st_filled += cur.rowcount

            tp_rows = [r for r in batch if (r["тип"] or "").strip()]
            if tp_rows:
                tv = "VALUES " + ",".join(["(%s,%s,%s,%s)"] * len(tp_rows))
                tparams = []
                for r in tp_rows: tparams.extend([r["helsi_no"], r["піб"], r["дата_народження"], r["тип"]])
                cur.execute(f"""
                    UPDATE lsmd l SET admission_type = v.tp
                    FROM ({tv}) AS v(helsi_no, pib, dob, tp)
                    WHERE l.helsi_no = v.helsi_no
                      AND {_norm("l.patient_name")} = {_norm("v.pib")}
                      AND COALESCE(l.birth_date,'') = COALESCE(v.dob,'')
                      AND COALESCE(NULLIF(btrim(l.admission_type),''),'') = ''
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
    ap = argparse.ArgumentParser(description="Імпорт випадків helsi з тексту веб-сторінки")
    ap.add_argument("files", nargs="+", help="txt-файл(и) з текстом сторінки helsi")
    ap.add_argument("--min-date", help="лишити записи з датою госпіталізації >= DD.MM.YYYY")
    ap.add_argument("--since-db", action="store_true",
                    help="авто: взяти min-date = остання дата госпіталізації в lsmd (без дублів, нічого пам'ятати)")
    ap.add_argument("--csv", help="шлях для CSV")
    ap.add_argument("--check", action="store_true", help="dry-run у БД (відкат)")
    ap.add_argument("--commit", action="store_true", help="записати в БД")
    a = ap.parse_args()

    # --since-db перекриває --min-date значенням з БД (джерело правди)
    if a.since_db:
        db_date = last_db_date()
        if db_date:
            a.min_date = db_date
            print(f"📅 --since-db: остання дата в lsmd = {db_date} → беремо записи >= неї")
        else:
            print("📅 --since-db: lsmd порожня — беремо всі записи")

    files = []
    for p in a.files:
        expanded = glob.glob(p)
        files.extend(sorted(expanded) if expanded else [p])

    all_rows = []
    for path in files:
        text = open(path, encoding="utf-8").read()
        rows = parse_text(text)
        print(f"{os.path.basename(path)}: {len(rows)} записів")
        all_rows.extend(rows)

    all_rows = _dedup(all_rows)

    if a.min_date:
        before = len(all_rows)
        all_rows = filter_min_date(all_rows, a.min_date)
        print(f"\nФільтр дати >= {a.min_date}: {len(all_rows)} з {before}")

    # Колізії helsi_no (різні пацієнти під одним номером)
    collisions = find_helsi_collisions(all_rows)
    if collisions:
        print(f"\n⚠️  КОЛІЗІЇ helsi_no (різні пацієнти, один номер) — БД залишить лише один:")
        for h, pats in collisions.items():
            print(f"   №{h}:")
            for pib, dob in pats:
                print(f"       {pib} ({dob})")

    print(f"\nВсього унікальних записів: {len(all_rows)} "
          f"| з МКХ: {sum(1 for r in all_rows if r['icd'])} "
          f"| з лікарем: {sum(1 for r in all_rows if r['doc_name'])} "
          f"| виписаних: {sum(1 for r in all_rows if r['вип_дата'])} "
          f"| екстрених: {sum(1 for r in all_rows if r['тип']=='Екстренна')}")

    if not (a.check or a.commit):
        csv_path = a.csv or "helsi_web_cases.csv"
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(all_rows[0].keys()))
            w.writeheader(); w.writerows(all_rows)
        print(f"CSV: {csv_path}")

    if a.check or a.commit:
        run_db(all_rows, commit=a.commit)


if __name__ == "__main__":
    main()
