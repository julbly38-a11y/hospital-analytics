-- Dashboard views for Looker/Google Data Studio
-- Generated: 2026-05-24
-- Tables: Hospital cases, diagnoses, departments, operations

-- VIEW 1: Letality by department (top metric)
CREATE OR REPLACE VIEW v_letality_by_dept AS
SELECT 
  d.dept_name as department,
  COUNT(*) as total_cases,
  SUM(CASE WHEN l.discharge_status = 'Помер' THEN 1 ELSE 0 END) as deaths,
  ROUND(
    (SUM(CASE WHEN l.discharge_status = 'Помер' THEN 1 ELSE 0 END)::numeric / COUNT(*)) * 100, 
    2
  ) as letality_percent
FROM lsmd l
LEFT JOIN departments d ON LOWER(TRIM(l.discharge_department)) = LOWER(TRIM(d.dept_name))
GROUP BY d.dept_name
ORDER BY letality_percent DESC;

-- VIEW 2: Top diagnoses (ICD-10)
CREATE OR REPLACE VIEW v_top_diagnoses AS
SELECT 
  l.icd_primary as icd_code,
  i.diagnosis_level3 as diagnosis_name,
  COUNT(*) as cases,
  COUNT(DISTINCT l.patient_id) as unique_patients,
  ROUND(
    (SUM(CASE WHEN l.discharge_status = 'Помер' THEN 1 ELSE 0 END)::numeric / COUNT(*)) * 100,
    2
  ) as letality_percent
FROM lsmd l
LEFT JOIN icd_10 i ON l.icd_primary = i.icd_code
WHERE l.icd_primary IS NOT NULL
GROUP BY l.icd_primary, i.diagnosis_level3
ORDER BY cases DESC
LIMIT 20;

-- VIEW 3: Admissions by hour (for time-based dashboard)
CREATE OR REPLACE VIEW v_admissions_by_hour AS
SELECT 
  EXTRACT(HOUR FROM l.admission_ts::timestamp) as hour_of_day,
  COUNT(*) as admissions,
  COUNT(DISTINCT l.patient_id) as unique_patients,
  ROUND(AVG(l.length_of_stay), 1) as avg_bed_days
FROM lsmd l
WHERE l.admission_ts IS NOT NULL
GROUP BY hour_of_day
ORDER BY hour_of_day;

-- VIEW 4: Department metrics (comprehensive)
CREATE OR REPLACE VIEW v_department_metrics AS
SELECT 
  d.dept_name as department,
  COUNT(*) as total_cases,
  COUNT(DISTINCT l.patient_id) as unique_patients,
  SUM(CASE WHEN l.admission_type = 'Екстрена' THEN 1 ELSE 0 END) as urgent_cases,
  SUM(CASE WHEN l.operation = 'Так' THEN 1 ELSE 0 END) as surgical_cases,
  ROUND(AVG(l.length_of_stay), 1) as avg_bed_days,
  SUM(CASE WHEN l.discharge_status = 'Помер' THEN 1 ELSE 0 END) as deaths
FROM lsmd l
LEFT JOIN departments d ON LOWER(TRIM(l.discharge_department)) = LOWER(TRIM(d.dept_name))
WHERE d.dept_name IS NOT NULL
GROUP BY d.dept_name
ORDER BY total_cases DESC;

-- VIEW 5: Gender and age distribution
CREATE OR REPLACE VIEW v_patient_demographics AS
SELECT 
  l.gender as gender,
  CASE 
    WHEN CAST(l.age AS INTEGER) < 18 THEN '0-17'
    WHEN CAST(l.age AS INTEGER) < 30 THEN '18-29'
    WHEN CAST(l.age AS INTEGER) < 45 THEN '30-44'
    WHEN CAST(l.age AS INTEGER) < 60 THEN '45-59'
    WHEN CAST(l.age AS INTEGER) < 75 THEN '60-74'
    ELSE '75+'
  END as age_group,
  COUNT(*) as cases,
  COUNT(DISTINCT l.patient_id) as unique_patients,
  ROUND(
    (SUM(CASE WHEN l.discharge_status = 'Помер' THEN 1 ELSE 0 END)::numeric / COUNT(*)) * 100,
    2
  ) as letality_percent
FROM lsmd l
WHERE l.gender IS NOT NULL AND l.age IS NOT NULL
GROUP BY l.gender, age_group
ORDER BY gender, age_group;

-- VIEW 6: Monthly trend
CREATE OR REPLACE VIEW v_monthly_admissions AS
SELECT 
  DATE_TRUNC('month', l.admission_date_d::date)::date as admission_month,
  COUNT(*) as admissions,
  SUM(CASE WHEN l.discharge_status = 'Помер' THEN 1 ELSE 0 END) as deaths,
  ROUND(AVG(l.length_of_stay), 1) as avg_bed_days
FROM lsmd l
WHERE l.admission_date_d IS NOT NULL
GROUP BY DATE_TRUNC('month', l.admission_date_d::date)
ORDER BY admission_month DESC;
