import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { displayDeptName } from '../../lib/department-display-names'

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
        // displayDeptName — те саме скорочення, що й /api/lpz-departments,
        // щоб на entry.html значення збігалось з data-dept у клінічному блоці.
        department = emp.department ? displayDeptName(emp.department) : emp.department
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

    // Етап 1 (сесія → lpz_empl, не URL ?dept=/?doc=): "своя" lpz-ідентичність
    // через email (auth.users.email = lpz_empl.email) — надійніше за старий
    // empl_name_id, бо lpz_empl.role='head' тепер повний канон (заповнено
    // вручну для відділень, яких не було в helsi). Сервісний ключ — бо
    // lpz_empl має RLS, а тут дозволений лише lookup власного email.
    let lpz_role = null, lpz_department = null, lpz_resource_id = null, lpz_department_structure_id = null
    const sbService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: lpzEmpl } = await sbService
      .schema('lpz')
      .from('lpz_empl')
      .select('resource_id, role, department_structure_id, org_edrpou, last_name, first_name, middle_name, position_name')
      .ilike('email', user.email)
      .maybeSingle()
    if (lpzEmpl) {
      lpz_role = lpzEmpl.role
      lpz_resource_id = lpzEmpl.resource_id
      lpz_department_structure_id = lpzEmpl.department_structure_id
      // full_name — той самий фолбек, що й org_edrpou нижче: без app_users
      // ПІБ зі старої empl нема, .field-me-name (utils.js:renderFieldMe)
      // падав аж до email.
      if (!full_name) {
        full_name = [lpzEmpl.last_name, lpzEmpl.first_name, lpzEmpl.middle_name].filter(Boolean).join(' ') || null
      }
      if (!position) position = lpzEmpl.position_name
      if (lpzEmpl.department_structure_id) {
        const { data: dept } = await sbService
          .schema('lpz')
          .from('lpz_departments')
          .select('name')
          .eq('org_edrpou', lpzEmpl.org_edrpou)
          .eq('structure_id', lpzEmpl.department_structure_id)
          .maybeSingle()
        lpz_department = dept?.name ? displayDeptName(dept.name) : null
      }
      // .field-me-role (utils.js:renderFieldMe) — [position, department] —
      // без app_users department теж нема зі старої empl, а lpz_department
      // вище вже правильно порахований з того самого lpzEmpl.
      if (!department) department = lpz_department
    }

    // org_edrpou — старий ланцюжок (app_users.empl_name_id → empl.org_edrpou)
    // не заповнений для співробітників, доданих лише через lpz-канон (немає
    // запису в app_users) — entry.js/head-cabinet.js/doctor-cabinet.js
    // читають саме org_edrpou для визначення лікарні, тож без фолбеку такий
    // користувач після логіну бачив порожню сторінку, хоча lpz_role/
    // lpz_department вище вже коректно визначені з того самого lpzEmpl.
    if (!org_edrpou && lpzEmpl) org_edrpou = lpzEmpl.org_edrpou

    return res.status(200).json({
      role: appUser?.role || 'viewer',
      // is_owner — окремо від role: role='admin' видають і директорам/заступникам
      // окремих лікарень (з lpz_empl.role), а сторінки, що бачать усі ЛПУ одразу
      // (admin-hospitals, admin-status), мають бути доступні лише власнику сайту.
      is_owner: appUser?.is_owner || false,
      email: user.email,
      full_name, emp_name, position, specialization, department, doc_name, org_edrpou,
      lpz_role, lpz_department, lpz_resource_id, lpz_department_structure_id,
    })
  } catch {
    return res.status(200).json({ role: null })
  }
}
