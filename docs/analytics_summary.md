# Аналітичні блоки ЛСМД

> Структура дашборду по клінічних блоках та відділеннях

---

## БЛОК 1 — Клінічний (загальний)

### 1.1 Хірургічний блок
_Відділення: Хірургічне №1, №2, Нейрохірургічне, Травматологічне (дорослі), Травматологічне (діти), Опікове, Урологічне_

```sql
SELECT discharge_department AS відділення,
  COUNT(*) AS випадків, SUM(f_operation) AS операцій,
  ROUND(100.0*SUM(f_operation)/COUNT(*),2) AS хірург_акт_пр,
  SUM(f_urgent) AS ургентних, SUM(f_death) AS померло,
  ROUND(100.0*SUM(f_death)/COUNT(*),2) AS летальність,
  ROUND(AVG(bed_days),1) AS ліжкодень
FROM v_case_metrics
WHERE discharge_department IN (
  'Хірургічне відділення №1','Хірургічне відділення №2',
  'Нейрохірургічне відділення','Травматологічне відділення для дорослих',
  'Травматологічне відділення для дітей','Опікове відділення','Урологічне відділення')
GROUP BY discharge_department ORDER BY випадків DESC

-- Структура операцій (екстрені vs планові)
SELECT discharge_department,
  SUM(f_urgent_operation) AS екстрені,
  SUM(f_operation)-SUM(f_urgent_operation) AS планові,
  ROUND(100.0*SUM(f_urgent_operation)/NULLIF(SUM(f_operation),0),1) AS екстр_пр
FROM v_case_metrics WHERE discharge_department IN (...)
GROUP BY discharge_department
```

### 1.2 Терапевтичний блок
_Відділення: Терапевтичне №1, №2, Гастроентерологічне, Гематологічне, Центр неврології_

```sql
SELECT discharge_department AS відділення,
  COUNT(*) AS випадків, SUM(f_death) AS померло,
  ROUND(100.0*SUM(f_death)/COUNT(*),2) AS летальність,
  ROUND(AVG(bed_days),1) AS ліжкодень,
  ROUND(AVG(patient_age),1) AS сер_вік,
  SUM(f_elderly) AS літніх,
  ROUND(100.0*SUM(f_referral)/COUNT(*),1) AS з_направленням_пр
FROM v_case_metrics
WHERE discharge_department IN (
  'Терапевтичне відділення №1','Терапевтичне відділення №2',
  'Гастроентерологічне відділення','Гематологічне відділення',
  'Центр невідкладної неврології')
GROUP BY discharge_department ORDER BY випадків DESC
```

### 1.3 Інтенсивна терапія
```sql
-- Тільки через v_icu_mortality
SELECT всього_поступлень, померло, летальність_pct,
  вижило, середній_ліжкодень, ліжкодень_померлих
FROM v_icu_mortality

-- Джерела поступлень
SELECT admission_department AS звідки, COUNT(*) AS поступлень, SUM(f_death) AS померло
FROM v_case_metrics
WHERE discharge_department = 'Відділення анестезіології з ліжками інтенсивної терапії'
GROUP BY admission_department ORDER BY поступлень DESC
```

---

## БЛОК 2 — По відділеннях (специфіка)

### 2.1 Хірургічне №1/№2 — операції, онкологія, апендицити, холецистити
```sql
-- Топ діагнозів
SELECT i.diagnosis_level3, COUNT(*) AS випадків,
  SUM(f_operation) AS операцій,
  ROUND(100.0*SUM(f_death)/COUNT(*),2) AS летальність
FROM v_case_metrics m JOIN icd_10 i ON m.icd_primary=i.icd_code
WHERE discharge_department LIKE 'Хірургічне%'
GROUP BY i.diagnosis_level3 ORDER BY випадків DESC LIMIT 15
-- Нічні/вихідні операції
SELECT
  SUM(CASE WHEN f_night=1 AND f_operation=1 THEN 1 ELSE 0 END) AS нічних_оп,
  SUM(CASE WHEN day_type='вихідний' AND f_operation=1 THEN 1 ELSE 0 END) AS вихідні_оп
FROM v_case_metrics WHERE discharge_department LIKE 'Хірургічне%'
```

### 2.2 Нейрохірургічне — ЧМТ, пухлини, судинні
```sql
SELECT
  CASE WHEN icd_primary LIKE 'S0%' THEN 'ЧМТ'
       WHEN icd_primary LIKE 'D3%' THEN 'Пухлини'
       WHEN icd_primary LIKE 'G%' THEN 'Неврологія'
       WHEN icd_primary LIKE 'I6%' THEN 'Судинні'
       ELSE 'Інші' END AS група,
  COUNT(*) AS випадків, ROUND(AVG(bed_days),1) AS ліжкодень, SUM(f_death) AS померло
FROM v_case_metrics
WHERE discharge_department = 'Нейрохірургічне відділення'
GROUP BY група ORDER BY випадків DESC
```

### 2.3 Травматологічне — сезонність, діти/дорослі, вихідні
```sql
-- Сезонність
SELECT EXTRACT(month FROM admission_date_d) AS місяць,
  COUNT(*) AS травм, SUM(f_child) AS дітей, SUM(f_elderly) AS літніх
FROM v_case_metrics WHERE discharge_department LIKE 'Травматологічне%'
GROUP BY місяць ORDER BY місяць
-- Вихідні/будні
SELECT day_type, COUNT(*) AS вип, ROUND(AVG(bed_days),1) AS ліжкодень
FROM v_case_metrics WHERE discharge_department LIKE 'Травматологічне%'
GROUP BY day_type
```

### 2.4 Урологічне — онко, плановий характер, чоловіки
```sql
SELECT
  CASE WHEN icd_primary LIKE 'C%' THEN 'Онкологія' ELSE 'Інші' END AS профіль,
  COUNT(*) AS вип, ROUND(AVG(bed_days),1) AS ліжк,
  SUM(f_operation) AS опер, SUM(f_death) AS помер, gender
FROM v_case_metrics
WHERE discharge_department = 'Урологічне відділення'
GROUP BY профіль, gender
```

### 2.5 Опікове — найдовший ліжкодень, тяжкість
```sql
SELECT
  ROUND(AVG(bed_days),1) AS середній, MAX(bed_days) AS макс,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bed_days) AS медіана,
  SUM(f_death) AS померло,
  ROUND(100.0*SUM(f_death)/COUNT(*),2) AS летальність
FROM v_case_metrics WHERE discharge_department = 'Опікове відділення'
```

### 2.6 Центр неврології — інсульти, летальність, повторні
```sql
-- Типи інсультів
SELECT
  CASE WHEN icd_primary LIKE 'I63%' THEN 'Ішемічний'
       WHEN icd_primary LIKE 'I61%' THEN 'Геморагічний'
       WHEN icd_primary LIKE 'I64%' THEN 'Невизначений'
       ELSE 'Інші' END AS тип,
  COUNT(*) AS вип, SUM(f_death) AS помер,
  ROUND(100.0*SUM(f_death)/COUNT(*),2) AS летальність,
  ROUND(AVG(bed_days),1) AS ліжкодень
FROM v_case_metrics
WHERE discharge_department = 'Центр невідкладної неврології'
GROUP BY тип ORDER BY вип DESC
-- Повторні інсульти ≤90 днів
SELECT COUNT(*) AS повторних FROM v_readmissions r
JOIN lsmd l ON r.id_case=l.id_case
WHERE l.admission_department='Центр невідкладної неврології'
  AND r.readmit_90d=1 AND r.same_diagnosis=1
```

### 2.7 Гематологічне — лейкози, лімфоми, тривале лікування
```sql
SELECT i.diagnosis_level3, COUNT(*) AS вип,
  ROUND(AVG(bed_days),1) AS ліжк, SUM(f_death) AS пом,
  COUNT(DISTINCT patient_id) AS унік_пац
FROM v_case_metrics m JOIN icd_10 i ON m.icd_primary=i.icd_code
WHERE discharge_department='Гематологічне відділення'
GROUP BY i.diagnosis_level3 ORDER BY вип DESC LIMIT 10
```

### 2.8 Гастроентерологічне — гепатити, цироз, панкреатит
```sql
SELECT
  CASE WHEN icd_primary LIKE 'K7%' THEN 'Печінка/жовчний'
       WHEN icd_primary LIKE 'K8%' THEN 'Жовчний міхур/підшлункова'
       WHEN icd_primary LIKE 'K2%' OR icd_primary LIKE 'K3%' THEN 'Шлунок/12п.кишка'
       WHEN icd_primary LIKE 'B1%' THEN 'Гепатити'
       ELSE 'Інші' END AS профіль,
  COUNT(*) AS вип, ROUND(AVG(bed_days),1) AS ліжк
FROM v_case_metrics
WHERE discharge_department='Гастроентерологічне відділення'
GROUP BY профіль ORDER BY вип DESC
```

---

## БЛОК 3 — Лікарі
```sql
SELECT doc_name AS лікар, COUNT(*) AS вип,
  COUNT(DISTINCT patient_id) AS пац, ROUND(AVG(bed_days),1) AS ліжк,
  SUM(f_death) AS пом, ROUND(100.0*SUM(f_death)/COUNT(*),2) AS летальність,
  SUM(f_operation) AS опер
FROM lsmd
WHERE admission_department='[ВІДДІЛЕННЯ]'
  AND EXTRACT(YEAR FROM admission_date_d)=2024
GROUP BY doc_name ORDER BY вип DESC
```

---

## БЛОК 4 — Часові паттерни
```sql
-- Нічні по блоках
SELECT cb.name AS блок, SUM(f_night) AS нічних, COUNT(*) AS всього,
  ROUND(100.0*SUM(f_night)/COUNT(*),1) AS нічних_пр
FROM v_case_metrics m
JOIN departments d ON d.dept_name=m.admission_department
JOIN clinical_blocks cb ON cb.id=d.block_id
GROUP BY cb.name
-- Вихідні по відділеннях
SELECT discharge_department,
  SUM(CASE WHEN day_type='вихідний' THEN 1 ELSE 0 END) AS у_вихідні,
  SUM(CASE WHEN day_type='будній' THEN 1 ELSE 0 END) AS у_будні
FROM v_case_metrics GROUP BY discharge_department
```

---

**Статус:** v1.0 — чорновик  
**Наступний крок:** реалізація в `/analytics` як вкладки/секції
# Аналітика: ключові показники

## Розподіл захворюваності (глави МКХ-10)

| Категорія | % |
|---|---|
| K Травлення | 21.83 |
| S,T Травми | 18.92 |
| I Кровообіг | 13.79 |
| G Нервова | 9.85 |
| N Сечостатева | 9.58 |

## Статистика
- 110 206 випадків (2020-2026)
- Сер. тривалість: 11.4 дня
- Смертність: 2.1% (436 у першу добу)
- 49 919 оперативних втручань (45.3%)
- Переведень: 2.82%

## Штат
- 354 особи в 13 клінічних відділеннях
- 240 ординаторів
- 3 блоки: хірургічний (195), терапевтичний (74), інтенсивна терапія (85)
