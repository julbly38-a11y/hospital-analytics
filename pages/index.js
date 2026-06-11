import { useState, useEffect, useMemo } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { createClient } from '../lib/supabase'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts'
import { SplitBar } from '../components/SplitBar'

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

async function fetchBlockStats(depts, year) {
  const useYear = year && year !== 'all'
  const fetcher = useYear
    ? (d) => fetchStats('deptProfileYear', `${d}|${year}`)
    : (d) => fetchStats('deptProfile', d)
  const results = await Promise.all(depts.map(fetcher))
  const rows = results.map(r => r[0]).filter(Boolean)
  if (!rows.length) return null
  const sum = (key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0)
  const wavg = (key, wkey) => {
    const tw = sum(wkey); if (!tw) return null
    return rows.reduce((s, r) => s + (Number(r[key]) || 0) * (Number(r[wkey]) || 0), 0) / tw
  }
  const total = sum('випадків')
  const летальність = total > 0
    ? (rows.reduce((s,r) => s + (Number(r.летальність)||0) * (Number(r.випадків)||0), 0) / total).toFixed(1)
    : '0'
  return {
    випадків:     total,
    середній_вік: wavg('середній_вік', 'випадків')?.toFixed(1),
    ліжкодень:    wavg('ліжкодень', 'випадків')?.toFixed(1),
    повторні:     sum('повторні'),
    поліпшення:   sum('поліпшення'),
    летальність,
    men:          sum('чоловіки'),
    women:        sum('жінки'),
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
          <div style={{ fontSize: 22, fontWeight: 300, color: color || '#1a1a1a', ...MONO, lineHeight: 1 }}>
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
  const [chartYear, setChartYear] = useState('all')
  const [allYears, setAllYears] = useState([])
  const [hoveredDept, setHoveredDept] = useState(null)
  const [deptCache, setDeptCache] = useState({})

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState(null)
  const [resetMode, setResetMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  // ── Auth state ──
  const [me, setMe] = useState(null)
  const [meLoading, setMeLoading] = useState(true)

  // ── Dept panel state (head_dept) ──
  const [deptProfile, setDeptProfile] = useState(null)
  const [deptHead, setDeptHead] = useState(null)
  const [deptDocs, setDeptDocs] = useState([])
  const [deptIcd, setDeptIcd] = useState([])
  const [deptToday, setDeptToday] = useState(null)
  const [deptLoading, setDeptLoading] = useState(false)
  const [headCabinet, setHeadCabinet] = useState(null)

  // ── Doctor panel state (doctor) ──
  const [cabinet, setCabinet] = useState(null)
  const [cabTab, setCabTab] = useState('recent')

  async function handleReset(e) {
    e.preventDefault()
    if (!email) { setLoginError('Введіть email'); return }
    setLoginLoading(true); setLoginError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    setLoginLoading(false)
    if (error) setLoginError(error.message)
    else setResetSent(true)
  }

  // Якщо в URL є #access_token від Supabase (скидання пароля) — переходимо на reset-password
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash
    if (hash.includes('access_token') && hash.includes('type=recovery')) {
      router.replace('/auth/reset-password' + hash)
    }
  }, [])

  useEffect(() => {
    fetchStats('doctorCount').then(rows => setDoctorCount(rows[0]?.cnt || null))
    fetchStats('allYears').then(rows => setAllYears(rows.map(r => r.year).filter(Boolean)))
  }, [])

  // Оновлення головної статистики при зміні року
  useEffect(() => {
    setKpi(null)
    const param = chartYear === 'all' ? 'all' : String(chartYear)
    fetchStats('ovKpiYear', param).then(rows => setKpi(rows[0] || null))
  }, [chartYear])

  async function loadBlockStats(year) {
    setBlockLoading(true)
    const cy = year === 'all' ? String(new Date().getFullYear()) : String(year)
    const [t, s, monthly, tMonthly, sMonthly] = await Promise.all([
      fetchBlockStats(THERAPEUTIC, year),
      fetchBlockStats(SURGICAL, year),
      fetchStats('hospitalMonthly', cy),
      fetchStats('therapeuticMonthly', cy),
      fetchStats('surgicalMonthly', cy),
    ])
    setTherStats(t)
    setSurgStats(s)
    setMonthlyData(monthly)
    setTherMonthly(tMonthly)
    setSurgMonthly(sMonthly)
    setBlockLoading(false)
  }

  async function handleShowWorkers() {
    const next = !showWorkers
    setShowWorkers(next)
    setLoginError(null)
    if (next) loadBlockStats(chartYear)
  }

  // Показники напрямків — завжди завантажуємо (і при зміні року)
  useEffect(() => {
    loadBlockStats(chartYear)
  }, [chartYear])

  // ── Check auth on mount ──
  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.role) setMe(d)
      setMeLoading(false)
    }).catch(() => setMeLoading(false))
  }, [])

  // ── Load dept data when me.role === head_dept ──
  useEffect(() => {
    if (!me?.department || me.role !== 'head_dept') return
    const dept = me.department
    const y = chartYear === 'all' ? 'all' : String(chartYear)
    setDeptLoading(true)
    Promise.all([
      fetchStats('deptProfileYear', `${dept}|${y}`),
      fetchStats('deptHead', dept),
      fetchStats('deptToday', dept),
      fetchStats('deptIcdPieYear', `${dept}|${y}`),
      fetchStats('deptDocs2', dept),
    ]).then(([prof, head, today, icd, docs]) => {
      setDeptProfile(prof[0] || null)
      setDeptHead(head[0] || null)
      setDeptToday(today[0] || null)
      setDeptIcd(icd || [])
      setDeptDocs(docs || [])
      setDeptLoading(false)
    }).catch(() => setDeptLoading(false))
  }, [me?.department, chartYear])

  // ── Load head cabinet data ──
  useEffect(() => {
    if (!me?.emp_name || me.role !== 'head_dept') return
    const yq = chartYear === 'all' ? '' : `&year=${chartYear}`
    fetch(`/api/cabinet?emp=${encodeURIComponent(me.emp_name)}${yq}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setHeadCabinet(d))
      .catch(() => {})
  }, [me?.emp_name, chartYear])

  // ── Load doctor cabinet when me.role === doctor ──
  useEffect(() => {
    if (me?.role !== 'doctor') return
    const yq = chartYear === 'all' ? '' : `?year=${chartYear}`
    fetch('/api/cabinet' + yq).then(r => r.ok ? r.json() : null).then(d => setCabinet(d)).catch(() => {})
  }, [me?.role, chartYear])

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
    if (d?.role === 'admin') { router.push('/org'); return }
    if (d?.role) setMe(d)
  }

  async function handleLogout() {
    if (!supabase) return
    await supabase.auth.signOut()
    setMe(null)
    setCabinet(null)
    setHeadCabinet(null)
    setDeptProfile(null)
    setDeptDocs([])
    setDeptIcd([])
  }

  const year = new Date().getFullYear()

  async function handleDeptHover(dept) {
    setHoveredDept(dept)
    if (!dept) return
    const cacheKey = `${dept}|${chartYear}`
    if (deptCache[cacheKey]) return
    const param = chartYear === 'all' ? dept : `${dept}|${chartYear}`
    const key = chartYear === 'all' ? 'deptProfile' : 'deptProfileYear'
    const [statsRows, headRows] = await Promise.all([
      fetchStats(key, param),
      fetchStats('deptHead', dept),
    ])
    const head = headRows[0] || {}
    const data = { ...(statsRows[0] || {}), head: head.name || null, doctors: head.doctors, beds: head.beds }
    setDeptCache(c => ({ ...c, [cacheKey]: data }))
  }

  return (
    <>
      <Head>
        <title>ЛСМД — Хотинська багатопрофільна лікарня</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#eeeae4' }}>

        {/* ══ ЗОНА 1: лого + терапевтичний блок | головна статистика ══ */}
        <div style={{ display: 'flex' }}>

          {/* Ліва колонка */}
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
                <path d="M155 55 Q175 90 155 130 Q135 155 100 160 Q65 155 45 130 Q25 90 45 55"
                  stroke="#8a9e8c" strokeWidth="18" strokeLinecap="round" fill="none" />
                <rect x="82" y="20" width="36" height="110" rx="8" fill="#b5697a" />
                <rect x="42" y="55" width="116" height="36" rx="8" fill="#b5697a" />
                <path d="M30 185 Q10 165 20 140 Q35 120 55 135 Q70 148 60 170 Q50 188 30 185Z" fill="#b5697a" />
                <path d="M55 135 Q65 118 75 130 Q80 145 65 158 Q55 163 55 135Z" fill="#b5697a" />
                <path d="M170 185 Q190 165 180 140 Q165 120 145 135 Q130 148 140 170 Q150 188 170 185Z" fill="#8a9e8c" />
                <path d="M145 135 Q135 118 125 130 Q120 145 135 158 Q145 163 145 135Z" fill="#8a9e8c" />
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

            {/* Терапевтичні відділення */}
            <div style={{ padding: '16px 0 16px' }}>
              {THERAPEUTIC.map((d, i) => (
                <DeptItem key={i} name={d} hovered={hoveredDept === d} stats={deptCache[`${d}|${chartYear}`]}
                  onEnter={() => handleDeptHover(d)} onLeave={() => setHoveredDept(null)} />
              ))}
            </div>
          </div>

          {/* Права частина — статистика + терапевтичний блок */}
          <div style={{
            flex: 1,
            background: 'linear-gradient(135deg, #cfe0ea 0%, #ddd0e8 30%, #eaddd0 60%, #d0e8da 100%)',
            position: 'relative', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ position: 'absolute', top: '5%', left: '5%', width: 450, height: 450, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: '-10%', right: '-5%', width: 520, height: 520, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />

            {/* Перемикач року — завжди видимий */}
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'flex-end', padding: '16px 40px 0', gap: 4 }}>
              <button onClick={() => setChartYear('all')} style={{
                padding: '3px 12px', borderRadius: 12,
                border: '1px solid rgba(0,0,0,0.15)',
                background: chartYear === 'all' ? 'rgba(0,0,0,0.12)' : 'transparent',
                fontSize: 10, cursor: 'pointer', ...MONO, color: '#444',
              }}>Всі</button>
              {allYears.map(y => (
                <button key={y} onClick={() => setChartYear(y)} style={{
                  padding: '3px 12px', borderRadius: 12,
                  border: '1px solid rgba(0,0,0,0.15)',
                  background: chartYear === y ? 'rgba(0,0,0,0.12)' : 'transparent',
                  fontSize: 10, cursor: 'pointer', ...MONO, color: '#444',
                }}>{y}</button>
              ))}
            </div>

            {/* Головна статистика */}
            <div style={{
              position: 'relative', zIndex: 1,
              display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap',
              padding: '16px 40px 24px', gap: '20px 32px',
              borderBottom: showWorkers ? '1px solid rgba(0,0,0,0.08)' : 'none',
            }}>
              <Stat value={kpi ? fmt(kpi.total_cases) : '…'} label="ГОСПІТАЛІЗАЦІЙ" />
              <Stat value={kpi ? fmt(kpi.unique_patients) : '…'} label="ПАЦІЄНТІВ" />
              <Stat value={doctorCount != null ? fmt(doctorCount) : '…'} label="ЛІКАРІВ" />
              <Stat value="20" label="ВІДДІЛЕНЬ" />
              <Stat value={chartYear === 'all' ? 'Всі' : String(chartYear)} large />
            </div>

            {/* Терапевтичний напрямок — завжди видимий */}
            <div style={{ position: 'relative', zIndex: 1, padding: '12px 40px 16px', flex: 1 }}>
              <div style={{ fontSize: 9, color: '#5b7fa6', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 12 }}>
                Терапевтичний напрямок
              </div>
              <BlockStats stats={therStats} loading={blockLoading} color="#5b7fa6" />
              <MiniChart data={therMonthly} loading={blockLoading} color="#5b7fa6" />
            </div>
          </div>
        </div>

        {/* ══ ЗОНА 2: смужка "Для працівників:" — повна ширина ══ */}
        <div style={{
          display: 'flex', alignItems: 'center',
          borderTop: '1px solid rgba(0,0,0,0.09)',
          borderBottom: '1px solid rgba(0,0,0,0.09)',
          background: (showWorkers || me) ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.03)',
          transition: 'background .2s',
        }}>
          {/* Ліва частина */}
          <div style={{ width: 480, flexShrink: 0, padding: '10px 40px', borderRight: '1px solid rgba(0,0,0,0.09)' }}>
            {!me ? (
              <button onClick={handleShowWorkers} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 700, color: '#333',
                padding: 0, display: 'block', width: '100%',
                textAlign: 'right', ...SANS,
              }}>Для працівників:</button>
            ) : (
              <div style={{ textAlign: 'right', fontSize: 12, color: '#555', ...SANS }}>
                {me.full_name || me.email}
                <span style={{ marginLeft: 6, fontSize: 10, color: '#999' }}>
                  {me.role === 'head_dept' ? '· завідувач' : me.role === 'doctor' ? '· лікар' : ''}
                </span>
              </div>
            )}
          </div>

          {/* Права частина */}
          <div style={{ flex: 1, padding: '8px 40px' }}>

            {/* Авторизований — кнопка виходу */}
            {me && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 12, color: '#555', ...SANS }}>
                  {me.department ? me.department : me.email}
                </span>
                <button onClick={handleLogout} style={{
                  background: 'none', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 6,
                  fontSize: 11, color: '#666', cursor: 'pointer', padding: '4px 14px', ...SANS,
                }}>Вийти</button>
              </div>
            )}

            {/* Не авторизований — форма логіну */}
            {!me && !showWorkers && (
              <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.3)', ...SANS }}>
                — натисніть для входу —
              </div>
            )}

            {!me && showWorkers && !resetMode && !resetSent && (
              <form onSubmit={handleLogin} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="email" placeholder="Login"
                  value={email} onChange={e => { setEmail(e.target.value); setLoginError(null) }}
                  required
                  style={{ flex: 1, minWidth: 0, padding: '6px 12px', border: loginError ? '1px solid #c0392b' : '1px solid rgba(0,0,0,0.15)', borderRadius: 6, fontSize: 13, ...SANS, background: 'rgba(255,255,255,0.85)', color: '#1a1a1a', outline: 'none' }}
                />
                <input type="password" placeholder="Password"
                  value={password} onChange={e => { setPassword(e.target.value); setLoginError(null) }}
                  required
                  style={{ flex: 1, minWidth: 0, padding: '6px 12px', border: loginError ? '1px solid #c0392b' : '1px solid rgba(0,0,0,0.15)', borderRadius: 6, fontSize: 13, ...SANS, background: 'rgba(255,255,255,0.85)', color: '#1a1a1a', outline: 'none' }}
                />
                <button type="submit" disabled={loginLoading} style={{
                  padding: '6px 20px', background: '#1a1a1a', border: 'none', borderRadius: 6,
                  color: '#fff', fontSize: 13, cursor: loginLoading ? 'not-allowed' : 'pointer',
                  opacity: loginLoading ? 0.6 : 1, flexShrink: 0, ...SANS,
                }}>{loginLoading ? '…' : 'Увійти →'}</button>
                <button type="button" onClick={() => { setResetMode(true); setLoginError(null) }}
                  style={{ background: 'none', border: 'none', fontSize: 11, color: 'rgba(0,0,0,0.4)', cursor: 'pointer', ...SANS, flexShrink: 0, padding: 0 }}>
                  Забули пароль?
                </button>
                {loginError && <span style={{ fontSize: 11, color: '#c0392b', ...SANS }}>{loginError}</span>}
              </form>
            )}

            {!me && showWorkers && resetMode && !resetSent && (
              <form onSubmit={handleReset} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="email" placeholder="Введіть ваш email"
                  value={email} onChange={e => { setEmail(e.target.value); setLoginError(null) }}
                  required
                  style={{ flex: 1, minWidth: 0, padding: '6px 12px', border: loginError ? '1px solid #c0392b' : '1px solid rgba(0,0,0,0.15)', borderRadius: 6, fontSize: 13, ...SANS, background: 'rgba(255,255,255,0.85)', color: '#1a1a1a', outline: 'none' }}
                />
                <button type="submit" disabled={loginLoading} style={{
                  padding: '6px 20px', background: '#1a1a1a', border: 'none', borderRadius: 6,
                  color: '#fff', fontSize: 13, cursor: loginLoading ? 'not-allowed' : 'pointer',
                  opacity: loginLoading ? 0.6 : 1, flexShrink: 0, ...SANS,
                }}>{loginLoading ? '…' : 'Надіслати →'}</button>
                <button type="button" onClick={() => { setResetMode(false); setLoginError(null) }}
                  style={{ background: 'none', border: 'none', fontSize: 11, color: 'rgba(0,0,0,0.4)', cursor: 'pointer', ...SANS, flexShrink: 0, padding: 0 }}>
                  ← Назад
                </button>
                {loginError && <span style={{ fontSize: 11, color: '#c0392b', ...SANS }}>{loginError}</span>}
              </form>
            )}

            {!me && showWorkers && resetSent && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: '#1a1a1a', ...SANS }}>Лист надіслано на {email}</span>
                <button onClick={() => { setResetMode(false); setResetSent(false) }}
                  style={{ background: 'none', border: 'none', fontSize: 11, color: 'rgba(0,0,0,0.4)', cursor: 'pointer', ...SANS }}>
                  ← Назад
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ══ ЗОНА 3: хірургічний блок | статистика блоків + графіки ══ */}
        <div style={{ display: 'flex', flex: 1 }}>

          {/* Ліва колонка — хірургічні відділення */}
          <div style={{
            width: 480, flexShrink: 0,
            borderRight: '1px solid rgba(0,0,0,0.1)',
            background: 'rgba(255,255,255,0.55)',
            backdropFilter: 'blur(16px)',
          }}>
            <div style={{ padding: '16px 0 32px' }}>
              {SURGICAL.map((d, i) => (
                <DeptItem key={i} name={d} hovered={hoveredDept === d} stats={deptCache[`${d}|${chartYear}`]}
                  onEnter={() => handleDeptHover(d)} onLeave={() => setHoveredDept(null)} />
              ))}
            </div>
          </div>

          {/* Права частина — статистика або кабінет */}
          <div style={{
            flex: 1,
            background: 'linear-gradient(135deg, #cfe0ea 0%, #ddd0e8 30%, #eaddd0 60%, #d0e8da 100%)',
            position: 'relative', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', background: 'rgba(255,255,255,0.05)' }} />

            {/* ── Кабінет відділення ── */}
            {me?.role === 'head_dept' && (
              <DeptPanel
                dept={me.department} deptProfile={deptProfile} deptHead={deptHead}
                deptDocs={deptDocs} deptIcd={deptIcd} deptToday={deptToday}
                headCabinet={headCabinet} loading={deptLoading}
                SANS={SANS} MONO={MONO} fmt={fmt}
              />
            )}

            {/* ── Кабінет лікаря ── */}
            {me?.role === 'doctor' && (
              <DoctorPanel
                cabinet={cabinet} tab={cabTab} setTab={setCabTab}
                SANS={SANS} MONO={MONO} fmt={fmt}
              />
            )}

            {/* ── Хірургічний напрямок (публічний, завжди) ── */}
            {!me && (
              <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 40px 16px', flex: 1 }}>
                  <div style={{ fontSize: 9, color: '#c0623a', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 12 }}>
                    Хірургічний напрямок
                  </div>
                  <BlockStats stats={surgStats} loading={blockLoading} color="#c0623a" />
                  <MiniChart data={surgMonthly} loading={blockLoading} color="#c0623a" />
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </>
  )
}

const PIE_COLORS = ['#2563eb','#7c3aed','#059669','#d97706','#dc2626','#0891b2']

const STATUS_COLORS = {
  'Лікується': '#5ab0ff', 'З поліпшенням': '#7fd99a', 'Без змін': '#cfae5a',
  'З погіршенням': '#e0a060', 'Помер': '#e08080', 'Переведений в інший заклад': '#a08ae0',
}
function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || '#999'
  return <span style={{ fontSize: 10, color: c, border: `1px solid ${c}55`, borderRadius: 999, padding: '1px 7px', whiteSpace: 'nowrap' }}>{status || '—'}</span>
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
}

function DeptPanel({ dept, deptProfile, deptHead, deptDocs, deptIcd, deptToday, headCabinet, loading, SANS, MONO, fmt }) {
  const headDoc = deptDocs.find(d => d.посада?.toLowerCase().includes('завідувач'))
  const ordDocs = deptDocs.filter(d => !d.посада?.toLowerCase().includes('завідувач'))
  const glass = { background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14 }
  const val = (v, suf = '') => loading ? '…' : fmt(v) + (fmt(v) !== '—' ? suf : '')
  return (
    <div style={{ position: 'relative', zIndex: 1, flex: 1, padding: '20px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', ...SANS }}>{dept}</div>

      {/* Рядок 1: головна статистика відділення */}
      <div style={{ ...glass, padding: '16px 20px' }}>
        <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 12 }}>Показники відділення</div>
        <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
          {[
            { l: 'ВИПАДКІВ',    v: val(deptProfile?.випадків) },
            { l: 'ПАЦІЄНТІВ',   v: val(deptProfile?.унікальних) },
            { l: 'ЛЕТАЛЬНІСТЬ', v: val(deptProfile?.летальність, '%') },
            { l: 'ЛІЖКО-ДЕНЬ',  v: val(deptProfile?.ліжкодень, ' дн.') },
            { l: 'СЕР. ВІК',    v: val(deptProfile?.середній_вік, ' р.') },
            { l: 'ЛІЖОК',       v: deptHead?.beds ? fmt(deptHead.beds) : '—' },
          ].map((s, i) => (
            <div key={i} style={{ flex: '1 1 80px', padding: '4px 14px', borderLeft: i > 0 ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
              <div style={{ fontSize: 22, fontWeight: 300, color: '#2563eb', ...MONO, lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 7, color: '#888', textTransform: 'uppercase', letterSpacing: '0.09em', marginTop: 4, ...MONO }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Рядок 2: сьогодні + ординаторська + топ ICD */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>

        {/* Сьогодні */}
        <div style={{ background: 'rgba(26,39,68,0.85)', backdropFilter: 'blur(8px)', borderRadius: 14, padding: '14px 20px', color: '#fff', minWidth: 140 }}>
          <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.14em', ...MONO, marginBottom: 8 }}>Сьогодні</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 300, ...MONO }}>{loading ? '…' : (deptToday?.discharged ?? '—')}</div>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginTop: 2, ...MONO }}>ВИПИСАНО</div>
            </div>
            <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.2)', fontWeight: 200 }}>/</div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 300, ...MONO }}>{loading ? '…' : (deptToday?.admitted ?? '—')}</div>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginTop: 2, ...MONO }}>ПОСТУПИЛО</div>
            </div>
          </div>
        </div>

        {/* Ординаторська */}
        <div style={{ ...glass, padding: '14px 18px', flex: '0 0 auto', minWidth: 160, maxHeight: 200, overflowY: 'auto' }}>
          <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 10 }}>Ординаторська</div>
          {headDoc && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 600, color: '#fff', flexShrink: 0, ...MONO }}>
                {initials(headDoc.emp_name)}
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 500, color: '#1a1a1a', ...SANS }}>{headDoc.emp_name}</div>
                <div style={{ fontSize: 8, color: '#2563eb', ...MONO }}>завідувач</div>
              </div>
            </div>
          )}
          {ordDocs.slice(0, 6).map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: '#666', flexShrink: 0, ...MONO }}>
                {initials(d.emp_name)}
              </div>
              <div style={{ fontSize: 10, color: '#333', ...SANS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.emp_name}</div>
            </div>
          ))}
          {loading && <div style={{ fontSize: 9, color: '#aaa', ...MONO }}>завантаження…</div>}
        </div>

        {/* Топ ICD */}
        {deptIcd.length > 0 && (
          <div style={{ ...glass, padding: '14px 18px', flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 10 }}>Топ МКХ-10</div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <ResponsiveContainer width={100} height={100}>
                <PieChart>
                  <Pie data={deptIcd} dataKey="випадків" innerRadius={28} outerRadius={46} paddingAngle={2}>
                    {deptIcd.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 10, borderRadius: 6, border: 'none', background: 'rgba(26,26,26,0.9)', color: '#fff' }}
                    formatter={(v, n, p) => [p.payload.відс + '% (' + fmt(v) + ')', '']} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1 }}>
                {deptIcd.slice(0, 4).map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                    <div style={{ fontSize: 10, color: '#333', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...SANS }}>{d.назва || d.код}</div>
                    <div style={{ fontSize: 10, fontWeight: 500, color: '#2563eb', ...MONO }}>{d.відс}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Рядок 3: особиста статистика завідувача */}
      {headCabinet?.summary && (
        <div style={{ ...glass, padding: '16px 20px' }}>
          <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 12 }}>
            Особиста статистика · {headDoc?.emp_name}
          </div>
          <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
            {[
              { l: 'ВИПАДКІВ',     v: fmt(headCabinet.summary['всього']) },
              { l: 'АКТИВНИХ',     v: fmt(headCabinet.summary['активних']) },
              { l: 'ЛІЖКО-ДЕНЬ',   v: fmt(headCabinet.summary['серед_ліжкодень']) },
              { l: 'ПОВТОРНІ',     v: fmt(headCabinet.summary['повторні']) },
              { l: 'ПОЛІПШЕННЯ',   v: fmt(headCabinet.summary['поліпшення']) },
              { l: 'ЛЕТАЛЬНІСТЬ',  v: fmt(headCabinet.summary['померло']) },
            ].map((s, i) => (
              <div key={i} style={{ flex: '1 1 80px', padding: '4px 14px', borderLeft: i > 0 ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
                <div style={{ fontSize: 22, fontWeight: 300, color: '#059669', ...MONO, lineHeight: 1 }}>{s.v}</div>
                <div style={{ fontSize: 7, color: '#888', textTransform: 'uppercase', letterSpacing: '0.09em', marginTop: 4, ...MONO }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Діаграми завідувача */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 28px', marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <SplitBar label="Стать" leftLabel="Жінки" rightLabel="Чоловіки"
              leftValue={headCabinet.summary['жінки']} rightValue={headCabinet.summary['чоловіки']}
              leftColor="#c0392b" rightColor="#2563eb" />
            <SplitBar label="Ургенція" leftLabel="Ургентних" rightLabel="Планових"
              leftValue={headCabinet.summary['ургентних']} rightValue={headCabinet.summary['планових']}
              leftColor="#d97706" rightColor="#6b8cba" />
            <SplitBar label="Покращення" leftLabel="З поліпшенням" rightLabel="Інші"
              leftValue={headCabinet.summary['поліпшення']} rightValue={Number(headCabinet.summary['всього']) - Number(headCabinet.summary['поліпшення'])}
              leftColor="#059669" rightColor="#cbd5e1" />
            <SplitBar label="Летальність" leftLabel="Померло" rightLabel="Виписано"
              leftValue={headCabinet.summary['померло']} rightValue={Number(headCabinet.summary['всього']) - Number(headCabinet.summary['померло'])}
              leftColor="#dc2626" rightColor="#7fd99a" />
          </div>
        </div>
      )}
    </div>
  )
}

function DoctorPanel({ cabinet, tab, setTab, SANS, MONO, fmt }) {
  if (!cabinet) return (
    <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.3)', ...MONO }}>завантаження кабінету…</div>
    </div>
  )
  const { profile, summary, recent, active, topDiag } = cabinet
  const rows = tab === 'recent' ? recent : tab === 'active' ? active : topDiag
  const glass = { background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14 }
  return (
    <div style={{ position: 'relative', zIndex: 1, flex: 1, padding: '20px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', ...SANS }}>
        {profile?.full_name}
        <span style={{ marginLeft: 10, fontSize: 10, color: '#888', fontWeight: 400, ...MONO }}>{profile?.specialization || profile?.position}</span>
      </div>

      {/* Stats */}
      {summary && (
        <div style={{ ...glass, padding: '16px 20px' }}>
          <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 12 }}>Моя статистика</div>
          <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
            {[
              { l: 'ВИПАДКІВ',    v: fmt(summary['всього']) },
              { l: 'АКТИВНИХ',    v: fmt(summary['активних']) },
              { l: 'ЛІЖКО-ДЕНЬ',  v: fmt(summary['серед_ліжкодень']) },
              { l: 'ПОВТОРНІ',    v: fmt(summary['повторні']) },
              { l: 'ПОЛІПШЕННЯ',  v: fmt(summary['поліпшення']) },
              { l: 'ЛЕТАЛЬНІСТЬ', v: fmt(summary['померло']) },
            ].map((s, i) => (
              <div key={i} style={{ flex: '1 1 80px', padding: '4px 14px', borderLeft: i > 0 ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
                <div style={{ fontSize: 22, fontWeight: 300, color: '#2563eb', ...MONO, lineHeight: 1 }}>{s.v}</div>
                <div style={{ fontSize: 7, color: '#888', textTransform: 'uppercase', letterSpacing: '0.09em', marginTop: 4, ...MONO }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Діаграми */}
      {summary && (
        <div style={{ ...glass, padding: '16px 20px' }}>
          <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 14 }}>Розподіл</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 28px' }}>
            <SplitBar label="Стать" leftLabel="Жінки" rightLabel="Чоловіки"
              leftValue={summary['жінки']} rightValue={summary['чоловіки']}
              leftColor="#c0392b" rightColor="#2563eb" />
            <SplitBar label="Ургенція" leftLabel="Ургентних" rightLabel="Планових"
              leftValue={summary['ургентних']} rightValue={summary['планових']}
              leftColor="#d97706" rightColor="#6b8cba" />
            <SplitBar label="Покращення" leftLabel="З поліпшенням" rightLabel="Інші"
              leftValue={summary['поліпшення']} rightValue={Number(summary['всього']) - Number(summary['поліпшення'])}
              leftColor="#059669" rightColor="#cbd5e1" />
            <SplitBar label="Летальність" leftLabel="Померло" rightLabel="Виписано"
              leftValue={summary['померло']} rightValue={Number(summary['всього']) - Number(summary['померло'])}
              leftColor="#dc2626" rightColor="#7fd99a" />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { k: 'recent', l: 'Останні' },
          { k: 'active', l: 'Активні' },
          { k: 'diag',   l: 'Діагнози' },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            background: tab === t.k ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.5)',
            border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8,
            fontSize: 10, cursor: 'pointer', padding: '4px 14px', ...MONO, color: '#333',
            fontWeight: tab === t.k ? 600 : 400,
          }}>{t.l}</button>
        ))}
      </div>

      {/* Table */}
      <div style={{ ...glass, padding: '0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 260 }}>
          {(!rows || rows.length === 0) ? (
            <div style={{ padding: '14px 18px', fontSize: 11, color: '#aaa', ...MONO }}>Немає даних.</div>
          ) : tab !== 'diag' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.07)', background: 'rgba(255,255,255,0.4)' }}>
                  {['№', 'Пацієнт', 'Дата', 'Діагноз', tab === 'recent' ? 'Статус' : 'Ліжкодень'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', ...MONO, fontWeight: 400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <td style={{ padding: '7px 10px', color: '#999', ...MONO }}>{r['номер']}</td>
                    <td style={{ padding: '7px 10px', ...SANS }}>{r['пацієнт']}</td>
                    <td style={{ padding: '7px 10px', color: '#888', ...MONO }}>{r['дата']}</td>
                    <td style={{ padding: '7px 10px', color: '#666', ...SANS, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r['діагноз']}</td>
                    <td style={{ padding: '7px 10px' }}>
                      {tab === 'recent' ? <StatusBadge status={r['статус']} /> : (r['ліжкодень'] != null ? r['ліжкодень'] + ' дн.' : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.07)', background: 'rgba(255,255,255,0.4)' }}>
                  {['Діагноз', 'Код', 'Випадків', 'Померло'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', ...MONO, fontWeight: 400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <td style={{ padding: '7px 10px', ...SANS }}>{r['діагноз']}</td>
                    <td style={{ padding: '7px 10px', color: '#888', ...MONO }}>{r['код']}</td>
                    <td style={{ padding: '7px 10px', ...MONO }}>{r['випадків']}</td>
                    <td style={{ padding: '7px 10px', color: r['померло'] > 0 ? '#e08080' : '#aaa', ...MONO }}>{r['померло']}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function DeptItem({ name, hovered, stats, onEnter, onLeave }) {
  return (
    <div onMouseEnter={onEnter} onMouseLeave={onLeave}
      style={{ borderRadius: 6, margin: '1px 8px', transition: 'background .15s',
        background: hovered ? 'rgba(0,0,0,0.04)' : 'transparent' }}>
      <div style={{ padding: '5px 32px', fontSize: 14, color: hovered ? '#1a1a1a' : '#333', textAlign: 'right', cursor: 'default', ...SANS }}>
        {name}
      </div>
      {hovered && (
        <div style={{ padding: '8px 32px 10px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          {!stats ? (
            <div style={{ fontSize: 10, color: '#aaa', textAlign: 'right', ...MONO }}>завантаження…</div>
          ) : (
            <>
              {stats.head && (
                <div style={{ fontSize: 12, color: '#555', textAlign: 'right', marginBottom: 10, ...SANS }}>
                  <span style={{ color: '#aaa', fontSize: 11 }}>Завідувач:&nbsp;</span>{stats.head}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 0 }}>
                {[
                  { v: fmt(stats.випадків),   l: 'ВИПАДКІВ' },
                  { v: fmt(stats.унікальних), l: 'ПАЦІЄНТІВ' },
                  { v: fmt(stats.doctors),    l: 'ЛІКАРІВ' },
                  { v: stats.beds ? fmt(stats.beds) : '—', l: 'ЛІЖОК' },
                ].map((it, i) => (
                  <div key={i} style={{ textAlign: 'center', padding: '0 14px',
                    borderLeft: i > 0 ? '1px solid rgba(0,0,0,0.08)' : 'none' }}>
                    <div style={{ fontSize: 18, fontWeight: 300, color: '#1a1a1a', lineHeight: 1, ...MONO }}>{it.v}</div>
                    <div style={{ fontSize: 7, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4, ...MONO }}>{it.l}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MiniChart({ data, loading, color = '#8b8fa8', height = 90 }) {
  if (loading) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 10, ...MONO }}>завантаження…</div>
  if (!data?.length) return null
  const rows = data.map(r => ({ м: r.місяць?.slice(5,7), випадків: Number(r.випадків) || 0 }))
  return (
    <div style={{ marginTop: 10 }}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" />
          <XAxis dataKey="м" tick={{ fontSize: 9, fontFamily: 'IBM Plex Mono', fill: '#999' }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 6, fontSize: 11, fontFamily: 'IBM Plex Mono' }}
            formatter={v => [Number(v).toLocaleString('uk'), 'Поступлень']}
            labelFormatter={l => `Місяць ${l}`}
          />
          <Line type="monotone" dataKey="випадків" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color, strokeWidth: 0 }} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function Stat({ value, label, large }) {
  return (
    <div>
      <div style={{
        fontSize: large ? 52 : 32, fontWeight: 300,
        color: '#1a1a1a', ...MONO, lineHeight: 1, letterSpacing: '-0.02em',
      }}>
        {value}
      </div>
      {label && (
        <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 6, ...MONO }}>
          {label}
        </div>
      )}
    </div>
  )
}
