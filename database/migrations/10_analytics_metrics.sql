-- ============================================================
-- Аналітичні показники (з Looker Studio calculated fields)
-- 80+ показників перенесено з Looker у нативний SQL
-- Джерело: looker_studio_calculated_fields.md
-- ============================================================

-- v_case_metrics: базовий VIEW з усіма прапорцями (1.1-1.19 + вікова група)
--   f_death, f_urgent, f_planned, f_operation, f_worse, f_transferred,
--   f_improved, f_nochange, f_referral, f_female, f_male, f_child,
--   f_elderly, f_urgent_death, f_planned_death, f_urgent_transfer,
--   f_urgent_operation, f_night, age_group

-- АГРЕГАТНІ VIEW:
-- v_hospital_summary    — загальні показники лікарні (3.1)
-- v_department_stats    — по відділеннях виписки (3.2)
-- v_urgency_stats       — ургентні показники (3.3)
-- v_diagnosis_stats     — по діагнозах (3.4)
-- v_patient_stats       — стать × вікова група (3.6)
-- v_region_stats        — географія (3.7)
-- v_peak_by_hour        — пік по годинах
-- v_peak_by_weekday     — пік по днях тижня
-- v_peak_by_month       — пік по місяцях
-- v_readmissions        — повторні госпіталізації (LEAD window)
-- v_readmission_metrics — зведена метрика 30/90 днів

-- МАПІНГ полів Looker → наша БД:
--   hosp_type        → admission_type
--   bed_days         → length_of_stay
--   operation_code   → operation_id IS NOT NULL
--   dept_discharge   → discharge_department
--   patient_age      → age(admission_date_d, birth_date_d)

-- ПЕРЕВАГА над Looker:
--   повторні госпіталізації (v_readmissions) рахуються через
--   window function LEAD() — у Looker Studio це було неможливо

-- Повні визначення див. через: SELECT pg_get_viewdef('v_case_metrics');

-- ПОКАЗНИКИ ЛІКАРНІ (приклад результату):
--   Госпіталізацій: 110 206 | Пацієнтів: 67 856
--   Сер. ліжко-день: 11.4 | Летальність: 2.06%
--   Екстрених: 90.49% | Хірургічна активність: 45.30%
--   Повторні ≤30д: 22.45% | ≤90д: 44.45%
