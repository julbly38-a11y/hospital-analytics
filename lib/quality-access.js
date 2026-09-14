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

// → { error: { status, body } } або { sb, scope, org, cols, showMoney, match(row) }
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
    cols,
    match: row => Object.entries(cols).every(([k, v]) => String(row[k]) === String(v)),
  }
}

// Таблиця перевірки — в пам'яті сервера на кілька хвилин: дані оновлюються
// щоденним прогоном, а кабінети запитують показники на кожен клік пігулки.
// На Vercel запит може потрапити на "холодний" екземпляр без кешу, тому:
//  - обсяг відділення/лікаря читається з бази лише своїми рядками (сотні, а
//    не вся лікарня), якщо вся лікарня ще не лежить у кеші цього екземпляра;
//  - light — без текстів підказок і діагнозів (плитки й графіки,
//    /api/lpz-quality-finance), у кілька разів менше даних.
// Порції PostgREST (по 1000 рядків) читаються одночасно. Після запису нового
// прогону кеш скидається (local-quality-ingest.js).
const SNAPSHOT_TTL_MS = 5 * 60 * 1000
const LIGHT_COLUMNS = 'id, org_edrpou, is_open, discharge_at, fix_deadline, flags, warnings, department_structure_id, doctor_resource_id, primary_icd, operations_count, admission_priority, checked_at'
const snapshotCache = new Map() // `${org}|${full|light}|${обсяг}` → { at, promise }

function cacheGet(key) {
  const hit = snapshotCache.get(key)
  return hit && Date.now() - hit.at < SNAPSHOT_TTL_MS ? hit.promise : null
}

function cacheLoad(key, loader) {
  const warm = cacheGet(key)
  if (warm) return warm
  const promise = loader()
  snapshotCache.set(key, { at: Date.now(), promise })
  promise.catch(() => snapshotCache.delete(key))
  return promise
}

async function readSnapshot(sb, org, columns, cols) {
  const table = () => Object.entries(cols).reduce(
    (q, [k, v]) => q.eq(k, v),
    sb.schema('lpz').from('lpz_case_quality_snapshot').select(columns, { count: 'exact' }).eq('org_edrpou', org))
  const first = await table().order('id').range(0, 999)
  if (first.error) throw new Error(first.error.message)
  const pages = Math.ceil((first.count || 0) / 1000)
  const rest = await Promise.all(Array.from({ length: Math.max(pages - 1, 0) }, (_, i) =>
    table().order('id').range((i + 1) * 1000, (i + 1) * 1000 + 999)))
  return [first, ...rest].flatMap(({ data, error }) => {
    if (error) throw new Error(error.message)
    return data || []
  })
}

export function invalidateSnapshotCache(org) {
  for (const key of [...snapshotCache.keys()]) {
    if (!org || key.startsWith(`${org}|`)) snapshotCache.delete(key)
  }
}

// Рядки в межах обсягу користувача (копії — обробники дописують у них поля).
// wholeHospital — уся лікарня незалежно від обсягу користувача; лише для
// агрегованих показників без персональних даних (шапка кабінетів,
// /api/lpz-quality-finance?level=hospital), ніколи для переліку епізодів.
export async function fetchSnapshotRows(access, { wholeHospital = false, light = false } = {}) {
  const { sb, org, cols } = access
  const kind = light ? 'light' : 'full'
  const clone = rows => rows.map(r => ({ ...r }))
  const scoped = !wholeHospital && Object.keys(cols).length > 0
  if (scoped) {
    // Уся лікарня вже в кеші цього екземпляра (повна підходить і для light) —
    // фільтруємо в пам'яті; інакше — лише свої рядки з бази.
    const hospital = cacheGet(`${org}|${kind}|all`) || (light && cacheGet(`${org}|full|all`))
    if (hospital) return clone((await hospital).filter(access.match))
    const key = `${org}|${kind}|${Object.entries(cols).map(([k, v]) => `${k}=${v}`).join('&')}`
    return clone(await cacheLoad(key, () => readSnapshot(sb, org, light ? LIGHT_COLUMNS : '*', cols)))
  }
  const warmFull = light && cacheGet(`${org}|full|all`)
  if (warmFull) return clone(await warmFull)
  return clone(await cacheLoad(`${org}|${kind}|all`, () => readSnapshot(sb, org, light ? LIGHT_COLUMNS : '*', {})))
}

export const hasIssues = r => (r.flags || []).length + (r.warnings || []).length > 0

// open — пацієнт у відділенні; закриті з зауваженнями — fixable (строк подачі
// змін ще не минув) або lost; закриті без зауважень — ok.
export function segmentOf(r, today) {
  if (r.is_open) return 'open'
  if (!hasIssues(r)) return 'ok'
  return r.fix_deadline && r.fix_deadline >= today ? 'fixable' : 'lost'
}
