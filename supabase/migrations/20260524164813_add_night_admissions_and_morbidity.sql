-- Night admissions and morbidity by department
-- Night hours: 22:00 - 06:00 (22-23, 0-5)

-- VIEW 1: Night vs Day admissions comparison
CREATE OR REPLACE VIEW v_night_vs_day_admissions AS
SELECT 
  CASE 
    WHEN EXTRACT(HOUR FROM admission_ts::timestamp) >= 22 
      OR EXTRACT(HOUR FROM admission_ts::timestamp) < 6 THEN 'Ніч'
    ELSE 'День'
  END as time_period,
  COUNT(*) as cases,
  COUNT(DISTINCT patient_id) as unique_patients,
  ROUND(AVG(length_of_stay), 1) as avg_bed_days,
  SUM(CASE WHEN admission_type = 'Екстрена' THEN 1 ELSE 0 END) as urgent_cases,
  SUM(CASE WHEN discharge_status = 'Помер' THEN 1 ELSE 0 END) as deaths,
  ROUND(
    (SUM(CASE WHEN discharge_status = 'Помер' THEN 1 ELSE 0 END)::numeric / COUNT(*)) * 100,
    2
  ) as letality_percent
FROM lsmd
WHERE admission_ts IS NOT NULL
GROUP BY time_period
ORDER BY time_period DESC;

-- VIEW 2: Detailed night admissions by hour
CREATE OR REPLACE VIEW v_night_admissions_detail AS
SELECT 
  EXTRACT(HOUR FROM admission_ts::timestamp)::int as hour_of_day,
  CASE 
    WHEN EXTRACT(HOUR FROM admission_ts::timestamp) >= 22 
      OR EXTRACT(HOUR FROM admission_ts::timestamp) < 6 THEN 'Ніч'
    ELSE 'День'
  END as time_period,
  COUNT(*) as admissions,
  COUNT(DISTINCT patient_id) as unique_patients,
  SUM(CASE WHEN admission_type = 'Екстрена' THEN 1 ELSE 0 END) as urgent,
  ROUND(AVG(length_of_stay), 1) as avg_bed_days,
  SUM(CASE WHEN discharge_status = 'Помер' THEN 1 ELSE 0 END) as deaths
FROM lsmd
WHERE admission_ts IS NOT NULL
GROUP BY hour_of_day
ORDER BY hour_of_day;

-- VIEW 3: Morbidity (disease distribution) by department
CREATE OR REPLACE VIEW v_morbidity_by_department AS
SELECT 
  d.dept_name as department,
  i.code_level1 as icd_chapter,
  i.category_level1 as disease_category,
  COUNT(*) as cases,
  COUNT(DISTINCT l.patient_id) as unique_patients,
  ROUND(
    (COUNT(*)::numeric / 
      (SELECT COUNT(*) FROM lsmd l2 
       WHERE LOWER(TRIM(l2.discharge_department)) = LOWER(TRIM(d.dept_name)))) * 100,
    2
  ) as percent_of_dept
FROM lsmd l
LEFT JOIN departments d ON LOWER(TRIM(l.discharge_department)) = LOWER(TRIM(d.dept_name))
LEFT JOIN icd_10 i ON l.icd_primary = i.icd_code
WHERE d.dept_name IS NOT NULL AND l.icd_primary IS NOT NULL
GROUP BY d.dept_name, i.code_level1, i.category_level1
ORDER BY d.dept_name, cases DESC;

-- VIEW 4: Night admissions by department
CREATE OR REPLACE VIEW v_night_admissions_by_department AS
SELECT 
  d.dept_name as department,
  CASE 
    WHEN EXTRACT(HOUR FROM l.admission_ts::timestamp) >= 22 
      OR EXTRACT(HOUR FROM l.admission_ts::timestamp) < 6 THEN 'Ніч'
    ELSE 'День'
  END as time_period,
  COUNT(*) as cases,
  COUNT(DISTINCT l.patient_id) as unique_patients,
  SUM(CASE WHEN l.admission_type = 'Екстрена' THEN 1 ELSE 0 END) as urgent_cases,
  ROUND(AVG(l.length_of_stay), 1) as avg_bed_days,
  SUM(CASE WHEN l.discharge_status = 'Помер' THEN 1 ELSE 0 END) as deaths
FROM lsmd l
LEFT JOIN departments d ON LOWER(TRIM(l.discharge_department)) = LOWER(TRIM(d.dept_name))
WHERE l.admission_ts IS NOT NULL AND d.dept_name IS NOT NULL
GROUP BY d.dept_name, time_period
ORDER BY d.dept_name, time_period DESC;

-- VIEW 5: Top diagnoses by department (top 5 per department)
CREATE OR REPLACE VIEW v_top_diagnoses_by_department AS
SELECT 
  d.dept_name as department,
  l.icd_primary as icd_code,
  i.diagnosis_level3 as diagnosis,
  COUNT(*) as cases,
  ROUND(
    (COUNT(*)::numeric / 
      (SELECT COUNT(*) FROM lsmd l2 
       WHERE LOWER(TRIM(l2.discharge_department)) = LOWER(TRIM(d.dept_name)))) * 100,
    2
  ) as percent_of_dept,
  SUM(CASE WHEN l.discharge_status = 'Помер' THEN 1 ELSE 0 END) as deaths
FROM lsmd l
LEFT JOIN departments d ON LOWER(TRIM(l.discharge_department)) = LOWER(TRIM(d.dept_name))
LEFT JOIN icd_10 i ON l.icd_primary = i.icd_code
WHERE d.dept_name IS NOT NULL AND l.icd_primary IS NOT NULL
GROUP BY d.dept_name, l.icd_primary, i.diagnosis_level3
ORDER BY d.dept_name, cases DESC;
