import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

// Сирі пари (лікар, блок МКХ) для перехресного підсвічування "Ординаторська"
// ↔ донат "Структура діагнозів" (head-cabinet.js, hover на лікаря підсвічує
// відповідні сегменти в dept-pie.js). Той самий рівень довіри й визначення
// відділення з сесії, що й /api/lpz-department-icd-blocks (агрегований).
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

    const { data, error } = await sbService.schema('lpz').rpc('lpz_department_icd_blocks_by_doctor', {
      p_org: lpzEmpl.org_edrpou,
      p_department: lpzEmpl.department_structure_id,
      ...(date ? { p_date: date } : {}),
    })

    if (error) return res.status(500).json({ error: error.message })
    res.status(200).json({ rows: data || [] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
