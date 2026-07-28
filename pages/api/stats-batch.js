/**
 * POST /api/stats-batch
 * Body: { queries: [{ key, param? }, ...] }  (max 20 запитів)
 *
 * Виконує всі запити паралельно через існуючий /api/stats,
 * повертає { results: [rows[], rows[], ...] } у тому ж порядку.
 *
 * Клієнт робить 1 HTTP roundtrip замість N.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { queries } = req.body || {}
  if (!Array.isArray(queries) || queries.length === 0 || queries.length > 20) {
    return res.status(400).json({ error: 'queries must be an array of 1–20 items' })
  }

  // Базовий URL: визначаємо з заголовків (працює на localhost і Vercel)
  const proto = req.headers['x-forwarded-proto'] || 'http'
  const host  = req.headers.host || 'localhost:3000'
  const base  = `${proto}://${host}`

  // Прокидаємо Cookie щоб авторизовані запити (periodAdmissions тощо) пройшли перевірку
  const cookieHeader = req.headers.cookie || ''

  const results = await Promise.all(
    queries.map(({ key, param }) =>
      fetch(`${base}/api/stats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookieHeader,
        },
        body: JSON.stringify(param !== undefined ? { key, param } : { key }),
      })
        .then(r => r.json())
        .then(d => d.rows || [])
        .catch(() => [])
    )
  )

  res.status(200).json({ results })
}
