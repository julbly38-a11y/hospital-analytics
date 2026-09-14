import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { estimatePrice, estimateRisk, PRICING_SOURCE } from '../../lib/quality-pricing'

// Контроль записів (public/quality.html) — епізоди з ознаками помилок, що
// впливають на оплату НСЗУ. Обсяг — лише з сесії: chief — уся лікарня, head —
// своє відділення (включно з епізодами без лікаря, адресованими йому), doctor —
// епізоди, які він веде або підписав. Начмедів (deputy) поки не підключено:
// немає прив'язки заступника до напрямку. Власник сайту (is_owner, без
// lpz_empl) — org з параметра, як в інших lpz-ендпоінтах.
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
      .select('org_edrpou, role, department_structure_id, resource_id')
      .ilike('email', user.email)
      .maybeSingle()
    const { data: appUser } = await supabase
      .from('app_users')
      .select('is_owner')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    const queryOrg = req.query.org ? String(req.query.org).trim() : null
    let query = sbService.schema('lpz').from('lpz_case_quality_snapshot').select('*')
    let scope

    if (appUser?.is_owner && queryOrg) {
      query = query.eq('org_edrpou', queryOrg)
      scope = 'hospital'
    } else if (lpzEmpl?.role === 'chief') {
      query = query.eq('org_edrpou', lpzEmpl.org_edrpou)
      scope = 'hospital'
    } else if (lpzEmpl?.role === 'head' && lpzEmpl.department_structure_id) {
      query = query.eq('org_edrpou', lpzEmpl.org_edrpou).eq('department_structure_id', lpzEmpl.department_structure_id)
      scope = 'department'
    } else if (lpzEmpl?.role === 'doctor' && lpzEmpl.resource_id) {
      query = query.eq('org_edrpou', lpzEmpl.org_edrpou).eq('doctor_resource_id', lpzEmpl.resource_id)
      scope = 'doctor'
    } else {
      return res.status(403).json({ error: 'доступ лише для головного лікаря, завідувачів і лікарів' })
    }

    // PostgREST віддає не більше 1000 рядків за запит — догружаємо сторінками.
    const rows = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await query.order('id').range(from, from + 999)
      if (error) return res.status(500).json({ error: error.message })
      rows.push(...(data || []))
      if (!data || data.length < 1000) break
    }
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date())
    // Гроші бачить лише головний лікар (і власник сайту) — лікарям і
    // завідувачам достатньо зауважень і підказок.
    const showMoney = scope === 'hospital'
    rows.forEach(r => {
      r.segment = r.is_open ? 'open' : (r.fix_deadline && r.fix_deadline >= today ? 'fixable' : 'lost')
      r.addressee = r.doctor_resource_id ? 'doctor' : 'head'
      if (showMoney) {
        r.est_price = estimatePrice(r)
        r.est_risk = estimateRisk(r, r.est_price)
      }
    })
    res.status(200).json({
      scope,
      today,
      pricing_source: showMoney ? PRICING_SOURCE : null,
      checked_at: rows.reduce((m, r) => ((r.checked_at || '') > m ? r.checked_at : m), ''),
      rows,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
