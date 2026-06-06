import { createServerClient } from '@supabase/ssr'

const esc = (s) => String(s).replace(/'/g, "''")

// Запити персонального кабінету — параметризовані doc_name визначається
// ВИКЛЮЧНО на сервері з ідентичності користувача, ніколи з клієнта.
const QUERIES = {
  summary: (doc) => `SELECT
      COUNT(*) as всього,
      COUNT(*) FILTER (WHERE discharge_status = 'Лікується') as активних,
      COUNT(*) FILTER (WHERE discharge_status = 'Помер') as померло,
      COUNT(*) FILTER (WHERE discharge_status ILIKE '%поліпшенням%') as поліпшення,
      ROUND(AVG(length_of_stay)::numeric, 1) as серед_ліжкодень,
      COUNT(*) FILTER (WHERE admission_type = 'Екстренна') as ургентних
    FROM lsmd WHERE doc_name = '${esc(doc)}'`,

  recent: (doc) => `SELECT id_case as номер, patient_name as пацієнт, admission_date as дата, admission_time as час,
      admission_department as відділення, icd_primary as діагноз, discharge_status as статус
    FROM lsmd WHERE doc_name = '${esc(doc)}'
    ORDER BY admission_date_d DESC NULLS LAST, id_case DESC LIMIT 12`,

  active: (doc) => `SELECT id_case as номер, patient_name as пацієнт, admission_date as дата,
      admission_department as відділення, icd_primary as діагноз, length_of_stay as ліжкодень
    FROM lsmd WHERE doc_name = '${esc(doc)}' AND discharge_status = 'Лікується'
    ORDER BY admission_date_d DESC NULLS LAST LIMIT 25`,

  topDiag: (doc) => `SELECT COALESCE(dd.diagnosis, dd.icd_code) as діагноз, dd.icd_code as код, dd.cases as випадків, dd.deaths as померло
    FROM doctor_diagnoses dd JOIN lsmd_doctors ld ON ld.doctor_id = dd.doctor_id
    WHERE ld.doc_name = '${esc(doc)}' ORDER BY dd.cases DESC LIMIT 6`,
}

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
    let doc_name = null, doctor_id = null, full_name = null, position = null, specialization = null, department = null
    if (appUser.empl_name_id) {
      const { data: emp } = await supabase.from('empl').select('full_name, emp_name, position, specialization, department').eq('name_id', appUser.empl_name_id).single()
      if (emp) { full_name = emp.full_name || emp.emp_name; position = emp.position; specialization = emp.specialization; department = emp.department }
      const { data: ld } = await supabase.from('lsmd_doctors').select('doctor_id, doc_name').eq('empl_name_id', appUser.empl_name_id).single()
      if (ld) { doctor_id = ld.doctor_id; doc_name = ld.doc_name }
    }
    return { role: appUser.role, doc_name, doctor_id, full_name, position, specialization, department, email: user.email }
  } catch {
    return null
  }
}

async function supaFetch(sql) {
  const r = await fetch(`${(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)}/rest/v1/rpc/execute_sql_safe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({ sql_query: sql, p_role: 'admin', p_doc_name: null }),
  })
  const data = await r.json()
  if (Array.isArray(data) && data[0]?.execute_sql !== undefined) return data[0].execute_sql || []
  if (Array.isArray(data)) return data
  return []
}

export default async function handler(req, res) {
  const me = await getMe(req)
  if (!me) return res.status(401).json({ error: 'Не авторизовано' })
  if (me.role !== 'doctor' && me.role !== 'admin') {
    return res.status(403).json({ error: 'Кабінет доступний лише лікарям' })
  }
  if (!me.doc_name) {
    return res.status(200).json({
      profile: me, summary: null, recent: [], active: [], topDiag: [],
      notice: 'Ваш обліковий запис не пов’язано з лікарем у базі lsmd_doctors — статистика недоступна.',
    })
  }

  try {
    const [summaryRows, recent, active, topDiag] = await Promise.all([
      supaFetch(QUERIES.summary(me.doc_name)),
      supaFetch(QUERIES.recent(me.doc_name)),
      supaFetch(QUERIES.active(me.doc_name)),
      supaFetch(QUERIES.topDiag(me.doc_name)),
    ])
    return res.status(200).json({
      profile: me,
      summary: summaryRows?.[0] || null,
      recent: recent || [],
      active: active || [],
      topDiag: topDiag || [],
    })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Помилка завантаження кабінету' })
  }
}
