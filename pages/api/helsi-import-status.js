const REPO = 'julbly38-a11y/hospital-analytics'
const GH_TOKEN = process.env.GITHUB_TOKEN

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { runId } = req.query
  if (!runId) return res.status(400).json({ error: 'runId required' })

  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/runs/${runId}`, {
    headers: {
      'Authorization': `Bearer ${GH_TOKEN}`,
      'Accept': 'application/vnd.github+json',
    },
  })
  if (!r.ok) return res.status(500).json({ error: await r.text() })
  const d = await r.json()

  // Логи (останній крок) — тільки якщо вже завершено
  let log = null
  if (d.status === 'completed') {
    const jobsRes = await fetch(`https://api.github.com/repos/${REPO}/actions/runs/${runId}/jobs`, {
      headers: { 'Authorization': `Bearer ${GH_TOKEN}`, 'Accept': 'application/vnd.github+json' },
    })
    const jobs = await jobsRes.json()
    const steps = jobs.jobs?.[0]?.steps || []
    const importStep = steps.find(s => s.name === 'Run import script')
    log = importStep ? `${importStep.conclusion} (${importStep.started_at} – ${importStep.completed_at})` : null
  }

  return res.status(200).json({
    status: d.status,           // queued | in_progress | completed
    conclusion: d.conclusion,   // success | failure | null
    url: d.html_url,
    log,
  })
}
