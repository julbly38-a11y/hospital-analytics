import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function isOwner(req) {
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
    if (!user) return false
    const { data } = await supabase.from('app_users').select('is_owner').eq('auth_user_id', user.id).single()
    return data?.is_owner || false
  } catch { return false }
}

// Список УСІХ лікарень одразу — навмисно лише для власника сайту, не для
// звичайних admin (директори/заступники окремих ЛПУ), щоб не перетинати
// дані між лікарнями.
export default async function handler(req, res) {
  const owner = await isOwner(req)
  if (!owner) return res.status(403).json({ error: 'Доступ заборонено' })

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
