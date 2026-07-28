import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

async function getRole(req) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { cookies: { getAll() { return Object.entries(req.cookies || {}).map(([name, value]) => ({ name, value })) }, setAll() {} } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase.from('app_users').select('role').eq('auth_user_id', user.id).single()
    return data?.role || null
  } catch { return null }
}

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export default async function handler(req, res) {
  const role = await getRole(req)
  if (role !== 'admin') return res.status(403).json({ error: 'Доступ заборонено' })

  const sb = admin()

  // GET — список всіх користувачів
  if (req.method === 'GET') {
    const { data: authUsers } = await sb.auth.admin.listUsers({ perPage: 500 })
    const { data: appUsers } = await sb.from('app_users').select('auth_user_id, role, empl_name_id')
    const { data: empl } = await sb.from('empl').select('name_id, emp_name, full_name, position, department').eq('emp_status', null).or('emp_status.is.null,emp_status.neq.звільнений')

    const appMap = Object.fromEntries((appUsers || []).map(u => [u.auth_user_id, u]))

    const users = (authUsers?.users || []).map(u => {
      const app = appMap[u.id] || {}
      const emp = (empl || []).find(e => e.name_id === app.empl_name_id)
      return {
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        role: app.role || null,
        empl_name_id: app.empl_name_id || null,
        emp_name: emp?.emp_name || null,
        position: emp?.position || null,
        department: emp?.department || null,
      }
    })

    return res.status(200).json({ users, empl: empl || [] })
  }

  // POST — призначити/змінити роль
  if (req.method === 'POST') {
    const { auth_user_id, role: newRole, empl_name_id } = req.body || {}
    if (!auth_user_id || !newRole) return res.status(400).json({ error: 'Невірні дані' })
    if (!['admin', 'head_dept', 'doctor', 'viewer'].includes(newRole)) return res.status(400).json({ error: 'Невідома роль' })

    const { error } = await sb.from('app_users').upsert({
      auth_user_id,
      role: newRole,
      empl_name_id: empl_name_id || null,
    }, { onConflict: 'auth_user_id' })

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  // DELETE — видалити роль (скинути до viewer)
  if (req.method === 'DELETE') {
    const { auth_user_id } = req.body || {}
    if (!auth_user_id) return res.status(400).json({ error: 'Невірні дані' })
    const { error } = await sb.from('app_users').delete().eq('auth_user_id', auth_user_id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  res.status(405).end()
}
