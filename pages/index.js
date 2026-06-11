import { useState, useEffect, useMemo } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { createClient } from '../lib/supabase'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const MONO = { fontFamily: 'var(--mono)' }
const UA_MONTHS = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень']

const ICD_NAMES = {
  K: 'Органи травлення', I: 'Кровообіг', S: 'Травми', G: 'Нервова система',
  N: 'Сечостатева', C: 'Новоутворення', M: "Кістково-м'язова",
  J: 'Органи дихання', E: 'Ендокринні', A: 'Інфекційні', F: 'Психічні',
}
const PIE_COLORS = ['#8b8fa8', '#a8b5c8', '#c8b8a8', '#a8c8b8', '#c8a8b8']

function fmt(n) {
  if (n == null || n === '') return '—'
  const num = Number(n)
  if (isNaN(num)) return String(n)
  return num.toLocaleString('uk-UA').replace(/ /g, ' ')
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

/* ── Топ KPI у хедері ── */
function HeaderKpi({ label, value }) {
  return (
    <div style={{ textAlign: 'center', padding: '0 28px', borderLeft: '1px solid rgba(255,255,255,0.12)' }}>
      <div style={{ fontSize: 28, fontWeight: 300, color: 'var(--text)', ...MONO, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 5, ...MONO }}>{label}</div>
    </div>
  )
}

/* ── Показник відділення (другий рядок) ── */
function DeptKpi({ label, value }) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 26, fontWeight: 300, color: 'var(--text)', ...MONO, lineHeight: 1 }}>{value ?? '—'}</div>
      <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 5, ...MONO }}>{label}</div>
    </div>
  )
}

export default function Home() {
  const router = useRouter()
  const supabase = createClient()

  const [role, setRole] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)

  // Глобальні KPI
  const [kpi, setKpi] = useState(null)
  const [depts, setDepts] = useState([])
  const [doctorCount, setDoctorCount] = useState(null)

  // Вибране відділення
  const [selDept, setSelDept] = useState(null)
  const [deptProfile, setDeptProfile] = useState(null)
  const [deptDocs, setDeptDocs] = useState([])
  const [deptMonthly, setDeptMonthly] = useState([])
  const [deptIcdCat,  setDeptIcdCat]  = useState([])
  const [deptLoading, setDeptLoading] = useState(false)
  const [chartPeriod, setChartPeriod] = useState('місяці') // 'роки' | 'місяці' | 'дні'

  // Auth перевірка
  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(d => {
      setRole(d.role)
      setAuthChecked(true)
      if (!d.role) router.push('/login')
    }).catch(() => { setAuthChecked(true); router.push('/login') })
  }, [])

  // Глобальні дані
  useEffect(() => {
    fetchStats('ovKpiYear', 'all').then(rows => setKpi(rows[0] || null))
    fetchStats('wDept').then(rows => {
      setDepts(rows)
      // Рахуємо лікарів із dept stats
      const total = rows.reduce((s, r) => s + Number(r.лікарів || 0), 0)
      // Якщо немає поля лікарів — підраховуємо через orgDocs
    })
    fetchStats('orgDocs').then(rows => setDoctorCount(rows.length))
  }, [])

  // URL синхронізація
  useEffect(() => {
    const d = router.query?.dept
    if (d) setSelDept(decodeURIComponent(d))
  }, [router.query?.dept])

  // Дані відділення
  useEffect(() => {
    if (!selDept) { setDeptProfile(null); setDeptDocs([]); setDeptMonthly([]); setDeptIcdCat([]); return }
    setDeptLoading(true)
    Promise.all([
      fetchStats('deptProfile', selDept),
      fetchStats('deptDocs2', selDept),
      fetchStats('deptYearly', selDept),
      fetchStats('deptMonthly', selDept),
      fetchStats('deptDaily', selDept),
      fetchStats('deptIcdCat', selDept),
    ]).then(([prof, docs, yearly, monthly, daily, icdCat]) => {
      setDeptProfile(prof[0] || null)
      setDeptDocs(docs)
      setDeptMonthly({ роки: yearly, місяці: monthly, дні: daily })
      setDeptIcdCat(icdCat)
      setDeptLoading(false)
    })
  }, [selDept])

  const завідувач = useMemo(() => deptDocs.find(d => d.посада?.toLowerCase().includes('завідувач')), [deptDocs])

  const chartData = useMemo(() => {
    const rows = deptMonthly?.[chartPeriod] || []
    return rows.map(r => {
      if (chartPeriod === 'роки')  return { мітка: String(r.рік),   випадків: Number(r.випадків) || 0 }
      if (chartPeriod === 'місяці') return { мітка: UA_MONTHS[parseInt(r.місяць?.slice(5, 7), 10) - 1] || r.місяць, випадків: Number(r.випадків) || 0 }
      return { мітка: r.день + ' ч.', випадків: Number(r.випадків) || 0 }
    })
  }, [deptMonthly, chartPeriod])

  const handleDeptClick = (dept) => {
    const next = selDept === dept ? null : dept
    setSelDept(next)
    router.replace({ query: next ? { dept: next } : {} }, undefined, { shallow: true })
  }

  async function handleLogout() {
    await supabase?.auth.signOut()
    router.push('/login')
  }

  if (!authChecked) return null

  return (
    <>
      <Head>
        <title>ЛСМД — Головна</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

        {/* ── ХЕДЕР ── */}
        <header style={{
          display: 'flex', alignItems: 'center',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)', flexShrink: 0,
        }}>
          {/* Лого + назва */}
          <div style={{ width: 320, padding: '18px 24px', borderRight: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', lineHeight: 1.4, letterSpacing: '0.04em' }}>
              ЛІКАРНЯ ШВИДКОЇ<br />МЕДИЧНОЇ ДОПОМОГИ
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, ...MONO }}>турбуємось про найцінніше</div>
          </div>

          {/* Глобальні KPI */}
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', padding: '18px 0', justifyContent: 'center' }}>
            <HeaderKpi label="Госпіталізацій" value={kpi ? fmt(kpi.total_cases) : '…'} />
            <HeaderKpi label="Пацієнтів"      value={kpi ? fmt(kpi.unique_patients) : '…'} />
            <HeaderKpi label="Лікарів"        value={doctorCount != null ? fmt(doctorCount) : '…'} />
            <HeaderKpi label="Відділень"      value={depts.length || '…'} />
            <HeaderKpi label="Летальність"    value={kpi ? kpi.death_rate_pct + '%' : '…'} />
          </div>

          {/* Вийти */}
          <div style={{ padding: '0 20px', borderLeft: '1px solid var(--border)' }}>
            <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 11, ...MONO }}>↪ Вийти</button>
          </div>
        </header>

        {/* ── ОСНОВНИЙ КОНТЕНТ ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: 'calc(100vh - 77px)' }}>

          {/* ── ЛІВА КОЛОНКА — список відділень ── */}
          <div style={{
            width: 320, flexShrink: 0, borderRight: '1px solid var(--border)',
            overflowY: 'auto', background: 'var(--surface)',
          }}>
            {/* Картка вибраного відділення */}
            {selDept && deptProfile && (
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', marginBottom: 6, lineHeight: 1.3 }}>{selDept}</div>
                {завідувач && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', ...MONO, marginBottom: 12 }}>
                    Завідувач: {завідувач.emp_name}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                  {[
                    { l: 'Випадків',  v: fmt(deptProfile.випадків) },
                    { l: 'Пацієнтів', v: fmt(deptProfile.унікальних) },
                    { l: 'Ліжок',     v: '—' },
                    { l: 'Лікарів',   v: deptDocs.length || '—' },
                  ].map(k => (
                    <div key={k.l} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 300, color: 'var(--text)', ...MONO }}>{k.v}</div>
                      <div style={{ fontSize: 8, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', ...MONO, marginTop: 2 }}>{k.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Список відділень */}
            <div style={{ paddingTop: 8 }}>
              {depts.map(d => {
                const active = selDept === d.відділення
                return (
                  <button key={d.відділення} onClick={() => handleDeptClick(d.відділення)} style={{
                    display: 'block', width: '100%', textAlign: 'right',
                    padding: '9px 20px', border: 'none', cursor: 'pointer',
                    background: active ? 'var(--bg)' : 'transparent',
                    color: active ? 'var(--text)' : 'var(--text2)',
                    fontSize: 13, fontFamily: 'var(--sans)',
                    borderLeft: active ? '3px solid var(--brand)' : '3px solid transparent',
                    transition: 'all .1s',
                  }}>
                    {d.відділення}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── ПРАВА КОЛОНКА — деталі відділення ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>

            {!selDept && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', fontSize: 13, ...MONO }}>
                Оберіть відділення зі списку ліворуч
              </div>
            )}

            {selDept && (
              <>
                {/* Лінійний графік */}
                <div style={{ padding: '16px 32px 0', borderBottom: '1px solid var(--border)' }}>
                  {/* Перемикач */}
                  <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                    {['роки', 'місяці', 'дні'].map(p => (
                      <button key={p} onClick={() => setChartPeriod(p)} style={{
                        padding: '4px 14px', border: '1px solid var(--border)', borderRadius: 20,
                        background: chartPeriod === p ? 'var(--text)' : 'transparent',
                        color: chartPeriod === p ? 'var(--bg)' : 'var(--text3)',
                        fontSize: 10, cursor: 'pointer', ...MONO, textTransform: 'uppercase',
                        letterSpacing: '0.07em', transition: 'all .15s',
                      }}>
                        {p}
                      </button>
                    ))}
                  </div>
                  {deptLoading && <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 12, ...MONO }}>завантаження…</div>}
                  {!deptLoading && chartData.length > 0 && (
                    <ResponsiveContainer width="100%" height={150}>
                      <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <XAxis dataKey="мітка" tick={{ fontSize: 10, fontFamily: 'var(--mono)', fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip
                          contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, fontFamily: 'var(--mono)' }}
                          formatter={(v) => [fmt(v), 'Госпіталізацій']}
                        />
                        <Line type="monotone" dataKey="випадків" stroke="#8b8fa8" strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                  {!deptLoading && chartData.length === 0 && (
                    <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 11, ...MONO }}>немає даних</div>
                  )}
                </div>

                {/* 5 KPI відділення */}
                {deptProfile && (
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    padding: '20px 32px', borderBottom: '1px solid var(--border)',
                    gap: 0,
                  }}>
                    <DeptKpi label="Середній вік"   value={deptProfile.середній_вік} />
                    <DeptKpi label="Ліжко-день"     value={deptProfile.ліжкодень} />
                    <DeptKpi label="Повторні"       value={fmt(deptProfile.повторні)} />
                    <DeptKpi label="Летальність"    value={deptProfile.летальність + '%'} />
                    <DeptKpi label="З покращенням"  value={deptProfile.поліпшення ? fmt(Math.round(Number(deptProfile.поліпшення) * 100 / Number(deptProfile.випадків || 1))) + '%' : '—'} />
                  </div>
                )}

                {/* Нижня зона */}
                {deptProfile && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, padding: '24px 32px' }}>

                    {/* Секторна діаграма захворюваності */}
                    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '20px 20px 12px' }}>
                      <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', ...MONO, marginBottom: 4 }}>
                        5 основних категорій захворюваності
                      </div>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 22, fontWeight: 300, color: 'var(--text)', ...MONO }}>{fmt(deptProfile.випадків)}</div>
                          <div style={{ fontSize: 8, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', ...MONO }}>Госпіталізацій</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 22, fontWeight: 300, color: 'var(--text)', ...MONO }}>{fmt(deptProfile.унікальних)}</div>
                          <div style={{ fontSize: 8, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', ...MONO }}>Пацієнтів</div>
                        </div>
                      </div>
                      {deptIcdCat.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={deptIcdCat.map(r => ({
                                name: ICD_NAMES[r.розділ] || r.розділ,
                                value: Number(r.випадків),
                              }))}
                              cx="50%" cy="50%"
                              innerRadius={50} outerRadius={80}
                              dataKey="value" paddingAngle={2}
                            >
                              {deptIcdCat.map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, fontFamily: 'var(--mono)' }}
                              formatter={(v, n) => [fmt(v) + ' вип.', n]}
                            />
                            <Legend iconSize={8} iconType="circle"
                              formatter={(v) => <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>{v}</span>}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 11, ...MONO }}>
                          {deptLoading ? 'завантаження…' : 'немає даних'}
                        </div>
                      )}
                    </div>

                    {/* Плейсхолдер другого графіку */}
                    <div style={{
                      border: '1px solid var(--border)', borderRadius: 10,
                      padding: '40px 24px', textAlign: 'center',
                      color: 'var(--text3)', fontSize: 13, ...MONO,
                    }}>
                      Графік
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
