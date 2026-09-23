-- raw_to_canon_h24_hospitalizations.sql
--
-- Переносить lpz_raw_h24_hospitalizations (джерело Health24 h24.ua/mis.h24.ua,
-- НЕ helsi) → канон lpz_hospitalizations (+ upsert lpz_organizations,
-- lpz_patients). Повторюваний, ідемпотентний.
--
-- Параметр org_edrpou тут — 43343870 (ОКНП «Буковинський клінічний
-- онкологічний центр»), замінити при використанні для іншого закладу
-- Health24.
--
-- Ключові відмінності від raw_to_canon_hospitalizations.sql (helsi):
--   1. id_case — напряму h24-івський bigint `id` (унікальний, стабільний,
--      без потреби розбирати номер картки й розводити колізії — на відміну
--      від helsi, де number/card_number буває нечисловим і повторюваним).
--   2. patient_id/helsi_record_id/doc_resource_id/department_structure_id —
--      у Health24 усі ID числові (bigint), а в каноні ці колонки uuid.
--      Робимо ДЕТЕРМІНОВАНИЙ UUID через md5('h24|'||org_edrpou||'|<тип>|'||id)::uuid
--      — стабільний між прогонами, не конфліктує з реальними UUID helsi
--      (інший namespace-префікс).
--   3. doc_resource_id/department_structure_id лишаються NULL: FK на
--      lpz_empl/lpz_departments, а персонал і відділення цього закладу ще
--      не заведені в канон (окрема задача пізніше).
--   4. gender у h24 — рядок 'male'/'female' (не boolean, як у helsi).
--   5. age віддається напряму (patient_age), рахувати не треба.
--   6. icd_primary парситься з episode_of_care_name виду
--      "(11112) C54.1 - Злоякісне новоутворення Ендометрія" — regex на код
--      МКХ одразу після дужки з номером картки.
--   7. status: state='discharged' -> 'Закритий', 'placed'/'awaiting_placement'
--      -> 'Відкритий'.
--   8. TZ: дати вже приходять зі зміщенням (+02:00/+03:00) у самому JSON,
--      явно конвертуємо в Europe/Kyiv як і для helsi.

BEGIN;

-- 0) Організація — потрібна перед госпіталізаціями (FK org_edrpou).
--    structure_id — NOT NULL у схемі, а eHealth-структури тут нема
--    (Health24, не helsi/eHealth напряму) -> той самий детермінований UUID.
INSERT INTO lpz.lpz_organizations (edrpou, structure_id, name, display_name)
VALUES (
  '43343870',
  md5('h24|43343870|org')::uuid,
  'ОБЛАСНЕ КОМУНАЛЬНЕ НЕКОМЕРЦІЙНЕ ПІДПРИЄМСТВО "БУКОВИНСЬКИЙ КЛІНІЧНИЙ ОНКОЛОГІЧНИЙ ЦЕНТР"',
  'БУКОВИНСЬКИЙ ОНКОЦЕНТР'
)
ON CONFLICT (edrpou) DO NOTHING;

-- 1) Стейджинг
CREATE TEMP TABLE stg_h24_hosp ON COMMIT DROP AS
SELECT
  org_edrpou,
  id::bigint AS id_case,
  md5('h24|' || org_edrpou || '|hosp|' || id)::uuid AS helsi_record_id,
  NULLIF(regexp_replace(episode_of_care_history_number, '[^0-9]', '', 'g'), '')::bigint AS helsi_no,
  patient_id::bigint AS h24_patient_id,
  md5('h24|' || org_edrpou || '|patient|' || patient_id)::uuid AS patient_id,
  patient_last_name, patient_first_name, patient_second_name,
  patient_gender,
  patient_birth_date::date AS patient_birth_date,
  patient_age::int AS patient_age,
  CASE state WHEN 'discharged' THEN 'Закритий' ELSE 'Відкритий' END AS canon_status,
  (episode_of_care_period_start::timestamptz AT TIME ZONE 'Europe/Kyiv') AS admission_ts,
  discharge_date::timestamptz AT TIME ZONE 'Europe/Kyiv' AS discharge_ts,
  department_name,
  employee_name AS doc_name,
  -- ICD-код одразу після "(<номер картки>) " — літера + 2 цифри + опційно .N
  substring(episode_of_care_name from '\)\s*([A-ZА-ЯҐЄІЇ][0-9]{2}(?:\.[0-9]+)?)') AS icd_primary,
  cond_patient_severity_title AS patient_severity
FROM lpz.lpz_raw_h24_hospitalizations
WHERE org_edrpou = '43343870' AND id IS NOT NULL;

-- 2) Пацієнти — upsert ПЕРЕД госпіталізаціями (FK), не чіпаємо наявних
INSERT INTO lpz.lpz_patients (org_edrpou, patient_id, full_name, last_name, first_name, middle_name, gender, birthday, age)
SELECT DISTINCT ON (patient_id)
  org_edrpou, patient_id,
  trim(concat_ws(' ', patient_last_name, patient_first_name, patient_second_name)),
  patient_last_name, patient_first_name, patient_second_name,
  CASE patient_gender WHEN 'male' THEN 'Ч' WHEN 'female' THEN 'Ж' ELSE NULL END,
  patient_birth_date::text,
  patient_age
FROM stg_h24_hosp
WHERE patient_id IS NOT NULL
ON CONFLICT (org_edrpou, patient_id) DO NOTHING;

-- Контрольні цифри перед записом
SELECT count(*) AS rows_to_upsert, count(DISTINCT id_case) AS distinct_id_case, count(*) FILTER (WHERE icd_primary IS NULL) AS no_icd
FROM stg_h24_hosp;

-- 3) Upsert у канон
INSERT INTO lpz.lpz_hospitalizations (
  org_edrpou, id_case, helsi_no, patient_id, patient_name, last_name, first_name, middle_name,
  gender, birth_date, age, status, admission_date, admission_time,
  discharge_date, discharge_time, department_name,
  doc_name, icd_primary, patient_severity, helsi_record_id
)
SELECT
  s.org_edrpou, s.id_case, s.helsi_no, s.patient_id,
  trim(concat_ws(' ', s.patient_last_name, s.patient_first_name, s.patient_second_name)),
  s.patient_last_name, s.patient_first_name, s.patient_second_name,
  CASE s.patient_gender WHEN 'male' THEN 'Ч' WHEN 'female' THEN 'Ж' ELSE NULL END,
  s.patient_birth_date, s.patient_age, s.canon_status,
  s.admission_ts::date, s.admission_ts::time,
  COALESCE(s.discharge_ts::date, NULL), s.discharge_ts::time,
  COALESCE(s.department_name, ''),
  s.doc_name, s.icd_primary, s.patient_severity, s.helsi_record_id
FROM stg_h24_hosp s
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
  admission_date = EXCLUDED.admission_date,
  admission_time = EXCLUDED.admission_time,
  discharge_date = EXCLUDED.discharge_date,
  discharge_time = EXCLUDED.discharge_time,
  department_name = EXCLUDED.department_name,
  doc_name = EXCLUDED.doc_name,
  icd_primary = EXCLUDED.icd_primary,
  patient_severity = EXCLUDED.patient_severity,
  helsi_record_id = EXCLUDED.helsi_record_id;

COMMIT;
