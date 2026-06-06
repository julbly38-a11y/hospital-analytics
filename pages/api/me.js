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
      .select('role, empl_name_id')
      .eq('auth_user_id', user.id)
      .single()

    let name = null, position = null, specialization = null
    if (appUser?.empl_name_id) {
      const { data: emp } = await supabase
        .from('empl')
        .select('full_name, emp_name, position, specialization')
        .eq('name_id', appUser.empl_name_id)
        .single()
      if (emp) {
        name = emp.full_name || emp.emp_name
        position = emp.position
        specialization = emp.specialization
      }
    }

    return res.status(200).json({
      role: appUser?.role || 'viewer',
      email: user.email,
      name, position, specialization,
    })
  } catch {
    return res.status(200).json({ role: null })
  }
}
