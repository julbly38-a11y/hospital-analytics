import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const REPO = 'julbly38-a11y/hospital-analytics'
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY
const GH_TOKEN = process.env.GITHUB_TOKEN

async function isOwner(req) {
  try {
    const supabase = createServerClient(SB_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll() { return Object.entries(req.cookies || {}).map(([name, value]) => ({ name, value })) },
        setAll() {},
      },
    })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const { data } = await supabase.from('app_users').select('is_owner').eq('auth_user_id', user.id).single()
    return data?.is_owner || false
  } catch { return false }
}

async function checkSupabase() {
  if (!SB_URL || !SB_SERVICE) return { ok: false, error: 'SUPABASE_SERVICE_KEY не задано в оточенні' }
  try {
    const sb = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
    const [pub, lpz] = await Promise.all([
      sb.from('empl').select('name_id', { count: 'exact', head: true }),
      sb.schema('lpz').from('lpz_organizations').select('edrpou', { count: 'exact', head: true }),
    ])
    return {
      ok: !pub.error && !lpz.error,
      url: SB_URL,
      public_schema: pub.error ? { error: pub.error.message } : { ok: true, empl_count: pub.count },
      lpz_schema: lpz.error ? { error: lpz.error.message } : { ok: true, organizations_count: lpz.count },
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

async function checkGithub() {
  if (!GH_TOKEN) return { ok: false, error: 'GITHUB_TOKEN не задано в оточенні' }
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json' },
    })
    if (!r.ok) return { ok: false, error: `GitHub API ${r.status}` }
    const d = await r.json()
    return { ok: true, repo: d.full_name, default_branch: d.default_branch, private: d.private, pushed_at: d.pushed_at }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

function checkVercel() {
  if (!process.env.VERCEL) return { ok: false, deployed_on_vercel: false, note: 'Локальний запуск (не Vercel)' }
  return {
    ok: true,
    deployed_on_vercel: true,
    env: process.env.VERCEL_ENV || null,
    url: process.env.VERCEL_URL || null,
    git_repo: process.env.VERCEL_GIT_REPO_SLUG || null,
    git_branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    git_commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
  }
}

export default async function handler(req, res) {
  const owner = await isOwner(req)
  if (!owner) return res.status(403).json({ error: 'Доступ заборонено' })

  const [supabase, github] = await Promise.all([checkSupabase(), checkGithub()])
  const vercel = checkVercel()

  res.status(200).json({ supabase, github, vercel, checked_at: new Date().toISOString() })
}
