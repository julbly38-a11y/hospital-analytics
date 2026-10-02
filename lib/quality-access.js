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
  } else {
    // Лікарі не мають власного доступу до контролю записів (рішення 2026-09-23):
    // епізоди лікаря видно лише завідувачу/головлікарю та власнику сайту, який
    // провалюється в них ІЄРАРХІЧНО (гілка is_owner + ?doctor= вище). Гілку
    // самодоступу 'doctor' навмисно прибрано — сесія лікаря падає сюди, у 403.
    return { error: { status: 403, body: { error: 'доступ лише для головного лікаря та завідувачів' } } }
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
const LIGHT_COLUMNS = 'id, helsi_case_id, org_edrpou, is_open, discharge_at, fix_deadline, flags, warnings, department_structure_id, doctor_resource_id, primary_icd, operations_count, admission_priority, checked_at'
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

// Вердикт НСЗУ по епізоду з lpz_episode_facts (package-validation, scripts/
// collect_package_validation.js; зібрано для виписаних епізодів усіх
// відділень, лише не старіших за 90 днів на момент збору):
//  - prices — реальна ціна: повна ціна ДСГ з коефіцієнтами епізоду
//    (adjustment_price / adjustment_coefficient); спецпакети з фіксованим
//    тарифом (інсульт, інфаркт, хіміотерапія…) — без коефіцієнта, лише price;
//  - refused — пряма відмова НСЗУ (validation_success = false) з текстом.
// Відмова через обмеження 90 днів у facts записана як validation_success =
// null («не розраховано») і сюди не потрапляє. Якщо факти не читаються —
// порожні мапи, і ціни лишаються орієнтовними (lib/quality-pricing.js).
async function readFactsPaged(sb, org, select, filter) {
  const table = () => filter(sb.schema('lpz').from('lpz_episode_facts')
    .select(select, { count: 'exact' }).eq('org_edrpou', org))
  const first = await table().order('helsi_case_id').range(0, 999)
  if (first.error) return null
  const pages = Math.ceil((first.count || 0) / 1000)
  const rest = await Promise.all(Array.from({ length: Math.max(pages - 1, 0) }, (_, i) =>
    table().order('helsi_case_id').range((i + 1) * 1000, (i + 1) * 1000 + 999)))
  const out = []
  for (const { data, error } of [first, ...rest]) {
    if (error) return null
    out.push(...(data || []))
  }
  return out
}

// Читабельний текст відмови з відповіді helsi: {errors:[{message}]}, {поле:[текст]}
// або {message}. Розмітку (<br>) прибираємо.
function nszuRefusalText(m) {
  const raw = m && m.error
  if (!raw) return 'НСЗУ відмовило в розрахунку (текст відмови не збережено).'
  let parts = []
  try {
    const j = JSON.parse(raw)
    if (Array.isArray(j.errors)) parts = j.errors.map(e => e.message)
    else if (j.message) parts = [j.message]
    else parts = Object.entries(j).map(([k, v]) => `${k}: ${[].concat(v).join(' ')}`)
  } catch { parts = [raw] }
  return parts.join(' ').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 700)
}

async function readNszuVerdicts(sb, org) {
  const [priced, refused] = await Promise.all([
    readFactsPaged(sb, org, 'helsi_case_id, price, adjustment_price, adjustment_coefficient',
      q => q.eq('validation_success', true).or('adjustment_price.not.is.null,price.not.is.null')),
    readFactsPaged(sb, org, 'helsi_case_id, validation_messages', q => q.eq('validation_success', false)),
  ])
  const prices = new Map()
  for (const f of priced || []) {
    if (f.adjustment_price != null && f.adjustment_coefficient > 0) prices.set(f.helsi_case_id, Math.round(f.adjustment_price / f.adjustment_coefficient))
    else if (f.price > 0) prices.set(f.helsi_case_id, Math.round(f.price))
  }
  const refusals = new Map((refused || []).map(f => [f.helsi_case_id, nszuRefusalText(f.validation_messages)]))
  return { prices, refusals }
}

async function readSnapshot(sb, org, columns, cols) {
  const table = () => Object.entries(cols).reduce(
    (q, [k, v]) => q.eq(k, v),
    sb.schema('lpz').from('lpz_case_quality_snapshot').select(columns, { count: 'exact' }).eq('org_edrpou', org))
  const verdicts = readNszuVerdicts(sb, org)
  const first = await table().order('id').range(0, 999)
  if (first.error) throw new Error(first.error.message)
  const pages = Math.ceil((first.count || 0) / 1000)
  const rest = await Promise.all(Array.from({ length: Math.max(pages - 1, 0) }, (_, i) =>
    table().order('id').range((i + 1) * 1000, (i + 1) * 1000 + 999)))
  const rows = [first, ...rest].flatMap(({ data, error }) => {
    if (error) throw new Error(error.message)
    return data || []
  })
  const { prices, refusals } = await verdicts
  rows.forEach(r => {
    const price = prices.get(r.helsi_case_id)
    if (price) r.real_price = price
    // Пряма відмова НСЗУ — окрема доведена помилка (закриті епізоди; у
    // відкритих виписки ще немає).
    const refusal = !r.is_open && refusals.get(r.helsi_case_id)
    if (refusal) {
      r.nszu_refused = true
      r.flags = [...new Set(['nszu_refused', ...(r.flags || [])])]
      if (r.hints !== undefined) r.hints = { ...(r.hints || {}), nszu_refused: refusal }
    }
  })
  return rows
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

// ── Нагадування лікарю по відкритих епізодах ──
// Норми перебування по діагнозах (перші 3 символи МКХ) — з власної історії
// стаціонару лікарні (lpz_hospitalizations, з 2023 р.): медіана й 75-й
// перцентиль у добах. Кеш на добу. Офіційних нормативів НСЗУ на добу нема:
// референтні значення (середнє по ДСГ за кв.–вер. 2025 ÷/× 3 або 1,5) НСЗУ не
// публікує — постанова №1808 п.36/38.
const NORMS_TTL_MS = 24 * 3600 * 1000
const normsCache = new Map() // org → { at, promise }

async function readLosNorms(sb, org) {
  const q = () => sb.schema('lpz').from('lpz_hospitalizations')
    .select('icd_primary, admission_date, admission_time, discharge_date, discharge_time', { count: 'exact' })
    .eq('org_edrpou', org).gte('admission_date', '2023-01-01').not('discharge_date', 'is', null).not('icd_primary', 'is', null)
  const first = await q().order('id_case').range(0, 999)
  if (first.error) return new Map()
  const pages = Math.ceil((first.count || 0) / 1000)
  const rest = await Promise.all(Array.from({ length: Math.max(pages - 1, 0) }, (_, i) =>
    q().order('id_case').range((i + 1) * 1000, (i + 1) * 1000 + 999)))
  const by = new Map()
  for (const { data, error } of [first, ...rest]) {
    if (error) return new Map()
    for (const h of data || []) {
      const icd3 = String(h.icd_primary || '').trim().slice(0, 3).toUpperCase()
      if (!icd3) continue
      const t = (d, tm) => new Date(`${d}T${tm || '00:00:00'}`).getTime()
      const los = (t(h.discharge_date, h.discharge_time) - t(h.admission_date, h.admission_time)) / 86400000
      if (!(los >= 0 && los < 120)) continue
      if (!by.has(icd3)) by.set(icd3, [])
      by.get(icd3).push(los)
    }
  }
  const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))]
  const norms = new Map()
  for (const [icd3, arr] of by) {
    if (arr.length < 20) continue
    arr.sort((x, y) => x - y)
    norms.set(icd3, { n: arr.length, median: pct(arr, 0.5), p75: pct(arr, 0.75), p90: pct(arr, 0.9) })
  }
  return norms
}

export function getLosNorms(sb, org) {
  const hit = normsCache.get(org)
  if (hit && Date.now() - hit.at < NORMS_TTL_MS) return hit.promise
  const promise = readLosNorms(sb, org)
  normsCache.set(org, { at: Date.now(), promise })
  promise.catch(() => normsCache.delete(org))
  return promise
}

// Правило: нагадування лікарю — у відкритому епізоді від 3-ї доби, поки в записі
// є що дооформити; доба = ціла кількість діб перебування + 1. Завідувачу — коли
// перебування довше за 75-й перцентиль по діагнозу, а для діагнозів без норми
// (менше 20 випадків) — з 10-ї доби.
// Історія проблем — hints.__track (pages/api/local-quality-ingest.js).
// «М'які» пункти — перевірками package-validation доведено, що оплату вони не
// блокують (README, «Каталог перевірок»): не вважаються важливими, не дають
// ескалації завідувачу й не входять у лічильник нагадувань.
export const SOFT_REMINDER_CODES = new Set(['single_diagnosis', 'injury_no_external_cause', 'no_doctor', 'stroke_no_g', 'stroke_no_additional'])
export const REMINDER_FROM_DAY = 3
export const REMINDER_ESCALATE_DAY_NO_NORM = 10

export function buildReminder(r, norms, nowMs = Date.now()) {
  if (!r.is_open) return null
  const codes = [...(r.flags || []), ...(r.warnings || [])]
  if (!codes.length) return null
  const day = Math.floor(Number(r.los_days) || 0) + 1
  if (day < REMINDER_FROM_DAY) return null
  const track = r.hints?.__track || {}
  const days = iso => (iso ? Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 86400000)) : null)
  const norm = norms.get(String(r.primary_icd || '').trim().slice(0, 3).toUpperCase()) || null
  const overNorm = norm ? Number(r.los_days) > norm.p75 : false
  const items = codes
    .map(code => ({ code, error: (r.flags || []).includes(code), soft: SOFT_REMINDER_CODES.has(code), since_days: days(track.first_seen?.[code]) }))
    .sort((a, b) => Number(a.soft) - Number(b.soft))
  const important = items.some(i => !i.soft)
  return {
    day,
    items,
    important,
    unchanged_days: days(track.changed_at),
    norm: norm ? { n: norm.n, median: Math.round(norm.median * 10) / 10, p75: Math.round(norm.p75 * 10) / 10 } : null,
    over_norm: overNorm,
    escalate: important && (norm ? overNorm : day >= REMINDER_ESCALATE_DAY_NO_NORM),
  }
}

export const hasIssues = r => (r.flags || []).length + (r.warnings || []).length > 0

// open — пацієнт у відділенні; закриті з помилками (flags) — fixable (строк
// подачі змін ще не минув) або lost; закриті лише з попередженнями — warned
// (оплату не блокують, помилкою не рахуються); закриті без зауважень — ok.
export function segmentOf(r, today) {
  if (r.is_open) return 'open'
  if (!hasIssues(r)) return 'ok'
  if (!(r.flags || []).length) return 'warned'
  return r.fix_deadline && r.fix_deadline >= today ? 'fixable' : 'lost'
}
