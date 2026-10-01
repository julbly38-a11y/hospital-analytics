// Серверне маскування ПІБ пацієнтів і лікарів (режим приватності).
//
// Чому на сервері, а не CSS-розмиттям у браузері: розмиття діє лише в браузері власника й обходиться
// інструментами розробника; інші ролі (завідувач, головний лікар) його не бачать узагалі. Тут імена
// замінюються ДО того, як відповідь API покидає сервер, для ВСІХ ролей, коли власник увімкнув режим.
//
// Прапорець — public.app_settings, key = 'pii_mask' (true/false). Перемикає лише власник через /api/pii-mode.
// Обгортка withPiiMask(handler) накладається на маршрути, що віддають імена. Маршрут без обгортки імен НЕ маскує:
// новий маршрут з іменами обов'язково обгортати й додавати його ключі в PATIENT_KEYS / DOCTOR_KEYS.
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

const CACHE_MS = 5000 // на serverless кожен інстанс тримає прапорець до 5 с: після перемикання інші інстанси підхоплять його за кілька секунд
let cache = { at: 0, on: false }

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Ключі відповідей API, у яких лежить ПІБ. Назви типу 'name' тут свідомо НЕ перелічені: це можуть бути назви відділень.
export const PATIENT_KEYS = new Set(['pib', 'піб', 'patient_name', 'patientName', 'patient_full_name'])
export const DOCTOR_KEYS = new Set([
  'doctor', 'doctorFull', 'doctor_name', 'doctorName', 'doctor_full_name', 'doctor_short_name',
  'doc_name', 'head_name', 'full_name', 'fullName', 'лікар', 'завідувач',
])

// Для невідомого стану (збій читання БД) маскуємо: помилка приватності гірша за помилку відображення.
export async function isPiiMaskOn() {
  const now = Date.now()
  if (now - cache.at < CACHE_MS) return cache.on
  try {
    const { data, error } = await sb().from('app_settings').select('value').eq('key', 'pii_mask').maybeSingle()
    if (error) throw error
    cache = { at: now, on: data?.value === true }
  } catch {
    cache = { at: now, on: true }
  }
  return cache.on
}

export function setPiiMaskCache(on) { cache = { at: Date.now(), on: !!on } }

// Стабільний код замість імені: те саме ім'я завжди дає той самий код (списки й вибір лікаря не ламаються),
// а HMAC із секретом не дає відновити ім'я перебором словника прізвищ.
function code(kind, value) {
  const secret = process.env.PII_MASK_SECRET || process.env.SUPABASE_SERVICE_KEY || ''
  const h = crypto.createHmac('sha256', secret).update(`${kind}|${String(value).trim().toLowerCase()}`).digest('hex').slice(0, 6).toUpperCase()
  return `${kind === 'patient' ? 'Пацієнт' : 'Лікар'} ${h}`
}

export function maskDeep(value) {
  if (Array.isArray(value)) return value.map(maskDeep)
  if (value && typeof value === 'object') {
    // short і full одного лікаря (doctor / doctorFull) мають давати один код
    const anchor = typeof value.doctorFull === 'string' && value.doctorFull ? value.doctorFull : null
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string' && v.trim()) {
        if (PATIENT_KEYS.has(k)) { out[k] = code('patient', v); continue }
        if (DOCTOR_KEYS.has(k)) { out[k] = code('doctor', (k === 'doctor' && anchor) ? anchor : v); continue }
      }
      out[k] = maskDeep(v)
    }
    return out
  }
  return value
}

export function withPiiMask(handler) {
  return async function piiMaskedHandler(req, res) {
    if (await isPiiMaskOn()) {
      const json = res.json.bind(res)
      res.json = (body) => json(maskDeep(body))
    }
    return handler(req, res)
  }
}

// Чи сесія належить власнику сайту (app_users.is_owner) — так само, як у /api/hospitals.
export async function getSessionUser(req) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { cookies: { getAll() { return Object.entries(req.cookies || {}).map(([name, value]) => ({ name, value })) }, setAll() {} } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, owner: false }
    const { data } = await supabase.from('app_users').select('is_owner').eq('auth_user_id', user.id).single()
    return { user, owner: data?.is_owner === true }
  } catch {
    return { user: null, owner: false }
  }
}

export async function writePiiMask(on, userId) {
  const { error } = await sb().from('app_settings').upsert(
    { key: 'pii_mask', value: !!on, updated_at: new Date().toISOString(), updated_by: userId || null },
    { onConflict: 'key' }
  )
  if (error) throw error
  setPiiMaskCache(on)
}
