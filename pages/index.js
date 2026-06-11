import { useState, useEffect, useMemo } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { createClient } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

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

function fmt(n, suffix = '') {
  if (n == null || n === '') return '—'
  const num = Number(n)
  if (isNaN(num)) return String(n)
  return num.toLocaleString('uk-UA') + suffix
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

async function fetchBlockStats(depts) {
  const results = await Promise.all(depts.map(d => fetchStats('deptProfile', d)))
  const rows = results.map(r => r[0]).filter(Boolean)
  if (!rows.length) return null
  const sum = (key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0)
  const wavg = (key, wkey) => {
    const tw = sum(wkey); if (!tw) return null
    return rows.reduce((s, r) => s + (Number(r[key]) || 0) * (Number(r[wkey]) || 0), 0) / tw
  }
  const total = sum('випадків')
  // летальність — зважена середня з death_rate_pct (відс. на відділення)
  const летальність = total > 0
    ? (rows.reduce((s,r) => s + (Number(r.летальність)||0) * (Number(r.випадків)||0), 0) / total).toFixed(1)
    : '0'
  return {
    випадків:    total,
    середній_вік: wavg('середній_вік', 'випадків')?.toFixed(1),
    ліжкодень:   wavg('ліжкодень', 'випадків')?.toFixed(1),
    повторні:    sum('повторні'),
    поліпшення:  sum('поліпшення'),
    летальність,
    men:         sum('чоловіки'),
    women:       sum('жінки'),
  }
}

function BlockStats({ stats, loading, color }) {
  if (loading) return <div style={{ fontSize: 12, color: '#999', ...MONO }}>завантаження…</div>
  if (!stats) return null
  const items = [
    { l: 'СЕРЕДНІЙ ВІК',   v: stats.середній_вік },
    { l: 'ЛІЖКО-ДЕНЬ',     v: stats.ліжкодень },
    { l: 'ПОВТОРНІ',       v: fmt(stats.повторні) },
    { l: 'З ПОКРАЩЕННЯМ',  v: stats.випадків > 0 ? (Number(stats.поліпшення)/Number(stats.випадків)*100).toFixed(1)+'%' : '—' },
    { l: 'ЛЕТАЛЬНІСТЬ',    v: stats.летальність + '%' },
  ]
  return (
    <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
      {items.map((it, i) => (
        <div key={i} style={{
          flex: '1 1 80px', textAlign: 'center',
          padding: '8px 12px',
          borderLeft: i > 0 ? '1px solid rgba(0,0,0,0.08)' : 'none',
        }}>
          <div style={{ fontSize: 28, fontWeight: 300, color: color || '#1a1a1a', ...MONO, lineHeight: 1 }}>
            {it.v ?? '—'}
          </div>
          <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 5, ...MONO }}>
            {it.l}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Home() {
  const router = useRouter()
  const supabase = useMemo(() => typeof window !== 'undefined' ? createClient() : null, [])

  const [kpi, setKpi] = useState(null)
  const [doctorCount, setDoctorCount] = useState(null)
  const [showWorkers, setShowWorkers] = useState(false)
  const [therStats, setTherStats] = useState(null)
  const [surgStats, setSurgStats] = useState(null)
  const [blockLoading, setBlockLoading] = useState(false)
  const [monthlyData, setMonthlyData] = useState([])
  const [therMonthly, setTherMonthly] = useState([])
  const [surgMonthly, setSurgMonthly] = useState([])
  const [chartYear, setChartYear] = useState(new Date().getFullYear())

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
    fetchStats('doctorCount').then(rows => setDoctorCount(rows[0]?.кількість || null))
  }, [])

  async function handleShowWorkers() {
    const next = !showWorkers
    setShowWorkers(next)
    setLoginError(null)
    if (next && !therStats) {
      setBlockLoading(true)
      const [t, s, monthly, tMonthly, sMonthly] = await Promise.all([
        fetchBlockStats(THERAPEUTIC),
        fetchBlockStats(SURGICAL),
        fetchStats('hospitalMonthly', String(chartYear)),
        fetchStats('therapeuticMonthly', String(chartYear)),
        fetchStats('surgicalMonthly', String(chartYear)),
      ])
      setTherStats(t)
      setSurgStats(s)
      setMonthlyData(monthly)
      setTherMonthly(tMonthly)
      setSurgMonthly(sMonthly)
      setBlockLoading(false)
    }
  }

  useEffect(() => {
    if (!showWorkers) return
    Promise.all([
      fetchStats('hospitalMonthly', String(chartYear)),
      fetchStats('therapeuticMonthly', String(chartYear)),
      fetchStats('surgicalMonthly', String(chartYear)),
    ]).then(([m, t, s]) => { setMonthlyData(m); setTherMonthly(t); setSurgMonthly(s) })
  }, [chartYear])

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
          background: 'rgba(255,255,255,0.55)',
          backdropFilter: 'blur(16px)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Лого */}
          <div style={{ padding: '32px 40px 24px', display: 'flex', alignItems: 'center', gap: 18, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <svg width="72" height="72" viewBox="0 0 200 220" fill="none" style={{ flexShrink: 0 }}>
              {/* Дуга (sage green) */}
              <path d="M155 55 Q175 90 155 130 Q135 155 100 160 Q65 155 45 130 Q25 90 45 55"
                stroke="#8a9e8c" strokeWidth="18" strokeLinecap="round" fill="none" />
              {/* Хрест (mauve) */}
              <rect x="82" y="20" width="36" height="110" rx="8" fill="#b5697a" />
              <rect x="42" y="55" width="116" height="36" rx="8" fill="#b5697a" />
              {/* Ліва рука (mauve) */}
              <path d="M30 185 Q10 165 20 140 Q35 120 55 135 Q70 148 60 170 Q50 188 30 185Z"
                fill="#b5697a" />
              <path d="M55 135 Q65 118 75 130 Q80 145 65 158 Q55 163 55 135Z"
                fill="#b5697a" />
              {/* Права рука (sage green) */}
              <path d="M170 185 Q190 165 180 140 Q165 120 145 135 Q130 148 140 170 Q150 188 170 185Z"
                fill="#8a9e8c" />
              <path d="M145 135 Q135 118 125 130 Q120 145 135 158 Q145 163 145 135Z"
                fill="#8a9e8c" />
            </svg>
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
          <div style={{ padding: '16px 0 8px' }}>
            {THERAPEUTIC.map((d, i) => (
              <div key={i} style={{ padding: '6px 40px', fontSize: 14, color: '#333', textAlign: 'right', ...SANS }}>
                {d}
              </div>
            ))}
          </div>

          {/* ── СМУЖКА "Для працівників:" ── */}
          <div style={{
            background: showWorkers ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.03)',
            borderTop: '1px solid rgba(0,0,0,0.09)',
            borderBottom: '1px solid rgba(0,0,0,0.09)',
            transition: 'background .2s',
          }}>
            {/* Рядок з написом + полями */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 10px 20px' }}>
              <button
                onClick={handleShowWorkers}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 14, fontWeight: 700, color: '#333',
                  whiteSpace: 'nowrap', flexShrink: 0, padding: 0, ...SANS,
                }}
              >
                Для працівників:
              </button>

              {showWorkers && (
                <form onSubmit={handleLogin} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="email" placeholder="Login"
                    value={email} onChange={e => { setEmail(e.target.value); setLoginError(null) }}
                    required
                    style={{
                      flex: 1, minWidth: 0, padding: '5px 10px',
                      border: loginError ? '1px solid #c0392b' : '1px solid rgba(0,0,0,0.15)',
                      borderRadius: 5, fontSize: 12, ...SANS,
                      background: 'rgba(255,255,255,0.9)', color: '#1a1a1a', outline: 'none',
                    }}
                  />
                  <input
                    type="password" placeholder="Password"
                    value={password} onChange={e => { setPassword(e.target.value); setLoginError(null) }}
                    required
                    style={{
                      flex: 1, minWidth: 0, padding: '5px 10px',
                      border: loginError ? '1px solid #c0392b' : '1px solid rgba(0,0,0,0.15)',
                      borderRadius: 5, fontSize: 12, ...SANS,
                      background: 'rgba(255,255,255,0.9)', color: '#1a1a1a', outline: 'none',
                    }}
                  />
                  <button type="submit" disabled={loginLoading} style={{
                    padding: '5px 12px', background: '#1a1a1a', border: 'none', borderRadius: 5,
                    color: '#fff', fontSize: 12, cursor: loginLoading ? 'not-allowed' : 'pointer',
                    opacity: loginLoading ? 0.6 : 1, flexShrink: 0, ...SANS,
                  }}>
                    {loginLoading ? '…' : '→'}
                  </button>
                </form>
              )}
            </div>
            {loginError && (
              <div style={{ padding: '2px 20px 8px', fontSize: 11, color: '#c0392b', ...SANS }}>
                {loginError}
              </div>
            )}
          </div>

          {/* Хірургічний блок */}
          <div style={{ padding: '8px 0 32px', flex: 1 }}>
            {SURGICAL.map((d, i) => (
              <div key={i} style={{ padding: '6px 40px', fontSize: 14, color: '#333', textAlign: 'right', ...SANS }}>
                {d}
              </div>
            ))}
          </div>
        </div>

        {/* ── ПРАВА ЧАСТИНА ── */}
        <div style={{
          flex: 1,
          background: 'linear-gradient(135deg, #cfe0ea 0%, #ddd0e8 30%, #eaddd0 60%, #d0e8da 100%)',
          position: 'relative', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Декоративні кола */}
          <div style={{ position: 'absolute', top: '5%', left: '5%', width: 450, height: 450, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: '-10%', right: '-5%', width: 520, height: 520, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />

          {/* Головна статистика */}
          <div style={{
            position: 'relative', zIndex: 1,
            display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap',
            padding: '40px 56px 32px', gap: '28px 44px',
            borderBottom: showWorkers ? '1px solid rgba(0,0,0,0.08)' : 'none',
          }}>
            <Stat value={kpi ? fmt(kpi.total_cases) : '…'} label="ГОСПІТАЛІЗАЦІЙ" />
            <Stat value={kpi ? fmt(kpi.unique_patients) : '…'} label="ПАЦІЄНТІВ" />
            <Stat value={doctorCount != null ? fmt(doctorCount) : '…'} label="ЛІКАРІВ" />
            <Stat value="20" label="ВІДДІЛЕНЬ" />
            <Stat value={String(year)} large />
          </div>

          {/* Блокова статистика (показується після кліку) */}
          {showWorkers && (
            <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>

              {/* Перемикач року — спільний для всіх графіків */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 56px 0', gap: 4 }}>
                {[new Date().getFullYear() - 1, new Date().getFullYear()].map(y => (
                  <button key={y} onClick={() => setChartYear(y)} style={{
                    padding: '3px 12px', borderRadius: 12,
                    border: '1px solid rgba(0,0,0,0.15)',
                    background: chartYear === y ? 'rgba(0,0,0,0.12)' : 'transparent',
                    fontSize: 10, cursor: 'pointer', ...MONO, color: '#444',
                  }}>{y}</button>
                ))}
              </div>

              {/* Терапевтичний блок */}
              <div style={{ padding: '16px 56px 20px', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize: 9, color: '#5b7fa6', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 12 }}>
                  Терапевтичний напрямок
                </div>
                <BlockStats stats={therStats} loading={blockLoading} color="#5b7fa6" />
                <MiniChart data={therMonthly} loading={blockLoading} color="#5b7fa6" />
              </div>

              {/* Хірургічний блок */}
              <div style={{ padding: '16px 56px 20px', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize: 9, color: '#c0623a', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 12 }}>
                  Хірургічний напрямок
                </div>
                <BlockStats stats={surgStats} loading={blockLoading} color="#c0623a" />
                <MiniChart data={surgMonthly} loading={blockLoading} color="#c0623a" />
              </div>

              {/* Загальний графік лікарні */}
              <div style={{ padding: '16px 56px 24px' }}>
                <div style={{ fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 12 }}>
                  Загальні поступлення лікарні
                </div>
                <MiniChart data={monthlyData} loading={blockLoading} color="#8b8fa8" height={110} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function MiniChart({ data, loading, color = '#8b8fa8', height = 90 }) {
  if (loading) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 10, ...MONO }}>завантаження…</div>
  if (!data?.length) return null
  const rows = data.map(r => ({ м: r.місяць?.slice(5,7), випадків: Number(r.випадків) || 0 }))
  return (
    <div style={{ marginTop: 10 }}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 2, right: 4, left: 0, bottom: 0 }} barSize={16}>
          <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" />
          <XAxis dataKey="м" tick={{ fontSize: 9, fontFamily: 'IBM Plex Mono', fill: '#999' }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 6, fontSize: 11, fontFamily: 'IBM Plex Mono' }}
            formatter={v => [Number(v).toLocaleString('uk'), 'Поступлень']}
            labelFormatter={l => `Місяць ${l}`}
          />
          <Bar dataKey="випадків" fill={color + '88'} radius={[3,3,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function Stat({ value, label, large }) {
  return (
    <div>
      <div style={{
        fontSize: large ? 68 : 42, fontWeight: 300,
        color: '#1a1a1a', ...MONO, lineHeight: 1, letterSpacing: '-0.02em',
      }}>
        {value}
      </div>
      {label && (
        <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 7, ...MONO }}>
          {label}
        </div>
      )}
    </div>
  )
}
