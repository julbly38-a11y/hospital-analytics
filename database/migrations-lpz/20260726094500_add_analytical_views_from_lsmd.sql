-- Переносить у схему lpz ті view зі старої схеми public (lsmd), яких у lpz
-- не було в жодному вигляді і які повністю будуються на вже наявних
-- таблицях lpz_hospitalizations / lpz_icd_diagnoses / lpz_dict_icd_blocks /
-- функції lpz_is_urgent_icd.
--
-- НЕ перенесено (свідомо): view, що дублюють існуючі RPC-функції lpz_kpi_*/
-- lpz_trend_*/lpz_department_* (~25 штук); view, що спираються на таблиці,
-- яких у lpz немає (operations, dept_transfers_matrix, doctor_shifts,
-- геокодовані localities, analytics_dept_icd_profile); doctor_diagnoses/
-- doctor_discharges/doctor_patient_links — у lpz нема чистого doc_resource_id
-- на госпіталізації, той самий крихкий join вже інкапсульовано в RPC
-- lpz_kpi_by_doctor/lpz_trend_by_doctor через lpz_episodes.
--
-- Усі view — org_edrpou-scoped (на відміну від однолікарняних оригіналів) і
-- WITH (security_invoker = true), щоб RLS базових таблиць застосовувався до
-- того, хто викликає view, а не до її власника.
--
-- Детальний опис кожної view: docs/LPZ_SCHEMA.md, розділ
-- "View, перенесені зі старої схеми public (lsmd)".

CREATE OR REPLACE FUNCTION lpz.lpz_icd_block_name(p_icd text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(
    (SELECT block_name FROM lpz.lpz_dict_icd_blocks
     WHERE p_icd BETWEEN code_from AND code_to
     ORDER BY priority LIMIT 1),
    'Інші'
  );
$$;

CREATE OR REPLACE VIEW lpz.lpz_readmissions
WITH (security_invoker = true) AS
WITH ordered AS (
  SELECT
    h.org_edrpou, h.id_case, h.patient_id, h.admission_date, h.discharge_date, h.icd_primary,
    lead(h.admission_date) OVER (PARTITION BY h.org_edrpou, h.patient_id ORDER BY h.admission_date) AS next_admission,
    lead(h.icd_primary) OVER (PARTITION BY h.org_edrpou, h.patient_id ORDER BY h.admission_date) AS next_icd
  FROM lpz.lpz_hospitalizations h
  WHERE h.patient_id IS NOT NULL AND h.admission_date IS NOT NULL
)
SELECT
  org_edrpou, id_case, patient_id, admission_date, discharge_date, icd_primary, next_admission,
  (next_admission - discharge_date) AS days_to_readmission,
  ((next_admission - discharge_date) BETWEEN 0 AND 30)::int AS readmit_30d,
  ((next_admission - discharge_date) BETWEEN 0 AND 90)::int AS readmit_90d,
  (next_icd = icd_primary)::int AS same_diagnosis
FROM ordered
WHERE next_admission IS NOT NULL;

CREATE OR REPLACE VIEW lpz.lpz_readmission_metrics
WITH (security_invoker = true) AS
SELECT
  org_edrpou,
  count(*) AS total_with_followup,
  sum(readmit_30d) AS readmit_30d,
  round(100.0 * sum(readmit_30d) / count(*), 2) AS readmit_30d_pct,
  sum(readmit_90d) AS readmit_90d,
  round(100.0 * sum(readmit_90d) / count(*), 2) AS readmit_90d_pct,
  sum(CASE WHEN readmit_30d = 1 AND same_diagnosis = 1 THEN 1 ELSE 0 END) AS same_dx_30d
FROM lpz.lpz_readmissions
GROUP BY org_edrpou;

CREATE OR REPLACE VIEW lpz.lpz_night_vs_day_admissions
WITH (security_invoker = true) AS
SELECT
  org_edrpou,
  CASE WHEN EXTRACT(hour FROM admission_time) >= 22 OR EXTRACT(hour FROM admission_time) < 6 THEN 'Ніч' ELSE 'День' END AS time_period,
  count(*) AS cases,
  count(DISTINCT patient_id) AS unique_patients,
  round(avg(discharge_date - admission_date) FILTER (WHERE discharge_date IS NOT NULL), 1) AS avg_bed_days,
  sum(CASE WHEN admission_type = 'Екстренна' OR lpz.lpz_is_urgent_icd(icd_primary) THEN 1 ELSE 0 END) AS urgent_cases,
  sum(CASE WHEN discharge_disposition_id = 1 THEN 1 ELSE 0 END) AS deaths,
  round(100.0 * sum(CASE WHEN discharge_disposition_id = 1 THEN 1 ELSE 0 END) / count(*), 2) AS letality_percent
FROM lpz.lpz_hospitalizations
WHERE admission_time IS NOT NULL
GROUP BY org_edrpou,
  CASE WHEN EXTRACT(hour FROM admission_time) >= 22 OR EXTRACT(hour FROM admission_time) < 6 THEN 'Ніч' ELSE 'День' END;

CREATE OR REPLACE VIEW lpz.lpz_night_admissions_detail
WITH (security_invoker = true) AS
SELECT
  org_edrpou,
  EXTRACT(hour FROM admission_time)::int AS hour_of_day,
  count(*) AS admissions,
  count(DISTINCT patient_id) AS unique_patients,
  sum(CASE WHEN admission_type = 'Екстренна' OR lpz.lpz_is_urgent_icd(icd_primary) THEN 1 ELSE 0 END) AS urgent,
  round(avg(discharge_date - admission_date) FILTER (WHERE discharge_date IS NOT NULL), 1) AS avg_bed_days,
  sum(CASE WHEN discharge_disposition_id = 1 THEN 1 ELSE 0 END) AS deaths
FROM lpz.lpz_hospitalizations
WHERE admission_time IS NOT NULL
GROUP BY org_edrpou, EXTRACT(hour FROM admission_time)::int;

CREATE OR REPLACE VIEW lpz.lpz_night_admissions_by_department
WITH (security_invoker = true) AS
SELECT
  org_edrpou,
  department_name AS department,
  CASE WHEN EXTRACT(hour FROM admission_time) >= 22 OR EXTRACT(hour FROM admission_time) < 6 THEN 'Ніч' ELSE 'День' END AS time_period,
  count(*) AS cases,
  count(DISTINCT patient_id) AS unique_patients,
  sum(CASE WHEN admission_type = 'Екстренна' OR lpz.lpz_is_urgent_icd(icd_primary) THEN 1 ELSE 0 END) AS urgent_cases,
  round(avg(discharge_date - admission_date) FILTER (WHERE discharge_date IS NOT NULL), 1) AS avg_bed_days,
  sum(CASE WHEN discharge_disposition_id = 1 THEN 1 ELSE 0 END) AS deaths
FROM lpz.lpz_hospitalizations
WHERE admission_time IS NOT NULL AND department_name IS NOT NULL
GROUP BY org_edrpou, department_name,
  CASE WHEN EXTRACT(hour FROM admission_time) >= 22 OR EXTRACT(hour FROM admission_time) < 6 THEN 'Ніч' ELSE 'День' END;

CREATE OR REPLACE VIEW lpz.lpz_weekend_vs_weekday
WITH (security_invoker = true) AS
SELECT
  org_edrpou,
  CASE WHEN EXTRACT(dow FROM admission_date) IN (0,6) THEN 'Вихідний' ELSE 'Робочий день' END AS day_type,
  count(*) AS cases,
  count(DISTINCT patient_id) AS unique_patients,
  round(avg(discharge_date - admission_date) FILTER (WHERE discharge_date IS NOT NULL), 1) AS avg_bed_days,
  sum(CASE WHEN admission_type = 'Екстренна' OR lpz.lpz_is_urgent_icd(icd_primary) THEN 1 ELSE 0 END) AS urgent_cases,
  sum(CASE WHEN discharge_disposition_id = 1 THEN 1 ELSE 0 END) AS deaths,
  round(100.0 * sum(CASE WHEN discharge_disposition_id = 1 THEN 1 ELSE 0 END) / count(*), 2) AS letality_percent
FROM lpz.lpz_hospitalizations
WHERE admission_date IS NOT NULL
GROUP BY org_edrpou, CASE WHEN EXTRACT(dow FROM admission_date) IN (0,6) THEN 'Вихідний' ELSE 'Робочий день' END;

CREATE OR REPLACE VIEW lpz.lpz_patient_demographics
WITH (security_invoker = true) AS
SELECT
  org_edrpou,
  gender,
  CASE
    WHEN age < 18 THEN '0-17' WHEN age < 30 THEN '18-29' WHEN age < 45 THEN '30-44'
    WHEN age < 60 THEN '45-59' WHEN age < 75 THEN '60-74' ELSE '75+'
  END AS age_group,
  count(*) AS cases,
  count(DISTINCT patient_id) AS unique_patients,
  round(100.0 * sum(CASE WHEN discharge_disposition_id = 1 THEN 1 ELSE 0 END) / count(*), 2) AS letality_percent
FROM lpz.lpz_hospitalizations
WHERE gender IS NOT NULL AND age IS NOT NULL
GROUP BY org_edrpou, gender,
  CASE
    WHEN age < 18 THEN '0-17' WHEN age < 30 THEN '18-29' WHEN age < 45 THEN '30-44'
    WHEN age < 60 THEN '45-59' WHEN age < 75 THEN '60-74' ELSE '75+'
  END;

CREATE OR REPLACE VIEW lpz.lpz_top_diagnoses
WITH (security_invoker = true) AS
SELECT org_edrpou, icd_code, diagnosis_name, cases, unique_patients, letality_percent, rank_in_org
FROM (
  SELECT
    h.org_edrpou, h.icd_primary AS icd_code, d.name AS diagnosis_name,
    count(*) AS cases,
    count(DISTINCT h.patient_id) AS unique_patients,
    round(100.0 * sum(CASE WHEN h.discharge_disposition_id = 1 THEN 1 ELSE 0 END) / count(*), 2) AS letality_percent,
    row_number() OVER (PARTITION BY h.org_edrpou ORDER BY count(*) DESC) AS rank_in_org
  FROM lpz.lpz_hospitalizations h
  LEFT JOIN lpz.lpz_icd_diagnoses d ON d.code = h.icd_primary
  WHERE h.icd_primary IS NOT NULL
  GROUP BY h.org_edrpou, h.icd_primary, d.name
) ranked
WHERE rank_in_org <= 20;

CREATE OR REPLACE VIEW lpz.lpz_diagnosis_stats
WITH (security_invoker = true) AS
SELECT
  org_edrpou, icd_primary AS icd_code,
  count(*) AS cases,
  count(DISTINCT patient_id) AS unique_patients,
  round(avg(discharge_date - admission_date) FILTER (WHERE discharge_date IS NOT NULL), 1) AS avg_bed_days,
  sum(CASE WHEN discharge_disposition_id = 1 THEN 1 ELSE 0 END) AS deaths,
  round(100.0 * sum(CASE WHEN discharge_disposition_id = 1 THEN 1 ELSE 0 END) / count(*), 2) AS death_rate_pct,
  sum(CASE WHEN lpz.lpz_is_urgent_icd(icd_primary) THEN 1 ELSE 0 END) AS urgent
FROM lpz.lpz_hospitalizations
WHERE icd_primary IS NOT NULL
GROUP BY org_edrpou, icd_primary;

CREATE OR REPLACE VIEW lpz.lpz_urgency_stats
WITH (security_invoker = true) AS
SELECT
  org_edrpou, department_name AS department,
  sum(CASE WHEN admission_type = 'Екстренна' OR lpz.lpz_is_urgent_icd(icd_primary) THEN 1 ELSE 0 END) AS urgent,
  sum(CASE WHEN NOT (admission_type = 'Екстренна' OR lpz.lpz_is_urgent_icd(icd_primary)) THEN 1 ELSE 0 END) AS planned,
  sum(CASE WHEN (admission_type = 'Екстренна' OR lpz.lpz_is_urgent_icd(icd_primary)) AND discharge_disposition_id = 1 THEN 1 ELSE 0 END) AS urgent_deaths,
  sum(CASE WHEN NOT (admission_type = 'Екстренна' OR lpz.lpz_is_urgent_icd(icd_primary)) AND discharge_disposition_id = 1 THEN 1 ELSE 0 END) AS planned_deaths,
  round(avg(discharge_date - admission_date) FILTER (WHERE (admission_type = 'Екстренна' OR lpz.lpz_is_urgent_icd(icd_primary)) AND discharge_date IS NOT NULL), 1) AS avg_bed_days_urgent,
  round(avg(discharge_date - admission_date) FILTER (WHERE NOT (admission_type = 'Екстренна' OR lpz.lpz_is_urgent_icd(icd_primary)) AND discharge_date IS NOT NULL), 1) AS avg_bed_days_planned
FROM lpz.lpz_hospitalizations
WHERE department_name IS NOT NULL
GROUP BY org_edrpou, department_name;

CREATE OR REPLACE VIEW lpz.lpz_icu_mortality
WITH (security_invoker = true) AS
SELECT
  org_edrpou,
  count(*) AS admissions_total,
  sum(CASE WHEN discharge_disposition_id = 1 THEN 1 ELSE 0 END) AS deaths,
  round(100.0 * sum(CASE WHEN discharge_disposition_id = 1 THEN 1 ELSE 0 END) / count(*), 2) AS letality_pct,
  round(avg(discharge_date - admission_date) FILTER (WHERE discharge_date IS NOT NULL), 1) AS avg_bed_days,
  round(avg(discharge_date - admission_date) FILTER (WHERE discharge_disposition_id = 1 AND discharge_date IS NOT NULL), 1) AS bed_days_deaths,
  sum(CASE WHEN discharge_disposition_id <> 1 THEN 1 ELSE 0 END) AS survived
FROM lpz.lpz_hospitalizations
WHERE department_name ILIKE '%анестез%' OR department_name ILIKE '%реанімац%' OR department_name ILIKE '%інтенсив%'
GROUP BY org_edrpou;

CREATE OR REPLACE VIEW lpz.lpz_morbidity_by_department
WITH (security_invoker = true) AS
SELECT
  org_edrpou, department_name AS department,
  lpz.lpz_icd_block_name(icd_primary) AS disease_category,
  count(*) AS cases,
  count(DISTINCT patient_id) AS unique_patients
FROM lpz.lpz_hospitalizations
WHERE department_name IS NOT NULL AND icd_primary IS NOT NULL
GROUP BY org_edrpou, department_name, lpz.lpz_icd_block_name(icd_primary);

CREATE OR REPLACE VIEW lpz.lpz_dept_disease_clean
WITH (security_invoker = true) AS
SELECT
  org_edrpou, department, disease_category, cases, unique_patients,
  round(cases * 100.0 / sum(cases) OVER (PARTITION BY org_edrpou, department), 2) AS percent_of_dept
FROM lpz.lpz_morbidity_by_department;
