import { createServerClient } from '@supabase/ssr'

const esc = (s) => String(s).replace(/'/g, "''")

function dateWhere(from, to) {
  const parts = []
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) parts.push(`l.admission_date_d >= '${from}'`)
  if (to   && /^\d{4}-\d{2}-\d{2}$/.test(to))   parts.push(`l.admission_date_d <= '${to}'`)
  return parts.length ? parts.join(' AND ') : null
}

const SELECT5 = `
  SELECT
    COUNT(*)::int                                                                   AS госпіталізацій,
    COUNT(DISTINCT l.patient_id)::int                                               AS пацієнтів,
    ROUND(100.0 * SUM((l.discharge_status = 'Помер')::int)::numeric
          / NULLIF(COUNT(*), 0), 2)                                                 AS летальність,
    ROUND(AVG(l.length_of_stay)::numeric, 1)                                        AS ліжкодень,
    ROUND(AVG(pb.age)::numeric, 1)                                                  AS середній_вік
  FROM lsmd l
  LEFT JOIN patients_best pb ON pb.patient_id = l.patient_id`

function buildSql(scope, id, from, to) {
  const dw = dateWhere(from, to)
  if (scope === 'hospital') {
    return `${SELECT5} WHERE ${dw || '1=1'}`
  }
  if (scope === 'dept') {
    const base = `${SELECT5} WHERE l.admission_department = '${esc(id)}'`
    return dw ? `${base} AND ${dw}` : base
  }
  if (scope === 'doctor') {
    const base = `${SELECT5} WHERE l.doc_name = '${esc(id)}'`
    return dw ? `${base} AND ${dw}` : base
  }
  return null
}

async function getRole(req) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() { return Object.entries(req.cookies || {}).map(([name, value]) => ({ name, value })) },
          setAll() {},
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    return 'authenticated'
  } catch { return null }
}

async function supaFetch(sql) {
  const r = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/execute_sql_safe`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ sql_query: sql, p_role: 'admin', p_doc_name: null }),
    }
  )
  const data = await r.json()
  if (Array.isArray(data) && data[0]?.execute_sql !== undefined) return data[0].execute_sql || []
  if (Array.isArray(data)) return data
  return []
}

export default async function handler(req, res) {
  const role = await getRole(req)
  if (!role) return res.status(401).json({ error: 'Не авторизовано' })
  if (req.method !== 'POST') return res.status(405).end()

  const { scope, id, dateFrom, dateTo } = req.body || {}

  if (!['hospital', 'dept', 'doctor'].includes(scope)) {
    return res.status(400).json({ error: 'Невідомий scope' })
  }
  if (scope !== 'hospital' && (!id || typeof id !== 'string' || id.length > 200)) {
    return res.status(400).json({ error: 'Потрібен id для scope dept/doctor' })
  }

  const sql = buildSql(scope, id || '', dateFrom || null, dateTo || null)
  if (!sql) return res.status(400).json({ error: 'Помилка параметрів' })

  try {
    const rows = await supaFetch(sql)
    return res.status(200).json(rows[0] || {})
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
