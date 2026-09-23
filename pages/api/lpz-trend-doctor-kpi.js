import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Тренд по ОДНОМУ лікарю для хвилястого графіка (doctor-cabinet.js) — той
// самий патерн, що /api/lpz-trend-department-kpi, лише замість відділення —
// doctor (uuid), без month (на doctor-cabinet.html графік завжди річний).
// Усі 6 показників (hosp/pat/bed/age/imp/let), кожен розбитий на
// ургентні/планові (lpz.lpz_is_urgent_icd). Один фетч на всі 6 —
// перемикання показника кліком на КПІ-плитку не вимагає повторного запиту.
export default async function handler(req, res) {
  const org = String(req.query.org || '').trim()
  const year = String(req.query.year || 'all').trim().toLowerCase()
  const doctor = String(req.query.doctor || '').trim()
  if (!org) return res.status(400).json({ error: 'org (ЄДРПОУ) обовʼязковий' })
  if (!doctor) return res.status(400).json({ error: 'doctor обовʼязковий' })

  try {
    const { data, error } = await sb()
      .schema('lpz')
      .rpc('lpz_trend_by_doctor_kpi', { p_org: org, p_year: year, p_doctor: doctor })

    if (error) return res.status(500).json({ error: error.message })
    res.status(200).json({ rows: data || [] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
