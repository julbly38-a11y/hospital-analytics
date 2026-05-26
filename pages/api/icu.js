export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
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
    res.status(200).json(data[0]?.execute_sql?.[0] || {})
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
