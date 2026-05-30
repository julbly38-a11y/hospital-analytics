import { createServerClient } from '@supabase/ssr'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  // Авторизація + перевірка ролі (реанімація = загальнолікарняні дані, не для doctor)
  try {
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
    if (!user) return res.status(401).json({ error: 'Не авторизовано' })
    const { data: appUser } = await supabase
      .from('app_users').select('role').eq('auth_user_id', user.id).single()
    if (appUser?.role === 'doctor') {
      return res.status(403).json({ error: 'Недоступно для ролі лікаря' })
    }
  } catch {
    return res.status(401).json({ error: 'Не авторизовано' })
  }

  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/execute_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify({ sql_query: `
        SELECT
          COUNT(*) AS total_admitted,
          COUNT(*) FILTER (WHERE discharge_status = 'Помер') AS died,
          ROUND(COUNT(*) FILTER (WHERE discharge_status = 'Помер') * 100.0 / COUNT(*), 1) AS icu_mortality
        FROM lsmd
        WHERE admission_department ILIKE '%анестез%'
      `})
    })
    const data = await r.json()
    let row = {}
    if (Array.isArray(data) && data.length > 0) {
      if (data[0].execute_sql !== undefined) {
        row = data[0].execute_sql?.[0] || {}
      } else {
        row = data[0]
      }
    }
    res.status(200).json(row)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
