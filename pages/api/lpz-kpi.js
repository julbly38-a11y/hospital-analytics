import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Публічні агреговані KPI (без ПІБ) для shell-шару — доступні без логіну,
// показуються ще до входу (layout.html), як і /api/hospital-info.
// Агрегація рахується на боці Postgres (lpz_kpi_summary), а не в JS —
// PostgREST інакше обрізає вибірку на 1000 рядків і агрегати спотворюються.
export default async function handler(req, res) {
  const org = String(req.query.org || '').trim()
  const year = String(req.query.year || 'all').trim().toLowerCase()
  if (!org) return res.status(400).json({ error: 'org (ЄДРПОУ) обовʼязковий' })

  try {
    const { data, error } = await sb()
      .schema('lpz')
      .rpc('lpz_kpi_summary', { p_org: org, p_year: year })
      .single()

    if (error) return res.status(500).json({ error: error.message })
    res.status(200).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
