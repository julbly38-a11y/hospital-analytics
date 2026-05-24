-- Weekend and weekly analytics views
-- For tracking admission patterns by day of week and weekend vs weekday

-- VIEW 1: Weekend vs Weekday statistics
CREATE OR REPLACE VIEW v_weekend_vs_weekday AS
SELECT 
  CASE 
    WHEN EXTRACT(DOW FROM l.admission_date_d::date) IN (0, 6) THEN 'Вихідний'
    ELSE 'Робочий день'
  END as day_type,
  COUNT(*) as cases,
  COUNT(DISTINCT l.patient_id) as unique_patients,
  ROUND(AVG(l.length_of_stay), 1) as avg_bed_days,
  SUM(CASE WHEN l.admission_type = 'Екстрена' THEN 1 ELSE 0 END) as urgent_cases,
  SUM(CASE WHEN l.discharge_status = 'Помер' THEN 1 ELSE 0 END) as deaths,
  ROUND(
    (SUM(CASE WHEN l.discharge_status = 'Помер' THEN 1 ELSE 0 END)::numeric / COUNT(*)) * 100,
    2
  ) as letality_percent
FROM lsmd l
WHERE l.admission_date_d IS NOT NULL
GROUP BY day_type
ORDER BY day_type DESC;

-- VIEW 2: Detailed weekday breakdown (Monday-Sunday)
CREATE OR REPLACE VIEW v_admissions_by_weekday AS
SELECT 
  EXTRACT(DOW FROM l.admission_date_d::date)::int as day_number,
  CASE EXTRACT(DOW FROM l.admission_date_d::date)::int
    WHEN 0 THEN 'Неділя'
    WHEN 1 THEN 'Понеділок'
    WHEN 2 THEN 'Вівторок'
    WHEN 3 THEN 'Середа'
    WHEN 4 THEN 'Четвер'
    WHEN 5 THEN 'П''ятниця'
    WHEN 6 THEN 'Субота'
  END as weekday_name,
  COUNT(*) as cases,
  COUNT(DISTINCT l.patient_id) as unique_patients,
  ROUND(AVG(l.length_of_stay), 1) as avg_bed_days,
  SUM(CASE WHEN l.admission_type = 'Екстрена' THEN 1 ELSE 0 END) as urgent_cases,
  SUM(CASE WHEN l.discharge_status = 'Помер' THEN 1 ELSE 0 END) as deaths,
  ROUND(
    (SUM(CASE WHEN l.discharge_status = 'Помер' THEN 1 ELSE 0 END)::numeric / COUNT(*)) * 100,
    2
  ) as letality_percent
FROM lsmd l
WHERE l.admission_date_d IS NOT NULL
GROUP BY day_number, weekday_name
ORDER BY day_number;

-- VIEW 3: Weekly trend (ISO weeks)
CREATE OR REPLACE VIEW v_weekly_admissions AS
SELECT 
  DATE_TRUNC('week', l.admission_date_d::date)::date as week_start,
  EXTRACT(WEEK FROM l.admission_date_d::date)::int as week_number,
  EXTRACT(YEAR FROM l.admission_date_d::date)::int as year,
  COUNT(*) as admissions,
  COUNT(DISTINCT l.patient_id) as unique_patients,
  SUM(CASE WHEN l.admission_type = 'Екстрена' THEN 1 ELSE 0 END) as urgent,
  SUM(CASE WHEN l.discharge_status = 'Помер' THEN 1 ELSE 0 END) as deaths,
  ROUND(AVG(l.length_of_stay), 1) as avg_bed_days
FROM lsmd l
WHERE l.admission_date_d IS NOT NULL
GROUP BY week_start, week_number, year
ORDER BY year DESC, week_number DESC;

-- VIEW 4: Weekend vs Weekday by department
CREATE OR REPLACE VIEW v_department_weekend_stats AS
SELECT 
  d.dept_name as department,
  CASE 
    WHEN EXTRACT(DOW FROM l.admission_date_d::date) IN (0, 6) THEN 'Вихідний'
    ELSE 'Робочий день'
  END as day_type,
  COUNT(*) as cases,
  COUNT(DISTINCT l.patient_id) as unique_patients,
  ROUND(AVG(l.length_of_stay), 1) as avg_bed_days,
  SUM(CASE WHEN l.discharge_status = 'Помер' THEN 1 ELSE 0 END) as deaths
FROM lsmd l
LEFT JOIN departments d ON LOWER(TRIM(l.discharge_department)) = LOWER(TRIM(d.dept_name))
WHERE l.admission_date_d IS NOT NULL AND d.dept_name IS NOT NULL
GROUP BY d.dept_name, day_type
ORDER BY d.dept_name, day_type DESC;

-- VIEW 5: Admission dynamics: day of week + time
CREATE OR REPLACE VIEW v_admissions_weekday_hour AS
SELECT 
  CASE EXTRACT(DOW FROM l.admission_date_d::date)::int
    WHEN 0 THEN 'Неділя'
    WHEN 1 THEN 'Понеділок'
    WHEN 2 THEN 'Вівторок'
    WHEN 3 THEN 'Середа'
    WHEN 4 THEN 'Четвер'
    WHEN 5 THEN 'П''ятниця'
    WHEN 6 THEN 'Субота'
  END as weekday_name,
  EXTRACT(HOUR FROM l.admission_ts::timestamp)::int as hour_of_day,
  COUNT(*) as admissions,
  ROUND(AVG(l.length_of_stay), 1) as avg_bed_days
FROM lsmd l
WHERE l.admission_ts IS NOT NULL
GROUP BY weekday_name, hour_of_day
ORDER BY 
  CASE 
    WHEN weekday_name = 'Понеділок' THEN 1
    WHEN weekday_name = 'Вівторок' THEN 2
    WHEN weekday_name = 'Середа' THEN 3
    WHEN weekday_name = 'Четвер' THEN 4
    WHEN weekday_name = 'П''ятниця' THEN 5
    WHEN weekday_name = 'Субота' THEN 6
    WHEN weekday_name = 'Неділя' THEN 7
  END,
  hour_of_day;
