import { createServerClient } from '@supabase/ssr'
import { IMPORT_TABLES } from '../../lib/import-config'
import {
  parseFlexibleDate, normalizeGender, normalizeAdmissionType,
  normalizeIcdCode, bestMatch, clean,
} from '../../lib/import-normalize'

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
    const { data: appUser } = await supabase.from('app_users').select('role').eq('auth_user_id', user.id).single()
    if (!appUser) return null
    return { role: appUser.role }
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

const MATCH_THRESHOLD = 0.55

async function getJSON(path) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: SERVICE_HEAD })
  if (!r.ok) throw new Error(`Запит ${path} не вдався: ${await r.text()}`)
  return r.json()
}

// Виконує PATCH-оновлення рядків staging з обмеженням паралельності.
async function patchRows(staging, updates, concurrency = 16) {
  let i = 0
  let failed = 0
  async function worker() {
    while (i < updates.length) {
      const idx = i++
      const { id, body } = updates[idx]
      const r = await fetch(`${SB}/rest/v1/${staging}?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...SERVICE_HEAD, 'Prefer': 'return=minimal' },
        body: JSON.stringify(body),
      })
      if (!r.ok) failed++
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, updates.length) }, worker)
  await Promise.all(workers)
  return failed
}

// --- Резолвери для кожної таблиці ---------------------------------------

async function resolveLsmd(rows) {
  const [departments, doctors, icdRows, statusRows] = await Promise.all([
    getJSON('departments?select=dept_name'),
    getJSON('lsmd_doctors?select=doctor_id,doc_name'),
    getJSON('icd_10?select=icd_code'),
    getJSON('lsmd?select=discharge_status&limit=2000'),
  ])
  const deptNames = departments.map(d => d.dept_name).filter(Boolean)
  const icdSet = new Set(icdRows.map(r => clean(r.icd_code).toUpperCase()))
  const statusSet = [...new Set(statusRows.map(r => r.discharge_status).filter(Boolean))]
  if (!statusSet.length) statusSet.push('Лікується', 'Виписаний', 'Переведений', 'Помер')

  const updates = []
  let resolved = 0, errors = 0, warnings = 0

  for (const row of rows) {
    const notes = []
    const body = {}
    let hasError = false

    // Стать
    const gender = normalizeGender(row.raw_gender)
    if (gender) body.resolved_gender = gender
    else if (row.raw_gender) { notes.push(`Не вдалось розпізнати стать: "${row.raw_gender}"`); warnings++ }

    // ПІБ — обовʼязково
    if (!clean(row.raw_patient_name)) { notes.push('Відсутнє ПІБ пацієнта'); hasError = true }

    // Дата госпіталізації — обовʼязково
    const admDate = parseFlexibleDate(row.raw_admission_date)
    if (admDate) body.resolved_admission_date = admDate
    else { notes.push(`Не вдалось розпізнати дату госпіталізації: "${row.raw_admission_date || ''}"`); hasError = true }

    const dchDate = parseFlexibleDate(row.raw_discharge_date)
    if (dchDate) body.resolved_discharge_date = dchDate
    if (admDate && dchDate) {
      const days = Math.round((new Date(dchDate) - new Date(admDate)) / 86400000)
      if (days >= 0) body.resolved_length_of_stay = days
    }

    // Тип госпіталізації
    const admType = normalizeAdmissionType(row.raw_admission_type)
    if (!admType && row.raw_admission_type) { notes.push(`Невідомий тип госпіталізації: "${row.raw_admission_type}"`); warnings++ }

    // Відділення (нечітке зіставлення)
    for (const [rawKey, outKey, label] of [
      ['raw_admission_department', 'resolved_admission_dept', 'відділення госпіталізації'],
      ['raw_current_department', 'resolved_current_dept', 'поточне відділення'],
      ['raw_discharge_department', 'resolved_discharge_dept', 'відділення виписки'],
    ]) {
      const raw = row[rawKey]
      if (!raw) continue
      const { match, score } = bestMatch(raw, deptNames)
      if (match && score >= MATCH_THRESHOLD) {
        body[outKey] = match
        if (score < 0.85) { notes.push(`${label}: "${raw}" → "${match}" (нечітке зіставлення, ${Math.round(score * 100)}%)`); warnings++ }
      } else {
        notes.push(`Не вдалось зіставити ${label}: "${raw}"`); warnings++
      }
    }

    // МКХ-10
    for (const [rawKey, outKey, label] of [
      ['raw_icd_primary', 'resolved_icd_primary', 'основний МКХ-10'],
      ['raw_icd_admission', 'resolved_icd_admission', 'МКХ-10 при госпіталізації'],
    ]) {
      const raw = row[rawKey]
      if (!raw) continue
      const code = normalizeIcdCode(raw)
      if (code && (icdSet.has(code) || icdSet.has(code.split('.')[0]))) {
        body[outKey] = code
      } else if (code) {
        body[outKey] = code
        notes.push(`Код ${label} "${raw}" → "${code}" відсутній у довіднику МКХ-10`); warnings++
      } else {
        notes.push(`Не вдалось розпізнати ${label}: "${raw}"`); warnings++
      }
    }

    // Лікар
    if (row.raw_doc_name) {
      const { match, score } = bestMatch(row.raw_doc_name, doctors.map(d => d.doc_name))
      if (match && score >= MATCH_THRESHOLD) {
        const doc = doctors.find(d => d.doc_name === match)
        body.resolved_doctor_id = doc?.doctor_id || null
        if (score < 0.85) { notes.push(`Лікар: "${row.raw_doc_name}" → "${match}" (${Math.round(score * 100)}%)`); warnings++ }
      } else {
        notes.push(`Не вдалось зіставити лікаря: "${row.raw_doc_name}"`); warnings++
      }
    }

    // Статус виписки
    if (row.raw_discharge_status) {
      const { match, score } = bestMatch(row.raw_discharge_status, statusSet)
      if (match && score >= MATCH_THRESHOLD) {
        body.resolved_discharge_status = match
        if (score < 0.85) { notes.push(`Статус виписки: "${row.raw_discharge_status}" → "${match}"`); warnings++ }
      } else {
        body.resolved_discharge_status = clean(row.raw_discharge_status)
        notes.push(`Незнайомий статус виписки: "${row.raw_discharge_status}" (збережено як є)`); warnings++
      }
    }

    body.notes = notes.join('; ') || null
    body.status = hasError ? 'error' : 'resolved'
    if (hasError) errors++; else resolved++
    updates.push({ id: row.id, body })
  }
  return { updates, resolved, errors, warnings }
}

async function resolvePatients(rows) {
  const [regions, districts] = await Promise.all([
    getJSON('regions?select=id,name'),
    getJSON('districts?select=id,name,region_id'),
  ])
  const regionNames = regions.map(r => r.name)
  const districtNames = districts.map(d => d.name)

  const updates = []
  let resolved = 0, errors = 0, warnings = 0

  for (const row of rows) {
    const notes = []
    const body = {}
    let hasError = false

    const gender = normalizeGender(row.raw_gender)
    if (gender) body.resolved_gender = gender
    else if (row.raw_gender) { notes.push(`Не вдалось розпізнати стать: "${row.raw_gender}"`); warnings++ }

    const fullName = clean(row.raw_full_name) || [row.raw_patient_name, row.raw_patient_prename, row.raw_parental].filter(Boolean).join(' ')
    if (!clean(fullName)) { notes.push('Відсутнє ПІБ пацієнта'); hasError = true }

    const bday = parseFlexibleDate(row.raw_birthday)
    if (bday) body.resolved_birthday = bday
    else if (row.raw_birthday) { notes.push(`Не вдалось розпізнати дату народження: "${row.raw_birthday}"`); warnings++ }

    if (row.raw_region) {
      const { match, score } = bestMatch(row.raw_region, regionNames)
      if (match && score >= MATCH_THRESHOLD) {
        body.resolved_region = match
        body.resolved_region_id = regions.find(r => r.name === match)?.id || null
        if (score < 0.85) { notes.push(`Область: "${row.raw_region}" → "${match}"`); warnings++ }
      } else { notes.push(`Не вдалось зіставити область: "${row.raw_region}"`); warnings++ }
    }

    if (row.raw_district) {
      const { match, score } = bestMatch(row.raw_district, districtNames)
      if (match && score >= MATCH_THRESHOLD) {
        body.resolved_district = match
        body.resolved_district_id = districts.find(d => d.name === match)?.id || null
        if (score < 0.85) { notes.push(`Район: "${row.raw_district}" → "${match}"`); warnings++ }
      } else { notes.push(`Не вдалось зіставити район: "${row.raw_district}"`); warnings++ }
    }

    body.notes = notes.join('; ') || null
    body.status = hasError ? 'error' : 'resolved'
    if (hasError) errors++; else resolved++
    updates.push({ id: row.id, body })
  }
  return { updates, resolved, errors, warnings }
}

async function resolveEmpl(rows) {
  const [departments, statusRows] = await Promise.all([
    getJSON('departments?select=id,dept_name'),
    getJSON('empl?select=emp_status&limit=2000'),
  ])
  const deptNames = departments.map(d => d.dept_name).filter(Boolean)
  const statusSet = [...new Set(statusRows.map(r => r.emp_status).filter(Boolean))]
  if (!statusSet.length) statusSet.push('Активний', 'Звільнений', 'У відпустці')

  const updates = []
  let resolved = 0, errors = 0, warnings = 0

  for (const row of rows) {
    const notes = []
    const body = {}
    let hasError = false

    const fullName = clean(row.raw_full_name) || clean(row.raw_emp_name)
    if (!fullName) { notes.push("Відсутнє ПІБ співробітника"); hasError = true }

    const gender = normalizeGender(row.raw_gender)
    if (gender) body.resolved_gender = gender
    else if (row.raw_gender) { notes.push(`Не вдалось розпізнати стать: "${row.raw_gender}"`); warnings++ }

    if (row.raw_position) body.resolved_position = clean(row.raw_position)

    if (row.raw_department) {
      const { match, score } = bestMatch(row.raw_department, deptNames)
      if (match && score >= MATCH_THRESHOLD) {
        body.resolved_department = match
        body.resolved_department_id = departments.find(d => d.dept_name === match)?.id || null
        if (score < 0.85) { notes.push(`Відділення: "${row.raw_department}" → "${match}"`); warnings++ }
      } else { notes.push(`Не вдалось зіставити відділення: "${row.raw_department}"`); warnings++ }
    }

    if (row.raw_status) {
      const { match, score } = bestMatch(row.raw_status, statusSet)
      if (match && score >= MATCH_THRESHOLD) {
        body.resolved_status = match
        if (score < 0.85) { notes.push(`Статус: "${row.raw_status}" → "${match}"`); warnings++ }
      } else {
        body.resolved_status = clean(row.raw_status)
        notes.push(`Незнайомий статус: "${row.raw_status}" (збережено як є)`); warnings++
      }
    }

    body.notes = notes.join('; ') || null
    body.status = hasError ? 'error' : 'resolved'
    if (hasError) errors++; else resolved++
    updates.push({ id: row.id, body })
  }
  return { updates, resolved, errors, warnings }
}

const RESOLVERS = { lsmd: resolveLsmd, patients_best: resolvePatients, empl: resolveEmpl }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const me = await getMe(req)
  if (!me || me.role !== 'admin') {
    return res.status(403).json({ error: 'Імпорт даних доступний лише адміністраторам' })
  }

  const { table, batchId } = req.body || {}
  const cfg = IMPORT_TABLES[table]
  if (!cfg) return res.status(400).json({ error: 'Невідома цільова таблиця' })
  if (!batchId) return res.status(400).json({ error: 'Не вказано batchId' })

  try {
    const rows = await getJSON(`${cfg.staging}?import_batch=eq.${encodeURIComponent(batchId)}&status=eq.pending&select=*`)
    if (!rows.length) return res.status(200).json({ ok: true, processed: 0, resolved: 0, errors: 0, warnings: 0, message: 'Немає рядків зі статусом "pending" для обробки' })

    const resolver = RESOLVERS[table]
    const { updates, resolved, errors, warnings } = await resolver(rows)
    const failed = await patchRows(cfg.staging, updates)

    await fetch(`${SB}/rest/v1/import_log?batch_id=eq.${encodeURIComponent(batchId)}`, {
      method: 'PATCH',
      headers: SERVICE_HEAD,
      body: JSON.stringify({ processed: rows.length, warnings, errors }),
    })

    return res.status(200).json({ ok: true, processed: rows.length, resolved, errors, warnings, patchFailed: failed })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Невідома помилка' })
  }
}
