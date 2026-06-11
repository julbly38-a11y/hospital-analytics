import { createServerClient } from '@supabase/ssr'
import { IMPORT_TABLES } from '../../lib/import-config'
import { isoToDmy, clean, normalizeAdmissionType } from '../../lib/import-normalize'

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

async function getJSON(path) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: SERVICE_HEAD })
  if (!r.ok) throw new Error(`Запит ${path} не вдався: ${await r.text()}`)
  return r.json()
}

async function nextId(table, idCol) {
  const arr = await getJSON(`${table}?select=${idCol}&order=${idCol}.desc&limit=1`)
  return (Array.isArray(arr) && arr[0]?.[idCol] ? Number(arr[0][idCol]) : 0) + 1
}

async function insertOne(table, body) {
  const r = await fetch(`${SB}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...SERVICE_HEAD, 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await r.text())
  const arr = await r.json()
  return arr[0]
}

async function patchStaging(staging, id, body) {
  await fetch(`${SB}/rest/v1/${staging}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...SERVICE_HEAD, 'Prefer': 'return=minimal' },
    body: JSON.stringify(body),
  })
}

// --- lsmd ----------------------------------------------------------------

async function commitLsmd(rows, staging) {
  let id = await nextId('lsmd', 'id_case')
  let inserted = 0, errors = 0

  for (const row of rows) {
    try {
      const admIso = row.resolved_admission_date
      const dchIso = row.resolved_discharge_date
      const birthIso = null // народження не парситься в lsmd-резолвері; зберігаємо сирий рядок

      const body = {
        id_case: id,
        patient_name: clean(row.raw_patient_name),
        gender: row.resolved_gender || null,
        phone_number: clean(row.raw_phone),
        admission_type: normalizeAdmissionType(row.raw_admission_type) || clean(row.raw_admission_type),
        admission_date: admIso ? isoToDmy(admIso) : clean(row.raw_admission_date),
        admission_date_d: admIso || null,
        discharge_date: dchIso ? isoToDmy(dchIso) : clean(row.raw_discharge_date),
        discharge_date_d: dchIso || null,
        birth_date: clean(row.raw_birth_date),
        birth_date_d: birthIso,
        age: clean(row.raw_age),
        address: clean(row.raw_address),
        admission_department: row.resolved_admission_dept || clean(row.raw_admission_department),
        current_department: row.resolved_current_dept || clean(row.raw_current_department),
        discharge_department: row.resolved_discharge_dept || clean(row.raw_discharge_department),
        icd_admission: row.resolved_icd_admission || clean(row.raw_icd_admission),
        icd_primary: row.resolved_icd_primary || clean(row.raw_icd_primary),
        doc_name: clean(row.raw_doc_name),
        doctor_id: row.resolved_doctor_id || null,
        discharge_status: row.resolved_discharge_status || clean(row.raw_discharge_status),
        operation: clean(row.raw_operation),
        referral: clean(row.raw_referral),
        referral_status: clean(row.raw_referral_status),
        length_of_stay: row.resolved_length_of_stay ?? null,
        patient_id: row.resolved_patient_id || null,
      }

      await insertOne('lsmd', body)
      await patchStaging(staging, row.id, { status: 'inserted', lsmd_id_case: id, notes: row.notes })
      inserted++
      id++
    } catch (e) {
      await patchStaging(staging, row.id, { status: 'error', notes: `${row.notes ? row.notes + '; ' : ''}Помилка вставки: ${e.message}` })
      errors++
    }
  }
  return { inserted, errors }
}

// --- patients_best --------------------------------------------------------

async function findExistingPatient(row) {
  const fullName = clean(row.raw_full_name) || [row.raw_patient_name, row.raw_patient_prename, row.raw_parental].filter(Boolean).map(clean).join(' ')
  if (!fullName) return null
  const candidates = await getJSON(`patients_best?select=patient_id,full_name,birthday&full_name=ilike.${encodeURIComponent(fullName)}`)
  if (!candidates.length) return null
  if (row.resolved_birthday) {
    const dmy = isoToDmy(row.resolved_birthday)
    const match = candidates.find(c => c.birthday === dmy || c.birthday === row.resolved_birthday)
    if (match) return match.patient_id
  }
  return candidates[0].patient_id
}

async function commitPatients(rows, staging) {
  let id = await nextId('patients_best', 'patient_id')
  let inserted = 0, linked = 0, errors = 0

  for (const row of rows) {
    try {
      const existingId = await findExistingPatient(row)
      if (existingId) {
        await patchStaging(staging, row.id, { status: 'inserted', patient_id: existingId, notes: `${row.notes ? row.notes + '; ' : ''}Знайдено існуючого пацієнта (id=${existingId}), нового запису не створено` })
        linked++
        continue
      }

      const fullName = clean(row.raw_full_name) || [row.raw_patient_name, row.raw_patient_prename, row.raw_parental].filter(Boolean).map(clean).join(' ')
      const body = {
        patient_id: id,
        full_name: fullName || null,
        patient_name: clean(row.raw_patient_name),
        patient_prename: clean(row.raw_patient_prename),
        parental: clean(row.raw_parental),
        gender: row.resolved_gender || null,
        birthday: row.resolved_birthday ? isoToDmy(row.resolved_birthday) : clean(row.raw_birthday),
        age: row.raw_age ? Number(clean(row.raw_age)) || null : null,
        phone_num: clean(row.raw_phone),
        address: clean(row.raw_address),
        locality: clean(row.raw_locality),
        city_name: clean(row.raw_city_name),
        district: row.resolved_district || clean(row.raw_district),
        district_id: row.resolved_district_id || null,
        region: row.resolved_region || clean(row.raw_region),
        region_id: row.resolved_region_id || null,
        patient_nationality: clean(row.raw_nationality),
        category: clean(row.raw_category),
      }

      await insertOne('patients_best', body)
      await patchStaging(staging, row.id, { status: 'inserted', patient_id: id, notes: row.notes })
      inserted++
      id++
    } catch (e) {
      await patchStaging(staging, row.id, { status: 'error', notes: `${row.notes ? row.notes + '; ' : ''}Помилка вставки: ${e.message}` })
      errors++
    }
  }
  return { inserted, linked, errors }
}

// --- empl ------------------------------------------------------------------

async function commitEmpl(rows, staging) {
  let id = await nextId('empl', 'name_id')
  let inserted = 0, errors = 0

  for (const row of rows) {
    try {
      const fullName = clean(row.raw_full_name) || clean(row.raw_emp_name)
      const body = {
        name_id: id,
        emp_name: clean(row.raw_emp_name) || fullName,
        full_name: fullName || null,
        gender_id: row.resolved_gender || null,
        emp_birthday: clean(row.raw_birthday),
        specialization: clean(row.raw_specialization),
        emp_phone: row.raw_phone ? Number(clean(row.raw_phone).replace(/\D/g, '')) || null : null,
        eh_empr_doc_numb: clean(row.raw_taxid),
        department: row.resolved_department || clean(row.raw_department),
        department_id: row.resolved_department_id || null,
        position: row.resolved_position || clean(row.raw_position),
        emp_status: row.resolved_status || clean(row.raw_status),
        is_clinical: false,
      }

      await insertOne('empl', body)
      await patchStaging(staging, row.id, { status: 'inserted', empl_name_id: id, notes: row.notes })
      inserted++
      id++
    } catch (e) {
      await patchStaging(staging, row.id, { status: 'error', notes: `${row.notes ? row.notes + '; ' : ''}Помилка вставки: ${e.message}` })
      errors++
    }
  }
  return { inserted, errors }
}

const COMMITTERS = { lsmd: commitLsmd, patients_best: commitPatients, empl: commitEmpl }

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
    const rows = await getJSON(`${cfg.staging}?import_batch=eq.${encodeURIComponent(batchId)}&status=eq.resolved&select=*`)
    if (!rows.length) {
      return res.status(200).json({ ok: true, inserted: 0, errors: 0, message: 'Немає рядків зі статусом "resolved" для запису' })
    }

    const committer = COMMITTERS[table]
    const result = await committer(rows, cfg.staging)

    const errRows = await getJSON(`${cfg.staging}?import_batch=eq.${encodeURIComponent(batchId)}&select=status`)
    const counts = errRows.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc }, {})

    await fetch(`${SB}/rest/v1/import_log?batch_id=eq.${encodeURIComponent(batchId)}`, {
      method: 'PATCH',
      headers: SERVICE_HEAD,
      body: JSON.stringify({
        inserted: counts.inserted || 0,
        errors: counts.error || 0,
        status: (counts.pending || 0) === 0 ? 'completed' : 'partial',
        finished_at: new Date().toISOString(),
      }),
    })

    return res.status(200).json({ ok: true, ...result, counts })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Невідома помилка' })
  }
}
