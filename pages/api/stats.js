export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/rpc/execute_sql`,
      {
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
      }
    )
    const data = await r.json()
    const row = data[0]?.execute_sql?.[0] || {}
    res.status(200).json(row)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
