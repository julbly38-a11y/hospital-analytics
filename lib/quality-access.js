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

// → { error: { status, body } } або { sb, scope, org, showMoney, match(row) }
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
  // Обидва запити незалежні — паралельно.
  const [{ data: lpzEmpl }, { data: appUser }] = await Promise.all([
    sb.schema('lpz').from('lpz_empl')
      .select('org_edrpou, role, department_structure_id, resource_id')
      .ilike('email', user.email)
      .maybeSingle(),
    supabase.from('app_users')
      .select('is_owner')
      .eq('auth_user_id', user.id)
      .maybeSingle(),
  ])

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
    match: row => Object.entries(cols).every(([k, v]) => String(row[k]) === String(v)),
  }
}

// Уся таблиця перевірки лікарні — в пам'яті сервера на кілька хвилин: дані
// оновлюються щоденним прогоном, а кабінети запитують показники на кожен клік
// пігулки. Порції PostgREST (по 1000 рядків) читаються одночасно. Після
// запису нового прогону кеш скидається (local-quality-ingest.js).
const SNAPSHOT_TTL_MS = 5 * 60 * 1000
const snapshotCache = new Map() // org → { at, promise }

function loadOrgSnapshot(sb, org) {
  const hit = snapshotCache.get(org)
  if (hit && Date.now() - hit.at < SNAPSHOT_TTL_MS) return hit.promise
  const table = () => sb.schema('lpz').from('lpz_case_quality_snapshot')
  const promise = (async () => {
    const { count, error } = await table().select('id', { count: 'exact', head: true }).eq('org_edrpou', org)
    if (error) throw new Error(error.message)
    const pages = Math.ceil((count || 0) / 1000)
    const results = await Promise.all(Array.from({ length: pages }, (_, i) =>
      table().select('*').eq('org_edrpou', org).order('id').range(i * 1000, i * 1000 + 999)))
    return results.flatMap(({ data, error: pageError }) => {
      if (pageError) throw new Error(pageError.message)
      return data || []
    })
  })()
  snapshotCache.set(org, { at: Date.now(), promise })
  promise.catch(() => snapshotCache.delete(org))
  return promise
}

export function invalidateSnapshotCache(org) {
  if (org) snapshotCache.delete(org)
  else snapshotCache.clear()
}

// Рядки в межах обсягу користувача (копії — обробники дописують у них поля).
// wholeHospital — уся лікарня незалежно від обсягу користувача; лише для
// агрегованих показників без персональних даних (шапка кабінетів,
// /api/lpz-quality-finance?level=hospital), ніколи для переліку епізодів.
export async function fetchSnapshotRows(access, { wholeHospital = false } = {}) {
  const rows = await loadOrgSnapshot(access.sb, access.org)
  return (wholeHospital ? rows : rows.filter(access.match)).map(r => ({ ...r }))
}

export const hasIssues = r => (r.flags || []).length + (r.warnings || []).length > 0

// open — пацієнт у відділенні; закриті з зауваженнями — fixable (строк подачі
// змін ще не минув) або lost; закриті без зауважень — ok.
export function segmentOf(r, today) {
  if (r.is_open) return 'open'
  if (!hasIssues(r)) return 'ok'
  return r.fix_deadline && r.fix_deadline >= today ? 'fixable' : 'lost'
}
