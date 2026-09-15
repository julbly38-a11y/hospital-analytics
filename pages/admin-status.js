import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

const SANS = { fontFamily: '"IBM Plex Sans", sans-serif' }
const MONO = { fontFamily: '"IBM Plex Mono", monospace' }

function Dot({ ok }) {
  return (
    <span style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      background: ok ? '#4a9870' : '#c0392b', marginRight: 8,
    }} />
  )
}

function Row({ label, value }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', fontSize: 13, ...MONO }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ color: '#1a1a1a', textAlign: 'right', wordBreak: 'break-all' }}>{String(value)}</span>
    </div>
  )
}

function Card({ title, ok, error, children }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(0,0,0,0.08)',
      borderTop: `3px solid ${ok ? '#4a9870' : '#c0392b'}`, borderRadius: 10,
      padding: '16px 20px', minWidth: 280, flex: '1 1 280px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 600, marginBottom: 10, ...SANS }}>
        <Dot ok={ok} />
        {title}
      </div>
      {error && <div style={{ color: '#c0392b', fontSize: 13, marginBottom: 6, ...MONO }}>{error}</div>}
      {children}
    </div>
  )
}

export default function AdminStatus() {
  const router = useRouter()
  const [status, setStatus] = useState(null)
  const [err, setErr] = useState(null)
  const [allowed, setAllowed] = useState(null)

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(me => {
      if (!me.is_owner) { router.replace('/'); return }
      setAllowed(true)
    })
  }, [router])

  useEffect(() => {
    if (!allowed) return
    fetch('/api/admin-status').then(r => {
      if (!r.ok) throw new Error('status ' + r.status)
      return r.json()
    }).then(setStatus).catch(e => setErr(e.message))
  }, [allowed])

  if (!allowed) return null

  return (
    <>
      <Head><title>Статус підключень — адмін</title></Head>
      <div style={{ minHeight: '100vh', background: '#f0ece8', padding: '40px 32px', ...SANS }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4, color: '#1a1a1a' }}>Статус підключень</h1>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 24, ...MONO }}>
          {status ? `перевірено: ${new Date(status.checked_at).toLocaleString('uk')}` : 'перевіряю…'}
        </div>

        {err && <div style={{ color: '#c0392b' }}>{err}</div>}

        {status && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <Card title="Supabase" ok={status.supabase.ok} error={status.supabase.error}>
              <Row label="URL" value={status.supabase.url} />
              <Row label="public.empl" value={status.supabase.public_schema?.error ? `помилка: ${status.supabase.public_schema.error}` : `${status.supabase.public_schema?.empl_count ?? '—'} рядків`} />
              <Row label="lpz.organizations" value={status.supabase.lpz_schema?.error ? `помилка: ${status.supabase.lpz_schema.error}` : `${status.supabase.lpz_schema?.organizations_count ?? '—'} рядків`} />
            </Card>

            <Card title="GitHub" ok={status.github.ok} error={status.github.error}>
              <Row label="repo" value={status.github.repo} />
              <Row label="гілка за замовч." value={status.github.default_branch} />
              <Row label="private" value={status.github.private != null ? String(status.github.private) : null} />
              <Row label="останній push" value={status.github.pushed_at && new Date(status.github.pushed_at).toLocaleString('uk')} />
            </Card>

            <Card title="Vercel" ok={status.vercel.ok} error={status.vercel.error}>
              <Row label="середовище" value={status.vercel.env} />
              <Row label="url" value={status.vercel.url} />
              <Row label="repo" value={status.vercel.git_repo} />
              <Row label="гілка" value={status.vercel.git_branch} />
              <Row label="commit" value={status.vercel.git_commit && status.vercel.git_commit.slice(0, 8)} />
              <Row label="примітка" value={status.vercel.note} />
            </Card>
          </div>
        )}
      </div>
    </>
  )
}
