import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

// Спільні правила доступу до контролю записів (lpz_case_quality_snapshot) —
// /api/lpz-case-quality (перелік епізодів) і /api/lpz-quality-finance
// (показники й динаміка для кабінетів). Обсяг — лише з сесії: chief — уся
// лікарня, head — своє відділення, doctor — свої епізоди. Власник сайту
// (is_owner) — org з параметра, плюс dept/doctor, коли заходить у кабінет
// чужого відділення чи лікаря. Начмедів (deputy) поки не підключено.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const kyivDate = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(d)

// → { error: { status, body } } або { sb, scope, showMoney, filter(query) }
export async function resolveQualityAccess(req) {
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
  if (!user) return { error: { status: 401, body: { error: 'unauthorized' } } }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: lpzEmpl } = await sb
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
  let eq

  if (appUser?.is_owner && queryOrg) {
    // Власник сайту заходить у кабінет будь-якого відділення/лікаря
    // (head-cabinet/doctor-cabinet з ?dept=/?doctor=) — той самий обсяг,
    // що побачив би сам завідувач або лікар. Параметрам довіряємо лише тут.
    const qDoctor = UUID_RE.test(req.query.doctor || '') ? req.query.doctor : null
    const qDept = UUID_RE.test(req.query.dept || '') ? req.query.dept : null
    if (qDoctor) eq = { scope: 'doctor', org: queryOrg, doctor_resource_id: qDoctor }
    else if (qDept) eq = { scope: 'department', org: queryOrg, department_structure_id: qDept }
    else eq = { scope: 'hospital', org: queryOrg }
  } else if (lpzEmpl?.role === 'chief') {
    eq = { scope: 'hospital', org: lpzEmpl.org_edrpou }
  } else if (lpzEmpl?.role === 'head' && lpzEmpl.department_structure_id) {
    eq = { scope: 'department', org: lpzEmpl.org_edrpou, department_structure_id: lpzEmpl.department_structure_id }
  } else if (lpzEmpl?.role === 'doctor' && lpzEmpl.resource_id) {
    eq = { scope: 'doctor', org: lpzEmpl.org_edrpou, doctor_resource_id: lpzEmpl.resource_id }
  } else {
    return { error: { status: 403, body: { error: 'доступ лише для головного лікаря, завідувачів і лікарів' } } }
  }

  const { scope, org, ...cols } = eq
  return {
    sb,
    scope,
    org,
    // Гроші бачить лише головний лікар і власник сайту (в будь-якому обсязі) —
    // лікарям і завідувачам достатньо зауважень і підказок.
    showMoney: scope === 'hospital' || !!appUser?.is_owner,
    filter: query => Object.entries(cols).reduce((q, [k, v]) => q.eq(k, v), query.eq('org_edrpou', org)),
  }
}

// PostgREST віддає не більше 1000 рядків за запит — догружаємо сторінками.
// wholeHospital — уся лікарня незалежно від обсягу користувача; лише для
// агрегованих показників без персональних даних (шапка кабінетів,
// /api/lpz-quality-finance?level=hospital), ніколи для переліку епізодів.
export async function fetchSnapshotRows(access, columns = '*', { wholeHospital = false } = {}) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const base = access.sb.schema('lpz').from('lpz_case_quality_snapshot').select(columns)
    const { data, error } = await (wholeHospital ? base.eq('org_edrpou', access.org) : access.filter(base))
      .order('id')
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return rows
}

export const hasIssues = r => (r.flags || []).length + (r.warnings || []).length > 0

// open — пацієнт у відділенні; закриті з зауваженнями — fixable (строк подачі
// змін ще не минув) або lost; закриті без зауважень — ok.
export function segmentOf(r, today) {
  if (r.is_open) return 'open'
  if (!hasIssues(r)) return 'ok'
  return r.fix_deadline && r.fix_deadline >= today ? 'fixable' : 'lost'
}
