// query-router.js — миттєві відповіді на типові запити БЕЗ виклику LLM (0 токенів)
// Якщо питання співпадає з патерном — повертає готовий SQL одразу.
// Інакше повертає null → запит йде до LLM як зазвичай.

const ROUTES = [
  {
    // Загальна статистика лікарні
    keywords: [['загальн', 'статистик'], ['скільки', 'всього'], ['загальн', 'показник']],
    sql: 'SELECT total_cases as всього_випадків, unique_patients as пацієнтів, avg_bed_days as середній_ліжкодень, death_rate_pct as летальність_пр, surgical_activity_pct as хірург_активність_пр FROM v_hospital_summary',
    explanation: 'Загальна статистика лікарні з v_hospital_summary'
  },
  {
    // Показники по всіх відділеннях
    keywords: [['показник', 'відділ'], ['статистик', 'відділ'], ['всі', 'відділ']],
    sql: 'SELECT department as відділення, total_cases as випадків, avg_bed_days as ліжкодень, death_rate_pct as летальність, surgical_activity_pct as хірург_акт FROM v_department_stats ORDER BY total_cases DESC',
    explanation: 'Показники по всіх відділеннях з v_department_stats'
  },
  {
    // Летальність по відділеннях
    keywords: [['летальн', 'відділ'], ['смертн', 'відділ']],
    sql: 'SELECT department as відділення, total_cases as всього, deaths as померло, death_rate_pct as летальність FROM v_department_stats ORDER BY death_rate_pct DESC',
    explanation: 'Летальність по відділеннях з v_department_stats'
  },
  {
    // Пікові навантаження по годинах
    keywords: [['пік', 'годин'], ['навантаж', 'годин'], ['по', 'годин']],
    sql: 'SELECT hour as година, cases as випадків, deaths as померло FROM v_peak_by_hour ORDER BY cases DESC',
    explanation: 'Навантаження за годинами з v_peak_by_hour'
  },
  {
    // Навантаження по днях тижня
    keywords: [['день', 'тижн'], ['дн', 'тижн'], ['навантаж', 'тижн']],
    sql: 'SELECT weekday_name as день, cases as випадків FROM v_peak_by_weekday ORDER BY dow',
    explanation: 'Навантаження за днями тижня з v_peak_by_weekday'
  },
  {
    // Навантаження по місяцях
    keywords: [['по', 'місяц'], ['навантаж', 'місяц'], ['динамік', 'місяц']],
    sql: 'SELECT month as місяць, cases as випадків, deaths as померло, avg_bed_days as ліжкодень FROM v_peak_by_month ORDER BY month',
    explanation: 'Навантаження за місяцями з v_peak_by_month'
  },
  {
    // Топ діагнозів
    keywords: [['топ', 'діагноз'], ['найчастіш', 'діагноз'], ['популярн', 'діагноз']],
    sql: "SELECT d.cases as кількість, d.icd_primary as icd_code, i.diagnosis_level3 FROM v_diagnosis_stats d JOIN icd_10 i ON d.icd_primary = i.icd_code ORDER BY d.cases DESC LIMIT 10",
    explanation: 'Топ-10 діагнозів з v_diagnosis_stats + icd_10'
  },
  {
    // Повторні госпіталізації
    keywords: [['повторн', 'госпіталіз'], ['реадміс'], ['readmiss']],
    sql: 'SELECT total_with_followup as всього_з_наступн, readmit_30d as повторні_30д, readmit_30d_pct as пр_30д, readmit_90d as повторні_90д, readmit_90d_pct as пр_90д, same_dx_30d as той_самий_діагноз_30д FROM v_readmission_metrics',
    explanation: 'Метрики повторних госпіталізацій з v_readmission_metrics'
  },
  {
    // Ургентні vs планові
    keywords: [['ургентн', 'планов'], ['екстрен', 'планов'], ['ургентн', 'відділ']],
    sql: 'SELECT department as відділення, urgent as ургентних, planned as планових, urgent_deaths as ургентні_смерті, urgent_surgical_pct as ургентна_хірургія_пр FROM v_urgency_stats ORDER BY urgent DESC',
    explanation: 'Ургентні vs планові з v_urgency_stats'
  },
  {
    // Розподіл за статтю та віком
    keywords: [['стат', 'вік'], ['розподіл', 'вік'], ['віков', 'груп']],
    sql: 'SELECT gender as стать, age_group as вік_група, cases as випадків, death_rate_pct as летальність FROM v_patient_stats ORDER BY cases DESC',
    explanation: 'Розподіл за статтю та віком з v_patient_stats'
  },
  {
    // За регіонами
    keywords: [['регіон'], ['район'], ['географ'], ['місцев']],
    sql: 'SELECT region as регіон, district as район, cases as випадків, unique_patients as пацієнтів, deaths as померло FROM v_region_stats ORDER BY cases DESC LIMIT 30',
    explanation: 'Статистика за регіонами з v_region_stats'
  }
]

// Нормалізація: нижній регістр, прибрати зайве
function normalize(text) {
  return text.toLowerCase().trim()
}

// Перевірка чи всі слова групи присутні
function matchesGroup(text, group) {
  return group.every(word => text.includes(word))
}

// Головна функція: повертає {sql, explanation} або null
export function routeQuery(question) {
  const text = normalize(question)

  for (const route of ROUTES) {
    // route.keywords — масив груп; достатньо щоб ОДНА група повністю співпала
    for (const group of route.keywords) {
      if (matchesGroup(text, group)) {
        return { sql: route.sql, explanation: route.explanation, cached: true }
      }
    }
  }
  return null
}
