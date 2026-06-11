import { useState, useEffect, useMemo } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { createClient } from '../lib/supabase'

const SANS = { fontFamily: '"IBM Plex Sans", sans-serif' }
const MONO = { fontFamily: '"IBM Plex Mono", monospace' }

const THERAPEUTIC = [
  'Терапевтичне відділення №1',
  'Гематологічне відділення',
  'Терапевтичне відділення №2',
  'Гастроентерологічне відділення',
  'Центр невідкладної неврології',
  'Відділення анестезіології з ліжками інтенсивної терапії',
]

const SURGICAL = [
  'Опікове відділення',
  'Травматологічне відділення для дітей',
  'Травматологічне відділення для дорослих',
  'Нейрохірургічне відділення',
  'Урологічне відділення',
  'Хірургічне відділення №2',
  'Хірургічне відділення №1',
]

function fmt(n) {
  if (n == null || n === '') return '—'
  const num = Number(n)
  if (isNaN(num)) return String(n)
  return num.toLocaleString('uk-UA')
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
  const [doctorCount, setDoctorCount] = useState(null)
  const [deptCount, setDeptCount] = useState(13)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState(null)

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(d => {
      if (d?.role && d.role !== 'viewer') redirectByRole(d.role)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetchStats('ovKpiYear', 'all').then(rows => setKpi(rows[0] || null))
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

      <div style={{ minHeight: '100vh', display: 'flex', background: '#eeeae4' }}>

        {/* ── ЛІВА КОЛОНКА ── */}
        <div style={{
          width: 480, flexShrink: 0,
          borderRight: '1px solid rgba(0,0,0,0.1)',
          background: 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(16px)',
          display: 'flex', flexDirection: 'column',
        }}>

          {/* Лого + назва */}
          <div style={{ padding: '32px 40px 28px', display: 'flex', alignItems: 'center', gap: 18 }}>
            <img src="/logo.png" alt="ЛСМД" style={{ width: 72, height: 72, objectFit: 'contain' }}
              onError={e => { e.target.style.display = 'none' }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a', lineHeight: 1.4, letterSpacing: '0.05em', ...SANS }}>
                ХОТИНСЬКА<br />БАГАТОПРОФІЛЬНА<br />ЛІКАРНЯ
              </div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 5, fontStyle: 'italic', ...SANS }}>
                турбуємось про найцінніше
              </div>
            </div>
          </div>

          {/* Терапевтичний блок */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {THERAPEUTIC.map((d, i) => (
              <div key={i} style={{
                padding: '7px 40px', fontSize: 14, color: '#333',
                textAlign: 'right', lineHeight: 1.5, ...SANS,
              }}>
                {d}
              </div>
            ))}
          </div>

          {/* ── СМУЖКА "Для працівників:" + логін ── */}
          <div style={{
            background: 'rgba(0,0,0,0.04)',
            borderTop: '1px solid rgba(0,0,0,0.08)',
            borderBottom: '1px solid rgba(0,0,0,0.08)',
            padding: '10px 20px 10px 16px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{
              fontSize: 13, fontWeight: 600, color: '#444',
              whiteSpace: 'nowrap', flexShrink: 0, ...SANS,
            }}>
              Для працівників:
            </span>

            <form onSubmit={handleLogin} style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => { setEmail(e.target.value); setLoginError(null) }}
                required
                style={{
                  flex: 1, minWidth: 0, padding: '6px 10px',
                  border: loginError ? '1px solid #c0392b' : '1px solid rgba(0,0,0,0.15)',
                  borderRadius: 6, fontSize: 12, ...SANS,
                  background: 'rgba(255,255,255,0.9)', color: '#1a1a1a',
                  outline: 'none',
                }}
              />
              <input
                type="password"
                placeholder="Пароль"
                value={password}
                onChange={e => { setPassword(e.target.value); setLoginError(null) }}
                required
                style={{
                  flex: 1, minWidth: 0, padding: '6px 10px',
                  border: loginError ? '1px solid #c0392b' : '1px solid rgba(0,0,0,0.15)',
                  borderRadius: 6, fontSize: 12, ...SANS,
                  background: 'rgba(255,255,255,0.9)', color: '#1a1a1a',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={loginLoading}
                style={{
                  padding: '6px 14px', background: '#1a1a1a',
                  border: 'none', borderRadius: 6,
                  color: '#fff', fontSize: 12, ...SANS,
                  cursor: loginLoading ? 'not-allowed' : 'pointer',
                  opacity: loginLoading ? 0.6 : 1, whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                {loginLoading ? '…' : 'Увійти →'}
              </button>
            </form>
          </div>

          {loginError && (
            <div style={{
              padding: '4px 20px 6px', fontSize: 11, color: '#c0392b', ...SANS,
              background: 'rgba(192,57,43,0.06)',
            }}>
              {loginError}
            </div>
          )}

          {/* Хірургічний блок */}
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 32 }}>
            {SURGICAL.map((d, i) => (
              <div key={i} style={{
                padding: '7px 40px', fontSize: 14, color: '#333',
                textAlign: 'right', lineHeight: 1.5, ...SANS,
              }}>
                {d}
              </div>
            ))}
          </div>
        </div>

        {/* ── ПРАВА ЧАСТИНА — градієнт + статистика ── */}
        <div style={{
          flex: 1,
          background: 'linear-gradient(135deg, #cfe0ea 0%, #ddd0e8 30%, #eaddd0 60%, #d0e8da 100%)',
          position: 'relative', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Декоративні кола */}
          <div style={{ position: 'absolute', top: '10%', left: '10%', width: 400, height: 400, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: '-10%', right: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />

          {/* Статистика */}
          <div style={{
            position: 'relative', zIndex: 1,
            display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap',
            padding: '40px 56px', gap: '32px 48px',
          }}>
            <Stat value={kpi ? fmt(kpi.total_cases) : '…'} label="ГОСПІТАЛІЗАЦІЙ" />
            <Stat value={kpi ? fmt(kpi.unique_patients) : '…'} label="ПАЦІЄНТІВ" />
            <Stat value={doctorCount != null ? fmt(doctorCount) : '…'} label="ЛІКАРІВ" />
            <Stat value={fmt(deptCount)} label="ВІДДІЛЕНЬ" />
            <Stat value={String(year)} label="" large />
          </div>
        </div>
      </div>
    </>
  )
}

function Stat({ value, label, large }) {
  return (
    <div>
      <div style={{
        fontSize: large ? 72 : 44, fontWeight: 300,
        color: '#1a1a1a', ...MONO, lineHeight: 1,
        letterSpacing: '-0.02em',
      }}>
        {value}
      </div>
      {label && (
        <div style={{
          fontSize: 10, color: '#666', textTransform: 'uppercase',
          letterSpacing: '0.12em', marginTop: 7, ...MONO,
        }}>
          {label}
        </div>
      )}
    </div>
  )
}
