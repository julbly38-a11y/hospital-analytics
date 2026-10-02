import { createClient } from '@supabase/supabase-js'
import { withPiiMask } from '../../lib/pii-mask'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Ординаторська — лікарі відділення (ПІБ+посада, без кейсів пацієнтів,
// тому той самий рівень довіри, що й /api/lpz-kpi-department: org+department
// клієнтським параметром, без звірки з сесією).
async function handler(req, res) {
  const org = String(req.query.org || '').trim()
  const department = String(req.query.department || '').trim()
  if (!org) return res.status(400).json({ error: 'org (ЄДРПОУ) обовʼязковий' })
  if (!department) return res.status(400).json({ error: 'department обовʼязковий' })

  try {
    const { data, error } = await sb()
      .schema('lpz')
      .rpc('lpz_department_staff', { p_org: org, p_department: department })

    if (error) return res.status(500).json({ error: error.message })
    res.status(200).json({ rows: data || [] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}

// Режим приватності (public.app_settings.pii_mask): коли ввімкнено, ПІБ у відповіді замінюються кодами для ВСІХ ролей.
export default withPiiMask(handler)
