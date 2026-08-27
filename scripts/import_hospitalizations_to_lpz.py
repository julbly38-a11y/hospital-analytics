#!/usr/bin/env python3
"""
Імпорт госпіталізацій з сирого /api/cards JSON helsi.pro напряму в lpz_hospitalizations.

На відміну від старого import_helsi_cards_json.py (писав у стару lsmd/patients_best,
укр. ключі, department/doctor матчились по НАЗВІ) — цей пише в нову універсальну
lpz_hospitalizations і матчить відділення по structureId (inpatientDepartment),
а не по назві — надійніше, 0 ризику синонімів.

org_edrpou береться з meta файлу (сам helsi його туди кладе), лікарню вказувати
не треба. id_case = helsi_no (number картки) — для нового пайплайну (не старої
до-helsi історії) helsi_no є в 100% записів, тож окремий сурогатний лічильник не
потрібен.

Лікар (doc_resource_id) у /api/cards ЗАВЖДИ порожній (participant: [] в
admissionEncounter) — це відомий розрив, закривається окремо через
helsi_extract_severity_merge.js (encounter_cases.care_manager), не цим скриптом.

Використання:
    python3 scripts/import_hospitalizations_to_lpz.py raw/<лікарня>/hospitalizations_*.json --check
    python3 scripts/import_hospitalizations_to_lpz.py raw/<лікарня>/hospitalizations_*.json --commit

Підключення до БД: змінна оточення LPZ_DB_URL, або --db-url.
"""
import sys, os, json, glob, argparse, re

try:
    import psycopg
except ImportError:
    print("[!] Потрібен psycopg: pip install 'psycopg[binary]'")
    sys.exit(1)


NUMBER_YEAR_RE = re.compile(r"^(\d+)-(\d{4})$")


def parse_card_number(number):
    """'11500' -> 11500 (ЛШМД). '6316-2026' -> рік*1_000_000+номер (Хотин, унікально в межах лікарні)."""
    if number is None:
        return None
    m = NUMBER_YEAR_RE.match(number)
    if m:
        num, year = int(m.group(1)), int(m.group(2))
        return year * 1_000_000 + num
    try:
        return int(number)
    except (TypeError, ValueError):
        return None


def load_legacy_dept_map(project_root):
    """org_edrpou -> {старий structureId: новий structureId}, з mappings/*_legacy_department_ids.json."""
    legacy_map = {}
    for path in glob.glob(os.path.join(project_root, "mappings", "*_legacy_department_ids.json")):
        d = json.load(open(path, encoding="utf-8"))
        org_edrpou = d["org_edrpou"]
        bucket = legacy_map.setdefault(org_edrpou, {})
        for m in d["mappings"]:
            bucket[m["old_structure_id"]] = m["new_structure_id"]
    return legacy_map


def split_iso(dt_str):
    """'2026-07-10T13:00:00+03:00' -> (date, time) або (None, None)."""
    if not dt_str:
        return None, None
    date_part, time_part = dt_str.split("T")
    return date_part, time_part[:5]


def card_to_row(c, org_edrpou):
    p = c.get("patient") or {}
    pd = c.get("patientData") or {}
    last, first, middle = p.get("lastName", ""), p.get("firstName", ""), p.get("middleName", "")
    full_name = " ".join(x for x in [last, first, middle] if x)

    birth_date, _ = split_iso(pd.get("birthDate") or "")
    age = (pd.get("age") or {}).get("years")

    adm_date, adm_time = split_iso(c.get("start"))
    dis_date, dis_time = split_iso(c.get("end"))

    ae = c.get("admissionEncounter") or {}
    diagnoses = ae.get("diagnoses") or []
    icd = None
    if diagnoses:
        code_obj = (diagnoses[0].get("condition") or {}).get("code") or {}
        icd = (code_obj.get("icd10Am") or {}).get("code") or None

    status = {"Active": "Відкритий", "Complete": "Закритий"}.get(c.get("status"), c.get("status"))
    admission_type = "Екстренна" if c.get("admissionSource") == "emergency" else "Планова"

    helsi_no = parse_card_number(c.get("number"))
    if helsi_no is None:
        return None  # без номера картки (або нерозпізнаний формат) нема id_case — пропускаємо

    return {
        "org_edrpou": org_edrpou,
        "id_case": helsi_no,
        "helsi_no": helsi_no,
        "patient_name": full_name,
        "last_name": last or None, "first_name": first or None, "middle_name": middle or None,
        "gender": "Ч" if pd.get("sex") is True else ("Ж" if pd.get("sex") is False else None),
        "birth_date": birth_date,
        "age": age,
        "status": status,
        "admission_type": admission_type,
        "admission_date": adm_date, "admission_time": adm_time,
        "discharge_date": dis_date, "discharge_time": dis_time,
        "department_structure_id": c.get("inpatientDepartment") or None,
        "department_name": c.get("inpatientDepartmentName") or "",
        "icd_primary": icd,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+")
    ap.add_argument("--check", action="store_true", help="dry-run у БД (відкат)")
    ap.add_argument("--commit", action="store_true", help="записати в БД")
    ap.add_argument("--db-url", default=os.environ.get("LPZ_DB_URL"))
    ap.add_argument("--org-edrpou", help="Перекриває org_edrpou з meta (для старих вигрузок без цього поля)")
    a = ap.parse_args()

    files = []
    for pth in a.files:
        expanded = glob.glob(pth)
        files.extend(sorted(expanded) if expanded else [pth])

    rows, skipped, org_edrpou = [], 0, a.org_edrpou
    for path in files:
        bundle = json.load(open(path, encoding="utf-8"))
        meta_org = (bundle.get("meta") or {}).get("org_edrpou")
        if meta_org:
            org_edrpou = meta_org
        cards = bundle.get("data", [])
        for c in cards:
            row = card_to_row(c, org_edrpou)
            if row is None:
                skipped += 1
            else:
                rows.append(row)
        print(f"{os.path.basename(path)}: {len(cards)} карток")

    if not org_edrpou:
        print("[!] Не знайшов org_edrpou в meta жодного файлу — нема куди писати.")
        sys.exit(1)

    # дедуп по id_case (якщо один і той самий номер трапився і в open, і в closed)
    by_id_case = {r["id_case"]: r for r in rows}
    rows = list(by_id_case.values())

    print(f"\norg_edrpou: {org_edrpou}")
    print(f"Всього унікальних записів: {len(rows)} (пропущено без номера картки: {skipped})")
    print(f"  з відділенням (structureId): {sum(1 for r in rows if r['department_structure_id'])}")
    print(f"  з МКХ:                       {sum(1 for r in rows if r['icd_primary'])}")
    print(f"  з датою народження:          {sum(1 for r in rows if r['birth_date'])}")
    print(f"  з лікарем:                   0  (очікувано — /api/cards його не дає, окремий мердж)")

    if not (a.check or a.commit):
        print("\nВкажи --check (dry-run у БД, без запису) або --commit (запис).")
        return

    if not a.db_url:
        print("[!] Потрібен --db-url або змінна оточення LPZ_DB_URL")
        sys.exit(1)

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    legacy_dept_map = load_legacy_dept_map(project_root).get(org_edrpou, {})

    with psycopg.connect(a.db_url) as conn:
        with conn.cursor() as cur:
            # відділення, яких нема в lpz_departments — спершу пробуємо legacy-мапінг (старий helsi structureId -> новий),
            # лишок (справді невідомі) обнуляємо, щоб не ламати батч
            cur.execute("SELECT structure_id FROM lpz_departments WHERE org_edrpou = %s", (org_edrpou,))
            valid_depts = {str(r[0]) for r in cur.fetchall()}
            remapped, unmatched = 0, set()
            for r in rows:
                sid = r["department_structure_id"]
                if sid and sid not in valid_depts:
                    new_sid = legacy_dept_map.get(sid)
                    if new_sid:
                        r["department_structure_id"] = new_sid
                        remapped += 1
                    else:
                        unmatched.add(sid)
                        r["department_structure_id"] = None
            if remapped:
                print(f"\n[i] {remapped} записів перемаплено зі старого structureId на новий (legacy-мапінг).")
            if unmatched:
                print(f"[!] structureId відділень поза lpz_departments і поза legacy-мапінгом ({len(unmatched)} шт.) — обнулено FK: {sorted(unmatched)}")

            cols = ["org_edrpou", "id_case", "helsi_no", "patient_name", "last_name", "first_name",
                    "middle_name", "gender", "birth_date", "age", "status", "admission_type",
                    "admission_date", "admission_time", "discharge_date", "discharge_time",
                    "department_structure_id", "department_name", "icd_primary"]
            placeholders = ", ".join(f"%({c})s" for c in cols)
            sql = f"""
                INSERT INTO lpz_hospitalizations ({", ".join(cols)})
                VALUES ({placeholders})
                ON CONFLICT (org_edrpou, id_case) DO UPDATE SET
                    status = EXCLUDED.status,
                    discharge_date = EXCLUDED.discharge_date,
                    discharge_time = EXCLUDED.discharge_time,
                    department_structure_id = EXCLUDED.department_structure_id,
                    department_name = EXCLUDED.department_name,
                    icd_primary = EXCLUDED.icd_primary
            """
            cur.executemany(sql, rows)
            print(f"\n{'[COMMIT]' if a.commit else '[CHECK, rollback]'} записано/оновлено {cur.rowcount if cur.rowcount != -1 else len(rows)} рядків")
        if a.commit:
            conn.commit()
            print("Закомічено.")
        else:
            conn.rollback()
            print("Відкочено (dry-run).")


if __name__ == "__main__":
    main()
