# Формули аналітичних показників ЛСМД

> Всі формули витягнуті з VIEW та Materialized Views Supabase БД  
> Джерело: 80+ calculated fields з Looker Studio → нативний SQL

---

## 1. Базові прапорці (`v_case_metrics`)

### 1.1 Смертність та виписка

```sql
-- Смертність
f_death = (discharge_status = 'Помер')::integer

-- Виписка з поліпшенням
f_improved = (discharge_status = 'З поліпшенням')::integer

-- Без змін
f_nochange = (discharge_status = 'Без змін')::integer

-- З погіршенням
f_worse = (discharge_status = 'З погіршенням')::integer

-- Переведений
f_transferred = (discharge_status LIKE '%Переведений%')::integer
```

### 1.2 Тип госпіталізації

```sql
-- Екстрена
f_urgent = (admission_type = 'Екстренна')::integer

-- Планова
f_planned = (admission_type = 'Планова')::integer

-- Наявність направлення
f_referral = (referral IS NOT NULL AND referral <> '')::integer
```

### 1.3 Операції

```sql
-- Операція виконана
f_operation = (operation_id IS NOT NULL)::integer

-- Екстрена + операція
f_urgent_operation = (admission_type = 'Екстренна' AND operation_id IS NOT NULL)::integer
```

### 1.4 Демографія

```sql
-- Стать
f_female = (gender = 'Ж')::integer
f_male = (gender = 'Ч')::integer

-- Вік
patient_age = EXTRACT(year FROM age(admission_date_d, birth_date_d))::integer

-- Вікові категорії
f_child = (patient_age < 18)::integer
f_elderly = (patient_age >= 60)::integer

-- Вікові групи
age_group = CASE
  WHEN patient_age < 18 THEN '0-17'
  WHEN patient_age <= 39 THEN '18-39'
  WHEN patient_age <= 59 THEN '40-59'
  WHEN patient_age <= 74 THEN '60-74'
  ELSE '75+'
END
```

### 1.5 Час та зміни

```sql
-- Нічна зміна
f_night = (shift_time = 'нічне')::integer

-- Класифікація змін
shift_time = CASE
  WHEN admission_time::time >= '22:00' OR admission_time::time < '07:00' THEN 'нічне'
  ELSE 'денне'
END

-- Тип дня
day_type = CASE
  WHEN EXTRACT(DOW FROM admission_date_d) IN (0,6) THEN 'вихідний'
  ELSE 'будній'
END
```

### 1.6 Комбіновані показники

```sql
-- Смерть при екстреній госпіталізації
f_urgent_death = (admission_type = 'Екстренна' AND discharge_status = 'Помер')::integer

-- Смерть при плановій
f_planned_death = (admission_type = 'Планова' AND discharge_status = 'Помер')::integer

-- Екстрене переведення
f_urgent_transfer = (admission_type = 'Екстренна' AND discharge_status LIKE '%Переведений%')::integer
```

### 1.7 Ліжко-дні

```sql
-- Тривалість госпіталізації (днів)
bed_days = length_of_stay

-- Автоматичний розрахунок при INSERT/UPDATE
length_of_stay = (discharge_date_d - admission_date_d)::int
```

---

## 2. Госпітальні показники (`v_hospital_summary`)

### 2.1 Обсяги

```sql
-- Всього випадків
total_cases = COUNT(*)

-- Унікальних пацієнтів
unique_patients = COUNT(DISTINCT patient_id)

-- Всього ліжко-днів
total_bed_days = SUM(bed_days)
```

### 2.2 Середні показники

```sql
-- Середнє ліжко-день
avg_bed_days = ROUND(AVG(bed_days), 1)

-- Середній вік пацієнтів
avg_age = ROUND(AVG(patient_age), 1)
```

### 2.3 Відсотки та частки

```sql
-- Летальність (%)
death_rate_pct = ROUND(100.0 * SUM(f_death) / COUNT(*), 2)

-- Частка ургентних (%)
urgent_pct = ROUND(100.0 * SUM(f_urgent) / COUNT(*), 2)

-- Хірургічна активність (%)
surgical_activity_pct = ROUND(100.0 * SUM(f_operation) / COUNT(*), 2)

-- Загальна формула частки
percentage = ROUND(100.0 * числитель::numeric / знаменник::numeric, 2)
```

### 2.4 Підсумки

```sql
-- Смертей
deaths = SUM(f_death)

-- Операцій
operations = SUM(f_operation)

-- Переведених
transferred = SUM(f_transferred)

-- З погіршенням
worse = SUM(f_worse)

-- Ургентних
urgent = SUM(f_urgent)

-- Планових
planned = SUM(f_planned)
```

---

## 3. Показники відділень (`v_department_stats`)

Усі показники **групуються по discharge_department**:

```sql
SELECT 
  discharge_department AS department,
  
  -- Обсяги
  COUNT(*) AS total_cases,
  COUNT(DISTINCT patient_id) AS unique_patients,
  
  -- Ліжко-дні
  ROUND(AVG(bed_days), 1) AS avg_bed_days,
  MAX(bed_days) AS max_bed_days,
  
  -- Летальність
  SUM(f_death) AS deaths,
  ROUND(100.0 * SUM(f_death) / COUNT(*), 2) AS death_rate_pct,
  
  -- Ургентність
  SUM(f_urgent) AS urgent,
  ROUND(100.0 * SUM(f_urgent) / COUNT(*), 2) AS urgent_pct,
  
  -- Хірургія
  SUM(f_operation) AS operations,
  ROUND(100.0 * SUM(f_operation) / COUNT(*), 2) AS surgical_activity_pct,
  
  -- Демографія
  ROUND(AVG(patient_age), 1) AS avg_age,
  SUM(f_female) AS women,
  SUM(f_male) AS men,
  SUM(f_child) AS children,
  SUM(f_elderly) AS elderly,
  
  -- Виписка
  SUM(f_referral) AS with_referral,
  SUM(f_improved) AS improved,
  SUM(f_nochange) AS nochange

FROM v_case_metrics
WHERE discharge_department IS NOT NULL
GROUP BY discharge_department
```

---

## 4. Повторні госпіталізації (`v_readmissions`)

### 4.1 Window Function для наступного візиту

```sql
WITH ordered AS (
  SELECT 
    id_case,
    patient_id,
    admission_date_d,
    discharge_date_d,
    icd_primary,
    
    -- Наступна дата поступлення ЦЬО ЖЕ пацієнта
    LEAD(admission_date_d) OVER (
      PARTITION BY patient_id 
      ORDER BY admission_date_d
    ) AS next_admission,
    
    -- Наступний діагноз
    LEAD(icd_primary) OVER (
      PARTITION BY patient_id 
      ORDER BY admission_date_d
    ) AS next_icd
    
  FROM lsmd
  WHERE patient_id IS NOT NULL 
    AND admission_date_d IS NOT NULL
)
SELECT 
  id_case,
  patient_id,
  admission_date_d,
  discharge_date_d,
  icd_primary,
  next_admission,
  
  -- Днів до повторного поступлення
  next_admission - discharge_date_d AS days_to_readmission,
  
  -- Повторна госпіталізація ≤30 днів
  ((next_admission - discharge_date_d) >= 0 
   AND (next_admission - discharge_date_d) <= 30)::integer AS readmit_30d,
  
  -- Повторна ≤90 днів
  ((next_admission - discharge_date_d) >= 0 
   AND (next_admission - discharge_date_d) <= 90)::integer AS readmit_90d,
  
  -- Той самий діагноз
  (next_icd = icd_primary)::integer AS same_diagnosis
  
FROM ordered
WHERE next_admission IS NOT NULL
```

### 4.2 Агреговані метрики (`v_readmission_metrics`)

```sql
SELECT 
  -- Випадків з наступним візитом
  COUNT(*) AS total_with_followup,
  
  -- Повторних ≤30 днів
  SUM(readmit_30d) AS readmit_30d,
  ROUND(100.0 * SUM(readmit_30d) / COUNT(*), 2) AS readmit_30d_pct,
  
  -- Повторних ≤90 днів
  SUM(readmit_90d) AS readmit_90d,
  ROUND(100.0 * SUM(readmit_90d) / COUNT(*), 2) AS readmit_90d_pct,
  
  -- Той самий діагноз ≤30 днів
  SUM(CASE 
    WHEN readmit_30d = 1 AND same_diagnosis = 1 THEN 1 
    ELSE 0 
  END) AS same_dx_30d

FROM v_readmissions
```

**Тлумачення:**
- `readmit_30d_pct` — % пацієнтів, які повернулися протягом 30 днів
- `readmit_90d_pct` — % повернень протягом 90 днів
- `same_dx_30d` — к-сть повернень з тим самим діагнозом

---

## 5. Ургентні показники (`v_urgency_stats`)

```sql
SELECT
  -- По типу госпіталізації
  hosp_type,
  
  COUNT(*) AS total_cases,
  
  -- Летальність
  SUM(f_death) AS deaths,
  ROUND(100.0 * SUM(f_death) / COUNT(*), 2) AS death_rate_pct,
  
  -- Операції
  SUM(f_operation) AS operations,
  ROUND(100.0 * SUM(f_operation) / COUNT(*), 2) AS surgery_pct,
  
  -- Середнє ліжко-день
  ROUND(AVG(bed_days), 1) AS avg_bed_days,
  
  -- Переведені
  SUM(f_transferred) AS transferred,
  
  -- З погіршенням
  SUM(f_worse) AS worse

FROM v_case_metrics
GROUP BY hosp_type
```

---

## 6. Діагнози (`v_diagnosis_stats`)

```sql
SELECT
  icd_primary AS icd_code,
  
  COUNT(*) AS cases,
  COUNT(DISTINCT patient_id) AS patients,
  
  -- Летальність по діагнозу
  SUM(f_death) AS deaths,
  ROUND(100.0 * SUM(f_death) / COUNT(*), 2) AS death_rate_pct,
  
  -- Хірургія
  SUM(f_operation) AS operations,
  ROUND(100.0 * SUM(f_operation) / COUNT(*), 2) AS surgery_pct,
  
  -- Середнє ліжко-день
  ROUND(AVG(bed_days), 1) AS avg_bed_days,
  
  -- Демографія
  ROUND(AVG(patient_age), 1) AS avg_age,
  SUM(f_female) AS women,
  SUM(f_male) AS men

FROM v_case_metrics
WHERE icd_primary IS NOT NULL
GROUP BY icd_primary
```

---

## 7. Пікові навантаження

### 7.1 По годинах (`v_peak_by_hour`)

```sql
SELECT
  EXTRACT(hour FROM admission_ts) AS hour,
  COUNT(*) AS admissions,
  SUM(f_urgent) AS urgent,
  SUM(f_planned) AS planned

FROM v_case_metrics
WHERE admission_ts IS NOT NULL
GROUP BY EXTRACT(hour FROM admission_ts)
ORDER BY hour
```

### 7.2 По днях тижня (`v_peak_by_weekday`)

```sql
SELECT
  EXTRACT(DOW FROM admission_date_d) AS weekday,  -- 0=неділя, 6=субота
  COUNT(*) AS admissions,
  SUM(f_urgent) AS urgent,
  SUM(f_night) AS night_admissions

FROM v_case_metrics
WHERE admission_date_d IS NOT NULL
GROUP BY EXTRACT(DOW FROM admission_date_d)
ORDER BY weekday
```

### 7.3 По місяцях (`v_peak_by_month`)

```sql
SELECT
  EXTRACT(month FROM admission_date_d) AS month,
  COUNT(*) AS admissions,
  SUM(f_death) AS deaths,
  SUM(f_operation) AS operations

FROM v_case_metrics
WHERE admission_date_d IS NOT NULL
GROUP BY EXTRACT(month FROM admission_date_d)
ORDER BY month
```

---

## 8. Географія (`v_region_stats`)

```sql
SELECT
  region,
  
  COUNT(*) AS patients,
  COUNT(DISTINCT patient_id) AS unique_patients,
  
  -- Найчастіші міста
  array_agg(DISTINCT city_name ORDER BY city_name) AS cities,
  
  -- Демографія
  SUM(f_female) AS women,
  SUM(f_male) AS men,
  ROUND(AVG(patient_age), 1) AS avg_age

FROM v_case_metrics
JOIN patients_best USING (patient_id)
WHERE region IS NOT NULL
GROUP BY region
ORDER BY patients DESC
```

---

## 9. Пацієнти (`v_patient_stats`)

Групування: **стать × вікова група**

```sql
SELECT
  gender,
  age_group,
  
  COUNT(*) AS cases,
  COUNT(DISTINCT patient_id) AS unique_patients,
  
  -- Летальність
  SUM(f_death) AS deaths,
  ROUND(100.0 * SUM(f_death) / COUNT(*), 2) AS death_rate_pct,
  
  -- Середнє ліжко-день
  ROUND(AVG(bed_days), 1) AS avg_bed_days,
  
  -- Операції
  SUM(f_operation) AS operations

FROM v_case_metrics
GROUP BY gender, age_group
ORDER BY gender, age_group
```

---

## 10. Правила розрахунку

### 10.1 Загальні принципи

```sql
-- Відсоток
percentage = ROUND(100.0 * числитель::numeric / знаменник::numeric, 2)

-- Середнє (1 знак)
average = ROUND(AVG(column), 1)

-- Прапорці (0 або 1)
flag = (умова)::integer

-- Підрахунок унікальних
unique_count = COUNT(DISTINCT column)

-- Сума прапорців = кількість випадків з умовою
sum_of_flags = SUM(flag)
```

### 10.2 Window Functions

```sql
-- Наступний запис по пацієнту
LEAD(column) OVER (PARTITION BY patient_id ORDER BY date)

-- Попередній запис
LAG(column) OVER (PARTITION BY patient_id ORDER BY date)

-- Ранг
ROW_NUMBER() OVER (PARTITION BY group ORDER BY metric DESC)

-- Накопичувальна сума
SUM(column) OVER (PARTITION BY group ORDER BY date 
                   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
```

### 10.3 Фільтри

```sql
-- Виключити "Лікується" (плейсхолдер)
WHERE discharge_status <> 'Лікується'

-- Тільки з датами
WHERE admission_date_d IS NOT NULL

-- Виключити тестові
WHERE patient_id IS NOT NULL
```

---

## 11. Materialized Views (кешовані)

Оновлюються **щоночі о 02:00** через `pg_cron`:

```sql
-- Денний потік (~2265 рядків)
mv_daily_stats = v_case_metrics GROUP BY admission_date_d

-- Зведення відділень (20 рядків)
mv_dept_stats = v_department_stats

-- Картка лікаря (868 рядків)
mv_doctor_full = лікар + його статистика

-- Використання діагнозів (19824 рядки)
mv_icd_usage = icd_10 + COUNT(випадків)
```

Оновлення вручну:

```sql
SELECT refresh_all_mviews();
```

---

## 12. Приклади використання

### Випадки за останній місяць

```sql
SELECT 
  admission_date_d,
  COUNT(*) AS admissions,
  SUM(f_urgent) AS urgent,
  SUM(f_death) AS deaths
FROM v_case_metrics
WHERE admission_date_d >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY admission_date_d
ORDER BY admission_date_d DESC
```

### Топ відділень за летальністю

```sql
SELECT 
  department,
  total_cases,
  deaths,
  death_rate_pct
FROM v_department_stats
WHERE total_cases >= 100  -- фільтр мінімального обсягу
ORDER BY death_rate_pct DESC
LIMIT 10
```

### Повторні візити одного пацієнта

```sql
SELECT 
  admission_date_d,
  discharge_date_d,
  next_admission,
  days_to_readmission,
  icd_primary,
  same_diagnosis
FROM v_readmissions
WHERE patient_id = 12345
ORDER BY admission_date_d
```

---

**Документ актуальний станом на:** 23.05.2026  
**Джерело:** Supabase БД `wnyfrckxhwujsjcfxqou`  
**Автор:** Claude + Julien (система ЛСМД)

---

## 13. Важливі фільтри для точності

### 13.1 Виключення плейсхолдера "Лікується"

**Проблема:** Пацієнти зі статусом "Лікується" мають `discharge_date = admission + 10 днів` (плейсхолдер, не реальна виписка).

**Рішення:**

```sql
-- У всіх запитах з length_of_stay або discharge_date
WHERE discharge_status <> 'Лікується'

-- Або
WHERE discharge_date_d IS NOT NULL 
  AND discharge_status IN ('Виписаний', 'Помер', 'Переведений', 'З поліпшенням', 'Без змін')
```

### 13.2 Коректні повторні госпіталізації

```sql
-- v_readmissions з фільтром
SELECT *
FROM v_readmissions
WHERE days_to_readmission >= 0  -- виключити від'ємні (плейсхолдери)
  AND days_to_readmission <= 365
```

### 13.3 Реальне середнє ліжко-день

```sql
-- Без "Лікується"
SELECT ROUND(AVG(bed_days), 1) AS avg_los_real
FROM v_case_metrics
WHERE discharge_status <> 'Лікується'
```

Детальніше про маркер "10 днів" → [DATABASE.md](DATABASE.md)

