import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Публічні агреговані KPI (без ПІБ), скоповані по напрямку (терапевтичний/
// хірургічний) — для блоку "по напрямках" на entry.html, поруч із
// загальнолікарняним КПІ-рядком (/api/lpz-kpi).
export default async function handler(req, res) {
  const org = String(req.query.org || '').trim()
  const year = String(req.query.year || 'all').trim().toLowerCase()
  const month = String(req.query.month || 'all').trim().toLowerCase()
  const direction = String(req.query.direction || '').trim()
  if (!org) return res.status(400).json({ error: 'org (ЄДРПОУ) обовʼязковий' })
  if (!direction) return res.status(400).json({ error: 'direction обовʼязковий' })

  try {
    const { data, error } = await sb()
      .schema('lpz')
      .rpc('lpz_kpi_by_direction', { p_org: org, p_year: year, p_direction: direction, p_month: month })
      .single()

    if (error) return res.status(500).json({ error: error.message })
    res.status(200).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
