import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function isOwner(req) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() { return Object.entries(req.cookies || {}).map(([name, value]) => ({ name, value })) },
          setAll() {},
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const { data } = await supabase.from('app_users').select('is_owner').eq('auth_user_id', user.id).single()
    return data?.is_owner || false
  } catch { return false }
}

// Сирі факти епізоду (lpz.lpz_episode_facts) — для дослідницької перевірки
// правил коректності (не готові висновки, як lpz_case_quality_snapshot).
// Лише для власника сайту: сторінка службова, не для лікарів/завідувачів.
export default async function handler(req, res) {
  const owner = await isOwner(req)
  if (!owner) return res.status(403).json({ error: 'Доступ заборонено' })

  const org = String(req.query.org || '43342788')
  const status = req.query.status === 'open' || req.query.status === 'closed' ? req.query.status : null

  try {
    const lpz = sb().schema('lpz')
    const FACTS_COLUMNS = 'helsi_case_id, card_number, status, admission_at, discharge_at, department_name, doctor_id, ' +
      'doctor_position, admit_source, priority, re_admission, injury_type, primary_icd, secondary_icd, ' +
      'complication_icd, external_cause_icd, intervention_codes, operation_codes, discharge_disposition, ' +
      'discharge_ehealth_status, discharge_signed_by_position, card_status, esoz_episode_status, resolution_name, ' +
      'package_number, package_name, dsg_code, dsg_name, validation_success, validation_messages, ' +
      'dsg_coefficient, price, adjustment_coefficient, adjustment_price'

    // PostgREST на Supabase обмежує відповідь db-max-rows (типово 1000)
    // незалежно від .range() — тому сторінкуємо запит, доки не отримаємо
    // сторінку коротшу за PAGE_SIZE.
    const PAGE_SIZE = 1000
    async function fetchAllFacts() {
      const all = []
      for (let from = 0; ; from += PAGE_SIZE) {
        let page = lpz.from('lpz_episode_facts')
          .select(FACTS_COLUMNS)
          .eq('org_edrpou', org)
          .order('admission_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1)
        if (status) page = page.eq('status', status)
        const { data: chunk, error: chunkError } = await page
        if (chunkError) throw chunkError
        all.push(...(chunk || []))
        if (!chunk || chunk.length < PAGE_SIZE) break
      }
      return all
    }

    const [data, { data: catalogRows }] = await Promise.all([
      fetchAllFacts(),
      lpz.from('lpz_quality_check_catalog').select('code, label_uk, blocks_payment, episodes_count, verification_method'),
    ])
    const catalog = Object.fromEntries((catalogRows || []).map(c => [c.code, c]))

    const doctorIds = [...new Set((data || []).map(r => r.doctor_id).filter(Boolean))]
    const doctorById = new Map()
    if (doctorIds.length) {
      const { data: empl } = await lpz.from('lpz_empl')
        .select('resource_id, last_name, first_name, middle_name')
        .eq('org_edrpou', org).in('resource_id', doctorIds)
      ;(empl || []).forEach(e => doctorById.set(e.resource_id, [e.last_name, e.first_name?.[0], e.middle_name?.[0]]
        .filter(Boolean).map((p, i) => i ? p + '.' : p).join(' ')))
    }

    const losDays = r => r.discharge_at ? (new Date(r.discharge_at) - new Date(r.admission_at)) / 86400000 : null
    const rows = (data || []).map(r => {
      const isTrauma = /^[ST]/.test(r.primary_icd || '')
      const los = losDays(r)
      return {
        ...r,
        doctor_short_name: r.doctor_id ? (doctorById.get(r.doctor_id) || null) : null,
        checks: {
          no_primary: !r.primary_icd,
          no_doctor: !r.doctor_id,
          injury_no_type: isTrauma && r.injury_type == null,
          single_dx: !(r.secondary_icd?.length) && !(r.complication_icd?.length),
          no_interventions: !(r.intervention_codes?.length),
          no_esoz: r.status === 'closed' && !r.esoz_episode_status,
          negative_card_number: /^-/.test(r.card_number || ''),
          los_over_30d: los != null && los > 30,
          no_signer: r.status === 'closed' && !r.discharge_signed_by_position,
          no_disposition: r.status === 'closed' && !r.discharge_disposition,
        },
      }
    })

    res.status(200).json({ org, total: rows.length, catalog, rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
