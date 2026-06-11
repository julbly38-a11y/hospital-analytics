import { useState, useEffect, useMemo } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { createClient } from '../lib/supabase'

const SANS = { fontFamily: 'var(--sans, "IBM Plex Sans", sans-serif)' }
const MONO = { fontFamily: 'var(--mono, "IBM Plex Mono", monospace)' }

function fmt(n) {
  if (n == null || n === '') return '—'
  const num = Number(n)
  if (isNaN(num)) return String(n)
  return num.toLocaleString('uk-UA').replace(/\s/g, ' ')
}

async function fetchStats(key, param) {
  const body = param !== undefined ? { key, param } : { key }
  const r = await fetch('/api/stats', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const d = await r.json()
  return d.rows || []
}

export default function Home() {
  const router = useRouter()
  const supabase = useMemo(() => typeof window !== 'undefined' ? createClient() : null, [])

  const [kpi, setKpi] = useState(null)
  const [depts, setDepts] = useState([])
  const [doctorCount, setDoctorCount] = useState(null)

  const [showLogin, setShowLogin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState(null)

  // Якщо вже авторизований — редирект
  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(d => {
      if (d?.role && d.role !== 'viewer') redirectByRole(d.role)
    }).catch(() => {})
  }, [])

  // Публічні дані
  useEffect(() => {
    fetchStats('ovKpiYear', 'all').then(rows => setKpi(rows[0] || null))
    fetchStats('wDept').then(rows => setDepts(rows))
    fetchStats('orgDocs').then(rows => setDoctorCount(rows.length))
  }, [])

  function redirectByRole(role) {
    if (role === 'admin') router.push('/org')
    else if (role === 'head_dept') router.push('/dept')
    else if (role === 'doctor') router.push('/cabinet')
    else router.push('/org')
  }

  async function handleLogin(e) {
    e.preventDefault()
    if (!supabase) return
    setLoginLoading(true)
    setLoginError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setLoginError('Невірний логін або пароль')
      setLoginLoading(false)
      return
    }
    const d = await fetch('/api/me').then(r => r.json()).catch(() => ({}))
    setLoginLoading(false)
    redirectByRole(d?.role)
  }

  const year = new Date().getFullYear()

  return (
    <>
      <Head>
        <title>ЛСМД — Хотинська багатопрофільна лікарня</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap" rel="stylesheet" />
      </Head>

      <div style={{
        minHeight: '100vh', display: 'flex',
        background: '#f5f3f0',
      }}>

        {/* ── ЛІВА КОЛОНКА ── */}
        <div style={{
          width: 480, flexShrink: 0,
          borderRight: '1px solid rgba(0,0,0,0.08)',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(255,255,255,0.55)',
          backdropFilter: 'blur(12px)',
        }}>

          {/* Лого + назва */}
          <div style={{ padding: '40px 48px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 0 }}>
              {/* SVG хрест */}
              <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
                <circle cx="36" cy="36" r="36" fill="rgba(180,60,60,0.08)" />
                <path d="M36 14 L36 58 M14 36 L58 36" stroke="#b43c3c" strokeWidth="7" strokeLinecap="round" />
                <path d="M22 22 Q36 10 50 22 Q62 36 50 50 Q36 62 22 50 Q10 36 22 22Z"
                  fill="rgba(80,130,90,0.12)" stroke="rgba(80,130,90,0.3)" strokeWidth="1" />
              </svg>
              <div>
                <div style={{ fontSize: 17, fontWeight: 500, color: '#1a1a1a', lineHeight: 1.35, letterSpacing: '0.04em', ...SANS }}>
                  ХОТИНСЬКА<br />БАГАТОПРОФІЛЬНА<br />ЛІКАРНЯ
                </div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 6, fontStyle: 'italic', ...SANS }}>
                  турбуємось про найцінніше
                </div>
              </div>
            </div>
          </div>

          {/* Список відділень */}
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>
            {depts.map((d, i) => (
              <div key={i} style={{
                padding: '8px 48px',
                fontSize: 14, color: '#333', ...SANS,
                textAlign: 'right',
                lineHeight: 1.5,
              }}>
                {d.відділення}
              </div>
            ))}

            {/* Для працівників */}
            <div style={{ margin: '24px 48px 0', borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 20 }}>
              <button
                onClick={() => { setShowLogin(!showLogin); setLoginError(null) }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 15, fontWeight: 500, color: '#333',
                  ...SANS, padding: 0, display: 'block', width: '100%',
                  textAlign: 'right', marginBottom: showLogin ? 16 : 0,
                  letterSpacing: '0.01em',
                }}
              >
                Для працівників:
              </button>

              {/* Форма логіну */}
              {showLogin && (
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    style={{
                      padding: '10px 14px', border: '1px solid rgba(0,0,0,0.15)',
                      borderRadius: 8, fontSize: 13, ...SANS,
                      background: 'rgba(255,255,255,0.8)', color: '#1a1a1a',
                      outline: 'none',
                    }}
                  />
                  <input
                    type="password"
                    placeholder="Пароль"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    style={{
                      padding: '10px 14px', border: '1px solid rgba(0,0,0,0.15)',
                      borderRadius: 8, fontSize: 13, ...SANS,
                      background: 'rgba(255,255,255,0.8)', color: '#1a1a1a',
                      outline: 'none',
                    }}
                  />
                  {loginError && (
                    <div style={{ fontSize: 11, color: '#c0392b', ...SANS }}>{loginError}</div>
                  )}
                  <button
                    type="submit"
                    disabled={loginLoading}
                    style={{
                      padding: '10px 14px', background: '#1a1a1a',
                      border: 'none', borderRadius: 8,
                      color: '#fff', fontSize: 13, ...SANS,
                      cursor: loginLoading ? 'not-allowed' : 'pointer',
                      opacity: loginLoading ? 0.6 : 1,
                      marginTop: 2,
                    }}
                  >
                    {loginLoading ? 'Вхід…' : 'Увійти →'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* ── ПРАВА ЧАСТИНА — градієнт + статистика ── */}
        <div style={{
          flex: 1, position: 'relative',
          background: 'linear-gradient(135deg, #dce8f0 0%, #e8dce8 35%, #f0e8dc 60%, #dce8e0 100%)',
          display: 'flex', flexDirection: 'column',
        }}>

          {/* Статистика вгорі */}
          <div style={{
            display: 'flex', alignItems: 'flex-start',
            padding: '40px 60px 0',
            gap: 48, flexWrap: 'wrap',
          }}>
            <Stat value={kpi ? fmt(kpi.total_cases) : '…'} label="ГОСПІТАЛІЗАЦІЙ" />
            <Stat value={kpi ? fmt(kpi.unique_patients) : '…'} label="ПАЦІЄНТІВ" />
            <Stat value={doctorCount != null ? fmt(doctorCount) : '…'} label="ЛІКАРІВ" />
            <Stat value={depts.length || '…'} label="ВІДДІЛЕНЬ" />
            <Stat value={String(year)} label="" large />
          </div>

          {/* Декоративне коло */}
          <div style={{
            position: 'absolute', bottom: -120, right: -120,
            width: 500, height: 500, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', top: '30%', left: '20%',
            width: 300, height: 300, borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)',
            pointerEvents: 'none',
          }} />
        </div>
      </div>
    </>
  )
}

function Stat({ value, label, large }) {
  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{
        fontSize: large ? 64 : 42, fontWeight: 300,
        color: '#1a1a1a', ...MONO,
        lineHeight: 1, letterSpacing: '-0.02em',
      }}>
        {value}
      </div>
      {label && (
        <div style={{
          fontSize: 10, color: '#666', textTransform: 'uppercase',
          letterSpacing: '0.12em', marginTop: 6, ...MONO,
        }}>
          {label}
        </div>
      )}
    </div>
  )
}
