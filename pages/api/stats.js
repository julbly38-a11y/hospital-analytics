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
  wDoctors:    'SELECT ld.doc_name as лікар, ds.total_cases as випадків, ds.unique_patients as унікальних, ds.improved as поліпшення, ds.deaths as померло, ds.avg_los as ліжкодень FROM doctor_stats ds JOIN lsmd_doctors ld ON ld.doctor_id = ds.doctor_id ORDER BY ds.total_cases DESC LIMIT 20',
  wNight:      'SELECT time_period as період, cases as випадків, unique_patients as унікальних, avg_bed_days as ліжкодень, deaths as померло, letality_percent as летальність FROM v_night_vs_day_admissions ORDER BY cases DESC',
  wOps:        'SELECT department as відділення, operations as операцій, total_cases as випадків, surgical_activity_pct as хір_активність FROM v_department_stats WHERE operations > 0 ORDER BY operations DESC',
  // --- Організаційна ієрархія ---
  orgDepts: `SELECT b.name as block, d.dept_name as відділення, d.doctors_count as лікарів, d.staff_count as персонал FROM departments d LEFT JOIN clinical_blocks b ON b.id = d.block_id ORDER BY b.name, d.dept_name`,
  orgDocs:  `SELECT emp_name as лікар, COALESCE(specialization,'—') as спеціалізація, position as посада, department as відділення FROM empl WHERE (emp_status IS DISTINCT FROM 'звільнений') AND (position ILIKE '%лікар%' OR position ILIKE '%ординатор%' OR position ILIKE '%завідувач%') ORDER BY department, (position ILIKE '%завідувач%') DESC, emp_name LIMIT 500`,
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
const PARAM_QUERIES = {
  // --- Огляд із фільтром по року (param = рік як рядок, або 'all') ---
  ovKpiYear: (p) => `SELECT COUNT(*) as total_cases, COUNT(DISTINCT patient_id) as unique_patients,
      ROUND(AVG(length_of_stay),1) as avg_bed_days,
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
  deptProfile: (p) => `SELECT department as відділення, total_cases as випадків, unique_patients as унікальних, avg_bed_days as ліжкодень, death_rate_pct as летальність, urgent_pct as ургентних_відс, operations as операцій, surgical_activity_pct as хір_активність, avg_age as середній_вік, women as жінки, men as чоловіки, children as діти, elderly as літні, improved as поліпшення FROM v_department_stats WHERE department = '${esc(p)}' LIMIT 1`,
  // Топ-діагнози одного відділення
  deptDiag: (p) => `SELECT COALESCE(diagnosis, icd_code) as діагноз, icd_code as код, cases as випадків, deaths as померло, percent_of_dept as відс FROM department_diagnoses WHERE department = '${esc(p)}' ORDER BY cases DESC LIMIT 10`,
  // Профіль лікаря (param = doc_name)
  docProfile: (p) => `SELECT ld.doc_name as лікар, ds.total_cases as випадків, ds.unique_patients as унікальних, ds.day_cases as денних, ds.night_cases as нічних, ds.weekend_cases as вихідних, ds.improved as поліпшення, ds.deaths as померло, ds.avg_los as ліжкодень, ds.first_case as перший, ds.last_case as останній FROM doctor_stats ds JOIN lsmd_doctors ld ON ld.doctor_id = ds.doctor_id WHERE ld.doc_name = '${esc(p)}' LIMIT 1`,
  // Топ-діагнози лікаря (через doctor_id, бо doc_name скорочений ≠ повне ПІБ у doctor_diagnoses)
  docDiag: (p) => `SELECT COALESCE(dd.diagnosis, dd.icd_code) as діагноз, dd.icd_code as код, dd.cases as випадків, dd.deaths as померло FROM doctor_diagnoses dd JOIN lsmd_doctors ld ON ld.empl_name_id = dd.doctor_id WHERE ld.doc_name = '${esc(p)}' ORDER BY dd.cases DESC LIMIT 10`,
  // Пошук МКХ-10 за кодом або назвою (для форми додавання пацієнта)
  icdSearch: (p) => `SELECT icd_code as код, COALESCE(diagnosis_level3, diagnosis_level2, category_level1) as назва FROM icd_10 WHERE icd_code ILIKE '${esc(p)}%' OR diagnosis_level3 ILIKE '%${esc(p)}%' OR diagnosis_level2 ILIKE '%${esc(p)}%' ORDER BY usage_count DESC NULLS LAST LIMIT 8`,
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

export default async function handler(req, res) {
  // Авторизація обовʼязкова. Загальні агреговані показники (без ПІБ) доступні всім ролям.
  const role = await getRole(req)
  if (!role) {
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
