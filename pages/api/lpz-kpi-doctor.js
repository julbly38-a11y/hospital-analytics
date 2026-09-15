import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Публічні агреговані KPI (без ПІБ), скоповані по ОДНОМУ лікарю
// (doc_resource_id) — для КПІ-блоку на doctor-cabinet.html. Той самий
// патерн, що /api/lpz-kpi-department, лише замість відділення — конкретний
// лікар (uuid). lpz_hospitalizations.doc_resource_id порожній (0% заповнення),
// тому звʼязок лікар↔випадок — через lpz_episodes (той самий join, що й
// /api/lpz-department-census), не пряма колонка.
export default async function handler(req, res) {
  const org = String(req.query.org || '').trim()
  const year = String(req.query.year || 'all').trim().toLowerCase()
  const month = String(req.query.month || 'all').trim().toLowerCase()
  const doctor = String(req.query.doctor || '').trim()
  if (!org) return res.status(400).json({ error: 'org (ЄДРПОУ) обовʼязковий' })
  if (!doctor) return res.status(400).json({ error: 'doctor обовʼязковий' })

  try {
    const { data, error } = await sb()
      .schema('lpz')
      .rpc('lpz_kpi_by_doctor', { p_org: org, p_year: year, p_doctor: doctor, p_month: month })
      .single()

    if (error) return res.status(500).json({ error: error.message })
    res.status(200).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
