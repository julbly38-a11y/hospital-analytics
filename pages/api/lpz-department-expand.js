import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Інлайн-розгортка відділення на entry.html (клік на будь-яке, не лише
// своє) — завідувач + випадків/пацієнтів/лікарів/ліжок. Публічні агреговані
// дані (без ПІБ пацієнтів), той самий рівень довіри, що й /api/lpz-kpi-department.
export default async function handler(req, res) {
  const org = String(req.query.org || '').trim()
  const department = String(req.query.department || '').trim()
  const year = String(req.query.year || 'all').trim().toLowerCase()
  if (!org) return res.status(400).json({ error: 'org (ЄДРПОУ) обовʼязковий' })
  if (!department) return res.status(400).json({ error: 'department обовʼязковий' })

  try {
    const { data, error } = await sb()
      .schema('lpz')
      .rpc('lpz_department_expand', { p_org: org, p_department: department, p_year: year })
      .single()

    if (error) return res.status(500).json({ error: error.message })
    res.status(200).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
