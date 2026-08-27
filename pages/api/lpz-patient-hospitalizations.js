import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

// Уся історія госпіталізацій пацієнта (клік на цифру повторних
// госпіталізацій, .census-hosp-count в utils.js) — по всій лікарні
// (org_edrpou з сесії), не лише поточному відділенню: той самий рівень
// довіри, що вже показує повний випадок конкретної госпіталізації, просто
// в часі. Дозвіл — лише завідувач/лікар (як і /api/lpz-department-census),
// org — виключно з сесії, patient — з клієнта (лише вибирає, ЯКОГО зі
// своїх видимих пацієнтів показати, не інше org_edrpou).
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

    const patient = req.query.patient ? String(req.query.patient).trim() : null
    if (!patient) return res.status(400).json({ error: 'patient обовʼязковий' })

    const sbService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: lpzEmpl } = await sbService
      .schema('lpz')
      .from('lpz_empl')
      .select('org_edrpou, role')
      .ilike('email', user.email)
      .maybeSingle()

    if (!lpzEmpl || (lpzEmpl.role !== 'head' && lpzEmpl.role !== 'doctor')) {
      return res.status(403).json({ error: 'доступ лише для завідувача або лікаря відділення' })
    }

    const { data, error } = await sbService.schema('lpz').rpc('lpz_patient_hospitalizations', {
      p_org: lpzEmpl.org_edrpou,
      p_patient: patient,
    })

    if (error) return res.status(500).json({ error: error.message })
    res.status(200).json({ rows: data || [] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
