import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

// Донат "Структура діагнозів" (public/js/dept-pie.js) на head-cabinet.html,
// lf-left-bottom — той самий рівень довіри й той самий принцип визначення
// відділення, що й /api/lpz-department-census: ВИКЛЮЧНО з сесії (не з
// клієнтського параметра), лише для завідувача/лікаря свого відділення.
// Опційний date (YYYY-MM-DD) — "перебуває станом на цю дату"; без явної
// дати — дата останнього наявного запису (як і в lpz-department-census).
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
      .select('org_edrpou, department_structure_id, role')
      .ilike('email', user.email)
      .maybeSingle()

    if (!lpzEmpl?.department_structure_id || (lpzEmpl.role !== 'head' && lpzEmpl.role !== 'doctor')) {
      return res.status(403).json({ error: 'доступ лише для завідувача або лікаря відділення' })
    }

    const dateParam = req.query.date ? String(req.query.date).trim() : null
    let date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined

    if (!date) {
      const { data: lastDate } = await sbService.schema('lpz').rpc('lpz_department_last_date', {
        p_org: lpzEmpl.org_edrpou,
        p_department: lpzEmpl.department_structure_id,
        p_doctor: null,
      })
      if (lastDate) date = lastDate
    }

    const { data, error } = await sbService.schema('lpz').rpc('lpz_department_icd_blocks', {
      p_org: lpzEmpl.org_edrpou,
      p_department: lpzEmpl.department_structure_id,
      ...(date ? { p_date: date } : {}),
    })

    if (error) return res.status(500).json({ error: error.message })
    res.status(200).json({ rows: data || [], date: date || null })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
