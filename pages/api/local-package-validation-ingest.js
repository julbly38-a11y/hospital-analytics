import { createClient } from '@supabase/supabase-js'

// Разове перенесення результатів package-validation (scripts/collect_package_validation.js,
// window.__pvSlimJson() у консолі helsi.pro) у lpz.lpz_episode_facts. Оновлює
// ЛИШЕ цінові поля (upsert лише цими колонками — інші сирі факти епізоду не
// чіпає, бо PostgREST merge-duplicates оновлює тільки надіслані колонки).
// Лише для локального dev-сервера: пише сервісним ключем, на проді вимкнено.
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

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

  // Звичайний UPDATE, не upsert: Postgres перевіряє NOT NULL-колонки
  // (admission_at тощо) для гілки INSERT в "INSERT ... ON CONFLICT DO
  // UPDATE" ще до перевірки самого конфлікту — тож частковий upsert falls
  // through на NOT NULL, навіть якщо рядок точно вже існує. Прямий UPDATE
  // цієї проблеми не має і на неіснуючих id просто нічого не міняє (count=0).
  let updated = 0, notFound = 0
  const CONCURRENCY = 15
  const items = rows.filter(r => r.helsi_case_id)
  let cursor = 0
  const worker = async () => {
    while (cursor < items.length) {
      const r = items[cursor++]
      const patch = {
        package_number: r.package_number ?? null,
        package_name: r.package_name ?? null,
        dsg_code: r.dsg_code ?? null,
        dsg_name: r.dsg_name ?? null,
        validation_success: r.validation_success ?? null,
        // info — рекомендації пакета (з collect_package_validation.js: info_messages);
        // лежить у тому самому jsonb, без зміни схеми. Якщо збирач його не передав —
        // ключа немає (не затираємо нулем).
        validation_messages: r.fin_messages
          ? { messages: r.fin_messages, error: r.error || null, skipped: r.skipped || null, ...(r.info_messages ? { info: r.info_messages } : {}) }
          : (r.error ? { error: r.error } : (r.skipped ? { skipped: r.skipped } : null)),
        dsg_coefficient: r.dsg_coefficient ?? null,
        price: r.price ?? null,
        adjustment_coefficient: r.adjustment_coefficient ?? null,
        adjustment_price: r.adjustment_price ?? null,
      }
      const { data, error } = await lpz.from('lpz_episode_facts')
        .update(patch).eq('org_edrpou', org).eq('helsi_case_id', r.helsi_case_id).select('id')
      if (error) { notFound++; continue }
      if (data && data.length) updated++; else notFound++
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  res.status(200).json({
    updated,
    not_found_in_db: notFound,
    with_price: items.filter(o => o.validation_success).length,
    failed: items.filter(o => o.validation_success === false).length,
  })
}
