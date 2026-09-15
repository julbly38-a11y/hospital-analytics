-- raw_to_canon_hospitalizations.sql
--
-- Переносить lpz_raw_hospitalizations_closed/open → канон lpz_hospitalizations
-- (+ upsert lpz_patients). Повторюваний, ідемпотентний: можна запускати після
-- кожного нового raw-знімку без побоювання зіпсувати вже перенесені дані.
--
-- ІСТОРІЯ: цю трансформацію вперше зроблено вручну через SQL 2026-07-19
-- (не збережено як скрипт — memory: project_lpz_raw_json_loader.md).
-- Переоформлено в цей файл 2026-09-08 при повторному прогоні, щоб гап
-- "одноразовий ручний прогін, не автоматизовано" більше не повторювався.
--
-- ПІСЛЯ цього скрипту ОБОВ'ЯЗКОВО запускати raw_to_canon_patients_enrich.sql
-- (той самий каталог) — тут у lpz_patients пишеться лише ПІБ/стать/ДН,
-- решта контактних/адресних полів (телефон/email/адреса/ІПН/декларація) —
-- окремим кроком. Забули це зробити 2026-09-08, користувач помітив.
--
-- Параметр :org_edrpou підставляється вручну перед запуском (немає psql
-- variables через Supabase MCP execute_sql) — замінити '43342788' на
-- потрібний ЄДРПОУ при запуску для іншої лікарні.
--
-- Ключові правила (не змінювати без явної причини — див. memory):
--   1. Номер картки: чистий int -> id_case напряму; формат "N-YYYY" (Хотинський,
--      трапляється і в ЛШМД) -> id_case = YYYY*1000000+N; інше -> пропускаємо
--      (свідомо не форсуємо сміттєві номери в канон).
--   2. helsi_record_id (raw.id) — справжній стабільний ідентифікатор. Якщо
--      рядок з таким helsi_record_id вже є в каноні — його id_case НЕ
--      змінюється (щоб не зʼїжджали вже показані користувачу дані).
--   3. Колізії номера картки (той самий number у різних госпіталізацій,
--      навіть у межах одного знімку) — перший за часом (start_) лишає собі
--      "природний" id_case, решта отримують синтетичний з технічного
--      діапазону 850000000+, продовжуючи від поточного максимуму. Якщо
--      "природний" id_case вже зайнятий у каноні СТАРИМ (доhelsi) записом
--      ІНШОГО пацієнта (номери карток перевикористовуються роками) —
--      теж синтетичний, а не мовчазне злиття на чужу історію.
--   4. TZ: Europe/Kyiv явно (сесія MCP працює в UTC, голий ::date дає зсув
--      для госпіталізацій 00:00-02:59).
--   5. Відділення: матчинг по нормалізованій назві (кратні пробіли -> один),
--      exact match спершу, інакше двобічний prefix-match (з гейтом на
--      порожній рядок, інакше LIKE '%' matсне все).
--   6. Патцієнти вставляються ПЕРЕД госпіталізаціями (FK), ON CONFLICT DO
--      NOTHING — не переписуємо вже наявні курировані записи.
--   7. doc_resource_id/department_structure_id — FK, якщо не знайдено
--      відповідності залишаємо NULL (не вигадуємо).
--   8. age — ОКРЕМА колонка від birth_date, KPI-функції (lpz_kpi_summary
--      тощо) рахують середній вік саме з age. НЕ забувати заповнювати
--      (2026-09-08: забули, "середній вік" зникав на днях із самими лише
--      новими госпіталізаціями).

BEGIN;

-- 0) Стейджинг: обидва raw-джерела в одну форму з розпарсеним id_case
CREATE TEMP TABLE stg_hosp ON COMMIT DROP AS
WITH src AS (
  SELECT
    'Закритий'::text AS canon_status,
    org_edrpou, id, number, start_, end_ AS case_end, discharge_date, patient_id,
    patient_last_name, patient_first_name, patient_middle_name,
    patient_data_sex, patient_data_birth_date,
    doctor_id, doctor_last_name, doctor_first_name, doctor_middle_name,
    inpatient_department_name,
    admission_enc_dx_0_cond_code_icd10_am_code,
    resolution_name, resolution_short_name, patient_severity_name,
    admission_enc_priority_name, re_admission
  FROM lpz.lpz_raw_hospitalizations_closed WHERE org_edrpou = '43342788'
  UNION ALL
  SELECT
    'Відкритий'::text AS canon_status,
    org_edrpou, id, number, start_, NULL::text AS case_end, discharge_date, patient_id,
    patient_last_name, patient_first_name, patient_middle_name,
    patient_data_sex, patient_data_birth_date,
    doctor_id, doctor_last_name, doctor_first_name, doctor_middle_name,
    inpatient_department_name,
    admission_enc_dx_0_cond_code_icd10_am_code,
    resolution_name, resolution_short_name, patient_severity_name,
    admission_enc_priority_name, re_admission
  FROM lpz.lpz_raw_hospitalizations_open WHERE org_edrpou = '43342788'
)
SELECT
  org_edrpou,
  canon_status,
  id::uuid AS helsi_record_id,
  number,
  CASE
    WHEN number ~ '^[0-9]+$' THEN number::bigint
    WHEN number ~ '^[0-9]+-[0-9]{4}$' THEN split_part(number, '-', 2)::bigint * 1000000 + split_part(number, '-', 1)::bigint
    ELSE NULL
  END AS parsed_id_case,
  start_::timestamptz AS start_,
  case_end::timestamptz AS case_end,
  discharge_date,
  patient_id::uuid AS patient_id,
  patient_last_name, patient_first_name, patient_middle_name,
  patient_data_sex,
  patient_data_birth_date::date AS patient_birth_date,
  doctor_id,
  doctor_last_name, doctor_first_name, doctor_middle_name,
  regexp_replace(trim(inpatient_department_name), '\s+', ' ', 'g') AS dept_name_norm,
  admission_enc_dx_0_cond_code_icd10_am_code AS icd_primary,
  resolution_name, resolution_short_name,
  patient_severity_name,
  CASE admission_enc_priority_name WHEN 'Ургентний' THEN 'Екстренна' WHEN 'Плановий' THEN 'Планова' ELSE NULL END AS admission_type,
  re_admission
FROM src;

-- 1) Пацієнти — upsert ПЕРЕД госпіталізаціями (FK), не чіпаємо наявних
INSERT INTO lpz.lpz_patients (org_edrpou, patient_id, full_name, last_name, first_name, middle_name, gender, birthday)
SELECT DISTINCT ON (patient_id)
  org_edrpou, patient_id,
  trim(concat_ws(' ', patient_last_name, patient_first_name, patient_middle_name)) AS full_name,
  patient_last_name, patient_first_name, patient_middle_name,
  CASE lower(patient_data_sex) WHEN 'true' THEN 'Ч' WHEN 'false' THEN 'Ж' ELSE NULL END AS gender,
  patient_birth_date::text AS birthday
FROM stg_hosp
WHERE patient_id IS NOT NULL
ON CONFLICT (org_edrpou, patient_id) DO NOTHING;

-- 2) Резолвінг id_case (helsi_record_id має пріоритет, далі колізії номера)
CREATE TEMP TABLE stg_resolved ON COMMIT DROP AS
WITH existing AS (
  SELECT id_case, helsi_record_id, patient_id
  FROM lpz.lpz_hospitalizations
  WHERE org_edrpou = '43342788'
),
joined AS (
  SELECT
    s.*,
    e_by_helsi.id_case AS existing_id_case,
    e_by_slot.helsi_record_id AS slot_owner_helsi,
    e_by_slot.patient_id AS slot_owner_patient_id
  FROM stg_hosp s
  LEFT JOIN existing e_by_helsi ON e_by_helsi.helsi_record_id = s.helsi_record_id
  LEFT JOIN existing e_by_slot ON e_by_slot.id_case = s.parsed_id_case
),
ranked AS (
  SELECT
    j.*,
    ROW_NUMBER() OVER (
      PARTITION BY j.parsed_id_case
      ORDER BY j.start_ ASC NULLS LAST, j.helsi_record_id
    ) AS slot_rank
  FROM joined j
  WHERE j.existing_id_case IS NULL AND j.parsed_id_case IS NOT NULL
),
tech_base AS (
  SELECT COALESCE(MAX(id_case), 850000000) AS max_technical
  FROM lpz.lpz_hospitalizations
  WHERE org_edrpou = '43342788' AND id_case BETWEEN 850000000 AND 850999999
),
pre AS (
  SELECT
    j.*,
    r.slot_rank,
    CASE
      WHEN j.existing_id_case IS NOT NULL THEN j.existing_id_case
      WHEN j.parsed_id_case IS NULL THEN NULL
      WHEN r.slot_rank = 1
           AND (j.slot_owner_helsi IS NULL OR j.slot_owner_helsi = j.helsi_record_id)
           AND (j.slot_owner_patient_id IS NULL OR j.slot_owner_patient_id = j.patient_id)
        THEN j.parsed_id_case
      ELSE NULL
    END AS final_id_case_pre
  FROM joined j
  LEFT JOIN ranked r ON r.helsi_record_id = j.helsi_record_id
),
need_synth AS (
  SELECT
    helsi_record_id,
    ROW_NUMBER() OVER (ORDER BY start_ ASC NULLS LAST, helsi_record_id) AS synth_rank
  FROM pre
  WHERE final_id_case_pre IS NULL AND parsed_id_case IS NOT NULL
)
SELECT
  pre.*,
  COALESCE(pre.final_id_case_pre, (SELECT max_technical FROM tech_base) + need_synth.synth_rank) AS final_id_case
FROM pre
LEFT JOIN need_synth ON need_synth.helsi_record_id = pre.helsi_record_id
WHERE pre.parsed_id_case IS NOT NULL;  -- непарсибельні номери свідомо не заливаємо (як і раніше)

-- Контрольні цифри перед записом (видно і в dry-run, і в реальному прогоні)
SELECT
  count(*) AS rows_to_upsert,
  count(*) FILTER (WHERE existing_id_case IS NOT NULL) AS updates_existing,
  count(*) FILTER (WHERE existing_id_case IS NULL AND final_id_case = parsed_id_case) AS inserts_natural_id,
  count(*) FILTER (WHERE existing_id_case IS NULL AND final_id_case <> parsed_id_case) AS inserts_synthetic_id,
  count(DISTINCT final_id_case) AS distinct_final_ids,
  count(*) AS total_rows
FROM stg_resolved;

-- 3) Upsert у канон
INSERT INTO lpz.lpz_hospitalizations (
  org_edrpou, id_case, helsi_no, patient_id, patient_name, last_name, first_name, middle_name,
  gender, birth_date, age, status, admission_type, admission_date, admission_time,
  discharge_date, discharge_time, department_structure_id, department_name,
  doc_resource_id, doc_name, icd_primary, re_admission, patient_severity, helsi_record_id,
  discharge_disposition_id
)
SELECT
  r.org_edrpou,
  r.final_id_case,
  r.parsed_id_case,
  r.patient_id,
  trim(concat_ws(' ', r.patient_last_name, r.patient_first_name, r.patient_middle_name)),
  r.patient_last_name, r.patient_first_name, r.patient_middle_name,
  CASE lower(r.patient_data_sex) WHEN 'true' THEN 'Ч' WHEN 'false' THEN 'Ж' ELSE NULL END,
  r.patient_birth_date,
  -- age — ОКРЕМА колонка від birth_date, KPI-функції (lpz_kpi_summary тощо)
  -- рахують середній вік саме з неї, не з birth_date. Забули це 2026-09-08 —
  -- 3375 нових рядків мали NULL age, "середній вік" зникав на днях, де всі
  -- госпіталізації нові. Формула звірена з наявними рядками каналу.
  date_part('year', age((r.start_ AT TIME ZONE 'Europe/Kyiv')::date, r.patient_birth_date))::int,
  r.canon_status,
  r.admission_type,
  (r.start_ AT TIME ZONE 'Europe/Kyiv')::date,
  (r.start_ AT TIME ZONE 'Europe/Kyiv')::time,
  COALESCE(r.discharge_date::date, (r.case_end AT TIME ZONE 'Europe/Kyiv')::date),
  (r.case_end AT TIME ZONE 'Europe/Kyiv')::time,
  d.structure_id,
  COALESCE(d.name, ''),
  emp.resource_id,
  trim(concat_ws(' ', r.doctor_last_name, r.doctor_first_name, r.doctor_middle_name)),
  r.icd_primary,
  r.re_admission,
  r.patient_severity_name,
  r.helsi_record_id,
  -- discharge_disposition_id — НЕ з /api/cards (там немає результату
  -- лікування), а з ОКРЕМОГО, набагато багатшого API
  -- /api/hospital/api/v1/encounter_cases/ (поле discharge_disposition.id
  -- напряму: 1=Помер, 2=З поліпшенням, 3=Здоровий, 4=Без змін,
  -- 5=З одужанням, 6=З погіршенням, 7=Самовільно пішов,
  -- 8=Статистична виписка, 9=Переведено). Знайдено 2026-09-08 —
  -- ДО цього моментно тут стояло CASE-заглушка (усі виписані -> 2), бо
  -- здавалось що сигналу смерті в даних взагалі нема; насправді є, просто
  -- в іншому ендпоінті. Заповнюється ОКРЕМИМ кроком —
  -- raw_to_canon_discharge_disposition.sql (після цього скрипту), тут
  -- лишаємо NULL, щоб не затерти.
  NULL::int AS discharge_disposition_id
FROM stg_resolved r
LEFT JOIN lpz.lpz_departments d
  ON d.org_edrpou = '43342788'
  AND (
    regexp_replace(trim(d.name), '\s+', ' ', 'g') = r.dept_name_norm
    OR (r.dept_name_norm <> '' AND regexp_replace(trim(d.name), '\s+', ' ', 'g') LIKE r.dept_name_norm || '%')
    OR (regexp_replace(trim(d.name), '\s+', ' ', 'g') <> '' AND r.dept_name_norm LIKE regexp_replace(trim(d.name), '\s+', ' ', 'g') || '%')
  )
LEFT JOIN lpz.lpz_empl emp
  ON emp.org_edrpou = '43342788' AND emp.resource_id = r.doctor_id::uuid
ON CONFLICT (org_edrpou, id_case) DO UPDATE SET
  helsi_no = EXCLUDED.helsi_no,
  patient_id = EXCLUDED.patient_id,
  patient_name = EXCLUDED.patient_name,
  last_name = EXCLUDED.last_name,
  first_name = EXCLUDED.first_name,
  middle_name = EXCLUDED.middle_name,
  gender = EXCLUDED.gender,
  birth_date = EXCLUDED.birth_date,
  age = EXCLUDED.age,
  status = EXCLUDED.status,
  admission_type = EXCLUDED.admission_type,
  admission_date = EXCLUDED.admission_date,
  admission_time = EXCLUDED.admission_time,
  discharge_date = EXCLUDED.discharge_date,
  discharge_time = EXCLUDED.discharge_time,
  -- НЕ перезаписувати наявний discharge_disposition_id (реальна класифікація
  -- зі старої системи, точніша за наш "2 за замовчуванням") — лише
  -- заповнити, якщо досі NULL.
  discharge_disposition_id = COALESCE(lpz.lpz_hospitalizations.discharge_disposition_id, EXCLUDED.discharge_disposition_id),
  department_structure_id = COALESCE(EXCLUDED.department_structure_id, lpz.lpz_hospitalizations.department_structure_id),
  department_name = CASE WHEN EXCLUDED.department_name <> '' THEN EXCLUDED.department_name ELSE lpz.lpz_hospitalizations.department_name END,
  doc_resource_id = COALESCE(EXCLUDED.doc_resource_id, lpz.lpz_hospitalizations.doc_resource_id),
  doc_name = COALESCE(EXCLUDED.doc_name, lpz.lpz_hospitalizations.doc_name),
  icd_primary = EXCLUDED.icd_primary,
  re_admission = EXCLUDED.re_admission,
  patient_severity = EXCLUDED.patient_severity,
  helsi_record_id = EXCLUDED.helsi_record_id;

-- Підсумок після запису
SELECT max(admission_date) AS new_max_admission, count(*) AS total_rows_org
FROM lpz.lpz_hospitalizations WHERE org_edrpou = '43342788';

COMMIT;
