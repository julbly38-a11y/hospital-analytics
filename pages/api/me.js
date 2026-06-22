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

    let full_name = null, emp_name = null, position = null, specialization = null, department = null, doc_name = null
    if (appUser?.empl_name_id) {
      const { data: emp } = await supabase
        .from('empl')
        .select('full_name, emp_name, position, specialization, department')
        .eq('name_id', appUser.empl_name_id)
        .single()
      if (emp) {
        full_name = emp.full_name || emp.emp_name
        emp_name = emp.emp_name
        position = emp.position
        specialization = emp.specialization
        department = emp.department
      }
      // doc_name (скорочене ім'я в lsmd) — для входу лікаря у свій кабінет
      const { data: doctor } = await supabase
        .from('lsmd_doctors')
        .select('doc_name')
        .eq('empl_name_id', appUser.empl_name_id)
        .maybeSingle()
      doc_name = doctor?.doc_name || null
    }

    return res.status(200).json({
      role: appUser?.role || 'viewer',
      email: user.email,
      full_name, emp_name, position, specialization, department, doc_name,
    })
  } catch {
    return res.status(200).json({ role: null })
  }
}
