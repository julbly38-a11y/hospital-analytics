import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Список лікарень для перемикача (адмін-сторінка). Не секретні дані.
export default async function handler(req, res) {
  try {
    const { data, error } = await sb()
      .schema('lpz')
      .from('lpz_organizations')
      .select('edrpou, display_name')
      .order('display_name')

    if (error) return res.status(500).json({ error: error.message })
    res.status(200).json({ hospitals: data || [] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
