import { createServerClient } from '@supabase/ssr'

const REPO = 'julbly38-a11y/hospital-analytics'
const WORKFLOW = 'import-helsi.yml'
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY
const GH_TOKEN = process.env.GITHUB_TOKEN
const BUCKET = 'helsi-imports'

export const config = { api: { bodyParser: false } }

async function getMe(req) {
  const supabase = createServerClient(SB_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
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

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const me = await getMe(req)
  if (!me || me.role !== 'admin') return res.status(403).json({ error: 'Тільки для адміністраторів' })

  const contentType = req.headers['content-type'] || ''
  if (!contentType.includes('application/pdf') && !contentType.includes('multipart')) {
    return res.status(400).json({ error: 'Очікується PDF-файл' })
  }

  try {
    const body = await readBody(req)
    const fileName = `${Date.now()}.pdf`

    // Завантаження у Supabase Storage
    const uploadRes = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${fileName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SB_SERVICE}`,
        'apikey': SB_SERVICE,
        'Content-Type': 'application/pdf',
      },
      body,
    })
    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      return res.status(500).json({ error: `Storage upload failed: ${err}` })
    }

    // Signed URL (дійсний 1 годину — достатньо для Action)
    const signRes = await fetch(`${SB_URL}/storage/v1/object/sign/${BUCKET}/${fileName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SB_SERVICE}`,
        'apikey': SB_SERVICE,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: 3600 }),
    })
    const { signedURL } = await signRes.json()
    const fileUrl = `${SB_URL}/storage/v1${signedURL}`

    // Тригер GitHub Actions
    const ghRes = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GH_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { file_path: fileName, file_url: fileUrl, dept: (req.query.dept || '').toString() },
      }),
    })
    if (!ghRes.ok) {
      const err = await ghRes.text()
      return res.status(500).json({ error: `GitHub dispatch failed: ${err}` })
    }

    // Невелика затримка і беремо run_id останнього запуску
    await new Promise(r => setTimeout(r, 2000))
    const runsRes = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=1`,
      { headers: { 'Authorization': `Bearer ${GH_TOKEN}`, 'Accept': 'application/vnd.github+json' } }
    )
    const runsData = await runsRes.json()
    const runId = runsData.workflow_runs?.[0]?.id || null

    return res.status(200).json({ ok: true, runId, fileName })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
