import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { deptIcon } from '../lib/dept-icons'

const COLORS = ['#1a1917','#6b6760','#9c9890','#c0c0b8','#d8d5cf','#4a9870','#c0392b','#e8a020']

/* ── hooks ─────────────────────────────────────────────── */

function useQuery(key) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetch('/api/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    }).then(r => r.json()).then(d => { setData(d.rows || []); setLoading(false) })
      .catch(() => { setData([]); setLoading(false) })
  }, [])
  return { data, loading }
}

function useInView(threshold = 0.12) {
  const ref = useRef()
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { threshold })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return [ref, visible]
}

function useCountUp(target, enabled = true, duration = 1400) {
  const [val, setVal] = useState(0)
  const rafRef = useRef()
  useEffect(() => {
    if (!enabled || !target) return
    const num = typeof target === 'number' ? target : parseFloat(String(target).replace(/[^0-9.]/g, ''))
    if (isNaN(num) || num === 0) return
    cancelAnimationFrame(rafRef.current)
    let start = null
    const step = (ts) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      const e = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(e * num))
      if (p < 1) rafRef.current = requestAnimationFrame(step)
      else setVal(num)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, enabled])
  return val
}

/* ── FloatingBg ────────────────────────────────────────── */

function FloatingBg() {
  const items = [
    { x: '4%',  y: '7%',  size: 22, dur: 7,   delay: 0    },
    { x: '14%', y: '70%', size: 18, dur: 8.5, delay: 1.3  },
    { x: '26%', y: '33%', size: 28, dur: 6.5, delay: 0.6  },
    { x: '39%', y: '87%', size: 20, dur: 9,   delay: 2.1  },
    { x: '53%', y: '14%', size: 26, dur: 7.5, delay: 0.9  },
    { x: '66%', y: '57%', size: 22, dur: 8,   delay: 1.7  },
    { x: '76%', y: '27%', size: 32, dur: 6.8, delay: 0.4  },
    { x: '86%', y: '76%', size: 24, dur: 7.2, delay: 2.6  },
    { x: '94%', y: '44%', size: 18, dur: 9.2, delay: 1.1  },
    { x: '48%', y: '64%', size: 26, dur: 8.3, delay: 3.2  },
    { x: '20%', y: '48%', size: 20, dur: 7.8, delay: 1.8  },
    { x: '61%', y: '91%', size: 24, dur: 6.2, delay: 0.2  },
  ]
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
      {items.map((item, i) => (
        <span key={i} style={{
          position: 'absolute', left: item.x, top: item.y,
          fontFamily: 'var(--mono)', fontSize: item.size,
          color: 'var(--text3)', userSelect: 'none', lineHeight: 1,
          animation: `floatY ${item.dur}s ease-in-out ${item.delay}s infinite alternate`,
        }}>+</span>
      ))}
    </div>
  )
}

/* ── Card ───────────────────────────────────────────────── */

function Card({ title, children, span = 1, delay = 0 }) {
  const [ref, visible] = useInView()
  return (
    <div ref={ref} className="anim-card" style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '10px', padding: '20px 24px',
      gridColumn: `span ${span}`,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(22px)',
      transition: `opacity 0.52s cubic-bezier(0,0,0.2,1) ${delay}s,
                   transform 0.52s cubic-bezier(0,0,0.2,1) ${delay}s,
                   box-shadow 0.22s ease, border-color 0.22s ease,
                   transform 0.22s cubic-bezier(0.34,1.56,0.64,1)`,
    }}>
      {title && (
        <p style={{ fontSize: '10px', fontFamily: 'var(--mono)', textTransform: 'uppercase',
          letterSpacing: '0.08em', color: 'var(--text3)', marginBottom: '16px' }}>{title}</p>
      )}
      {children}
    </div>
  )
}

/* ── StatBig з лічильником ──────────────────────────────── */

function StatBig({ rawValue, formattedValue, label, sub }) {
  const counted = useCountUp(rawValue, !!rawValue)
  const display = rawValue
    ? counted.toLocaleString('uk')
    : (formattedValue || '—')
  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <p style={{ fontSize: '36px', fontWeight: 300, fontFamily: 'var(--mono)', lineHeight: 1 }}>
        {display}
      </p>
      <p style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '6px' }}>{label}</p>
      {sub && <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px' }}>{sub}</p>}
    </div>
  )
}

/* ── Loader ─────────────────────────────────────────────── */

function Loader() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 40 }}>
      {[0, 0.2, 0.4].map((d, i) => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%', background: 'var(--text3)',
          animation: 'pulse 1.2s ease-in-out infinite', animationDelay: `${d}s`
        }} />
      ))}
    </div>
  )
}

/* ── Tooltip ────────────────────────────────────────────── */

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '8px 12px', fontSize: 12, fontFamily: 'var(--mono)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
      <p style={{ color: 'var(--text2)', marginBottom: 4 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || 'var(--text)' }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  )
}

/* ── Page ───────────────────────────────────────────────── */

export default function Analytics() {
  const summary    = useQuery('summary')
  const deptStats  = useQuery('deptStats')
  const peakHour   = useQuery('peakHour')
  const peakMonth  = useQuery('peakMonth')
  const peakWeekday = useQuery('peakWeekday')
  const urgency    = useQuery('urgency')
  const icu        = useQuery('icu')

  const s = summary.data?.[0] || {}
  const icuRow = icu.data?.[0] || {}

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
        @keyframes floatY {
          0%   { transform: translateY(0px)   rotate(0deg);  opacity: 0.38; }
          100% { transform: translateY(-28px) rotate(15deg); opacity: 0.72; }
        }
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes brandPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%     { opacity:0.65; transform:scale(1.18); }
        }
        .recharts-cartesian-axis-tick-value {
          font-family: 'IBM Plex Mono', monospace; font-size: 11px;
        }
        .anim-card { will-change: transform, box-shadow; }
        .anim-card:hover {
          box-shadow: 0 8px 28px rgba(26,25,23,0.09), 0 2px 8px rgba(26,25,23,0.05) !important;
          border-color: #c4c0b8 !important;
          transform: translateY(-3px) !important;
          transition: box-shadow .22s ease, border-color .22s ease, transform .22s cubic-bezier(0.34,1.56,0.64,1) !important;
        }
        header { animation: fadeInDown 0.45s cubic-bezier(0,0,0.2,1) both; }
      `}</style>

      <FloatingBg />

      <div style={{ minHeight: '100vh', position: 'relative' }}>

        {/* Header */}
        <header style={{
          background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          padding: '0 40px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', height: 56,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 300,
              color: 'var(--accent)', display: 'inline-block',
              animation: 'brandPulse 3.2s ease-in-out infinite' }}>+</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 500 }}>ЛСМД</span>
            <span style={{ color: 'var(--border)' }}>|</span>
            <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>Аналітичний дашборд</span>
          </div>
          <Link href="/glow" style={{
            fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)',
            textDecoration: 'none', padding: '6px 12px', borderRadius: 6,
            border: '1px solid var(--border)',
            transition: 'border-color .15s ease, color .15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#00e5ff'; e.currentTarget.style.color = '#00e5ff' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text2)' }}
          >✦ Гло-графіки</Link>
          <Link href="/" style={{
            fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)',
            textDecoration: 'none', padding: '6px 12px', borderRadius: 6,
            border: '1px solid var(--border)',
            transition: 'border-color .15s ease, color .15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text3)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text2)' }}
          >← AI Асистент</Link>
        </header>

        <div style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto' }}>

          {/* KPI Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { rawV: s.total_cases,      fmtV: s.total_cases?.toLocaleString('uk'),                    l: '✚ Госпіталізацій',       s: 'всього' },
              { rawV: s.unique_patients,  fmtV: s.unique_patients?.toLocaleString('uk'),                l: '◉ Унікальних пацієнтів', s: '' },
              { rawV: null,               fmtV: s.avg_bed_days ? Number(s.avg_bed_days).toFixed(1) : '—', l: '≋ Середній ліжкодень',   s: 'днів' },
              { rawV: null,               fmtV: s.death_rate_pct ? Number(s.death_rate_pct).toFixed(2) + '%' : '—', l: '♡ Летальність', s: 'загальна' },
              { rawV: null,               fmtV: icuRow.летальність_pct ? Number(icuRow.летальність_pct).toFixed(1) + '%' : '—',
                l: '◎ Летальність реанімації', s: `${icuRow.померло || '—'} / ${icuRow.всього_поступлень?.toLocaleString('uk') || '—'}` },
            ].map((kpi, i) => (
              <Card key={i} delay={i * 0.07}>
                {summary.loading || icu.loading ? <Loader /> : (
                  <StatBig rawValue={kpi.rawV} formattedValue={kpi.fmtV} label={kpi.l} sub={kpi.s} />
                )}
              </Card>
            ))}
          </div>

          {/* Row 2: Відділення + Ургентні */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
            <Card title="⊞ Топ відділень за кількістю випадків" delay={0.1}>
              {deptStats.loading ? <Loader /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={deptStats.data} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="відділення" width={210}
                      tick={{ fontSize: 10, fontFamily: 'var(--mono)', fill: 'var(--text2)' }}
                      tickFormatter={v => {
                        const icon = deptIcon(v)
                        const label = v.length > 25 ? v.slice(0,23)+'…' : v
                        return `${icon} ${label}`
                      }}
                      axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="випадків" fill="var(--accent)" radius={[0,3,3,0]}
                      isAnimationActive animationDuration={1200} animationEasing="ease-out" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card title="⚡ Ургентні vs Планові" delay={0.2}>
              {urgency.loading ? <Loader /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={urgency.data} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="відділення" tick={{ fontSize: 9, fontFamily: 'var(--mono)' }}
                      tickFormatter={v => v.split(' ')[0].slice(0,8)} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--mono)' }} />
                    <Bar dataKey="ургентних" fill="#c0392b" radius={[3,3,0,0]}
                      isAnimationActive animationDuration={1200} />
                    <Bar dataKey="планових" fill="var(--text3)" radius={[3,3,0,0]}
                      isAnimationActive animationDuration={1400} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* Row 3: Години + Дні тижня */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <Card title="↑ Поступлення по годинах доби" delay={0.1}>
              {peakHour.loading ? <Loader /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={peakHour.data} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="година" tick={{ fontSize: 10, fontFamily: 'var(--mono)' }}
                      tickFormatter={v => v % 4 === 0 ? `${v}:00` : ''} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="поступлень" fill="var(--accent)" radius={[2,2,0,0]}
                      isAnimationActive animationDuration={1000} animationEasing="ease-out" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card title="☾ Поступлення по днях тижня" delay={0.2}>
              {peakWeekday.loading ? <Loader /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={peakWeekday.data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="назва" tick={{ fontSize: 11, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="поступлень" fill="var(--accent)" radius={[3,3,0,0]}
                      isAnimationActive animationDuration={1200} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* Row 4: Динаміка по місяцях */}
          <div style={{ marginBottom: 24 }}>
            <Card title="≋ Динаміка по місяцях" span={2} delay={0.15}>
              {peakMonth.loading ? <Loader /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={peakMonth.data} margin={{ left: 0, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="місяць" tick={{ fontSize: 11, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--mono)' }} />
                    <Line type="monotone" dataKey="поступлень" stroke="var(--accent)"
                      strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }}
                      isAnimationActive animationDuration={1800} animationEasing="ease-out" />
                    <Line type="monotone" dataKey="померло" stroke="#c0392b"
                      strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }}
                      isAnimationActive animationDuration={2100} animationEasing="ease-out" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <div style={{ textAlign: 'center', padding: '16px 0 8px',
            fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
            ЛСМД · Чернівці · дані оновлюються в реальному часі
          </div>
        </div>
      </div>
    </>
  )
}
