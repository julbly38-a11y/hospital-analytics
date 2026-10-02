import { createClient } from '@supabase/supabase-js'
import { getSessionUser, isPiiMaskOn } from '../../lib/pii-mask'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Швидкий пошук для власника сайту: пацієнти й співробітники за ПІБ (кілька слів, у будь-якому порядку) або за телефоном
// (формати 050…, +38 (050)…, 380… порівнюються по цифрах). Це доступ до персональних даних, тому:
//  - лише власник (app_users.is_owner); решті 401/403;
//  - поки діє режим приватності ПІБ — вимкнено (409), інакше пошук «Іваненко» виявляв би, хто стоїть за кодом «Пацієнт 7B20DE»;
//  - запити НЕ логуються й не кешуються (Cache-Control: no-store);
//  - саме читання — SQL-функція lpz.lpz_admin_search, доступна лише service_role.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end() }

  const { user, owner } = await getSessionUser(req)
  if (!user) return res.status(401).json({ error: 'Потрібен вхід' })
  if (!owner) return res.status(403).json({ error: 'Пошук доступний лише власнику сайту' })
  if (await isPiiMaskOn()) {
    return res.status(409).json({ masked: true, error: 'Пошук за ПІБ і телефоном вимкнений, поки діє режим приватності ПІБ' })
  }

  const q = String(req.query.q || '').trim().slice(0, 80)
  const letters = q.replace(/[^\p{L}]/gu, '').length
  const digits = q.replace(/\D/g, '').length
  if (letters === 0 && digits < 5) return res.status(400).json({ error: 'Введіть щонайменше 5 цифр телефону' })
  if (letters > 0 && letters < 2) return res.status(400).json({ error: 'Введіть щонайменше 2 літери' })

  try {
    const { data, error } = await sb().schema('lpz').rpc('lpz_admin_search', { p_q: q })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
