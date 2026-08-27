import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Тренд по ОДНОМУ відділенню для хвилястого графіка (head-cabinet.js) — той
// самий патерн, що /api/lpz-trend-direction-kpi (entry.js), лише замість
// напряму — department (uuid). Усі 6 показників (hosp/pat/bed/age/imp/let),
// кожен розбитий на ургентні/планові (lpz.lpz_is_urgent_icd). Один фетч на
// всі 6 — перемикання показника кліком на КПІ-плитку не вимагає повторного
// запиту. year+місяць конкретні → щоденна деталізація того місяця.
export default async function handler(req, res) {
  const org = String(req.query.org || '').trim()
  const year = String(req.query.year || 'all').trim().toLowerCase()
  const month = String(req.query.month || 'all').trim().toLowerCase()
  const department = String(req.query.department || '').trim()
  if (!org) return res.status(400).json({ error: 'org (ЄДРПОУ) обовʼязковий' })
  if (!department) return res.status(400).json({ error: 'department обовʼязковий' })

  try {
    const { data, error } = await sb()
      .schema('lpz')
      .rpc('lpz_trend_by_department_kpi', { p_org: org, p_year: year, p_department: department, p_month: month })

    if (error) return res.status(500).json({ error: error.message })
    res.status(200).json({ rows: data || [] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
