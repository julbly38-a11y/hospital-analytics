import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Тренд госпіталізацій по ОДНОМУ відділенню: всі роки → по роках, конкретний
// рік → по місяцях. Формат {x,y} — під spark-chart.js. Той самий патерн, що
// /api/lpz-trend-direction, лише замість напряму — department (uuid).
export default async function handler(req, res) {
  const org = String(req.query.org || '').trim()
  const year = String(req.query.year || 'all').trim().toLowerCase()
  const department = String(req.query.department || '').trim()
  if (!org) return res.status(400).json({ error: 'org (ЄДРПОУ) обовʼязковий' })
  if (!department) return res.status(400).json({ error: 'department обовʼязковий' })

  try {
    const { data, error } = await sb()
      .schema('lpz')
      .rpc('lpz_trend_by_department', { p_org: org, p_year: year, p_department: department })

    if (error) return res.status(500).json({ error: error.message })
    res.status(200).json({ rows: data || [] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
