import { createClient } from '@supabase/supabase-js'
import { getHospitalTheme } from '../../lib/hospital-themes'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Публічна, некритична інформація (назва/адреса лікарні) — доступна без логіну,
// бо показується ще до входу (layout.html).
export default async function handler(req, res) {
  const org = String(req.query.org || '').trim()
  if (!org) return res.status(400).json({ error: 'org (ЄДРПОУ) обовʼязковий' })

  try {
    const { data, error } = await sb()
      .schema('lpz')
      .from('lpz_organizations')
      .select('edrpou, display_name, tagline, logo_url, short_name, address, phones')
      .eq('edrpou', org)
      .single()

    if (error || !data) return res.status(404).json({ error: 'Лікарню не знайдено' })
    // theme = null, якщо для лікарні немає власної кольорової схеми — тоді
    // фронтенд нічого не оверрайдить і лишається дефолт (Хотин, theme.css).
    res.status(200).json({ ...data, theme: getHospitalTheme(data.edrpou) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
