import { useState, useEffect, useMemo } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { createClient } from '../lib/supabase'

import { SANS, MONO, fmt, fetchStats, THERAPEUTIC, SURGICAL } from '../components/shared'
import { Stat } from '../components/Stat'
import { BlockStats } from '../components/BlockStats'
import { MiniChart } from '../components/MiniChart'
import { DeptItem } from '../components/DeptItem'
import { DoctorPanel } from '../components/DoctorPanel'
import { DeptPanel } from '../components/DeptPanel'

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
    ? (rows.reduce((s, r) => s + (Number(r.летальність) || 0) * (Number(r.випадків) || 0), 0) / total).toFixed(1)
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

export default function Home() {
  const router = useRouter()
  const supabase = useMemo(() => typeof window !== 'undefined' ? createClient() : null, [])

  // ── Публічні дані ──
  const [kpi, setKpi] = useState(null)
  const [doctorCount, setDoctorCount] = useState(null)
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

  // ── Auth ──
  const [me, setMe] = useState(null)
  const [meLoading, setMeLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState(null)
  const [showWorkers, setShowWorkers] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  // ── Кабінет завідувача ──
  const [deptProfile, setDeptProfile] = useState(null)
  const [deptHead, setDeptHead] = useState(null)
  const [deptDocs, setDeptDocs] = useState([])
  const [deptIcd, setDeptIcd] = useState([])
  const [deptToday, setDeptToday] = useState(null)
  const [deptLoading, setDeptLoading] = useState(false)
  const [headCabinet, setHeadCabinet] = useState(null)

  // ── Кабінет лікаря ──
  const [cabinet, setCabinet] = useState(null)
  const [cabTab, setCabTab] = useState('recent')

  // Redirect якщо reset-password
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash
    if (hash.includes('access_token') && hash.includes('type=recovery')) {
      router.replace('/auth/reset-password' + hash)
    }
  }, [])

  // Початкові дані
  useEffect(() => {
    fetchStats('doctorCount').then(rows => setDoctorCount(rows[0]?.cnt || null))
    fetchStats('allYears').then(rows => setAllYears(rows.map(r => r.year).filter(Boolean)))
  }, [])

  // KPI при зміні року
  useEffect(() => {
    setKpi(null)
    fetchStats('ovKpiYear', chartYear === 'all' ? 'all' : String(chartYear))
      .then(rows => setKpi(rows[0] || null))
  }, [chartYear])

  // Блокова статистика при зміні року
  useEffect(() => {
    const cy = chartYear === 'all' ? String(new Date().getFullYear()) : String(chartYear)
    setBlockLoading(true)
    Promise.all([
      fetchBlockStats(THERAPEUTIC, chartYear),
      fetchBlockStats(SURGICAL, chartYear),
      fetchStats('hospitalMonthly', cy),
      fetchStats('therapeuticMonthly', cy),
      fetchStats('surgicalMonthly', cy),
    ]).then(([t, s, monthly, tMonthly, sMonthly]) => {
      setTherStats(t)
      setSurgStats(s)
      setMonthlyData(monthly)
      setTherMonthly(tMonthly)
      setSurgMonthly(sMonthly)
      setBlockLoading(false)
    })
  }, [chartYear])

  // Перевірка сесії
  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.role) setMe(d)
      setMeLoading(false)
    }).catch(() => setMeLoading(false))
  }, [])

  // Дані завідувача
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

  // Особистий кабінет завідувача
  useEffect(() => {
    if (!me?.emp_name || me.role !== 'head_dept') return
    const yq = chartYear === 'all' ? '' : `&year=${chartYear}`
    fetch(`/api/cabinet?emp=${encodeURIComponent(me.emp_name)}${yq}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setHeadCabinet(d))
      .catch(() => {})
  }, [me?.emp_name, chartYear])

  // Кабінет лікаря
  useEffect(() => {
    if (me?.role !== 'doctor') return
    const yq = chartYear === 'all' ? '' : `?year=${chartYear}`
    fetch('/api/cabinet' + yq).then(r => r.ok ? r.json() : null).then(d => setCabinet(d)).catch(() => {})
  }, [me?.role, chartYear])

  async function handleLogin(e) {
    e.preventDefault()
    if (!supabase) return
    setLoginLoading(true); setLoginError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setLoginError('Невірний логін або пароль'); setLoginLoading(false); return }
    const d = await fetch('/api/me').then(r => r.json()).catch(() => ({}))
    setLoginLoading(false)
    if (d?.role === 'admin') { router.push('/org'); return }
    if (d?.role) setMe(d)
  }

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

  async function handleLogout() {
    if (!supabase) return
    await supabase.auth.signOut()
    setMe(null); setCabinet(null); setHeadCabinet(null)
    setDeptProfile(null); setDeptDocs([]); setDeptIcd([])
  }

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

        {/* ══ ЗОНА 1: лого + терапевтичні ліворуч | KPI + терапевтична статистика праворуч ══ */}
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
            <div style={{ padding: '16px 0' }}>
              {THERAPEUTIC.map((d, i) => (
                <DeptItem key={i} name={d}
                  hovered={hoveredDept === d}
                  stats={deptCache[`${d}|${chartYear}`]}
                  onEnter={() => handleDeptHover(d)}
                  onLeave={() => setHoveredDept(null)}
                />
              ))}
            </div>
          </div>

          {/* Права частина */}
          <div style={{
            flex: 1,
            background: 'linear-gradient(135deg, #cfe0ea 0%, #ddd0e8 30%, #eaddd0 60%, #d0e8da 100%)',
            position: 'relative', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ position: 'absolute', top: '5%', left: '5%', width: 450, height: 450, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: '-10%', right: '-5%', width: 520, height: 520, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />

            {/* Перемикач року */}
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

            {/* KPI */}
            <div style={{
              position: 'relative', zIndex: 1,
              display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap',
              padding: '16px 40px 24px', gap: '20px 32px',
            }}>
              <Stat value={kpi ? fmt(kpi.total_cases) : '…'} label="ГОСПІТАЛІЗАЦІЙ" />
              <Stat value={kpi ? fmt(kpi.unique_patients) : '…'} label="ПАЦІЄНТІВ" />
              <Stat value={doctorCount != null ? fmt(doctorCount) : '…'} label="ЛІКАРІВ" />
              <Stat value="20" label="ВІДДІЛЕНЬ" />
              <Stat value={chartYear === 'all' ? 'Всі' : String(chartYear)} large />
            </div>

            {/* Терапевтичний напрямок */}
            <div style={{ position: 'relative', zIndex: 1, padding: '12px 40px 16px', flex: 1 }}>
              <div style={{ fontSize: 9, color: '#5b7fa6', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 12 }}>
                Терапевтичний напрямок
              </div>
              <BlockStats stats={therStats} loading={blockLoading} color="#5b7fa6" />
              <MiniChart data={therMonthly} loading={blockLoading} color="#5b7fa6" />
            </div>
          </div>
        </div>

        {/* ══ ЗОНА 2: смужка "Для працівників" ══ */}
        <div style={{
          display: 'flex', alignItems: 'center',
          borderTop: '1px solid rgba(0,0,0,0.09)',
          borderBottom: '1px solid rgba(0,0,0,0.09)',
          background: (showWorkers || me) ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.03)',
          transition: 'background .2s',
        }}>
          <div style={{ width: 480, flexShrink: 0, padding: '10px 40px', borderRight: '1px solid rgba(0,0,0,0.09)' }}>
            {!me ? (
              <button onClick={() => { setShowWorkers(v => !v); setLoginError(null) }} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 700, color: '#333',
                padding: 0, display: 'block', width: '100%', textAlign: 'right', ...SANS,
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

          <div style={{ flex: 1, padding: '8px 40px' }}>
            {me && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 12, color: '#555', ...SANS }}>{me.department ? me.department : me.email}</span>
                <button onClick={handleLogout} style={{
                  background: 'none', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 6,
                  fontSize: 11, color: '#666', cursor: 'pointer', padding: '4px 14px', ...SANS,
                }}>Вийти</button>
              </div>
            )}

            {!me && !showWorkers && (
              <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.3)', ...SANS }}>— натисніть для входу —</div>
            )}

            {!me && showWorkers && !resetMode && !resetSent && (
              <form onSubmit={handleLogin} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="email" placeholder="Login" value={email}
                  onChange={e => { setEmail(e.target.value); setLoginError(null) }} required
                  style={{ flex: 1, minWidth: 0, padding: '6px 12px', border: loginError ? '1px solid #c0392b' : '1px solid rgba(0,0,0,0.15)', borderRadius: 6, fontSize: 13, ...SANS, background: 'rgba(255,255,255,0.85)', color: '#1a1a1a', outline: 'none' }}
                />
                <input type="password" placeholder="Password" value={password}
                  onChange={e => { setPassword(e.target.value); setLoginError(null) }} required
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
                <input type="email" placeholder="Введіть ваш email" value={email}
                  onChange={e => { setEmail(e.target.value); setLoginError(null) }} required
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

        {/* ══ ЗОНА 3: хірургічні ліворуч | хірургічна статистика або кабінет праворуч ══ */}
        <div style={{ display: 'flex', flex: 1 }}>

          {/* Ліва колонка */}
          <div style={{
            width: 480, flexShrink: 0,
            borderRight: '1px solid rgba(0,0,0,0.1)',
            background: 'rgba(255,255,255,0.55)',
            backdropFilter: 'blur(16px)',
          }}>
            <div style={{ padding: '16px 0 32px' }}>
              {SURGICAL.map((d, i) => (
                <DeptItem key={i} name={d}
                  hovered={hoveredDept === d}
                  stats={deptCache[`${d}|${chartYear}`]}
                  onEnter={() => handleDeptHover(d)}
                  onLeave={() => setHoveredDept(null)}
                />
              ))}
            </div>
          </div>

          {/* Права частина */}
          <div style={{
            flex: 1,
            background: 'linear-gradient(135deg, #cfe0ea 0%, #ddd0e8 30%, #eaddd0 60%, #d0e8da 100%)',
            position: 'relative', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', background: 'rgba(255,255,255,0.05)' }} />

            {me?.role === 'head_dept' && (
              <DeptPanel
                dept={me.department} deptProfile={deptProfile} deptHead={deptHead}
                deptDocs={deptDocs} deptIcd={deptIcd} deptToday={deptToday}
                headCabinet={headCabinet} loading={deptLoading}
              />
            )}

            {me?.role === 'doctor' && (
              <DoctorPanel cabinet={cabinet} tab={cabTab} setTab={setCabTab} />
            )}

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
