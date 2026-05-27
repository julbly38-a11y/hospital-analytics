import { detectDoctor, detectYear, detectPeriod } from './doctors.js'

const n = t => t.toLowerCase().trim()
const has = (t,...w) => w.every(x=>t.includes(x))
const any = (t,...w) => w.some(x=>t.includes(x))
const hasBedDays = t => t.includes('ліжкоден') || t.includes('ліжкодн') // ліжкодень / ліжкоднем / ліжкодня

function doctorSQL(t, doc) {
  const yr = detectYear(t)
  const p  = detectPeriod(t, yr)
  const df = p ? `AND admission_date_d BETWEEN '${p.from}' AND '${p.to}'`
             : yr ? `AND EXTRACT(YEAR FROM admission_date_d)=${yr}` : ''
  const pl = p ? ` (${p.from}—${p.to})` : yr ? ` (${yr})` : ''
  if (any(t,'спеціалізац','ким працює','яка посада','хто такий'))
    return {explanation:`Інфо: ${doc}`,sql:`SELECT emp_name as лікар,specialization as спеціалізація,position as посада,department as відділення FROM empl WHERE emp_name ILIKE '%${doc}%'`}
  if (has(t,'вихідн','діб'))
    return {explanation:`Вихідні доби: ${doc}${pl}`,sql:`SELECT doc_name as лікар,COUNT(DISTINCT admission_date_d) AS вихідних_діб FROM lsmd WHERE doc_name ILIKE '%${doc}%' AND EXTRACT(DOW FROM admission_date_d) IN (0,6) ${df} GROUP BY doc_name`}
  if (has(t,'нічн'))
    return {explanation:`Нічні: ${doc}${pl}`,sql:`SELECT doc_name as лікар,COUNT(*) as нічніх FROM lsmd WHERE doc_name ILIKE '%${doc}%' AND admission_ts IS NOT NULL AND (EXTRACT(HOUR FROM admission_ts::timestamp)>=22 OR EXTRACT(HOUR FROM admission_ts::timestamp)<6) ${df} GROUP BY doc_name`}
  if (any(t,'летальн','смертн','померл'))
    return {explanation:`Летальність: ${doc}${pl}`,sql:`SELECT doc_name as лікар,COUNT(*) as всього,SUM(CASE WHEN discharge_status='Помер' THEN 1 ELSE 0 END) as померло FROM lsmd WHERE doc_name ILIKE '%${doc}%' ${df} GROUP BY doc_name`}
  if (any(t,'операц','хірург'))
    return {explanation:`Операції: ${doc}${pl}`,sql:`SELECT doc_name as лікар,COUNT(*) as всього,SUM(CASE WHEN operation_id IS NOT NULL THEN 1 ELSE 0 END) as операцій FROM lsmd WHERE doc_name ILIKE '%${doc}%' ${df} GROUP BY doc_name`}
  return {explanation:`Статистика: ${doc}${pl}`,sql:`SELECT doc_name as лікар,COUNT(*) as випадків,COUNT(DISTINCT patient_id) as пацієнтів,ROUND(AVG(length_of_stay),1) as ліжкодень,SUM(CASE WHEN discharge_status='Помер' THEN 1 ELSE 0 END) as померло FROM lsmd WHERE doc_name ILIKE '%${doc}%' ${df} GROUP BY doc_name`}
}

// Детектор районів: keyword → {district, region}
const DISTRICT_MAP = [
  ['новоселицьк','Новоселицький','Чернівецька'],
  ['глибоцьк','Глибоцький','Чернівецька'],
  ['сторожинецьк','Сторожинецький','Чернівецька'],
  ['хотинськ','Хотинський','Чернівецька'],
  ['кіцманськ','Кіцманський','Чернівецька'],
  ['заставнівськ','Заставнівський','Чернівецька'],
  ['герцаївськ','Герцаївський','Чернівецька'],
  ['вижницьк','Вижницький','Чернівецька'],
  ['кельменецьк','Кельменецький','Чернівецька'],
  ['сокирянськ','Сокирянський','Чернівецька'],
  ['путильськ','Путильський','Чернівецька'],
  ['снятинськ','Снятинський','Івано-Франківська'],
  ['косівськ','Косівський','Івано-Франківська'],
  ['заліщицьк','Заліщицький','Тернопільська'],
  ['коломийськ','Коломийський','Івано-Франківська'],
  ['борщівськ','Борщівський','Тернопільська'],
]

function districtSQL(t, district, region) {
  if (any(t,'топ','діагноз','найчастіш','поширен'))
    return {explanation:`Топ діагнозів: ${district}`,
      sql:`SELECT icd_code as код,diagnosis as діагноз,cases as випадків,unique_patients as пацієнтів,avg_bed_days as ліжкодень,deaths as померло,percent_of_district as відс FROM district_diagnoses WHERE region='${region}' AND district='${district}' AND is_top10=TRUE ORDER BY cases DESC`}
  if (any(t,'підкатегор','блок','група','підгруп'))
    return {explanation:`Підкатегорії: ${district}`,
      sql:`SELECT subcategory as підкатегорія,cases as випадків,unique_patients as пацієнтів,percent_of_district as відс FROM district_disease_subcategories WHERE region='${region}' AND district='${district}' ORDER BY cases DESC LIMIT 15`}
  return {explanation:`Категорії хвороб: ${district}`,
    sql:`SELECT disease_category as категорія,cases as випадків,unique_patients as пацієнтів,percent_of_district as відс,is_primary as основна FROM district_disease_categories WHERE region='${region}' AND district='${district}' ORDER BY cases DESC`}
}

export function routeQuery(question) {
  const t = n(question)

  // Детектор лікаря
  const doc = detectDoctor(t)
  if (doc) return {cached:true,...doctorSQL(t,doc)}

  // Детектор районів
  for (const [kw,district,region] of DISTRICT_MAP)
    if (t.includes(kw)) return {cached:true,...districtSQL(t,district,region)}

  // Загальна статистика
  if (has(t,'загальн','статистик')||has(t,'скільки','всього'))
    return {cached:true,explanation:'Загальна статистика',sql:`SELECT total_cases as всього,unique_patients as пацієнтів,avg_bed_days as ліжкодень,death_rate_pct as летальність_пр,surgical_activity_pct as хірург_акт FROM v_hospital_summary`}

  // Відділення
  if (has(t,'показник','відділ')||has(t,'статистик','відділ')||has(t,'всі','відділ'))
    return {cached:true,explanation:'По відділеннях',sql:`SELECT department as відділення,total_cases as випадків,avg_bed_days as ліжкодень,death_rate_pct as летальність,surgical_activity_pct as хірург_акт FROM v_department_stats ORDER BY total_cases DESC`}
  if (has(t,'летальн','відділ'))
    return {cached:true,explanation:'Летальність по відділеннях',sql:`SELECT department as відділення,total_cases as всього,deaths as померло,death_rate_pct as летальність FROM v_department_stats ORDER BY death_rate_pct DESC`}
  if (hasBedDays(t)&&t.includes('відділ')||has(t,'середн')&&hasBedDays(t)||(any(t,'найдовш','найбільш','довг')&&hasBedDays(t)))
    return {cached:true,explanation:'Ліжкодень по відділеннях',sql:`SELECT department as відділення,avg_bed_days as середній,max_bed_days as макс FROM v_department_stats ORDER BY avg_bed_days DESC`}
  if (has(t,'операц','відділ')||has(t,'хірург','активн'))
    return {cached:true,explanation:'Хірургічна активність',sql:`SELECT department as відділення,operations as операцій,surgical_activity_pct as акт_пр FROM v_department_stats ORDER BY surgical_activity_pct DESC`}

  // Реанімація / ІТ летальність — перевіряємо ДО deptMap
  if (any(t,'реанімац','інтенсивн') && any(t,'летальн','смертн','померл','статистик'))
    return {cached:true,explanation:'Летальність реанімації',sql:`SELECT всього_поступлень,померло,летальність_pct as летальність_відс,вижило,ліжкодень_померлих,середній_ліжкодень FROM v_icu_mortality`}

  // Діагнози/категорії по конкретному відділенню
  const deptMap=[
    ['гастроентерол','Гастроентерологічне відділення'],
    ['гематолог','Гематологічне відділення'],
    ['нейрохірург','Нейрохірургічне відділення'],
    ['опіков','Опікове відділення'],
    ['урологічн','Урологічне відділення'],
    ['невролог','Центр невідкладної неврології'],
    ['анестез','Відділення анестезіології з ліжками інтенсивної терапії'],
    ['терапевт','Терапевтичне відділення №1'],
    ['травматол','Травматологічне відділення для дорослих'],
    ['хірургічн','Хірургічне відділення №1'],
  ]
  for (const [kw,dept] of deptMap) {
    if (!t.includes(kw)) continue
    if (any(t,'топ','діагноз','найчастіш','поширен'))
      return {cached:true,explanation:`Топ діагнозів: ${dept}`,sql:`SELECT icd_code as код,diagnosis as діагноз,cases as випадків,unique_patients as пацієнтів,avg_bed_days as ліжкодень,deaths as померло FROM department_diagnoses WHERE department='${dept}' AND is_top10=TRUE ORDER BY cases DESC`}
    if (any(t,'підкатегор','блок','група'))
      return {cached:true,explanation:`Підкатегорії: ${dept}`,sql:`SELECT subcategory as підкатегорія,cases as випадків,percent_of_dept as відс FROM department_disease_subcategories WHERE department='${dept}' ORDER BY cases DESC LIMIT 15`}
    if (any(t,'категор','захворюван','хвороб'))
      return {cached:true,explanation:`Категорії: ${dept}`,sql:`SELECT disease_category as категорія,cases as випадків,percent_of_dept as відс,is_primary as основна FROM department_disease_categories WHERE department='${dept}' ORDER BY cases DESC`}
    return {cached:true,explanation:`Статистика: ${dept}`,sql:`SELECT department as відділення,total_cases as випадків,unique_patients as пацієнтів,avg_bed_days as ліжкодень,deaths as померло,death_rate_pct as летальність FROM v_department_stats WHERE department ILIKE '%${kw}%'`}
  }

  // Регіональна захворюваність (Чернівецька, Івано-Франківська тощо)
  const regions=[
    ['чернівецьк','Чернівецька'],['івано-франківськ','Івано-Франківська'],
    ['тернопільськ','Тернопільська'],['хмельницьк','Хмельницька'],
    ['закарпатськ','Закарпатська'],['львівськ','Львівська'],
  ]
  for (const [kw,region] of regions) {
    if (!t.includes(kw)) continue
    if (any(t,'топ','діагноз','найчастіш'))
      return {cached:true,explanation:`Топ діагнозів: ${region}`,
        sql:`SELECT district as район,icd_code as код,diagnosis as діагноз,cases as випадків FROM district_diagnoses WHERE region='${region}' AND is_top10=TRUE ORDER BY cases DESC LIMIT 30`}
    if (any(t,'підкатегор','блок','група'))
      return {cached:true,explanation:`Підкатегорії: ${region}`,
        sql:`SELECT district as район,subcategory as підкатегорія,cases as випадків FROM district_disease_subcategories WHERE region='${region}' ORDER BY cases DESC LIMIT 30`}
    return {cached:true,explanation:`Хвороби по районах: ${region}`,
      sql:`SELECT district as район,disease_category as категорія,cases as випадків,unique_patients as пацієнтів,percent_of_district as відс,is_primary as основна FROM district_disease_categories WHERE region='${region}' ORDER BY district,cases DESC`}
  }

  // Загальні регіон/район запити
  if (has(t,'основн','категор','район')||has(t,'хвороб','район'))
    return {cached:true,explanation:'Основні хвороби по районах',
      sql:`SELECT region as регіон,district as район,disease_category as категорія,cases as випадків FROM district_disease_categories WHERE is_primary=TRUE ORDER BY cases DESC LIMIT 30`}
  if (has(t,'основн','категор','регіон')||has(t,'хвороб','регіон'))
    return {cached:true,explanation:'Основні хвороби по регіонах',
      sql:`SELECT region as регіон,disease_category as категорія,cases as випадків,unique_patients as пацієнтів FROM region_disease_categories WHERE is_primary=TRUE ORDER BY cases DESC`}

  // Загальне: регіони/райони
  if (has(t,'основн','категор')||has(t,'головн','хвороб','відділ'))
    return {cached:true,explanation:'Основні категорії по відділеннях',
      sql:`SELECT department as відділення,disease_category as категорія,cases as випадків,percent_of_dept as відс FROM department_disease_categories WHERE is_primary=TRUE ORDER BY cases DESC`}
  if (has(t,'топ','діагноз','відділ'))
    return {cached:true,explanation:'Топ діагноз по відділеннях',
      sql:`SELECT department as відділення,icd_code as код,diagnosis as діагноз,cases as випадків FROM department_diagnoses WHERE is_top10=TRUE ORDER BY department,cases DESC`}

  // Спеціалізації
  if (has(t,'спеціалізац')&&!has(t,'відділ'))
    return {cached:true,explanation:'Спеціалізації',sql:`SELECT emp_name as лікар,specialization as спеціалізація,department as відділення FROM empl WHERE specialization IS NOT NULL ORDER BY specialization,emp_name`}
  const specs=['хірург','терапевт','уролог','кардіолог','невропатолог','нейрохірург','анестезіолог','гастроентеролог','гінеколог','ендокринолог','травматолог','онколог','педіатр','пульмонолог','офтальмолог','нефролог','гематолог','інфекціоніст']
  for (const sp of specs)
    if (has(t,sp)&&any(t,'лікар','список','скільки','всі')) {
      if (has(t,'скільки')) return {cached:true,explanation:`Кількість: ${sp}`,sql:`SELECT COUNT(*) as кількість FROM empl WHERE specialization ILIKE '%${sp}%'`}
      return {cached:true,explanation:`Лікарі: ${sp}`,sql:`SELECT emp_name as лікар,department as відділення,position as посада FROM empl WHERE specialization ILIKE '%${sp}%' ORDER BY emp_name`}
    }

  // Топ діагнозів загально
  if (has(t,'топ','діагноз')||has(t,'найчастіш','діагноз'))
    return {cached:true,explanation:'Топ діагнозів',sql:`SELECT icd_code,diagnosis_name,cases as випадків,unique_patients as пацієнтів,letality_percent as летальність FROM v_top_diagnoses ORDER BY cases DESC LIMIT 20`}
  if (has(t,'діагноз','відділ')||has(t,'захворюван','відділ'))
    return {cached:true,explanation:'Захворюваність',sql:`SELECT department as відділення,disease_category as категорія,cases as випадків,percent_of_dept as відс FROM v_morbidity_by_department WHERE department IS NOT NULL ORDER BY department,cases DESC`}

  // Конкретні діагнози
  const diags=[[[' панкреатит'],'K86','панкреатит'],[[' інсульт'],'I63','інсульт'],[[' геморагічн'],'I61','геморагічний інсульт'],[[' інфаркт',' міокард'],'I21','інфаркт'],[[' апендицит'],'K35','апендицит'],[[' холецистит'],'K80','холецистит'],[[' цироз'],'K74','цироз'],[[' діабет'],'E11','діабет'],[[' пневмон'],'J18','пневмонія'],[[' гіпертонічн'],'I11','гіпертонія'],[[' струс'],'S06','струс'],[[' тромбофлебіт'],'I80','тромбофлебіт'],[[' простат'],'N40','простата']]
  for (const [kws,icd,label] of diags)
    if (kws.every(k=>t.includes(k.trim())))
      return {cached:true,explanation:`Діагноз: ${label}`,sql:`SELECT d.icd_primary as код,i.diagnosis_level3 as діагноз,d.cases as випадків,d.unique_patients as пацієнтів,d.avg_bed_days as ліжкодень,d.deaths as померло FROM v_diagnosis_stats d LEFT JOIN icd_10 i ON d.icd_primary=i.icd_code WHERE d.icd_primary LIKE '${icd}%' ORDER BY d.cases DESC LIMIT 20`}

  // Навантаження
  if (has(t,'годин')&&any(t,'пік','навантаж','по'))
    return {cached:true,explanation:'По годинах',sql:`SELECT hour as година,admissions as поступлень,urgent as ургентних,planned as планових FROM v_peak_by_hour ORDER BY hour`}
  if (has(t,'тижн')&&any(t,'день','дн')&&!has(t,'статистик'))
    return {cached:true,explanation:'По днях тижня',sql:`SELECT weekday as день_номер,admissions as поступлень,urgent as ургентних,night_admissions as нічних FROM v_peak_by_weekday ORDER BY weekday`}
  if (has(t,'місяц')&&any(t,'динамік','по','навантаж'))
    return {cached:true,explanation:'По місяцях',sql:`SELECT month as місяць,admissions as поступлень,deaths as померло,operations as операцій FROM v_peak_by_month ORDER BY month`}
  if (has(t,'тижн')&&any(t,'статистик','навантаж')) {
    const y=detectYear(t)||2024
    return {cached:true,explanation:`Тижнева ${y}`,sql:`SELECT week_start as тиждень,admissions as поступлень,deaths as померло FROM v_weekly_admissions WHERE year=${y} ORDER BY week_number DESC LIMIT 20`}
  }

  // Ургентні / вихідні / нічні
  if (has(t,'ургентн')||(has(t,'екстрен')&&has(t,'планов')))
    return {cached:true,explanation:'Ургентні vs планові',sql:`SELECT department as відділення,urgent as ургентних,planned as планових,urgent_deaths as ург_смерті FROM v_urgency_stats ORDER BY urgent DESC`}
  if (has(t,'вихідн')&&any(t,'робоч','vs','порівн')&&!has(t,'діб'))
    return {cached:true,explanation:'Вихідні vs робочі',sql:`SELECT day_type as день,cases as випадків,avg_bed_days as ліжкодень,letality_percent as летальність FROM v_weekend_vs_weekday ORDER BY cases DESC`}
  if (has(t,'вихідн')&&has(t,'відділ'))
    return {cached:true,explanation:'Вихідні по відділеннях',sql:`SELECT department as відділення,day_type as день,cases as випадків,avg_bed_days as ліжкодень FROM v_department_weekend_stats ORDER BY department,day_type DESC`}
  if ((has(t,'нічн')||has(t,'ніч'))&&any(t,'денн','день','vs','загалом'))
    return {cached:true,explanation:'Нічні vs денні',sql:`SELECT time_period as період,cases as випадків,urgent_cases as ургентних,letality_percent as летальність FROM v_night_vs_day_admissions ORDER BY time_period DESC`}
  if (has(t,'нічн')&&has(t,'відділ'))
    return {cached:true,explanation:'Нічні по відділеннях',sql:`SELECT department as відділення,time_period as період,cases as випадків,deaths as померло FROM v_night_admissions_by_department ORDER BY department,time_period DESC`}

  // Інше
  if (has(t,'повторн')||has(t,'реадміс'))
    return {cached:true,explanation:'Повторні госпіталізації',sql:`SELECT readmit_30d as повторні_30д,readmit_30d_pct as пр_30д,readmit_90d as повторні_90д,readmit_90d_pct as пр_90д FROM v_readmission_metrics`}
  if (has(t,'стат')&&has(t,'вік'))
    return {cached:true,explanation:'Стать/вік',sql:`SELECT gender as стать,age_group as вік,cases as випадків,death_rate_pct as летальність FROM v_patient_stats ORDER BY cases DESC`}
  if (any(t,'регіон','район','географ','місцев'))
    return {cached:true,explanation:'За регіонами',sql:`SELECT region as регіон,district as район,cases as випадків,unique_patients as пацієнтів,deaths as померло FROM v_region_stats ORDER BY cases DESC LIMIT 30`}

  return null
}
