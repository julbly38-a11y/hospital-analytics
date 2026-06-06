import { createServerClient } from '@supabase/ssr'

// Визначає роль і лікарську ідентичність поточного користувача
async function getMe(req) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { cookies: {
        getAll() { return Object.entries(req.cookies || {}).map(([name, value]) => ({ name, value })) },
        setAll() {},
      } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: appUser } = await supabase.from('app_users').select('role, empl_name_id').eq('auth_user_id', user.id).single()
    if (!appUser) return null
    let doc_name = null, doctor_id = null
    if (appUser.empl_name_id) {
      const { data: ld } = await supabase.from('lsmd_doctors').select('doctor_id, doc_name').eq('empl_name_id', appUser.empl_name_id).single()
      if (ld) { doctor_id = ld.doctor_id; doc_name = ld.doc_name }
    }
    return { role: appUser.role, doc_name, doctor_id }
  } catch {
    return null
  }
}

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_HEAD = {
  'Content-Type': 'application/json',
  'apikey': process.env.SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
}

const DEPARTMENTS = new Set([
  'Відділення анестезіології з ліжками інтенсивної терапії',
  'Гастроентерологічне відділення',
  'Гематологічне відділення',
  'Нейрохірургічне відділення',
  'Опікове відділення',
  'Терапевтичне відділення №1',
  'Терапевтичне відділення №2',
  'Травматологічне відділення для дітей',
  'Травматологічне відділення для дорослих',
  'Урологічне відділення',
  'Хірургічне відділення №1',
  'Хірургічне відділення №2',
  'Центр невідкладної неврології',
])

const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/
const TIME_RE = /^\d{2}:\d{2}$/

function validate(b) {
  if (!b.patient_name || !String(b.patient_name).trim()) return "Вкажіть ПІБ пацієнта"
  if (b.gender !== 'Ч' && b.gender !== 'Ж') return "Невірне значення статі"
  if (!DATE_RE.test(b.birth_date || '')) return "Дата народження має бути у форматі ДД.ММ.РРРР"
  if (!DATE_RE.test(b.admission_date || '')) return "Дата госпіталізації має бути у форматі ДД.ММ.РРРР"
  if (!TIME_RE.test(b.admission_time || '')) return "Час госпіталізації має бути у форматі ГГ:ХХ"
  if (b.admission_type !== 'Екстренна' && b.admission_type !== 'Планова') return "Невірний тип госпіталізації"
  if (!DEPARTMENTS.has(b.admission_department)) return "Невірне відділення госпіталізації"
  if (!b.icd_primary || !/^[A-Z][0-9]{2}/.test(String(b.icd_primary).trim())) return "Вкажіть коректний код МКХ-10"
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const me = await getMe(req)
  if (!me || (me.role !== 'doctor' && me.role !== 'admin')) {
    return res.status(403).json({ error: 'Реєструвати госпіталізації можуть лише лікарі та адміністратори' })
  }

  const b = req.body || {}
  const err = validate(b)
  if (err) return res.status(400).json({ error: err })

  try {
    // Наступний id_case (немає sequence/default — рахуємо вручну)
    const r1 = await fetch(`${SB}/rest/v1/lsmd?select=id_case&order=id_case.desc&limit=1`, { headers: SERVICE_HEAD })
    if (!r1.ok) throw new Error('Не вдалося визначити номер випадку')
    const arr = await r1.json()
    const nextId = (Array.isArray(arr) && arr[0]?.id_case ? Number(arr[0].id_case) : 0) + 1

    const row = {
      id_case: nextId,
      patient_name: String(b.patient_name).trim(),
      gender: b.gender,
      age: b.age ? String(b.age).trim() : null,
      birth_date: b.birth_date,
      phone_number: b.phone_number ? String(b.phone_number).trim() : null,
      address: b.address ? String(b.address).trim() : null,
      admission_type: b.admission_type,
      admission_date: b.admission_date,
      admission_time: b.admission_time,
      admission_department: b.admission_department,
      current_department: b.admission_department,
      icd_admission: String(b.icd_primary).trim(),
      icd_primary: String(b.icd_primary).trim(),
      doc_name: me.doc_name || null,
      doctor_id: me.doctor_id || null,
      discharge_status: 'Лікується',
    }

    const r2 = await fetch(`${SB}/rest/v1/lsmd`, {
      method: 'POST',
      headers: { ...SERVICE_HEAD, 'Prefer': 'return=representation' },
      body: JSON.stringify(row),
    })
    if (!r2.ok) {
      const t = await r2.text()
      return res.status(500).json({ error: 'Помилка запису в базу: ' + t })
    }
    const inserted = await r2.json()
    return res.status(200).json({ ok: true, case: (Array.isArray(inserted) && inserted[0]) || row })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Невідома помилка' })
  }
}
