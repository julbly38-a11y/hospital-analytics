import { createClient } from '@supabase/supabase-js'

// Разове довантаження НОВИХ епізодів (scripts/collect_lpz_episode_facts.js,
// window.__efJson() у консолі helsi.pro) у lpz.lpz_episode_facts. На відміну
// від local-package-validation-ingest.js тут рядок ПОВНИЙ (усі NOT NULL поля
// присутні), тож звичайний upsert безпечний — не впаде на "INSERT-гілку"
// ON CONFLICT DO UPDATE, як частковий апдейт цінових полів.
// Лише для локального dev-сервера: пише сервісним ключем, на проді вимкнено.
export const config = { api: { bodyParser: { sizeLimit: '20mb' } } }

const ORGS = new Set(['43342788', '02005875'])

export default async function handler(req, res) {
  if (process.env.NODE_ENV === 'production') return res.status(404).end()
  res.setHeader('Access-Control-Allow-Origin', 'https://helsi.pro')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Private-Network', 'true')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { org, rows } = req.body || {}
  if (!ORGS.has(org) || !Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'bad payload' })

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const lpz = sb.schema('lpz')

  // Не чіпаємо рядки, де рядок УЖЕ Є (там могли прийти пізніше ціни з
  // package-validation — повний upsert обнулив би їх). Батч 200, не 500:
  // 500 UUID у .in() (GET-запит) один раз уже мовчки провалився (data
  // прийшло undefined, error не перевірявся) — тоді ВСІ 1603 рядки
  // помилково визнались "новими" і upsert стер ціни на 996 епізодах
  // (відновлено з window.__pvSlim, що ще жила в пам'яті вкладки). Тепер
  // будь-яка помилка тут — це abort, не мовчазне "вважаємо новим".
  const existing = new Set()
  const ids = rows.map(r => r.helsi_case_id).filter(Boolean)
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await lpz.from('lpz_episode_facts').select('helsi_case_id')
      .eq('org_edrpou', org).in('helsi_case_id', ids.slice(i, i + 200))
    if (error) return res.status(500).json({ error: 'existing-check failed, aborted before any write: ' + error.message, at: i })
    data.forEach(d => existing.add(d.helsi_case_id))
  }

  // Пагінація encounter_cases зі зсувом (skip) під час живих змін статусу
  // епізоду (open→closed) інколи дублює рядок — дедуплікуємо за id.
  const out = [...new Map(
    rows.filter(r => r.helsi_case_id && !existing.has(r.helsi_case_id)).map(r => [r.helsi_case_id, r])
  ).values()]

  // Звичайний insert, НЕ upsert: якщо existing-фільтр десь помилково
  // пропустив уже наявний рядок, insert впаде на unique-конфлікті (23505,
  // безпечно, нічого не пишеться), а не мовчки перезапише ціни нулями.
  let inserted = 0
  const insertErrors = []
  for (let i = 0; i < out.length; i += 500) {
    const chunk = out.slice(i, i + 500)
    const { error, count } = await lpz.from('lpz_episode_facts').insert(chunk, { count: 'exact' })
    if (error) { insertErrors.push({ at: i, error: error.message }); continue }
    inserted += count || chunk.length
  }

  res.status(200).json({
    inserted,
    skipped_existing: rows.length - out.length,
    total_received: rows.length,
    insert_errors: insertErrors,
  })
}
