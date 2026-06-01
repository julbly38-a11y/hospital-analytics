import { detectDoctor, detectYear, detectPeriod } from './doctors.js'

const n = t => t.toLowerCase().trim()
const has = (t,...w) => w.every(x=>t.includes(x))
const any = (t,...w) => w.some(x=>t.includes(x))
const hasBedDays = t => t.includes('ліжкоден') || t.includes('ліжкодн') || t.includes('ліжко-ден') || t.includes('ліжко-дн') // всі форми

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
  if (has(t,'доб','чергуван') || has(t,'скільки','чергуван') || has(t,'днів','чергуван'))
    return {explanation:`Доби чергування (09:00→09:00): ${doc}${pl}`,sql:`SELECT COUNT(DISTINCT (CASE WHEN EXTRACT(HOUR FROM admission_ts::timestamp)<9 THEN admission_ts::date - INTERVAL '1 day' ELSE admission_ts::date END)::date) as діб_чергування, COUNT(*) as всього_поступлень FROM lsmd WHERE doc_name ILIKE '%${doc}%' AND admission_ts IS NOT NULL ${df}`}
  if (has(t,'нічн'))
    return {explanation:`Нічні поступлення (22:00–07:00, за часом у системі): ${doc}${pl}`,sql:`SELECT COUNT(*) as нічних_поступлень, COUNT(DISTINCT (CASE WHEN EXTRACT(HOUR FROM admission_ts::timestamp)<9 THEN admission_ts::date - INTERVAL '1 day' ELSE admission_ts::date END)::date) as діб_чергування_з_нічними FROM lsmd WHERE doc_name ILIKE '%${doc}%' AND admission_ts IS NOT NULL AND (EXTRACT(HOUR FROM admission_ts::timestamp)>=22 OR EXTRACT(HOUR FROM admission_ts::timestamp)<7) ${df}`}
  if (any(t,'летальн','смертн','померл'))
    return {explanation:`Летальність: ${doc}${pl}`,sql:`SELECT doc_name as лікар,COUNT(*) as всього,SUM(CASE WHEN discharge_status='Помер' THEN 1 ELSE 0 END) as померло FROM lsmd WHERE doc_name ILIKE '%${doc}%' ${df} GROUP BY doc_name`}
  if (any(t,'операц','хірург'))
    return {explanation:`Операції: ${doc}${pl}`,sql:`SELECT doc_name as лікар,COUNT(*) as всього,SUM(CASE WHEN operation_id IS NOT NULL THEN 1 ELSE 0 END) as операцій FROM lsmd WHERE doc_name ILIKE '%${doc}%' ${df} GROUP BY doc_name`}
  // Діагноз у лікаря → список власних випадків (дати, МКХ, вислід)
  const dgx = doctorDiagnosis(t)
  if (dgx) {
    return {explanation:`Мої випадки (${dgx.label})${pl}`,
      sql:`SELECT admission_date_d as дата_надходження,patient_name as пацієнт,icd_primary as мкх,admission_department as відділення,discharge_status as вислід,length_of_stay as ліжкодень FROM lsmd WHERE doc_name ILIKE '%${doc}%' AND icd_primary LIKE '${dgx.icd}%' ${df} ORDER BY admission_date_d DESC LIMIT 200`}
  }
  return {explanation:`Статистика: ${doc}${pl}`,sql:`SELECT doc_name as лікар,COUNT(*) as випадків,COUNT(DISTINCT patient_id) as пацієнтів,ROUND(AVG(length_of_stay),1) as ліжкодень,SUM(CASE WHEN discharge_status='Помер' THEN 1 ELSE 0 END) as померло FROM lsmd WHERE doc_name ILIKE '%${doc}%' ${df} GROUP BY doc_name`}
}

// Розпізнавання діагнозу в запиті лікаря. Префікси ICD-10 за реальними даними неврології + загальні.
function doctorDiagnosis(t) {
  const DIAGS = [
    [[' тіа',' транзиторн','минуч'],'G45','транзиторна ішемічна атака'],
    [[' ішемічн інсульт',' ішемічного інсульт',' інсульт'],'I63','ішемічний інсульт'],
    [[' геморагічн',' крововилив'],'I61','геморагічний інсульт'],
    [[' субарахноїд'],'I60','субарахноїдальний крововилив'],
    [[' корінц',' радикул',' защемлен нерв'],'G55','корінцеві синдроми'],
    [[' розсіян',' склероз'],'G35','розсіяний склероз'],
    [[' епілеп',' судом',' напад'],'G40','епілепсія'],
    [[' енцефалопат'],'G93','енцефалопатія'],
    [[' поліневропат',' нейропат',' невропат'],'G61','поліневропатія'],
    [[' міастен'],'G70','міастенія'],
    [[' мігрен',' головн біль'],'G43','мігрень'],
    [[' паркінсон'],'G20','хвороба Паркінсона'],
    [[' грижа диск',' протрузі',' остеохондроз'],'M51','ураження міжхребцевих дисків'],
    [[' дорсалг',' біль у спин',' люмбал'],'M54','дорсалгія'],
    [[' інфаркт',' міокард'],'I21','інфаркт міокарда'],
    [[' гіпертон',' артеріальн тиск'],'I10','гіпертонічна хвороба'],
    [[' пневмон'],'J1','пневмонія'],
    [[' діабет',' цукров'],'E11','цукровий діабет'],
    [[' струс',' чмт',' черепно-мозков'],'S06','струс/ЧМТ'],
    [[' панкреатит'],'K86','панкреатит'],
    [[' апендицит'],'K35','апендицит'],
  ]
  for (const [keys, icd, label] of DIAGS) {
    if (keys.some(k => t.includes(k))) return { icd, label }
  }
  return null
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

export function routeQuery(question, role, empName) {
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

  // Відділення конкретного напрямку: "скільки/які відділення хірургічного напрямку"
  if ((t.includes('напрям')||t.includes('блок')) && (t.includes('хірург')||t.includes('терапевт')||t.includes('інтенсивн')||t.includes('параклін')) && (has(t,'відділ')||has(t,'скільки')||has(t,'які')||has(t,'перелік'))) {
    let blockName = null
    if (t.includes('хірург')) blockName = 'хірургічний'
    else if (t.includes('терапевт')) blockName = 'терапевтичний'
    else if (t.includes('інтенсивн')) blockName = 'інтенсивна_терапія'
    else if (t.includes('параклін')) blockName = 'параклінічний'
    if (blockName) {
      return {cached:true,explanation:`Відділення напрямку: ${blockName}`,
        sql:`SELECT d.dept_name as відділення,d.doctors_count as лікарів,d.staff_count as персонал FROM departments d JOIN clinical_blocks b ON b.id=d.block_id WHERE b.name='${blockName}' ORDER BY d.dept_name`}
    }
  }

  // Напрямки (клінічні блоки): терапевтичний / хірургічний / інтенсивна терапія / параклінічний
  if (has(t,'напрям')||has(t,'по блок')||has(t,'блок')&&has(t,'статистик')) {
    const yr = detectYear(t)
    if (yr) {
      return {cached:true,explanation:`Показники по напрямках (${yr})`,
        sql:`SELECT b.name as напрямок,s.total_cases as випадків,s.unique_patients as пацієнтів,s.deaths as померло,s.death_rate_pct as летальність,s.operations as операцій,s.surgical_activity_pct as хірург_акт,s.avg_bed_days as ліжкодень FROM analytics_block_summary s JOIN clinical_blocks b ON b.id=s.block_id WHERE s.period_year=${yr} ORDER BY s.total_cases DESC`}
    }
    // Без року — за весь період (узгоджено із загальною статистикою лікарні)
    return {cached:true,explanation:`Показники по напрямках (весь період)`,
      sql:`SELECT b.name as напрямок,SUM(s.total_cases) as випадків,SUM(s.unique_patients) as пацієнтів,SUM(s.deaths) as померло,ROUND(SUM(s.deaths)*100.0/NULLIF(SUM(s.total_cases),0),2) as летальність,SUM(s.operations) as операцій,ROUND(SUM(s.operations)*100.0/NULLIF(SUM(s.total_cases),0),2) as хірург_акт,ROUND(AVG(s.avg_bed_days),1) as ліжкодень FROM analytics_block_summary s JOIN clinical_blocks b ON b.id=s.block_id GROUP BY b.name ORDER BY випадків DESC`}
  }

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
    ['хірург','Хірургічне відділення №1'],
  ]
  for (const [kw,dept] of deptMap) {
    if (!t.includes(kw)) continue
    // Якщо ключ збігається з назвою спеціальності і в запиті НЕ йдеться про відділення
    // (немає слова "відділ"/"центр" і номера) — це запит про спеціальність, не відділення.
    // Пропускаємо deptMap, хай спрацює гілка спеціалізацій нижче.
    const specKeys = ['хірург','терапевт','уролог','травматол','гастроентерол','гематолог','нейрохірург']
    const num = t.match(/№?\s*([12])\b/) || t.match(/\b([12])\b/)
    const aboutDept = has(t,'відділ')||has(t,'центр')||!!num
    if (specKeys.includes(kw) && !aboutDept) continue
    // Уточнюємо відділення за номером (№1/№2) для хірургії, терапії, травматології
    let exactDept = dept
    if (kw === 'хірург') exactDept = (num && num[1] === '2') ? 'Хірургічне відділення №2' : 'Хірургічне відділення №1'
    else if (kw === 'терапевт') exactDept = (num && num[1] === '2') ? 'Терапевтичне відділення №2' : 'Терапевтичне відділення №1'
    else if (kw === 'травматол') exactDept = (t.includes('діт')||t.includes('дит')) ? 'Травматологічне відділення для дітей' : 'Травматологічне відділення для дорослих'
    if (any(t,'лікар','доктор','персонал','хто працює','співробітник','штат','завідувач'))
      return {cached:true,explanation:`Лікарі: ${exactDept}`,sql:`SELECT emp_name as лікар,specialization as спеціалізація,position as посада FROM empl WHERE department='${exactDept}' AND (is_clinical=true OR position ILIKE '%лікар%' OR position ILIKE '%ординатор%' OR position ILIKE '%завідувач%') ORDER BY (position ILIKE '%завідувач%') DESC, emp_name`}
    if (any(t,'топ','діагноз','найчастіш','поширен'))
      return {cached:true,explanation:`Топ діагнозів: ${exactDept}`,sql:`SELECT icd_code as код,diagnosis as діагноз,cases as випадків,unique_patients as пацієнтів,avg_bed_days as ліжкодень,deaths as померло FROM department_diagnoses WHERE department='${exactDept}' AND is_top10=TRUE ORDER BY cases DESC`}
    if (any(t,'підкатегор','блок','група'))
      return {cached:true,explanation:`Підкатегорії: ${exactDept}`,sql:`SELECT subcategory as підкатегорія,cases as випадків,percent_of_dept as відс FROM department_disease_subcategories WHERE department='${exactDept}' ORDER BY cases DESC LIMIT 15`}
    if (any(t,'категор','захворюван','хвороб'))
      return {cached:true,explanation:`Категорії: ${exactDept}`,sql:`SELECT disease_category as категорія,cases as випадків,percent_of_dept as відс,is_primary as основна FROM department_disease_categories WHERE department='${exactDept}' ORDER BY cases DESC`}
    return {cached:true,explanation:`Статистика: ${dept}`,sql:`SELECT department as відділення,total_cases as випадків,unique_patients as пацієнтів,avg_bed_days as ліжкодень,deaths as померло,death_rate_pct as летальність FROM v_department_stats WHERE department ILIKE '%${kw}%'`}
  }

  // Регіональна захворюваність (Чернівецька, Івано-Франківська тощо)
  const regions=[
    ['івано-франківськ','Івано-Франківська'],
    ['тернопільськ','Тернопільська'],['хмельницьк','Хмельницька'],
    ['закарпатськ','Закарпатська'],['львівськ','Львівська'],
  ]
  if (t.includes('чернівецьк'))
    return {cached:true,explanation:'По районах Чернівецької',
      sql:`SELECT district as район,cases as випадків,unique_patients as пацієнтів,avg_bed_days as ліжкодень,deaths as померло FROM v_region_stats WHERE region='Чернівецька' ORDER BY cases DESC`}

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
  const specs=['нейрохірург','хірург','терапевт','уролог','кардіолог','невропатолог','анестезіолог','гастроентеролог','гінеколог','ендокринолог','травматолог','онколог','педіатр','пульмонолог','офтальмолог','нефролог','гематолог','інфекціоніст','комбустіолог']
  for (const sp of specs)
    if (has(t,sp)&&any(t,'лікар','доктор','список','скільки','всі','покажи')) {
      // точний матч спеціальності (щоб "хірург" не захопив "нейрохірург")
      const cond = `specialization = '${sp}'`
      if (has(t,'скільки')) return {cached:true,explanation:`Кількість: ${sp}`,sql:`SELECT COUNT(*) as кількість FROM empl WHERE ${cond}`}
      return {cached:true,explanation:`Лікарі за фахом: ${sp}`,sql:`SELECT emp_name as лікар,department as відділення,position as посада FROM empl WHERE ${cond} ORDER BY department, emp_name`}
    }

  // Діти / вік
  if (any(t,'дітей','дитин','дітям','дитяч','педіатр')&&any(t,'госпіталізов','скільки','кількість','поступил'))
    return {cached:true,explanation:'Госпіталізації дітей',sql:`SELECT COUNT(*) as всього, COUNT(DISTINCT patient_id) as пацієнтів, ROUND(AVG(length_of_stay),1) as ліжкодень FROM lsmd WHERE age::text ~ '^[0-9]+$' AND age::integer < 18 ${detectYear(t)?`AND EXTRACT(YEAR FROM admission_date_d)=${detectYear(t)}`:''}`}

  if (any(t,'пікові навант','пікове навант','навантаження по год','по годинах доби','поступлення по год'))
    return {cached:true,explanation:'Пікове навантаження по годинах',sql:`SELECT hour as година, cases as поступлень, deaths as померло FROM v_peak_by_hour ORDER BY година`}

  if (any(t,'пікові навант','пікове навант','навантаження по міс','по місяцях','динаміка по міс')&&!any(t,'годин','днях','тижня')) {
    const yr = detectYear(t) || 2024
    return {cached:true,explanation:`Динаміка по місяцях ${yr}`,sql:`SELECT month as місяць, cases as поступлень, deaths as померло FROM v_peak_by_month WHERE year=${yr} ORDER BY month_num`}
  }
  if (has(t,'топ','діагноз')||has(t,'найчастіш','діагноз'))
    return {cached:true,explanation:'Топ діагнозів',sql:`SELECT icd_code,diagnosis_name,cases as випадків,unique_patients as пацієнтів,letality_percent as летальність FROM v_top_diagnoses ORDER BY cases DESC LIMIT 20`}
  if (has(t,'діагноз','відділ')||has(t,'захворюван','відділ'))
    return {cached:true,explanation:'Захворюваність',sql:`SELECT department as відділення,disease_category as категорія,cases as випадків,percent_of_dept as відс FROM v_morbidity_by_department WHERE department IS NOT NULL ORDER BY department,cases DESC`}

  // Конкретні діагнози
  const diags=[[[' панкреатит'],'K86','панкреатит'],[[' інсульт'],'I63','інсульт'],[[' геморагічн'],'I61','геморагічний інсульт'],[[' інфаркт',' міокард'],'I21','інфаркт'],[[' апендицит'],'K35','апендицит'],[[' холецистит'],'K80','холецистит'],[[' цироз'],'K74','цироз'],[[' діабет'],'E11','діабет'],[[' пневмон'],'J1','пневмонія'],[[' гіпертонічн'],'I11','гіпертонія'],[[' струс'],'S06','струс'],[[' тромбофлебіт'],'I80','тромбофлебіт'],[[' простат'],'N40','простата']]
  for (const [kws,icd,label] of diags)
    if (kws.every(k=>t.includes(k.trim()))) {
      if (any(t,'скільки','кількість','всього'))
        return {cached:true,explanation:`Кількість: ${label}`,sql:`SELECT SUM(cases) as випадків, SUM(unique_patients) as пацієнтів, ROUND(AVG(avg_bed_days),1) as ліжкодень, SUM(deaths) as померло, ROUND(100.0*SUM(deaths)/NULLIF(SUM(cases),0),2) as летальність_відс FROM v_diagnosis_stats WHERE icd_primary LIKE '${icd}%'`}
      return {cached:true,explanation:`Діагноз: ${label}`,sql:`SELECT d.icd_primary as код,i.diagnosis_level3 as діагноз,d.cases as випадків,d.unique_patients as пацієнтів,d.avg_bed_days as ліжкодень,d.deaths as померло FROM v_diagnosis_stats d LEFT JOIN icd_10 i ON d.icd_primary=i.icd_code WHERE d.icd_primary LIKE '${icd}%' ORDER BY d.cases DESC LIMIT 20`}
    }

  // Навантаження
  if (has(t,'годин')&&any(t,'пік','навантаж','по'))
    return {cached:true,explanation:'По годинах',sql:`SELECT hour as година,cases as поступлень,deaths as померло FROM v_peak_by_hour ORDER BY hour`}
  if (has(t,'тижн')&&any(t,'день','дн')&&!has(t,'статистик'))
    return {cached:true,explanation:'По днях тижня',sql:`SELECT dow as день_номер,weekday_name as день,cases as поступлень FROM v_peak_by_weekday ORDER BY dow`}
  if (has(t,'місяц')&&any(t,'динамік','по','навантаж'))
    return {cached:true,explanation:'По місяцях',sql:`SELECT month as місяць,cases as поступлень,deaths as померло,avg_bed_days as ліжкодень FROM v_peak_by_month ORDER BY month_num`}
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


  // Погіршення / без змін / направлення / екстрені операції
  if (any(t,'погіршен','гіршен'))
    return {cached:true,explanation:'З погіршенням стану',sql:`SELECT COUNT(*) as випадків, ROUND(100.0*COUNT(*)/(SELECT COUNT(*) FROM lsmd),2) as відсоток FROM lsmd WHERE discharge_status='З погіршенням'`}
  if (has(t,'без змін'))
    return {cached:true,explanation:'Без змін після лікування',sql:`SELECT COUNT(*) as випадків, ROUND(100.0*COUNT(*)/(SELECT COUNT(*) FROM lsmd),2) as відсоток FROM lsmd WHERE discharge_status='Без змін'`}
  if (has(t,'направлен'))
    return {cached:true,explanation:'Пацієнти з направленням',sql:`SELECT COUNT(*) as всього, SUM(CASE WHEN referral IS NOT NULL AND referral!='' THEN 1 ELSE 0 END) as з_направленням, ROUND(100.0*SUM(CASE WHEN referral IS NOT NULL AND referral!='' THEN 1 ELSE 0 END)/COUNT(*),2) as відсоток FROM lsmd`}
  if (has(t,'екстрен') && any(t,'операц','хірург'))
    return {cached:true,explanation:'Екстрені операції',sql:`SELECT COUNT(*) as екстрених_операцій FROM lsmd WHERE admission_type='Екстренна' AND operation_id IS NOT NULL`}

  // Реанімація — поступило / померло
  if (any(t,'реанімац','інтенсивн') && any(t,'поступил','скільки','кількість'))
    return {cached:true,explanation:'Поступило в реанімацію',sql:`SELECT всього_поступлень as поступило FROM v_icu_mortality`}
  if (any(t,'реанімац','інтенсивн') && any(t,'померл','смерт'))
    return {cached:true,explanation:'Померло в реанімації',sql:`SELECT померло, летальність_pct as летальність FROM v_icu_mortality`}
  if (any(t,'реанімац','інтенсивн') && hasBedDays(t))
    return {cached:true,explanation:'Ліжкодень реанімації',sql:`SELECT середній_ліжкодень, ліжкодень_померлих FROM v_icu_mortality`}

  // Вік по відділеннях — avg_age з v_department_stats (не lsmd.age TEXT)
  if (has(t,'середн') && has(t,'вік') && has(t,'відділ'))
    return {cached:true,explanation:'Середній вік по відділеннях',sql:`SELECT department as відділення, avg_age as середній_вік FROM v_department_stats ORDER BY avg_age DESC`}

  // Діти по відділеннях — з v_department_stats
  if (any(t,'дітей','дитин') && has(t,'відділ'))
    return {cached:true,explanation:'Діти по відділеннях',sql:`SELECT department as відділення, children as дітей, total_cases as всього FROM v_department_stats ORDER BY children DESC`}

  // Літні пацієнти
  if (any(t,'літн','пенсіон','похил') && any(t,'госпіталізов','скільки','кількість','поступил'))
    return {cached:true,explanation:'Літні пацієнти (60+)',sql:`SELECT COUNT(*) as всього FROM lsmd WHERE age ~ '^[0-9]+$' AND age::integer >= 60`}

  // Летальність по діагнозах
  if (has(t,'летальн') && has(t,'діагноз') && !has(t,'відділ'))
    return {cached:true,explanation:'Летальність по діагнозах',sql:`SELECT icd_primary as код, death_rate_pct as летальність, cases as випадків, deaths as померло FROM v_diagnosis_stats WHERE cases >= 50 ORDER BY death_rate_pct DESC LIMIT 20`}

  // Летальність по статі
  if (has(t,'летальн') && any(t,'чоловік','жінок','стат'))
    return {cached:true,explanation:'Летальність по статі',sql:`SELECT gender as стать, SUM(cases) as випадків, ROUND(AVG(death_rate_pct),2) as летальність FROM v_patient_stats GROUP BY gender ORDER BY летальність DESC`}

  // Летальність по віку
  if (has(t,'летальн') && has(t,'вік'))
    return {cached:true,explanation:'Летальність по віку',sql:`SELECT age_group as вік, SUM(cases) as випадків, ROUND(AVG(death_rate_pct),2) as летальність FROM v_patient_stats GROUP BY age_group ORDER BY летальність DESC`}

  // Планові / операції / переведені / загальна летальність
  if (has(t,'планов') && any(t,'скільки','кількість') && !has(t,'відділ') && !has(t,'vs'))
    return {cached:true,explanation:'Планові госпіталізації',sql:`SELECT planned as планових, urgent as ургентних, urgent_pct as відсоток_ургентних FROM v_hospital_summary`}
  if (any(t,'операц') && any(t,'скільки','кількість') && !has(t,'відділ') && !has(t,'хірург'))
    return {cached:true,explanation:'Кількість операцій',sql:`SELECT operations as операцій, surgical_activity_pct as хірург_акт FROM v_hospital_summary`}
  if (any(t,'переведен') && any(t,'скільки','кількість') && !has(t,'відділ'))
    return {cached:true,explanation:'Переведені пацієнти',sql:`SELECT transferred as переведених FROM v_hospital_summary`}
  if (has(t,'загальн') && has(t,'летальн'))
    return {cached:true,explanation:'Загальна летальність',sql:`SELECT death_rate_pct as летальність_відсоток, deaths as померло, total_cases as всього FROM v_hospital_summary`}

  return null
}

// Wrapper що застосовує doctor filter до результату
export function routeQueryWithRole(question, role, empName) {
  const result = routeQuery(question, role, empName)
  if (!result) return null
  if (role !== 'doctor' || !empName) return result
  const safeName = empName.replace(/'/g, "''")
  let sql = result.sql
  // Якщо SQL уже фільтрує по doc_name з прізвищем лікаря (гілка doctorSQL) — не дублюємо
  const surnameLow = empName.trim().split(/\s+/)[0].toLowerCase().slice(0, 6)
  const alreadyFiltered = /doc_name\s+ilike/i.test(sql) && sql.toLowerCase().includes(surnameLow)
  if (!alreadyFiltered && /\bfrom\s+lsmd\b/i.test(sql)) {
    const am = sql.match(/\bfrom\s+lsmd\s+(?:as\s+)?([a-z_]+)/i)
    const reserved = ['where','group','order','limit','having','join','left','right','inner','on','union','as']
    const alias = am && !reserved.includes(am[1].toLowerCase()) ? am[1] : null
    const pre = alias ? alias + '.' : ''
    const f = `${pre}doc_name ILIKE '%${safeName}%'`
    if (/\bwhere\b/i.test(sql)) {
      sql = sql.replace(/\bwhere\b/i, `WHERE ${f} AND `)
    } else {
      sql = sql.replace(/\bfrom\s+lsmd\b/i, `FROM lsmd WHERE ${f}`)
    }
    return { ...result, sql }
  }
  return result
}
