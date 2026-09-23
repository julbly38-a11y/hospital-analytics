import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Тренд по напрямку для хвилястого графіка (entry.js:sideStackTherap): усі
// 6 показників (hosp/pat/bed/age/imp/let), кожен розбитий на ургентні/
// планові (lpz.lpz_is_urgent_icd — та сама МКХ-класифікація, що й
// .bar-col-urgent у bar-chart.js). Один фетч на всі 6 — перемикання
// показника кліком на КПІ-плитку не вимагає повторного запиту.
// year+місяць конкретні → щоденна деталізація того місяця (той самий
// перехід рік→місяць→дні, що в lpz_trend_by_department/head-cabinet.html).
export default async function handler(req, res) {
  const org = String(req.query.org || '').trim()
  const year = String(req.query.year || 'all').trim().toLowerCase()
  const direction = String(req.query.direction || '').trim()
  const month = String(req.query.month || 'all').trim().toLowerCase()
  if (!org) return res.status(400).json({ error: 'org (ЄДРПОУ) обовʼязковий' })
  if (!direction) return res.status(400).json({ error: 'direction обовʼязковий' })

  try {
    const { data, error } = await sb()
      .schema('lpz')
      .rpc('lpz_trend_by_direction_kpi', { p_org: org, p_year: year, p_direction: direction, p_month: month })

    if (error) return res.status(500).json({ error: error.message })
    res.status(200).json({ rows: data || [] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
