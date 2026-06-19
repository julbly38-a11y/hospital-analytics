import { createServerClient } from '@supabase/ssr'

// Whitelist: клієнт шле тільки КЛЮЧ, сервер сам обирає SQL.
// Жодного довільного SQL від клієнта — це закриває діру з відкритим execute_sql.
const QUERIES = {
  summary:     'SELECT total_cases,unique_patients,avg_bed_days,death_rate_pct,surgical_activity_pct FROM v_hospital_summary',
  deptStats:   'SELECT department as відділення, total_cases as випадків, death_rate_pct as летальність, avg_bed_days as ліжкодень FROM v_department_stats ORDER BY total_cases DESC LIMIT 10',
  peakHour:    'SELECT hour as година, cases as поступлень FROM v_peak_by_hour ORDER BY hour',
  peakMonth:   'SELECT month as місяць, cases as поступлень, deaths as померло FROM v_peak_by_month WHERE year=2024 ORDER BY month_num',
  peakWeekday: 'SELECT dow as день, weekday_name as назва, cases as поступлень FROM v_peak_by_weekday ORDER BY dow',
  urgency:     'SELECT department as відділення, urgent as ургентних, planned as планових FROM v_urgency_stats ORDER BY urgent DESC LIMIT 8',
  patStats:    "SELECT age_group as вік, SUM(cases) as випадків, ROUND(AVG(death_rate_pct),2) as летальність FROM v_patient_stats WHERE gender IN ('Ч','Ж') GROUP BY age_group ORDER BY випадків DESC LIMIT 8",
  icu:         'SELECT всього_поступлень,померло,летальність_pct,середній_ліжкодень FROM v_icu_mortality',
  // --- Дашборд «Огляд» (живі дані) ---
  ovKpi:       'SELECT total_cases, unique_patients, death_rate_pct, deaths, avg_bed_days, urgent, planned, urgent_pct, operations, surgical_activity_pct FROM v_hospital_summary',
  ovHours:     'SELECT hour as година, cases as випадків, deaths as померло FROM v_peak_by_hour ORDER BY hour',
  ovStatus:    "SELECT discharge_status as статус, COUNT(*) as випадків, ROUND(COUNT(*)*100.0/SUM(COUNT(*)) OVER (),2) as відс FROM lsmd WHERE discharge_status IN ('З поліпшенням','Помер','Без змін','Переведений в інший заклад','Лікується','З погіршенням') GROUP BY discharge_status ORDER BY випадків DESC",
  ovIcd:       "SELECT LEFT(icd_primary,1) as розділ, COUNT(*) as випадків FROM lsmd WHERE icd_primary IS NOT NULL AND icd_primary ~ '^[A-Z]' GROUP BY LEFT(icd_primary,1) ORDER BY випадків DESC LIMIT 7",
  ovYears:     "SELECT DISTINCT EXTRACT(year FROM admission_date_d)::int as рік FROM lsmd WHERE admission_date_d IS NOT NULL ORDER BY рік DESC",
  // --- Хвиля 1: Відділення / Пацієнти / Піки(дні) / Ургентність ---
  wDept:       'SELECT department as відділення, total_cases as випадків, unique_patients as унікальних, avg_bed_days as ліжкодень, death_rate_pct as летальність, operations as операцій, surgical_activity_pct as хір_активність FROM v_department_stats ORDER BY total_cases DESC',
  wPat:        "SELECT gender as стать, age_group as вік, cases as випадків FROM v_patient_stats WHERE gender IN ('Ч','Ж')",
  wWeekday:    'SELECT dow as день, weekday_name as назва, cases as поступлень FROM v_peak_by_weekday ORDER BY dow',
  wUrgency:    'SELECT department as відділення, urgent as ургентних, planned as планових FROM v_urgency_stats ORDER BY urgent DESC',
  // --- Хвиля 2: Діагнози / Лікарі / Нічні / Операції ---
  wDiag:       'SELECT icd_code as код, diagnosis_name as діагноз, cases as випадків, unique_patients as унікальних, letality_percent as летальність FROM v_top_diagnoses ORDER BY cases DESC LIMIT 20',
  wDoctors:    'SELECT ld.doc_name as лікар, ds.total_cases as випадків, ds.unique_patients as унікальних, ds.improved as поліпшення, ds.deaths as померло, ds.avg_los as ліжкодень FROM doctor_stats ds JOIN lsmd_doctors ld ON ld.empl_name_id = ds.doctor_id ORDER BY ds.total_cases DESC LIMIT 20',
  wNight:      'SELECT time_period as період, cases as випадків, unique_patients as унікальних, avg_bed_days as ліжкодень, deaths as померло, letality_percent as летальність FROM v_night_vs_day_admissions ORDER BY cases DESC',
  wOps:        'SELECT department as відділення, operations as операцій, total_cases as випадків, surgical_activity_pct as хір_активність FROM v_department_stats WHERE operations > 0 ORDER BY operations DESC',
  // --- Організаційна ієрархія ---
  orgDepts: `SELECT b.name as block, d.dept_name as відділення, d.doctors_count as лікарів, d.staff_count as персонал FROM departments d LEFT JOIN clinical_blocks b ON b.id = d.block_id ORDER BY b.name, d.dept_name`,
  orgDocs:  `SELECT emp_name as лікар, COALESCE(specialization,'—') as спеціалізація, position as посада, department as відділення FROM empl WHERE (emp_status IS DISTINCT FROM 'звільнений') AND (position ILIKE '%лікар%' OR position ILIKE '%ординатор%' OR position ILIKE '%завідувач%') ORDER BY department, (position ILIKE '%завідувач%') DESC, emp_name LIMIT 500`,
  doctorCount: `SELECT COUNT(DISTINCT doctor_id) as cnt FROM doctor_stats WHERE total_cases > 0`,
  allYears: `SELECT DISTINCT EXTRACT(year FROM admission_date_d)::int as year FROM lsmd WHERE admission_date_d IS NOT NULL ORDER BY year DESC`,
  // --- Хвиля 3: Географія ---
  wGeo:        "SELECT region as область, COALESCE(district,'(центр / без деталізації)') as район, SUM(cases) as випадків, SUM(unique_patients) as пацієнтів, ROUND(AVG(avg_bed_days::numeric),1) as ліжкодень, SUM(deaths) as померло FROM v_region_stats GROUP BY region, district ORDER BY випадків DESC LIMIT 25",
}

// Параметризовані запити. Параметр екранується (подвоєння '),
// у SQL не потрапляє сирий ввід — захист від інʼєкцій.
const esc = (s) => String(s).replace(/'/g, "''")
// Безпечний фільтр по року для огляду: param = '2024' або 'all'/'усі'
const yearFilter = (p) => {
  const s = String(p || '').trim().toLowerCase()
  if (!s || s === 'all' || s === 'усі') return '1=1'
  const y = parseInt(s, 10)
  if (!/^\d{4}$/.test(s) || y < 2000 || y > 2100) return '1=1'
  return `EXTRACT(year FROM admission_date_d) = ${y}`
}
// Універсальний розбір періоду "відділення|рік|місяць|день|тиждень" — будь-яка частина може бути
// порожньою або 'all'. Відділення порожнє = вся лікарня. Тиждень, якщо заданий, має пріоритет
// над місяцем/днем (взаємовиключні — тиждень ISO не комбінується з конкретним днем місяця).
const parsePeriod = (p) => {
  const [dept = '', year = 'all', month = 'all', day = 'all', week = 'all'] = String(p || '').split('|')
  const conditions = ['admission_date_d IS NOT NULL']
  if (dept) conditions.push(`admission_department = '${esc(dept)}'`)
  const ys = String(year).trim().toLowerCase()
  if (ys && ys !== 'all' && ys !== 'усі') {
    const y = parseInt(ys, 10)
    if (/^\d{4}$/.test(ys) && y >= 2000 && y <= 2100) conditions.push(`EXTRACT(year FROM admission_date_d) = ${y}`)
  }
  const ws = String(week).trim().toLowerCase()
  if (ws && ws !== 'all') {
    const w = parseInt(ws, 10)
    if (w >= 1 && w <= 53) conditions.push(`EXTRACT(week FROM admission_date_d) = ${w}`)
  } else {
    const ms = String(month).trim().toLowerCase()
    if (ms && ms !== 'all') {
      const m = parseInt(ms, 10)
      if (m >= 1 && m <= 12) conditions.push(`EXTRACT(month FROM admission_date_d) = ${m}`)
    }
    const ds = String(day).trim().toLowerCase()
    if (ds && ds !== 'all') {
      const d = parseInt(ds, 10)
      if (d >= 1 && d <= 31) conditions.push(`EXTRACT(day FROM admission_date_d) = ${d}`)
    }
  }
  return conditions.join(' AND ')
}
const PARAM_QUERIES = {
  // КПІ за будь-яку комбінацію відділення/рік/місяць/день/тиждень.
  // param = "відділення|рік|місяць|день|тиждень" (відділення порожнє = вся лікарня)
  periodKpi: (p) => `SELECT COUNT(*) as total_cases, COUNT(DISTINCT patient_id) as unique_patients,
      ROUND(AVG(length_of_stay),1) as avg_bed_days,
      ROUND(AVG(age::numeric) FILTER (WHERE age ~ '^\\d+$'),1) as avg_age,
      ROUND(100.0*SUM((discharge_status='Помер')::int)::numeric/NULLIF(COUNT(*),0)::numeric,2) as death_rate_pct,
      ROUND(100.0*SUM((discharge_status='З поліпшенням')::int)::numeric/NULLIF(COUNT(*),0),1) as improved_pct
    FROM lsmd WHERE ${parsePeriod(p)}`,
  // Графік по днях для тієї ж комбінації фільтрів (x=день, y=кількість — формат для renderSpark)
  periodDaily: (p) => `SELECT EXTRACT(day FROM admission_date_d)::int as x, COUNT(*) as y
    FROM lsmd WHERE ${parsePeriod(p)} GROUP BY x ORDER BY x`,
  // Рух за конкретну дату (відділення|рік|місяць|день): скільки поступило і скільки виписано саме в цей день
  periodFlow: (p) => {
    const [dept = '', year = '', month = '', day = ''] = String(p || '').split('|')
    const y = parseInt(year, 10), m = parseInt(month, 10), d = parseInt(day, 10)
    const valid = /^\d{4}$/.test(String(year).trim()) && m >= 1 && m <= 12 && d >= 1 && d <= 31
    const dateExpr = valid ? `make_date(${y},${m},${d})` : 'CURRENT_DATE'
    const deptCond = dept ? `AND admission_department='${esc(dept)}'` : ''
    return `SELECT
      (SELECT COUNT(*) FROM lsmd WHERE admission_date_d=${dateExpr} ${deptCond}) as поступило,
      (SELECT COUNT(*) FROM lsmd WHERE discharge_date_d=${dateExpr} ${deptCond}) as виписано`
  },
  // Хворі, що ПЕРЕБУВАЮТЬ у відділенні станом на обрану дату (відділення|рік|місяць|день).
  // Поступили <= дати і ще не виписані (або виписані >= дати). ПІБ/вік/діагноз/днів перебування.
  // НЕ публічний (містить ПІБ) — доступний лише авторизованим.
  periodAdmissions: (p) => {
    const [dept = '', year = '', month = '', day = ''] = String(p || '').split('|')
    const y = parseInt(year, 10), m = parseInt(month, 10), d = parseInt(day, 10)
    const validDate = /^\d{4}$/.test(String(year).trim()) && m >= 1 && m <= 12 && d >= 1 && d <= 31
    const dateExpr = validDate ? `make_date(${y},${m},${d})` : 'CURRENT_DATE'
    const conds = [
      `l.admission_date_d <= ${dateExpr}`,
      `(l.discharge_date_d >= ${dateExpr} OR l.discharge_date_d IS NULL)`,
    ]
    if (dept) conds.push(`l.admission_department = '${esc(dept)}'`)
    return `SELECT
        COALESCE(pb.full_name, '—') as піб,
        CASE WHEN l.age ~ '^\\d+$' THEN l.age ELSE NULL END as вік,
        l.gender as стать,
        COALESCE(i.diagnosis_level3, i.diagnosis_level2, i.category_level1, l.icd_primary, '—') as діагноз,
        l.icd_primary as код,
        l.length_of_stay as днів,
        l.doc_name as лікар,
        TO_CHAR(l.admission_date_d, 'DD.MM.YYYY') as поступив,
        TO_CHAR(l.discharge_date_d, 'DD.MM.YYYY') as виписаний,
        CASE WHEN l.patient_id IS NULL THEN 0
          ELSE (SELECT COUNT(*) FROM lsmd l3 WHERE l3.patient_id = l.patient_id) - 1 END as повторні
      FROM lsmd l
      LEFT JOIN icd_10 i ON i.icd_code = l.icd_primary
      LEFT JOIN patients_best pb ON pb.patient_id = l.patient_id
      WHERE ${conds.join(' AND ')}
      ORDER BY pb.full_name ASC NULLS LAST LIMIT 100`
  },
  // Кількість лікарів за рік (distinct doctor_id з lsmd; param = рік або 'all')
  doctorCountYear: (p) => `SELECT COUNT(DISTINCT doctor_id) as cnt FROM lsmd WHERE doctor_id IS NOT NULL AND ${yearFilter(p)}`,
  // KPI терапевтичного блоку (сума 5 відділень; param = рік або 'all')
  therapeuticKpiYear: (p) => `SELECT COUNT(*) as total_cases, COUNT(DISTINCT patient_id) as unique_patients,
      ROUND(AVG(length_of_stay),1) as avg_bed_days,
      ROUND(AVG(age::numeric) FILTER (WHERE age ~ '^\\d+$'),1) as avg_age,
      ROUND(100.0*SUM((discharge_status='З поліпшенням')::int)::numeric/NULLIF(COUNT(*),0),1) as improved_pct,
      ROUND(100.0*SUM((discharge_status='Помер')::int)::numeric/NULLIF(COUNT(*),0),1) as death_rate_pct
    FROM lsmd
    WHERE admission_department IN ('Терапевтичне відділення №1','Гематологічне відділення','Терапевтичне відділення №2','Гастроентерологічне відділення','Центр невідкладної неврології')
      AND ${yearFilter(p)}`,
  // KPI хірургічного блоку (7 відділень; param = рік або 'all')
  surgicalKpiYear: (p) => `SELECT COUNT(*) as total_cases, COUNT(DISTINCT patient_id) as unique_patients,
      ROUND(AVG(length_of_stay),1) as avg_bed_days,
      ROUND(AVG(age::numeric) FILTER (WHERE age ~ '^\\d+$'),1) as avg_age,
      ROUND(100.0*SUM((discharge_status='З поліпшенням')::int)::numeric/NULLIF(COUNT(*),0),1) as improved_pct,
      ROUND(100.0*SUM((discharge_status='Помер')::int)::numeric/NULLIF(COUNT(*),0),1) as death_rate_pct
    FROM lsmd
    WHERE admission_department IN ('Опікове відділення','Травматологічне відділення для дітей','Травматологічне відділення для дорослих','Нейрохірургічне відділення','Урологічне відділення','Хірургічне відділення №2','Хірургічне відділення №1')
      AND ${yearFilter(p)}`,
  // Тренд госпіталізацій терапевтичного блоку: all → по роках, рік → по місяцях
  therapeuticTrend: (p) => {
    const dept = "('Терапевтичне відділення №1','Гематологічне відділення','Терапевтичне відділення №2','Гастроентерологічне відділення','Центр невідкладної неврології')";
    const s = String(p || '').trim().toLowerCase();
    if (!s || s === 'all' || s === 'усі')
      return `SELECT EXTRACT(year FROM admission_date_d)::int as x, COUNT(*) as y FROM lsmd WHERE admission_date_d IS NOT NULL AND admission_department IN ${dept} GROUP BY x ORDER BY x`;
    return `SELECT EXTRACT(month FROM admission_date_d)::int as x, COUNT(*) as y FROM lsmd WHERE admission_date_d IS NOT NULL AND admission_department IN ${dept} AND ${yearFilter(p)} GROUP BY x ORDER BY x`;
  },
  // Тренд госпіталізацій хірургічного блоку
  surgicalTrend: (p) => {
    const dept = "('Опікове відділення','Травматологічне відділення для дітей','Травматологічне відділення для дорослих','Нейрохірургічне відділення','Урологічне відділення','Хірургічне відділення №2','Хірургічне відділення №1')";
    const s = String(p || '').trim().toLowerCase();
    if (!s || s === 'all' || s === 'усі')
      return `SELECT EXTRACT(year FROM admission_date_d)::int as x, COUNT(*) as y FROM lsmd WHERE admission_date_d IS NOT NULL AND admission_department IN ${dept} GROUP BY x ORDER BY x`;
    return `SELECT EXTRACT(month FROM admission_date_d)::int as x, COUNT(*) as y FROM lsmd WHERE admission_date_d IS NOT NULL AND admission_department IN ${dept} AND ${yearFilter(p)} GROUP BY x ORDER BY x`;
  },
  // --- Огляд із фільтром по року (param = рік як рядок, або 'all') ---
  ovKpiYear: (p) => `SELECT COUNT(*) as total_cases, COUNT(DISTINCT patient_id) as unique_patients,
      ROUND(AVG(length_of_stay),1) as avg_bed_days,
      ROUND(AVG(age::numeric) FILTER (WHERE age ~ '^\\d+$'),1) as avg_age,
      SUM((discharge_status='Помер')::int) as deaths,
      ROUND(100.0*SUM((discharge_status='Помер')::int)::numeric/NULLIF(COUNT(*),0)::numeric,2) as death_rate_pct,
      SUM((admission_type='Екстренна')::int) as urgent,
      SUM((admission_type='Планова')::int) as planned,
      ROUND(100.0*SUM((admission_type='Екстренна')::int)::numeric/NULLIF(COUNT(*),0)::numeric,2) as urgent_pct,
      SUM((operation_id IS NOT NULL)::int) as operations,
      ROUND(100.0*SUM((operation_id IS NOT NULL)::int)::numeric/NULLIF(COUNT(*),0)::numeric,2) as surgical_activity_pct
    FROM lsmd WHERE ${yearFilter(p)}`,
  ovHoursYear: (p) => `SELECT EXTRACT(hour FROM admission_ts)::integer as година, COUNT(*) as випадків,
      COUNT(*) FILTER (WHERE discharge_status = 'Помер') as померло
    FROM lsmd WHERE admission_ts IS NOT NULL AND ${yearFilter(p)}
    GROUP BY EXTRACT(hour FROM admission_ts)::integer ORDER BY година`,
  ovStatusYear: (p) => `SELECT discharge_status as статус, COUNT(*) as випадків,
      ROUND(COUNT(*)*100.0/SUM(COUNT(*)) OVER (),2) as відс
    FROM lsmd WHERE discharge_status IN ('З поліпшенням','Помер','Без змін','Переведений в інший заклад','Лікується','З погіршенням') AND ${yearFilter(p)}
    GROUP BY discharge_status ORDER BY випадків DESC`,
  // param формату "рік|кількість" — напр. "2024|10" або "all|7"; кількість обмежена 3-15
  ovIcdYear: (p) => {
    const [yPart, nPart] = String(p).split('|')
    const n = Math.min(15, Math.max(3, parseInt(nPart, 10) || 7))
    return `SELECT LEFT(icd_primary,1) as розділ, COUNT(*) as випадків
      FROM lsmd WHERE icd_primary IS NOT NULL AND icd_primary ~ '^[A-Z]' AND ${yearFilter(yPart)}
      GROUP BY LEFT(icd_primary,1) ORDER BY випадків DESC LIMIT ${n}`
  },
  // Профіль одного відділення
  deptProfile: (p) => `SELECT department as відділення, total_cases as випадків, unique_patients as унікальних, avg_bed_days as ліжкодень, death_rate_pct as летальність, urgent_pct as ургентних_відс, operations as операцій, surgical_activity_pct as хір_активність, avg_age as середній_вік, women as жінки, men as чоловіки, children as діти, elderly as літні, improved as поліпшення,
    (SELECT COUNT(*) FROM lsmd WHERE admission_department = '${esc(p)}' AND discharge_status = 'Помер' AND COALESCE(length_of_stay,999) <= 1) as смерть_день1,
    (SELECT COUNT(*) FROM (SELECT patient_id FROM lsmd WHERE admission_department = '${esc(p)}' GROUP BY patient_id HAVING COUNT(*) > 1) t) as повторні
    FROM v_department_stats WHERE department = '${esc(p)}' LIMIT 1`,
  // Завідувач + кількість лікарів + ліжок по відділенню
  deptHead: (p) => `SELECT
    COALESCE(e.full_name, e.emp_name) as name,
    (SELECT COUNT(*) FROM empl e2 WHERE e2.department='${esc(p)}' AND e2.emp_status IS DISTINCT FROM 'звільнений' AND (e2.position ILIKE '%лікар%' OR e2.position ILIKE '%ординатор%' OR e2.position ILIKE '%завідувач%')) as doctors,
    d.doctors_count as beds
    FROM empl e
    LEFT JOIN departments d ON d.dept_name='${esc(p)}'
    WHERE e.department='${esc(p)}' AND e.position ILIKE '%завідувач%' AND e.emp_status IS DISTINCT FROM 'звільнений'
    LIMIT 1`,
  // Профіль відділення за конкретний рік (param = "назва|рік" або "назва|all")
  deptProfileYear: (p) => {
    const sep = p.lastIndexOf('|')
    const dept = sep >= 0 ? p.slice(0, sep) : p
    const yPart = sep >= 0 ? p.slice(sep + 1) : 'all'
    const yf = yearFilter(yPart)
    return `SELECT
      COUNT(*) as випадків,
      COUNT(DISTINCT patient_id) as унікальних,
      ROUND(AVG(length_of_stay),1) as ліжкодень,
      ROUND(100.0*SUM((discharge_status='Помер')::int)::numeric/NULLIF(COUNT(*),0),1) as летальність,
      ROUND(AVG(age::numeric) FILTER (WHERE age ~ '^\\d+$'),1) as середній_вік,
      SUM((gender='Ж')::int) as жінки,
      SUM((gender='Ч')::int) as чоловіки,
      SUM((discharge_status='З поліпшенням')::int) as поліпшення,
      (SELECT COUNT(*) FROM (SELECT patient_id FROM lsmd l2 WHERE l2.admission_department='${esc(dept)}' AND ${yf.replace('admission_date_d', 'l2.admission_date_d')} GROUP BY patient_id HAVING COUNT(*)>1) t) as повторні
      FROM lsmd
      WHERE admission_department='${esc(dept)}' AND ${yf}`
  },
  // Сьогоднішня активність відділення (поступили / виписані сьогодні)
  deptToday: (p) => `SELECT
    SUM((DATE(admission_date_d) = CURRENT_DATE)::int) as admitted,
    SUM((DATE(discharge_date_d) = CURRENT_DATE)::int) as discharged
    FROM lsmd WHERE admission_department='${esc(p)}'`,
  // Топ-5 ICD категорій для пончика (param = назва відділення)
  deptIcdPie: (p) => `SELECT i.code_level1 as код, i.category_level1 as назва,
    ROUND(100.0*COUNT(*)::numeric/NULLIF((SELECT COUNT(*) FROM lsmd l2 WHERE l2.admission_department='${esc(p)}' AND l2.icd_primary IS NOT NULL),0),1) as відс,
    COUNT(*) as випадків
    FROM lsmd l JOIN icd_10 i ON i.icd_code=l.icd_primary
    WHERE l.admission_department='${esc(p)}' AND l.icd_primary IS NOT NULL AND i.code_level1 IS NOT NULL
    GROUP BY i.code_level1, i.category_level1 ORDER BY випадків DESC LIMIT 5`,
  // Топ-5 ICD з фільтром по року (param = "назва|рік" або "назва|all")
  deptIcdPieYear: (p) => {
    const sep = p.lastIndexOf('|')
    const dept = sep >= 0 ? p.slice(0, sep) : p
    const yPart = sep >= 0 ? p.slice(sep + 1) : 'all'
    const yf = yearFilter(yPart)
    return `SELECT i.code_level1 as код, i.category_level1 as назва,
      ROUND(100.0*COUNT(*)::numeric/NULLIF((SELECT COUNT(*) FROM lsmd l2 WHERE l2.admission_department='${esc(dept)}' AND l2.icd_primary IS NOT NULL AND ${yf.replace('admission_date_d','l2.admission_date_d')}),0),1) as відс,
      COUNT(*) as випадків
      FROM lsmd l JOIN icd_10 i ON i.icd_code=l.icd_primary
      WHERE l.admission_department='${esc(dept)}' AND l.icd_primary IS NOT NULL AND i.code_level1 IS NOT NULL AND ${yf}
      GROUP BY i.code_level1, i.category_level1 ORDER BY випадків DESC LIMIT 5`
  },
  // Топ-5 блоків МКХ (2-й ступінь ієрархії) відділення за рік (param = "назва|рік" або "назва|all").
  // Блок визначається за діапазоном рубрики (LEFT(icd_primary,3)); для невпізнаних — глава МКХ.
  deptIcdBlocksYear: (p) => {
    const sep = p.lastIndexOf('|')
    const dept = sep >= 0 ? p.slice(0, sep) : p
    const yPart = sep >= 0 ? p.slice(sep + 1) : 'all'
    const yf = yearFilter(yPart)
    return `WITH blocks AS (
        SELECT CASE
          -- Нервова система
          WHEN LEFT(l.icd_primary,3) BETWEEN 'G00' AND 'G09' THEN 'Запальні хвороби ЦНС'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'G20' AND 'G26' THEN 'Екстрапірамідні розлади'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'G35' AND 'G37' THEN 'Демієлінізуючі хвороби'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'G40' AND 'G47' THEN 'Епілепсія та пароксизмальні розлади'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'G50' AND 'G64' THEN 'Периферична нервова система та корінці'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'G80' AND 'G83' THEN 'Паралітичні синдроми'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'G90' AND 'G99' THEN 'Інші розлади нервової системи'
          -- Серцево-судинна система
          WHEN LEFT(l.icd_primary,3) BETWEEN 'I10' AND 'I16' THEN 'Гіпертонічна хвороба'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'I20' AND 'I25' THEN 'Ішемічна хвороба серця'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'I30' AND 'I39' THEN 'Ендокардит, перикардит та вади серця'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'I40' AND 'I43' THEN 'Кардіоміопатії та міокардит'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'I44' AND 'I49' THEN 'Порушення ритму серця'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'I50' AND 'I52' THEN 'Серцева недостатність'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'I60' AND 'I69' THEN 'Цереброваскулярні хвороби'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'I70' AND 'I79' THEN 'Атеросклероз та хвороби артерій'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'I80' AND 'I89' THEN 'Хвороби вен та лімфатичних судин'
          -- Органи дихання
          WHEN LEFT(l.icd_primary,3) BETWEEN 'J10' AND 'J18' THEN 'Грип та пневмонія'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'J20' AND 'J22' THEN 'Гострий бронхіт'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'J40' AND 'J47' THEN 'Хронічні хвороби нижніх дихальних шляхів'
          -- Органи травлення
          WHEN LEFT(l.icd_primary,3) BETWEEN 'K20' AND 'K31' THEN 'Хвороби стравоходу, шлунку та ДПК'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'K35' AND 'K38' THEN 'Апендицит'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'K40' AND 'K46' THEN 'Грижі черевної стінки'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'K50' AND 'K52' THEN 'Неінфекційний ентерит та коліт'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'K55' AND 'K64' THEN 'Інші хвороби кишківника'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'K70' AND 'K77' THEN 'Хвороби печінки'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'K80' AND 'K87' THEN 'Хвороби жовчного міхура та підшлункової залози'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'K90' AND 'K93' THEN 'Інші хвороби органів травлення'
          -- Шкіра
          WHEN LEFT(l.icd_primary,3) BETWEEN 'L00' AND 'L08' THEN 'Гнійні та інфекційні хвороби шкіри'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'L80' AND 'L99' THEN 'Рубці, виразки та інші хвороби шкіри'
          -- Кістково-м'язова система
          WHEN LEFT(l.icd_primary,3) BETWEEN 'M00' AND 'M14' THEN 'Артрити та поліартропатії'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'M15' AND 'M19' THEN 'Артрози великих суглобів'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'M20' AND 'M25' THEN 'Інші хвороби суглобів'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'M40' AND 'M54' THEN 'Дорсопатії (хребет, корінці)'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'M60' AND 'M79' THEN 'Хвороби мʼяких тканин та сухожиль'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'M80' AND 'M90' THEN 'Хвороби кісток'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'M91' AND 'M94' THEN 'Хондропатії та хвороби росту'
          -- Сечостатева система
          WHEN LEFT(l.icd_primary,3) BETWEEN 'N00' AND 'N08' THEN 'Гломерулонефрити'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'N10' AND 'N16' THEN 'Тубуло-інтерстиціальні нефрити та уропатії'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'N20' AND 'N23' THEN 'Сечокамʼяна хвороба'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'N25' AND 'N29' THEN 'Інші хвороби нирок'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'N30' AND 'N39' THEN 'Стриктура уретри, цистит та хвороби сечового міхура'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'N40' AND 'N53' THEN 'Хвороби передміхурової залози та статевих органів'
          -- Ендокринна система
          WHEN LEFT(l.icd_primary,3) BETWEEN 'E10' AND 'E14' THEN 'Діабетичні ускладнення'
          -- Новоутворення (гематологія, урологія, хірургія, нейрохірургія)
          WHEN LEFT(l.icd_primary,3) BETWEEN 'C60' AND 'C68' THEN 'Злоякісні новоутворення сечостатевої системи'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'C81' AND 'C96' THEN 'Злоякісні новоутворення крові та лімфатичної тканини'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'C00' AND 'C59' THEN 'Злоякісні новоутворення (солідні пухлини)'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'C69' AND 'C80' THEN 'Злоякісні новоутворення (солідні пухлини)'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'D10' AND 'D36' THEN 'Доброякісні новоутворення'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'D37' AND 'D44' THEN 'Новоутворення невизначеного характеру'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'D45' AND 'D47' THEN 'Мієлодиспластичні синдроми та мієлопроліферативні хвороби'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'D50' AND 'D64' THEN 'Анемії'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'D65' AND 'D69' THEN 'Порушення згортання крові'
          -- Хвороби накопичення та амілоїдоз (гематологія: хвороба Гоше E75, амілоїдоз E85)
          WHEN LEFT(l.icd_primary,3) BETWEEN 'E70' AND 'E90' THEN 'Хвороби накопичення та амілоїдоз'
          -- Вроджені вади (ортопедія дітей)
          WHEN LEFT(l.icd_primary,3) BETWEEN 'Q60' AND 'Q64' THEN 'Вроджені вади сечостатевої системи'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'Q65' AND 'Q79' THEN 'Вроджені вади опорно-рухового апарату'
          -- Травми — за локалізацією
          WHEN LEFT(l.icd_primary,3) BETWEEN 'S00' AND 'S09' THEN 'Травми голови (ЧМТ)'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'S10' AND 'S19' THEN 'Травми шиї'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'S20' AND 'S39' THEN 'Травми грудної клітки та хребта'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'S40' AND 'S49' THEN 'Травми плечового суглоба та плеча'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'S50' AND 'S59' THEN 'Травми ліктьового суглоба та передпліччя'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'S60' AND 'S69' THEN 'Травми запʼястка та кисті'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'S70' AND 'S79' THEN 'Травми кульшового суглоба та стегна'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'S80' AND 'S89' THEN 'Травми колінного суглоба та гомілки'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'S90' AND 'S99' THEN 'Травми гомілковостопного суглоба та стопи'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'T00' AND 'T07' THEN 'Множинні травми'
          -- Опіки та відмороження
          WHEN LEFT(l.icd_primary,3) BETWEEN 'T20' AND 'T28' THEN 'Опіки зовнішніх ділянок тіла'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'T29' AND 'T32' THEN 'Опіки множинних ділянок'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'T33' AND 'T35' THEN 'Відмороження'
          -- Ускладнення медичних процедур та протезів
          WHEN LEFT(l.icd_primary,3) BETWEEN 'T80' AND 'T88' THEN 'Ускладнення хірургічних процедур та протезів'
          -- Інфекційні хвороби (рожа/сепсис у хірургії, гепатит у гастро)
          WHEN LEFT(l.icd_primary,3) BETWEEN 'A30' AND 'A49' THEN 'Бактеріальні інфекції (рожа, сепсис)'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'B15' AND 'B19' THEN 'Вірусний гепатит'
          -- Дихальна недостатність та інші хвороби дихання (терапія)
          WHEN LEFT(l.icd_primary,3) BETWEEN 'J80' AND 'J99' THEN 'Інші хвороби органів дихання'
          -- Симптоми з боку сечовидільної системи (урологія: гематурія R31, затримка сечі R33)
          WHEN LEFT(l.icd_primary,3) BETWEEN 'R30' AND 'R39' THEN 'Симптоми з боку сечовидільної системи'
          -- Алергічні реакції (терапія)
          WHEN LEFT(l.icd_primary,3) = 'T78' THEN 'Алергічні реакції'
          -- Отруєння та токсична дія (анестезіологія/ІТ)
          WHEN LEFT(l.icd_primary,3) BETWEEN 'T36' AND 'T65' THEN 'Отруєння та токсична дія'
          -- Зовнішні причини травм (травматологія: падіння, ДТП)
          WHEN LEFT(l.icd_primary,1) IN ('V','W','X','Y') THEN 'Зовнішні причини травм'
          -- Інші розлади нервової системи (нейродегенеративні G30, мʼязові G70 тощо)
          WHEN LEFT(l.icd_primary,3) BETWEEN 'G10' AND 'G14' THEN 'Інші розлади нервової системи'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'G30' AND 'G32' THEN 'Інші розлади нервової системи'
          WHEN LEFT(l.icd_primary,3) BETWEEN 'G70' AND 'G73' THEN 'Інші розлади нервової системи'
          ELSE i.category_level1
        END as блок
        FROM lsmd l JOIN icd_10 i ON i.icd_code=l.icd_primary
        WHERE l.admission_department='${esc(dept)}' AND l.icd_primary IS NOT NULL AND ${yf}
      ),
      grouped AS (SELECT блок, COUNT(*) as cnt FROM blocks WHERE блок IS NOT NULL GROUP BY блок),
      ranked AS (SELECT блок, cnt, ROW_NUMBER() OVER (ORDER BY cnt DESC) as rn, SUM(cnt) OVER () as total FROM grouped)
      SELECT CASE WHEN rn <= 5 THEN блок ELSE 'Інші' END as назва,
        SUM(cnt) as випадків,
        ROUND(100.0*SUM(cnt)::numeric/NULLIF(MAX(total),0),1) as відс
      FROM ranked
      GROUP BY CASE WHEN rn <= 5 THEN блок ELSE 'Інші' END
      ORDER BY MIN(rn)`
  },
  // Топ-діагнози одного відділення
  deptDiag: (p) => `SELECT COALESCE(diagnosis, icd_code) as діагноз, icd_code as код, cases as випадків, deaths as померло, percent_of_dept as відс FROM department_diagnoses WHERE department = '${esc(p)}' ORDER BY cases DESC LIMIT 10`,
  // Динаміка топ-3 діагнозів за 12 місяців (помісячно)
  deptTrend12m: (p) => `WITH top3 AS (SELECT icd_primary AS код FROM lsmd WHERE admission_department = '${esc(p)}' AND icd_primary IS NOT NULL GROUP BY icd_primary ORDER BY COUNT(*) DESC LIMIT 3) SELECT TO_CHAR(DATE_TRUNC('month', l.admission_date_d), 'YYYY-MM') AS місяць, l.icd_primary AS код, COALESCE(i.diagnosis_level3, l.icd_primary) AS діагноз, COUNT(*) AS випадків FROM lsmd l JOIN top3 ON top3.код = l.icd_primary LEFT JOIN icd_10 i ON i.icd_code = l.icd_primary WHERE l.admission_department = '${esc(p)}' AND l.admission_date_d >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months' GROUP BY місяць, l.icd_primary, i.diagnosis_level3 ORDER BY місяць, COUNT(*) DESC`,
  // Динаміка топ-3 діагнозів поточного місяця (щодня)
  deptTrendMonth: (p) => `WITH top3 AS (SELECT icd_primary AS код FROM lsmd WHERE admission_department = '${esc(p)}' AND icd_primary IS NOT NULL GROUP BY icd_primary ORDER BY COUNT(*) DESC LIMIT 3) SELECT TO_CHAR(l.admission_date_d, 'DD') AS день, l.icd_primary AS код, COALESCE(i.diagnosis_level3, l.icd_primary) AS діагноз, COUNT(*) AS випадків FROM lsmd l JOIN top3 ON top3.код = l.icd_primary LEFT JOIN icd_10 i ON i.icd_code = l.icd_primary WHERE l.admission_department = '${esc(p)}' AND DATE_TRUNC('month', l.admission_date_d) = DATE_TRUNC('month', CURRENT_DATE) GROUP BY день, l.icd_primary, i.diagnosis_level3 ORDER BY день::int, COUNT(*) DESC`,
  // Лікарі відділення з doc_name + emp_name (для dept cabinet)
  deptDocs2: (p) => `SELECT ld.doc_name as doc_name, COALESCE(e.full_name, e.emp_name) as full_name, e.emp_name as emp_name, e.position as посада, e.specialization as спеціалізація, COALESCE(ds.total_cases, 0) as випадків FROM empl e LEFT JOIN lsmd_doctors ld ON ld.empl_name_id = e.name_id LEFT JOIN doctor_stats ds ON ds.doctor_id = ld.empl_name_id WHERE e.department = '${esc(p)}' AND (e.emp_status IS DISTINCT FROM 'звільнений') AND (e.position ILIKE '%лікар%' OR e.position ILIKE '%ординатор%' OR e.position ILIKE '%завідувач%') ORDER BY COALESCE(e.full_name, e.emp_name) ASC LIMIT 50`,
  // Ординатори (резиденти) відділення, макс 20
  deptOrdinators: (p) => `SELECT e.emp_name, e.specialization FROM empl e WHERE e.department = '${esc(p)}' AND (e.emp_status IS DISTINCT FROM 'звільнений') AND e.position ILIKE '%ординатор%' ORDER BY e.emp_name LIMIT 20`,
  // Чергові лікарі: 9 блоків — терапія (спільний пул терапевтичних), неврологія, +7 хірургічних.
  // 1 черговий на блок, детермінована щоденна ротація. param = 'YYYY-MM-DD' (доба); дефолт — сьогодні.
  dutyDoctors: (p) => {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(p || '').trim())
    const dateExpr = m ? `make_date(${+m[1]},${+m[2]},${+m[3]})` : 'CURRENT_DATE'
    return `WITH params AS (SELECT (${dateExpr} - DATE '2000-01-01') AS seed),
      pool AS (
        SELECT CASE
            WHEN e.department IN ('Терапевтичне відділення №1','Терапевтичне відділення №2','Гастроентерологічне відділення','Гематологічне відділення') THEN 'Терапія'
            WHEN e.department = 'Центр невідкладної неврології' THEN 'Неврологія'
            WHEN e.department = 'Опікове відділення' THEN 'Опікове'
            WHEN e.department = 'Травматологічне відділення для дітей' THEN 'Травматологія дітей'
            WHEN e.department = 'Травматологічне відділення для дорослих' THEN 'Травматологія дорослих'
            WHEN e.department = 'Нейрохірургічне відділення' THEN 'Нейрохірургія'
            WHEN e.department = 'Урологічне відділення' THEN 'Урологія'
            WHEN e.department = 'Хірургічне відділення №2' THEN 'Хірургія №2'
            WHEN e.department = 'Хірургічне відділення №1' THEN 'Хірургія №1'
          END AS блок, COALESCE(e.full_name, e.emp_name) AS doc, e.department AS dep, e.name_id
        FROM empl e
        WHERE (e.position ILIKE '%лікар%' OR e.position ILIKE '%ординатор%')
          AND (e.emp_status IS DISTINCT FROM 'звільнений')
      ),
      ranked AS (
        SELECT блок, doc, dep,
          ROW_NUMBER() OVER (PARTITION BY блок ORDER BY name_id) AS rn,
          COUNT(*) OVER (PARTITION BY блок) AS cnt
        FROM pool WHERE блок IS NOT NULL
      )
      SELECT r.блок AS блок, r.doc AS лікар, r.dep AS відділення
      FROM ranked r, params p
      WHERE r.cnt > 0 AND r.rn = (p.seed % r.cnt) + 1`
  },
  // Профіль лікаря (param = doc_name)
  docProfile: (p) => `SELECT ld.doc_name as лікар, ds.total_cases as випадків, ds.unique_patients as унікальних, ds.day_cases as денних, ds.night_cases as нічних, ds.weekend_cases as вихідних, ds.improved as поліпшення, ds.deaths as померло, ds.avg_los as ліжкодень, ds.avg_age as середній_вік, ds.first_case as перший, ds.last_case as останній FROM doctor_stats ds JOIN lsmd_doctors ld ON ld.empl_name_id = ds.doctor_id WHERE ld.doc_name = '${esc(p)}' LIMIT 1`,
  // Топ-діагнози лікаря (через doctor_id, бо doc_name скорочений ≠ повне ПІБ у doctor_diagnoses)
  docDiag: (p) => `SELECT COALESCE(dd.diagnosis, dd.icd_code) as діагноз, dd.icd_code as код, dd.cases as випадків, dd.deaths as померло FROM doctor_diagnoses dd JOIN lsmd_doctors ld ON ld.empl_name_id = dd.doctor_id WHERE ld.doc_name = '${esc(p)}' ORDER BY dd.cases DESC LIMIT 10`,
  // Тренд по роках (для головної сторінки)
  deptYearly: (p) => `SELECT EXTRACT(year FROM admission_date_d)::int as рік, COUNT(*) as випадків FROM lsmd WHERE admission_department = '${esc(p)}' AND admission_date_d IS NOT NULL GROUP BY рік ORDER BY рік`,
  // Місячний тренд госпіталізацій по відділенню (для головної сторінки)
  deptMonthly: (p) => `SELECT TO_CHAR(DATE_TRUNC('month', admission_date_d), 'YYYY-MM') as місяць, COUNT(*) as випадків FROM lsmd WHERE admission_department = '${esc(p)}' AND admission_date_d >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months' GROUP BY місяць ORDER BY місяць`,
  // Щоденний тренд поточного місяця по відділенню
  deptDaily: (p) => `SELECT TO_CHAR(admission_date_d, 'DD') as день, COUNT(*) as випадків FROM lsmd WHERE admission_department = '${esc(p)}' AND DATE_TRUNC('month', admission_date_d) = DATE_TRUNC('month', CURRENT_DATE) GROUP BY день ORDER BY день::int`,
  // Топ-5 категорій МКХ по відділенню — назви з icd_10 (chapter = перша буква)
  deptIcdCat: (p) => `SELECT i.code_level1 as код, i.category_level1 as назва, COUNT(*) as випадків FROM lsmd l JOIN icd_10 i ON i.icd_code = l.icd_primary WHERE l.admission_department = '${esc(p)}' AND l.icd_primary IS NOT NULL GROUP BY i.code_level1, i.category_level1 ORDER BY випадків DESC LIMIT 5`,
  // Пошук МКХ-10 за кодом або назвою (для форми додавання пацієнта)
  icdSearch: (p) => `SELECT icd_code as код, COALESCE(diagnosis_level3, diagnosis_level2, category_level1) as назва FROM icd_10 WHERE icd_code ILIKE '${esc(p)}%' OR diagnosis_level3 ILIKE '%${esc(p)}%' OR diagnosis_level2 ILIKE '%${esc(p)}%' ORDER BY usage_count DESC NULLS LAST LIMIT 8`,
  // Місячна динаміка поступлень по всій лікарні за конкретний рік (param = рік як рядок)
  hospitalMonthly: (p) => `SELECT TO_CHAR(DATE_TRUNC('month', admission_date_d), 'YYYY-MM') as місяць, COUNT(*) as випадків FROM lsmd WHERE admission_date_d IS NOT NULL AND EXTRACT(year FROM admission_date_d) = ${/^\d{4}$/.test(String(p).trim()) ? parseInt(p,10) : new Date().getFullYear()} GROUP BY місяць ORDER BY місяць`,
  // Місячна динаміка терапевтичного блоку (param = рік)
  therapeuticMonthly: (p) => `SELECT TO_CHAR(DATE_TRUNC('month', admission_date_d), 'YYYY-MM') as місяць, COUNT(*) as випадків FROM lsmd WHERE admission_date_d IS NOT NULL AND EXTRACT(year FROM admission_date_d) = ${/^\d{4}$/.test(String(p).trim()) ? parseInt(p,10) : new Date().getFullYear()} AND admission_department IN ('Терапевтичне відділення №1','Гематологічне відділення','Терапевтичне відділення №2','Гастроентерологічне відділення','Центр невідкладної неврології','Відділення анестезіології з ліжками інтенсивної терапії') GROUP BY місяць ORDER BY місяць`,
  // Місячна динаміка хірургічного блоку (param = рік)
  surgicalMonthly: (p) => `SELECT TO_CHAR(DATE_TRUNC('month', admission_date_d), 'YYYY-MM') as місяць, COUNT(*) as випадків FROM lsmd WHERE admission_date_d IS NOT NULL AND EXTRACT(year FROM admission_date_d) = ${/^\d{4}$/.test(String(p).trim()) ? parseInt(p,10) : new Date().getFullYear()} AND admission_department IN ('Опікове відділення','Травматологічне відділення для дітей','Травматологічне відділення для дорослих','Нейрохірургічне відділення','Урологічне відділення','Хірургічне відділення №2','Хірургічне відділення №1') GROUP BY місяць ORDER BY місяць`,
}

// Запити лише для admin (персональні дані пацієнтів).
const ADMIN_PARAM_QUERIES = {
  // Пошук пацієнта за ПІБ (param = частина ПІБ)
  patSearch: (p) => `SELECT patient_id, full_name as піб, age as вік, gender as стать, locality as нп FROM patients_best WHERE full_name ILIKE '%${esc(p)}%' AND full_name IS NOT NULL ORDER BY full_name LIMIT 25`,
  // Картка пацієнта (param = patient_id як рядок)
  patCard: (p) => `SELECT patient_id, full_name as піб, age as вік, gender as стать, birthday as дата_нар, phone_num as телефон, locality as нп, region as область, district as район FROM patients_best WHERE patient_id = ${/^\d+$/.test(String(p)) ? Number(p) : 0} LIMIT 1`,
  // Історія госпіталізацій пацієнта
  patHistory: (p) => `SELECT admission_date_d as поступив, discharge_date_d as виписаний, icd_primary as діагноз, admission_department as відділення, discharge_status as статус, length_of_stay as ліжкодень, doc_name as лікар FROM lsmd WHERE patient_id = ${/^\d+$/.test(String(p)) ? Number(p) : 0} ORDER BY admission_date_d DESC LIMIT 50`,
}

async function getRole(req) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return Object.entries(req.cookies || {}).map(([name, value]) => ({ name, value }))
          },
          setAll() {},
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: appUser } = await supabase
      .from('app_users').select('role').eq('auth_user_id', user.id).single()
    return appUser?.role || 'viewer'
  } catch {
    return null
  }
}

async function supaFetch(sql) {
  const r = await fetch(`${(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)}/rest/v1/rpc/execute_sql_safe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    },
    body: JSON.stringify({ sql_query: sql, p_role: 'admin', p_doc_name: null })
  })
  const data = await r.json()
  let rows = []
  if (Array.isArray(data) && data[0]?.execute_sql !== undefined) rows = data[0].execute_sql || []
  else if (Array.isArray(data)) rows = data
  return rows
}

// Публічні запити — доступні без авторизації (тільки агреговані дані, без ПІБ)
const PUBLIC_KEYS = new Set([
  'ovKpiYear', 'doctorCount', 'doctorCountYear', 'therapeuticKpiYear', 'surgicalKpiYear', 'deptProfile', 'deptProfileYear', 'deptHead',
  'therapeuticMonthly', 'surgicalMonthly', 'hospitalMonthly', 'allYears',
  'therapeuticTrend', 'surgicalTrend', 'deptOrdinators', 'deptDocs2', 'deptDaily', 'dutyDoctors',
  'deptIcdPie', 'deptIcdPieYear', 'deptIcdBlocksYear',
  'periodKpi', 'periodDaily', 'periodFlow',
  // periodAdmissions — НЕ тут: містить ПІБ пацієнтів, доступний лише авторизованим
])

export default async function handler(req, res) {
  const { key } = req.body || {}
  const isPublic = PUBLIC_KEYS.has(key)

  const role = await getRole(req)
  if (!role && !isPublic) {
    return res.status(401).json({ error: 'Не авторизовано' })
  }

  if (req.method === 'POST') {
    const { key, param } = req.body || {}
    // Admin-only параметризовані запити (персональні дані пацієнтів)
    if (key && ADMIN_PARAM_QUERIES[key]) {
      if (role !== 'admin') {
        return res.status(403).json({ error: 'Доступ лише для адміністратора' })
      }
      if (!param || typeof param !== 'string' || param.length > 200) {
        return res.status(400).json({ error: 'Некоректний параметр' })
      }
      try {
        const rows = await supaFetch(ADMIN_PARAM_QUERIES[key](param))
        return res.status(200).json({ rows })
      } catch (e) {
        console.error('Stats SQL error:', e.message, '| key:', key)
        return res.status(500).json({ error: e.message, rows: [] })
      }
    }
    // Параметризований запит (напр. профіль відділення)
    if (key && PARAM_QUERIES[key]) {
      if (!param || typeof param !== 'string' || param.length > 200) {
        return res.status(400).json({ error: 'Некоректний параметр' })
      }
      try {
        const rows = await supaFetch(PARAM_QUERIES[key](param))
        return res.status(200).json({ rows })
      } catch (e) {
        console.error('Stats SQL error:', e.message, '| key:', key)
        return res.status(500).json({ error: e.message, rows: [] })
      }
    }
    if (!key || !QUERIES[key]) {
      return res.status(400).json({ error: 'Невідомий ключ запиту' })
    }
    try {
      const rows = await supaFetch(QUERIES[key])
      return res.status(200).json({ rows })
    } catch (e) {
      console.error('Stats SQL error:', e.message, '| key:', key)
      return res.status(500).json({ error: e.message, rows: [] })
    }
  }

  if (req.method === 'GET') {
    try {
      const rows = await supaFetch(`
        SELECT COUNT(*) as total_requests,
          SUM(tokens_in) as total_tokens_in,
          SUM(tokens_out) as total_tokens_out,
          SUM(tokens_in + tokens_out) as total_tokens,
          SUM(cost_usd) as total_cost,
          MIN(created_at) as first_request,
          MAX(created_at) as last_request,
          COUNT(DISTINCT DATE(created_at)) as active_days
        FROM usage_stats
      `)
      return res.status(200).json(rows[0] || {})
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  res.status(405).end()
}
