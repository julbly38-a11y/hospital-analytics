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
}

async function isAuthorized(req, res) {
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
    return !!user
  } catch {
    return false
  }
}

async function supaFetch(sql) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/execute_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    },
    body: JSON.stringify({ sql_query: sql })
  })
  const data = await r.json()
  let rows = []
  if (Array.isArray(data) && data[0]?.execute_sql !== undefined) rows = data[0].execute_sql || []
  else if (Array.isArray(data)) rows = data
  return rows
}

export default async function handler(req, res) {
  // Авторизація обовʼязкова для всіх методів
  if (!(await isAuthorized(req, res))) {
    return res.status(401).json({ error: 'Не авторизовано' })
  }

  if (req.method === 'POST') {
    const { key } = req.body || {}
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
