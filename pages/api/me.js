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
      .select('role, empl_name_id, is_owner')
      .eq('auth_user_id', user.id)
      .single()

    let full_name = null, emp_name = null, position = null, specialization = null, department = null, doc_name = null, org_edrpou = null
    if (appUser?.empl_name_id) {
      const { data: emp } = await supabase
        .from('empl')
        .select('full_name, emp_name, position, specialization, department, org_edrpou')
        .eq('name_id', appUser.empl_name_id)
        .single()
      if (emp) {
        full_name = emp.full_name || emp.emp_name
        emp_name = emp.emp_name
        position = emp.position
        specialization = emp.specialization
        department = emp.department
        org_edrpou = emp.org_edrpou
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
      // is_owner — окремо від role: role='admin' видають і директорам/заступникам
      // окремих лікарень (з lpz_empl.role), а сторінки, що бачать усі ЛПУ одразу
      // (admin-hospitals, admin-status), мають бути доступні лише власнику сайту.
      is_owner: appUser?.is_owner || false,
      email: user.email,
      full_name, emp_name, position, specialization, department, doc_name, org_edrpou,
    })
  } catch {
    return res.status(200).json({ role: null })
  }
}
