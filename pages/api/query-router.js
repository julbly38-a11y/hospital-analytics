// query-router.js — миттєві відповіді БЕЗ виклику LLM (0 токенів)
// Якщо питання співпадає — повертає готовий SQL. Інакше → null.

function normalize(text) { return text.toLowerCase().trim() }
function has(text, ...words) { return words.every(w => text.includes(w)) }
function hasAny(text, ...words) { return words.some(w => text.includes(w)) }

export function routeQuery(question) {
  const t = normalize(question)

  // ── ЗАГАЛЬНА СТАТИСТИКА ──────────────────────────────────────────
  if (has(t, 'загальн', 'статистик') || has(t, 'скільки', 'всього') || has(t, 'загальн', 'показник'))
    return { cached: true, explanation: 'Загальна статистика лікарні',
      sql: `SELECT total_cases as всього_випадків, unique_patients as пацієнтів, avg_bed_days as середній_ліжкодень, death_rate_pct as летальність_пр, surgical_activity_pct as хірург_активність_пр FROM v_hospital_summary` }

  // ── ВІДДІЛЕННЯ ───────────────────────────────────────────────────
  if (has(t, 'показник', 'відділ') || has(t, 'статистик', 'відділ') || has(t, 'всі', 'відділ'))
    return { cached: true, explanation: 'Показники по всіх відділеннях',
      sql: `SELECT department as відділення, total_cases as випадків, avg_bed_days as ліжкодень, death_rate_pct as летальність, surgical_activity_pct as хірург_акт FROM v_department_stats ORDER BY total_cases DESC` }

  if (has(t, 'летальн', 'відділ') || has(t, 'смертн', 'відділ'))
    return { cached: true, explanation: 'Летальність по відділеннях',
      sql: `SELECT department as відділення, total_cases as всього, deaths as померло, death_rate_pct as летальність FROM v_department_stats ORDER BY death_rate_pct DESC` }

  if (has(t, 'операц', 'відділ') || has(t, 'хірург', 'активн'))
    return { cached: true, explanation: 'Хірургічна активність по відділеннях',
      sql: `SELECT department as відділення, operations as операцій, surgical_activity_pct as хірург_активність, total_cases as всього FROM v_department_stats ORDER BY surgical_activity_pct DESC` }

  if (has(t, 'ліжкодень', 'відділ') || has(t, 'середн', 'ліжкодень'))
    return { cached: true, explanation: 'Середній ліжкодень по відділеннях',
      sql: `SELECT department as відділення, avg_bed_days as середній_ліжкодень, max_bed_days as макс_ліжкодень FROM v_department_stats ORDER BY avg_bed_days DESC` }

  // Конкретні відділення
  const depts = [
    ['гастроентерол', 'Гастроентерологічне відділення'],
    ['гематолог', 'Гематологічне відділення'],
    ['нейрохірург', 'Нейрохірургічне відділення'],
    ['опіков', 'Опікове відділення'],
    ['терапевт', '№1', 'Терапевтичне відділення №1'],
    ['терапевт', '№2', 'Терапевтичне відділення №2'],
    ['травматолог', 'діт', 'Травматологічне відділення для дітей'],
    ['травматолог', 'дорос', 'Травматологічне відділення для дорослих'],
    ['урологічн', 'Урологічне відділення'],
    ['хірургічн', '№1', 'Хірургічне відділення №1'],
    ['хірургічн', '№2', 'Хірургічне відділення №2'],
    ['неврологі', 'Центр невідкладної неврології'],
    ['анестезіолог', 'Відділення анестезіології з ліжками інтенсивної терапії'],
    ['реанімац', 'Відділення анестезіології з ліжками інтенсивної терапії'],
    ['інтенсивн', 'Відділення анестезіології з ліжками інтенсивної терапії'],
  ]
  for (const d of depts) {
    const keywords = d.slice(0, -1)
    const name = d[d.length - 1]
    if (keywords.every(k => t.includes(k)))
      return { cached: true, explanation: `Статистика: ${name}`,
        sql: `SELECT department as відділення, total_cases as випадків, unique_patients as пацієнтів, avg_bed_days as ліжкодень, deaths as померло, death_rate_pct as летальність, operations as операцій, surgical_activity_pct as хірург_акт, avg_age as сер_вік FROM v_department_stats WHERE department ILIKE '%${name.split(' ')[0]}%'` }
  }

  // ── СПЕЦІАЛІЗАЦІЇ ────────────────────────────────────────────────
  const specs = [
    ['хірург', 'хірург'], ['терапевт', 'терапевт'], ['уролог', 'уролог'],
    ['кардіолог', 'кардіолог'], ['невропатолог', 'невропатолог'],
    ['нейрохірург', 'нейрохірург'], ['анестезіолог', 'анестезіолог'],
    ['гастроентеролог', 'гастроентеролог'], ['гінеколог', 'гінеколог'],
    ['ендокринолог', 'ендокринолог'], ['травматолог', 'травматолог'],
    ['онколог', 'онколог'], ['педіатр', 'педіатр'], ['пульмонолог', 'пульмонолог'],
    ['офтальмолог', 'офтальмолог'], ['отоларинголог', 'отоларинголог'],
    ['психіатр', 'психіатр'], ['ревматолог', 'ревматолог'],
    ['нефролог', 'нефролог'], ['гематолог', 'гематолог'],
    ['інфекціоніст', 'інфекціоніст'], ['дерматовенеролог', 'дерматовенеролог'],
  ]

  if (has(t, 'спеціалізац') && !has(t, 'відділ')) {
    // "яка спеціалізація у лікаря Прізвище"
    return { cached: true, explanation: 'Список спеціалізацій всіх лікарів',
      sql: `SELECT emp_name as лікар, specialization as спеціалізація, department as відділення FROM empl WHERE specialization IS NOT NULL ORDER BY specialization, emp_name` }
  }

  for (const [kw, spec] of specs) {
    if (has(t, kw) && hasAny(t, 'лікар', 'спеціаліст', 'список', 'скільки', 'всі')) {
      if (has(t, 'скільки'))
        return { cached: true, explanation: `Кількість лікарів: ${spec}`,
          sql: `SELECT COUNT(*) as кількість, specialization as спеціалізація FROM empl WHERE specialization ILIKE '%${spec}%' AND emp_status != 'inactive' GROUP BY specialization` }
      return { cached: true, explanation: `Лікарі: ${spec}`,
        sql: `SELECT emp_name as лікар, department as відділення, position as посада FROM empl WHERE specialization ILIKE '%${spec}%' ORDER BY emp_name` }
    }
  }

  // ── ДІАГНОЗИ ────────────────────────────────────────────────────
  if (has(t, 'топ', 'діагноз') || has(t, 'найчастіш', 'діагноз') || has(t, 'поширен', 'діагноз'))
    return { cached: true, explanation: 'Топ-20 діагнозів',
      sql: `SELECT icd_code, diagnosis_name, cases as випадків, unique_patients as пацієнтів, letality_percent as летальність FROM v_top_diagnoses ORDER BY cases DESC LIMIT 20` }

  if (has(t, 'діагноз', 'відділ') || has(t, 'захворюван', 'відділ') || has(t, 'мorbідн'))
    return { cached: true, explanation: 'Захворюваність по відділеннях',
      sql: `SELECT department as відділення, disease_category as категорія, cases as випадків, percent_of_dept as відс_відділення FROM v_morbidity_by_department WHERE department IS NOT NULL ORDER BY department, cases DESC` }

  // Конкретні діагнози
  const diags = [
    [['панкреатит'], 'K86', 'панкреатит'],
    [['інсульт'], 'I63', 'інсульт'],
    [['геморагічн', 'інсульт'], 'I61', 'геморагічний інсульт'],
    [['інфаркт', 'мозк'], 'I63', 'інфаркт мозку'],
    [['інфаркт', 'міокард'], 'I21', 'інфаркт міокарду'],
    [['апендицит'], 'K35', 'апендицит'],
    [['холецистит'], 'K80', 'холецистит'],
    [['цироз'], 'K74', 'цироз печінки'],
    [['діабет'], 'E11', 'цукровий діабет'],
    [['пневмон'], 'J18', 'пневмонія'],
    [['гіпертонічн'], 'I11', 'гіпертонічна хвороба'],
    [['травм', 'голов'], 'S06', 'травма голови'],
    [['тромбофлебіт'], 'I80', 'тромбофлебіт'],
    [['урол', 'камін'], 'N20', 'камені сечовода'],
    [['простат'], 'N40', 'простата'],
  ]
  for (const [kws, icd, label] of diags) {
    if (kws.every(k => t.includes(k)))
      return { cached: true, explanation: `Статистика: ${label}`,
        sql: `SELECT d.icd_primary as код, i.diagnosis_level3 as діагноз, d.cases as випадків, d.unique_patients as пацієнтів, d.avg_bed_days as ліжкодень, d.deaths as померло, d.death_rate_pct as летальність FROM v_diagnosis_stats d LEFT JOIN icd_10 i ON d.icd_primary = i.icd_code WHERE d.icd_primary LIKE '${icd}%' ORDER BY d.cases DESC LIMIT 20` }
  }

  // ── НАВАНТАЖЕННЯ ─────────────────────────────────────────────────
  if (has(t, 'годин') && hasAny(t, 'пік', 'навантаж', 'по', 'розподіл'))
    return { cached: true, explanation: 'Навантаження по годинах',
      sql: `SELECT hour as година, cases as випадків, deaths as померло FROM v_peak_by_hour ORDER BY hour` }

  if (has(t, 'тижн') && hasAny(t, 'день', 'дн', 'навантаж', 'по'))
    return { cached: true, explanation: 'Навантаження по днях тижня',
      sql: `SELECT weekday_name as день, cases as випадків, deaths as померло FROM v_peak_by_weekday ORDER BY dow` }

  if (has(t, 'місяц') && hasAny(t, 'динамік', 'по', 'навантаж'))
    return { cached: true, explanation: 'Динаміка по місяцях',
      sql: `SELECT month as місяць, cases as випадків, deaths as померло, avg_bed_days as ліжкодень FROM v_peak_by_month ORDER BY month` }

  if (has(t, 'тижн') && hasAny(t, 'статистик', 'навантаж', 'по'))
    return { cached: true, explanation: 'Тижнева статистика 2024',
      sql: `SELECT week_start as тиждень, admissions as поступлень, deaths as померло, avg_bed_days as ліжкодень FROM v_weekly_admissions WHERE year = 2024 ORDER BY week_number DESC LIMIT 20` }

  // ── УРГЕНТНІ / ПЛАНОВІ ───────────────────────────────────────────
  if (has(t, 'ургентн') || (has(t, 'екстрен') && has(t, 'планов')))
    return { cached: true, explanation: 'Ургентні vs планові по відділеннях',
      sql: `SELECT department as відділення, urgent as ургентних, planned as планових, urgent_deaths as ургентні_смерті, urgent_surgical_pct as хірургія_пр FROM v_urgency_stats ORDER BY urgent DESC` }

  // ── ВИХІДНІ / НІЧ ───────────────────────────────────────────────
  if (has(t, 'вихідн') && hasAny(t, 'робоч', 'vs', 'порівн'))
    return { cached: true, explanation: 'Вихідні vs робочі дні',
      sql: `SELECT day_type as день, cases as випадків, unique_patients as пацієнтів, avg_bed_days as ліжкодень, letality_percent as летальність FROM v_weekend_vs_weekday ORDER BY cases DESC` }

  if (has(t, 'вихідн') && has(t, 'відділ'))
    return { cached: true, explanation: 'Вихідні vs робочі по відділеннях',
      sql: `SELECT department as відділення, day_type as день, cases as випадків, avg_bed_days as ліжкодень, deaths as померло FROM v_department_weekend_stats ORDER BY department, day_type DESC` }

  if ((has(t, 'нічн') || has(t, 'ніч')) && hasAny(t, 'денн', 'день', 'vs', 'порівн', 'загалом'))
    return { cached: true, explanation: 'Нічні vs денні поступлення',
      sql: `SELECT time_period as період, cases as випадків, unique_patients as пацієнтів, avg_bed_days as ліжкодень, urgent_cases as ургентних, letality_percent as летальність FROM v_night_vs_day_admissions ORDER BY time_period DESC` }

  if (has(t, 'нічн') && has(t, 'відділ'))
    return { cached: true, explanation: 'Нічні поступлення по відділеннях',
      sql: `SELECT department as відділення, time_period as період, cases as випадків, urgent_cases as ургентних, deaths as померло FROM v_night_admissions_by_department ORDER BY department, time_period DESC` }

  // ── ПОВТОРНІ ГОСПІТАЛІЗАЦІЇ ──────────────────────────────────────
  if (has(t, 'повторн') || has(t, 'реадміс'))
    return { cached: true, explanation: 'Метрики повторних госпіталізацій',
      sql: `SELECT total_with_followup as всього_з_наступн, readmit_30d as повторні_30д, readmit_30d_pct as пр_30д, readmit_90d as повторні_90д, readmit_90d_pct as пр_90д, same_dx_30d as той_самий_діагноз_30д FROM v_readmission_metrics` }

  // ── ПАЦІЄНТИ СТАТЬ/ВІК ──────────────────────────────────────────
  if (has(t, 'стат') && has(t, 'вік') || has(t, 'вікова', 'груп') || has(t, 'розподіл', 'вік'))
    return { cached: true, explanation: 'Розподіл за статтю та віком',
      sql: `SELECT gender as стать, age_group as вік_група, cases as випадків, death_rate_pct as летальність FROM v_patient_stats ORDER BY cases DESC` }

  if (has(t, 'діт') && hasAny(t, 'скільки', 'госпіталіз'))
    return { cached: true, explanation: 'Госпіталізації дітей',
      sql: `SELECT gender as стать, cases as випадків, unique_patients as пацієнтів, avg_bed_days as ліжкодень FROM v_patient_stats WHERE age_group = 'Діти' ORDER BY cases DESC` }

  if (has(t, 'літн') && hasAny(t, 'скільки', 'госпіталіз', 'пацієнт'))
    return { cached: true, explanation: 'Госпіталізації літніх пацієнтів',
      sql: `SELECT gender as стать, cases as випадків, unique_patients as пацієнтів, avg_bed_days as ліжкодень FROM v_patient_stats WHERE age_group = 'Літні' ORDER BY cases DESC` }

  // ── РЕГІОНИ ──────────────────────────────────────────────────────
  if (hasAny(t, 'регіон', 'район', 'географ', 'місцев'))
    return { cached: true, explanation: 'Статистика за регіонами',
      sql: `SELECT region as регіон, district as район, cases as випадків, unique_patients as пацієнтів, deaths as померло FROM v_region_stats ORDER BY cases DESC LIMIT 30` }

  if (has(t, 'чернівецьк') && hasAny(t, 'район', 'пацієнт'))
    return { cached: true, explanation: 'Пацієнти з Чернівецького району',
      sql: `SELECT region as регіон, district as район, cases as випадків, unique_patients as пацієнтів FROM v_region_stats WHERE district ILIKE '%Чернівецьк%' ORDER BY cases DESC` }

  return null
}
