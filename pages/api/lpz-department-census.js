import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

// "Перебуває у відділенні" — містить ПІБ/вік/діагноз пацієнтів (не як
// /api/lpz-kpi-department, де лише агрегати). Тому відділення НЕ береться з
// клієнтського параметра (той самий антипатерн, що ми свідомо уникаємо
// всюди в цьому проекті — старий ?dept= без server-side звірки з сесією):
// тут department визначається ВИКЛЮЧНО з сесії (auth.users.email →
// lpz_empl.department_structure_id). Для завідувача (head) — клієнт може
// передати опційний doctor (клік-фільтр в ординаторській), в межах уже
// server-side-визначеного відділення. Для лікаря (doctor) — doctor
// ЗАВЖДИ примусово дорівнює власному resource_id (клієнтський doctor
// ігнорується) — лікар бачить лише своїх пацієнтів, не всього відділення.
// Опційний date (YYYY-MM-DD) — "перебуває станом на цю дату" (клік на точку
// графіка динаміки). Без явної дати — НЕ "сьогодні" (даних на реальне
// сьогодні може й не бути), а дата ОСТАННЬОГО наявного запису для цього
// відділення/лікаря (lpz_department_last_date) — те, що реально показати.
// Відповідь завжди містить використану date, щоб фронтенд знав, що саме
// показує (day-name + дата в заголовку), навіть коли дату підібрав сервер.
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
    if (!user) return res.status(401).json({ error: 'unauthorized' })

    const sbService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: lpzEmpl } = await sbService
      .schema('lpz')
      .from('lpz_empl')
      .select('org_edrpou, department_structure_id, role, resource_id')
      .ilike('email', user.email)
      .maybeSingle()

    // Власник сайту (is_owner) не має власного lpz_empl-запису — для нього
    // org/department прийшли б з клієнтського параметра, чого цей ендпоінт
    // навмисно уникає для звичайних завідувачів/лікарів (див. коментар
    // вище). Виняток — лише коли сесія підтверджує is_owner (app_users,
    // серверне поле, клієнт підмінити не може), той самий принцип, що й у
    // head-cabinet.js:initHeadCabinet на фронтенді.
    const { data: appUser } = await supabase
      .from('app_users')
      .select('is_owner')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    const queryOrg = req.query.org ? String(req.query.org).trim() : null
    const queryDept = req.query.department ? String(req.query.department).trim() : null
    const adminOverride = appUser?.is_owner && queryOrg && queryDept

    if (!adminOverride && (!lpzEmpl?.department_structure_id || (lpzEmpl.role !== 'head' && lpzEmpl.role !== 'doctor'))) {
      return res.status(403).json({ error: 'доступ лише для завідувача або лікаря відділення' })
    }

    const org = adminOverride ? queryOrg : lpzEmpl.org_edrpou
    const department = adminOverride ? queryDept : lpzEmpl.department_structure_id
    const doctor = adminOverride
      ? (req.query.doctor ? String(req.query.doctor).trim() : null)
      : (lpzEmpl.role === 'doctor' ? lpzEmpl.resource_id : (req.query.doctor ? String(req.query.doctor).trim() : null))

    const dateParam = req.query.date ? String(req.query.date).trim() : null
    let date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined

    if (!date) {
      const { data: lastDate } = await sbService.schema('lpz').rpc('lpz_department_last_date', {
        p_org: org,
        p_department: department,
        p_doctor: doctor,
      })
      if (lastDate) date = lastDate
    }

    const [{ data, error }, { data: flowData, error: flowError }] = await Promise.all([
      sbService.schema('lpz').rpc('lpz_department_census', {
        p_org: org,
        p_department: department,
        p_doctor: doctor,
        ...(date ? { p_date: date } : {}),
      }),
      sbService.schema('lpz').rpc('lpz_department_flow', {
        p_org: org,
        p_department: department,
        ...(date ? { p_date: date } : {}),
      }).single(),
    ])

    if (error) return res.status(500).json({ error: error.message })
    if (flowError) return res.status(500).json({ error: flowError.message })
    res.status(200).json({
      rows: data || [],
      admitted: flowData?.admitted ?? 0,
      discharged: flowData?.discharged ?? 0,
      date: date || null,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
