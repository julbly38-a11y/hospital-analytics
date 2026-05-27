export default async function handler(req, res) {
  // POST з sql — для аналітики
  if (req.method === 'POST') {
    const { sql } = req.body
    if (!sql) return res.status(400).json({ error: 'No SQL' })
    try {
      const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/execute_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
        },
        body: JSON.stringify({ sql_query: sql })
      })
      const data = await r.json()
      let rows = []
      if (Array.isArray(data) && data[0]?.execute_sql !== undefined) rows = data[0].execute_sql || []
      else if (Array.isArray(data)) rows = data
      return res.status(200).json({ rows })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // GET — usage_stats для сайдбару
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
          COUNT(*) as total_requests,
          SUM(tokens_in) as total_tokens_in,
          SUM(tokens_out) as total_tokens_out,
          SUM(tokens_in + tokens_out) as total_tokens,
          SUM(cost_usd) as total_cost,
          MIN(created_at) as first_request,
          MAX(created_at) as last_request,
          COUNT(DISTINCT DATE(created_at)) as active_days
        FROM usage_stats
      `})
    })
    const data = await r.json()
    const row = data[0]?.execute_sql?.[0] || {}
    res.status(200).json(row)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
`})
      }
    )
    const data = await r.json()
    const row = data[0]?.execute_sql?.[0] || {}
    res.status(200).json(row)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
