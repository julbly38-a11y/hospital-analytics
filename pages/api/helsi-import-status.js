import { createServerClient } from '@supabase/ssr'

const REPO = 'julbly38-a11y/hospital-analytics'
const GH_TOKEN = process.env.GITHUB_TOKEN

// Той самий захист, що й у helsi-import-trigger: лише адміністратор. Без нього будь-хто
// з runId міг би через наш GitHub-токен читати статус запусків workflow.
async function getMe(req) {
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() { return Object.entries(req.cookies || {}).map(([name, value]) => ({ name, value })) },
      setAll() {},
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('app_users').select('role').eq('auth_user_id', user.id).single()
  return data || null
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const me = await getMe(req)
  if (!me || me.role !== 'admin') return res.status(403).json({ error: 'Тільки для адміністраторів' })

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
