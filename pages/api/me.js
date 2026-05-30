import { createServerClient } from '@supabase/ssr'

export default async function handler(req, res) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return Object.entries(req.cookies || {}).map(([name, value]) => ({ name, value }))
          },
          setAll() {},
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return res.status(200).json({ role: null })

    const { data: appUser } = await supabase
      .from('app_users')
      .select('role')
      .eq('auth_user_id', user.id)
      .single()

    return res.status(200).json({ role: appUser?.role || 'viewer', email: user.email })
  } catch {
    return res.status(200).json({ role: null })
  }
}
