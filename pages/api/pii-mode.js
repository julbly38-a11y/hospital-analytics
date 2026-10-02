import { getSessionUser, isPiiMaskOn, writePiiMask } from '../../lib/pii-mask'

// GET  — стан режиму приватності (будь-який залогінений користувач; потрібен, щоб показати позначку «ПІБ приховано»).
// POST — { masked: boolean } змінити режим: ЛИШЕ власник сайту (app_users.is_owner). Режим глобальний і діє на всі ролі.
export default async function handler(req, res) {
  const { user, owner } = await getSessionUser(req)
  if (!user) return res.status(401).json({ error: 'Потрібен вхід' })

  if (req.method === 'GET') {
    return res.status(200).json({ masked: await isPiiMaskOn(), can_toggle: owner })
  }

  if (req.method === 'POST') {
    if (!owner) return res.status(403).json({ error: 'Лише власник сайту може змінювати режим' })
    const masked = req.body && req.body.masked
    if (typeof masked !== 'boolean') return res.status(400).json({ error: 'masked має бути true або false' })
    try {
      await writePiiMask(masked, user.id)
      return res.status(200).json({ masked, can_toggle: true })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).end()
}
