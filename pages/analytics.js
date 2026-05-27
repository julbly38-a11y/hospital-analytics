import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

const COLORS = ['#1a1917','#6b6760','#9c9890','#c0c0b8','#d8d5cf','#4a9870','#c0392b','#e8a020']

function useQuery(sql) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetch('/api/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql })
    }).then(r => r.json()).then(d => { setData(d.rows || []); setLoading(false) })
      .catch(() => { setData([]); setLoading(false) })
  }, [])
  return { data, loading }
}

function Card({ title, children, span = 1 }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '10px', padding: '20px 24px',
      gridColumn: `span ${span}`
    }}>
      <p style={{ fontSize: '10px', fontFamily: 'var(--mono)', textTransform: 'uppercase',
        letterSpacing: '0.08em', color: 'var(--text3)', marginBottom: '16px' }}>{title}</p>
      {children}
    </div>
  )
}

function StatBig({ value, label, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <p style={{ fontSize: '36px', fontWeight: 300, fontFamily: 'var(--mono)', lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '6px' }}>{label}</p>
      {sub && <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px' }}>{sub}</p>}
    </div>
  )
}

function Loader() {
  return <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 40 }}>
    {[0,0.2,0.4].map((d,i) => (
      <span key={i} style={{
        width: 6, height: 6, borderRadius: '50%', background: 'var(--text3)',
        animation: 'pulse 1.2s ease-in-out infinite', animationDelay: `${d}s`
      }}/>
    ))}
  </div>
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '8px 12px', fontSize: 12, fontFamily: 'var(--mono)' }}>
      <p style={{ color: 'var(--text2)', marginBottom: 4 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || 'var(--text)' }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  )
}

export default function Analytics() {
  const summary = useQuery('SELECT total_cases,unique_patients,avg_bed_days,death_rate_pct,surgical_activity_pct FROM v_hospital_summary')
  const deptStats = useQuery('SELECT department as відділення, total_cases as випадків, death_rate_pct as летальність, avg_bed_days as ліжкодень FROM v_department_stats ORDER BY total_cases DESC LIMIT 10')
  const peakHour = useQuery('SELECT hour as година, cases as поступлень FROM v_peak_by_hour ORDER BY hour')
  const peakMonth = useQuery('SELECT month as місяць, cases as поступлень, deaths as померло FROM v_peak_by_month ORDER BY month')
  const peakWeekday = useQuery('SELECT dow as день, weekday_name as назва, cases as поступлень FROM v_peak_by_weekday ORDER BY dow')
  const urgency = useQuery('SELECT department as відділення, urgent as ургентних, planned as планових FROM v_urgency_stats ORDER BY ургентних DESC LIMIT 8')
  const patStats = useQuery('SELECT age_group as вік, cases as випадків, death_rate_pct as летальність FROM v_patient_stats WHERE gender=\'Ч\' OR gender=\'Ж\' GROUP BY вік,летальність ORDER BY випадків DESC LIMIT 8')
  const icu = useQuery('SELECT всього_поступлень,померло,летальність_pct,середній_ліжкодень FROM v_icu_mortality')

  const s = summary.data?.[0] || {}
  const icuRow = icu.data?.[0] || {}

  const weekdays = ['Нд','Пн','Вт','Ср','Чт','Пт','Сб']

  return (
    <>
      <Head>
        <title>ЛСМД — Аналітика</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      </Head>

      <style jsx global>{`
        @keyframes pulse {
          0%,60%,100%{opacity:.3;transform:scale(.9)}
          30%{opacity:1;transform:scale(1)}
        }
        .recharts-cartesian-axis-tick-value { font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
      `}</style>

      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        {/* Header */}
        <header style={{
          background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          padding: '0 40px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', height: 56
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 300, color: 'var(--accent)' }}>+</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 500 }}>ЛСМД</span>
            <span style={{ color: 'var(--border)' }}>|</span>
            <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>Аналітичний дашборд</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/" style={{
              fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)',
              textDecoration: 'none', padding: '6px 12px', borderRadius: 6,
              border: '1px solid var(--border)', transition: 'all .15s'
            }}>← AI Асистент</Link>
          </div>
        </header>

        <div style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto' }}>

          {/* KPI Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { v: s.total_cases?.toLocaleString('uk'), l: 'Госпіталізацій', s: 'всього' },
              { v: s.unique_patients?.toLocaleString('uk'), l: 'Унікальних пацієнтів', s: '' },
              { v: s.avg_bed_days ? Number(s.avg_bed_days).toFixed(1) : '—', l: 'Середній ліжкодень', s: 'днів' },
              { v: s.death_rate_pct ? Number(s.death_rate_pct).toFixed(2) + '%' : '—', l: 'Летальність', s: 'загальна' },
              { v: icuRow.летальність_pct ? Number(icuRow.летальність_pct).toFixed(1) + '%' : '—', l: 'Летальність реанімації', s: `${icuRow.померло || '—'} / ${icuRow.всього_поступлень?.toLocaleString('uk') || '—'}` },
            ].map((kpi, i) => (
              <Card key={i} title="">
                {summary.loading || icu.loading ? <Loader /> : <StatBig value={kpi.v || '—'} label={kpi.l} sub={kpi.s} />}
              </Card>
            ))}
          </div>

          {/* Row 2: Відділення + Ургентні */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
            <Card title="Топ відділень за кількістю випадків">
              {deptStats.loading ? <Loader /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={deptStats.data} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="відділення" width={200}
                      tick={{ fontSize: 10, fontFamily: 'var(--mono)', fill: 'var(--text2)' }}
                      tickFormatter={v => v.length > 28 ? v.slice(0,26)+'…' : v}
                      axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="випадків" fill="var(--accent)" radius={[0,3,3,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card title="Ургентні vs Планові">
              {urgency.loading ? <Loader /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={urgency.data} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="відділення" tick={{ fontSize: 9, fontFamily: 'var(--mono)' }}
                      tickFormatter={v => v.split(' ')[0].slice(0,8)} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--mono)' }} />
                    <Bar dataKey="ургентних" fill="#c0392b" radius={[3,3,0,0]} />
                    <Bar dataKey="планових" fill="var(--text3)" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* Row 3: Пікові години + Дні тижня */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <Card title="Поступлення по годинах доби">
              {peakHour.loading ? <Loader /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={peakHour.data} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="година" tick={{ fontSize: 10, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false}
                      tickFormatter={v => v % 4 === 0 ? `${v}:00` : ''} />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="поступлень" fill="var(--accent)"
                      radius={[2,2,0,0]}
                      label={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card title="Поступлення по днях тижня">
              {peakWeekday.loading ? <Loader /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={peakWeekday.data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="назва" tick={{ fontSize: 11, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="поступлень" fill="var(--accent)" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* Row 4: Динаміка по місяцях */}
          <div style={{ marginBottom: 24 }}>
            <Card title="Динаміка по місяцях" span={2}>
              {peakMonth.loading ? <Loader /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={peakMonth.data} margin={{ left: 0, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="місяць" tick={{ fontSize: 11, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--mono)' }} />
                    <Line type="monotone" dataKey="поступлень" stroke="var(--accent)"
                      strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="померло" stroke="#c0392b"
                      strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* Footer */}
          <div style={{ textAlign: 'center', padding: '16px 0 8px',
            fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
            ЛСМД · Чернівці · дані оновлюються в реальному часі
          </div>
        </div>
      </div>
    </>
  )
}
