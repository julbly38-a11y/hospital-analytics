import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { deptIcon } from '../lib/dept-icons'

/* ── Config ───────────────────────────────────────── */
const BLOCK_CFG = {
  'хірургічний':        { icon: '✂', color: '#c0392b', label: 'Хірургічний' },
  'терапевтичний':      { icon: '♡', color: '#4a9870', label: 'Терапевтичний' },
  'інтенсивна_терапія': { icon: '◎', color: '#2563eb', label: 'Інтенсивна терапія' },
  'параклінічний':      { icon: '≡', color: '#6b6760', label: 'Параклінічний' },
}
const BLOCK_ORDER = ['хірургічний', 'терапевтичний', 'інтенсивна_терапія', 'параклінічний']

async function fetchStats(key, param) {
  const body = param !== undefined ? { key, param } : { key }
  const r = await fetch('/api/stats', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const d = await r.json()
  return d.rows || []
}

function initials(name = '') {
  if (name.startsWith('+')) return '+'
  return name.split(/[\s.]+/).filter(p => p.length > 1).slice(0, 2).map(p => p[0].toUpperCase()).join('')
}

/* ── Hospital card ────────────────────────────────── */
function HospitalCard({ total, patients, staff, depts }) {
  const stats = [
    { v: total?.toLocaleString('uk') || '…', l: 'Госпіталізацій' },
    { v: patients?.toLocaleString('uk') || '…', l: 'Пацієнтів' },
    { v: staff || '…', l: 'Співробітників' },
    { v: depts || '…', l: 'Відділень' },
  ]
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 12,
      padding: '20px 24px', background: 'var(--bg2)',
      display: 'flex', alignItems: 'flex-start',
      justifyContent: 'space-between', gap: 16,
      flexWrap: 'wrap', marginBottom: 20
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 26, fontWeight: 300, color: '#c0392b', fontFamily: 'var(--mono)', lineHeight: 1 }}>+</span>
          <span style={{ fontSize: 20, fontWeight: 500, fontFamily: 'var(--mono)', color: 'var(--text)' }}>ЛСМД</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>Лікарня швидкої медичної допомоги</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, fontFamily: 'var(--mono)' }}>Чернівці · Україна · 20 відділень</div>
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {stats.map(s => (
          <div key={s.l} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 300, fontFamily: 'var(--mono)', color: 'var(--text)', lineHeight: 1.1 }}>{s.v}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--mono)' }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Block card ───────────────────────────────────── */
function BlockCard({ blk, cfg, depts, active, onClick }) {
  const totalDocs = depts.reduce((s, d) => s + (Number(d.лікарів) || 0), 0)
  return (
    <div onClick={onClick} style={{
      border: `1px solid ${active ? cfg.color : 'var(--border)'}`,
      borderRadius: 10, padding: '16px',
      background: active ? 'var(--bg2)' : 'var(--surface)',
      cursor: 'pointer', transition: 'all .18s',
      borderTop: `3px solid ${cfg.color}`,
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.08)' }}
    onMouseLeave={e => { e.currentTarget.style.boxShadow = '' }}
    >
      <div style={{ fontSize: 22, marginBottom: 8 }}>{cfg.icon}</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 8, lineHeight: 1.3 }}>{cfg.label}</div>
      <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--mono)', marginBottom: 2 }}>{depts.length} відділень</div>
      <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--mono)', marginBottom: 10 }}>{totalDocs} лікарів</div>
      <div style={{ fontSize: 10, fontWeight: 500, color: active ? cfg.color : 'var(--text3)', fontFamily: 'var(--mono)' }}>
        {active ? '▲ Згорнути' : '▼ Відкрити'}
      </div>
    </div>
  )
}

/* ── Department card ──────────────────────────────── */
function DeptCard({ dept, cfg, active, hasDoc, onClick }) {
  const head = dept._head
  return (
    <div onClick={onClick} style={{
      border: `${active ? '1.5px' : '1px'} solid ${active ? cfg.color : 'var(--border)'}`,
      borderRadius: 8, padding: '12px 14px',
      background: active ? 'var(--bg2)' : 'var(--surface)',
      cursor: hasDoc ? 'pointer' : 'default',
      transition: 'all .15s',
    }}
    onMouseEnter={e => { if (hasDoc && !active) e.currentTarget.style.background = 'var(--bg2)' }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'var(--surface)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 6 }}>
        <span style={{ fontSize: 15, lineHeight: 1.2 }}>{deptIcon(dept.відділення)}</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', lineHeight: 1.3 }}>{dept.відділення}</span>
      </div>
      {head && (
        <div style={{ fontSize: 10, color: cfg.color, marginBottom: 5, fontFamily: 'var(--mono)' }}>↳ {head}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{dept.лікарів} лікарів</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <a href={'/analytics'} onClick={e => e.stopPropagation()}
            title="Аналітика відділення"
            style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', textDecoration: 'none',
              padding: '1px 4px', border: '1px solid var(--border)', borderRadius: 3 }}>📊</a>
          {hasDoc && <span style={{ fontSize: 10, color: 'var(--text3)' }}>{active ? '▲' : '▼'}</span>}
        </div>
      </div>
    </div>
  )
}

/* ── Doctor chip ──────────────────────────────────── */
function DocChip({ doc, cfg, onAsk }) {
  const isHead = doc.посада?.toLowerCase().includes('завідувач')
  const ini = initials(doc.лікар || '')
  const clickable = !doc.лікар?.startsWith('+')
  return (
    <div onClick={clickable ? onAsk : undefined}
      title={clickable ? `Запитати AI про ${doc.лікар}` : ''}
      style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 10px 5px 5px',
      border: '1px solid var(--border)', borderRadius: 8,
      background: 'var(--surface)',
      cursor: clickable ? 'pointer' : 'default',
      transition: 'border-color .15s, background .15s',
    }}
    onMouseEnter={e => { if (clickable) { e.currentTarget.style.borderColor = cfg.color; e.currentTarget.style.background = 'var(--bg2)' } }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' }}
    >
      <div style={{
        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
        background: isHead ? cfg.color : 'var(--bg2)',
        color: isHead ? '#fff' : 'var(--text2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 500, fontFamily: 'var(--mono)',
      }}>{ini}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: isHead ? 500 : 400, color: 'var(--text)', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
          {doc.лікар}
        </div>
        {doc.спеціалізація && doc.спеціалізація !== '—' && (
          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{doc.спеціалізація}</div>
        )}
      </div>
      {isHead && (
        <div style={{
          fontSize: 9, padding: '2px 5px', borderRadius: 3,
          background: cfg.color + '18', color: cfg.color, fontWeight: 500,
          fontFamily: 'var(--mono)', flexShrink: 0
        }}>завід.</div>
      )}
      {clickable && (
        <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', flexShrink: 0 }}>→AI</div>
      )}
    </div>
  )
}

/* ── Section label ────────────────────────────────── */
function SectionLabel({ text }) {
  return (
    <div style={{
      fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em',
      color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 10
    }}>{text}</div>
  )
}

/* ── SVG Line Chart ───────────────────────────────── */
const CHART_COLORS = ['#e74c3c', '#3b82f6', '#f59e0b']

function SvgLineChart({ rows, xKey }) {
  if (!rows?.length) return (
    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', padding: '10px 0' }}>Даних немає</div>
  )
  const W = 560, H = 110, PL = 30, PR = 8, PT = 8, PB = 24
  const cW = W - PL - PR, cH = H - PT - PB
  const xVals = [...new Set(rows.map(r => r[xKey]))].sort()
  const codes  = [...new Set(rows.map(r => r.код))]
  const lookup = {}
  rows.forEach(r => { lookup[`${r[xKey]}_${r.код}`] = Number(r.випадків) || 0 })
  const maxY = Math.max(...rows.map(r => Number(r.випадків) || 0), 1)
  const px = i => PL + (xVals.length > 1 ? (i / (xVals.length - 1)) * cW : cW / 2)
  const py = v => PT + cH - Math.min((v / maxY) * cH, cH)
  const step = Math.max(1, Math.ceil(xVals.length / 8))
  return (
    <div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
        {codes.map((c, ci) => {
          const label = rows.find(r => r.код === c)?.діагноз || ''
          return (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 18, height: 2, background: CHART_COLORS[ci % 3], borderRadius: 1 }} />
              <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                {c}{label ? ` · ${label.slice(0, 32)}` : ''}
              </span>
            </div>
          )
        })}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {[0, 0.5, 1].map(f => (
          <line key={f} x1={PL} x2={W - PR} y1={py(maxY * f)} y2={py(maxY * f)}
            stroke="var(--border)" strokeWidth={0.5} strokeDasharray={f < 1 ? '3,3' : undefined} />
        ))}
        {[0, Math.round(maxY / 2), maxY].map(v => (
          <text key={v} x={PL - 3} y={py(v) + 3.5} textAnchor="end" fontSize={7} fill="var(--text3)" fontFamily="monospace">{v}</text>
        ))}
        {xVals.map((x, i) => i % step === 0 && (
          <text key={x} x={px(i)} y={H - 4} textAnchor="middle" fontSize={7} fill="var(--text3)" fontFamily="monospace">
            {xKey === 'день' ? x : x.slice(5)}
          </text>
        ))}
        {codes.map((c, ci) => {
          const color = CHART_COLORS[ci % 3]
          const pts = xVals.map((x, i) => [px(i), py(lookup[`${x}_${c}`] || 0)])
          return (
            <g key={c}>
              <polyline
                points={pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}
                fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
              />
              {pts.map(([cx2, cy2], i) => (lookup[`${xVals[i]}_${c}`] || 0) > 0 && (
                <circle key={i} cx={cx2} cy={cy2} r={2.5} fill={color} stroke="var(--surface)" strokeWidth={1.5} />
              ))}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ── Main page ────────────────────────────────────── */
export default function OrgPage() {
  const router = useRouter()
  const [depts, setDepts]   = useState([])
  const [docs, setDocs]     = useState([])
  const [loading, setLoading] = useState(true)
  const [selBlock, setSelBlock] = useState(null)
  const [selDept,  setSelDept]  = useState(null)
  const [deptProfile, setDeptProfile] = useState(null)
  const [deptDiag,    setDeptDiag]    = useState([])
  const [deptTrend,   setDeptTrend]   = useState([])
  const [deptTrendM,  setDeptTrendM]  = useState([])
  const [selDoc,      setSelDoc]      = useState(null)
  const [selDocProf,  setSelDocProf]  = useState(null)
  const [selDocDiag,  setSelDocDiag]  = useState([])

  useEffect(() => {
    Promise.all([fetchStats('orgDepts'), fetchStats('orgDocs')])
      .then(([d, dc]) => { setDepts(d); setDocs(dc); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // useMemo ПЕРЕД useEffect що від нього залежить — уникаємо TDZ ReferenceError
  const blocks = useMemo(() => {
    const headMap = {}
    docs.forEach(d => {
      if (d.посада?.toLowerCase().includes('завідувач') && !headMap[d.відділення]) {
        headMap[d.відділення] = d.лікар
      }
    })
    const grouped = {}
    depts.forEach(d => {
      const blk = d.block || 'параклінічний'
      if (!grouped[blk]) grouped[blk] = []
      grouped[blk].push({ ...d, _head: headMap[d.відділення] || null })
    })
    return BLOCK_ORDER.map(b => ({ id: b, depts: grouped[b] || [] })).filter(b => b.depts.length > 0)
  }, [depts, docs])

  const selDeptDocs = useMemo(() => {
    if (!selDept) return []
    return docs.filter(d => d.відділення === selDept)
  }, [docs, selDept])

  // Auto-expand dept + block from URL param (?dept=...)
  useEffect(() => {
    const deptParam = router.query?.dept
    if (!deptParam || loading || !blocks.length) return
    setSelDept(deptParam)
    const blk = blocks.find(b => b.depts.some(d => d.відділення === deptParam))
    if (blk) setSelBlock(blk.id)
  }, [router.query?.dept, loading, blocks])

  // Підгрузка профілю, діагнозів і трендів відділення при виборі
  useEffect(() => {
    setSelDoc(null); setSelDocProf(null); setSelDocDiag([])
    if (!selDept) { setDeptProfile(null); setDeptDiag([]); setDeptTrend([]); setDeptTrendM([]); return }
    setDeptProfile(null); setDeptDiag([]); setDeptTrend([]); setDeptTrendM([])
    Promise.all([
      fetchStats('deptProfile', selDept),
      fetchStats('deptDiag', selDept),
      fetchStats('deptTrend12m', selDept),
      fetchStats('deptTrendMonth', selDept),
    ]).then(([prof, diag, trend, trendM]) => {
      setDeptProfile(prof[0] || null)
      setDeptDiag(diag)
      setDeptTrend(trend)
      setDeptTrendM(trendM)
    })
  }, [selDept])

  // Підгрузка профілю лікаря при виборі
  useEffect(() => {
    if (!selDoc) { setSelDocProf(null); setSelDocDiag([]); return }
    setSelDocProf(null); setSelDocDiag([])
    Promise.all([
      fetchStats('docProfile', selDoc),
      fetchStats('docDiag', selDoc),
    ]).then(([prof, diag]) => {
      setSelDocProf(prof[0] || null)
      setSelDocDiag(diag)
    })
  }, [selDoc])

  // Stats
  const totalDocs  = depts.reduce((s, d) => s + (Number(d.лікарів) || 0), 0)
  const totalStaff = depts.reduce((s, d) => s + (Number(d.персонал) || 0), 0)

  return (
    <>
      <Head>
        <title>ЛСМД · Структура лікарні</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px 32px', maxWidth: 1280, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>ЛСМД</span>
            <span style={{ color: 'var(--border)' }}>·</span>
            <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Структура лікарні</span>
            {loading && <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginLeft: 8 }}>завантаження…</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['← AI Асистент', '/'], ['Аналітика', '/analytics'], ['Гло-графіки', '/glow']].map(([t, h]) => (
              <Link key={h} href={h} style={{
                fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)',
                textDecoration: 'none', padding: '5px 12px',
                border: '1px solid var(--border)', borderRadius: 6, transition: 'all .15s'
              }}>{t}</Link>
            ))}
          </div>
        </div>

        {/* Hospital card */}
        <HospitalCard total={110206} patients={72293} staff={totalStaff || 882} depts={depts.length || 20} />

        {/* Block cards */}
        <SectionLabel text="Клінічні напрямки" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {blocks.map(blk => {
            const cfg = BLOCK_CFG[blk.id] || { icon: '⊞', color: '#6b6760', label: blk.id }
            return (
              <BlockCard key={blk.id} blk={blk.id} cfg={cfg} depts={blk.depts}
                active={selBlock === blk.id}
                onClick={() => { setSelBlock(selBlock === blk.id ? null : blk.id); setSelDept(null) }}
              />
            )
          })}
        </div>

        {/* Departments */}
        {selBlock && (() => {
          const blk = blocks.find(b => b.id === selBlock)
          const cfg = BLOCK_CFG[selBlock] || { icon: '⊞', color: '#6b6760', label: selBlock }
          return (
            <div style={{ marginBottom: 24 }}>
              <SectionLabel text={`Відділення · ${cfg.label}`} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
                {blk.depts.map(dept => {
                  const deptDocs = docs.filter(d => d.відділення === dept.відділення)
                  return (
                    <DeptCard key={dept.відділення} dept={dept} cfg={cfg}
                      active={selDept === dept.відділення}
                      hasDoc={deptDocs.length > 0}
                      onClick={() => { if (deptDocs.length > 0) setSelDept(selDept === dept.відділення ? null : dept.відділення) }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* Dept detail panel */}
        {selDept && (() => {
          const cfg = BLOCK_CFG[selBlock] || { icon: '⊞', color: '#6b6760', label: selBlock }
          const isNeuro = /невро|нейро/i.test(selDept)

          const head   = selDeptDocs.find(d => d.посада?.toLowerCase().includes('завідувач'))
          const others = selDeptDocs.filter(d => !d.посада?.toLowerCase().includes('завідувач'))

          const top7 = deptDiag.slice(0, 7)
          const maxPct = top7.reduce((m, d) => Math.max(m, Number(d.відс) || 0), 0) || 1

          const kpis = deptProfile ? [
            { l: 'Випадків',    v: deptProfile.випадків?.toLocaleString('uk') },
            { l: 'Унікальних',  v: deptProfile.унікальних?.toLocaleString('uk') },
            { l: 'Ліжкодень',   v: deptProfile.ліжкодень },
            { l: 'Летальність', v: deptProfile.летальність != null ? deptProfile.летальність + '%' : null },
            { l: 'Смерть день1',v: deptProfile.смерть_день1 != null ? String(deptProfile.смерть_день1) : null },
            ...(!isNeuro && deptProfile.повторні != null
              ? [{ l: 'Повторні госп.', v: Number(deptProfile.повторні).toLocaleString('uk') }]
              : []),
          ].filter(k => k.v != null) : []

          return (
            <div style={{
              border: `1px solid ${cfg.color}33`,
              borderLeft: `3px solid ${cfg.color}`,
              borderRadius: 8, padding: '16px 20px',
              marginBottom: 24, background: 'var(--surface)'
            }}>
              {/* Заголовок */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {selDoc
                    ? <>
                        <button onClick={() => setSelDoc(null)} style={{ fontSize: 12, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)', padding: 0 }}>← {selDept}</button>
                        <span style={{ color: 'var(--border)' }}>›</span>
                        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{selDoc}</span>
                      </>
                    : <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{selDept}</div>
                  }
                </div>
                <button onClick={() => { setSelDept(null); setSelDoc(null) }} style={{ fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)' }}>✕</button>
              </div>

              {/* ── Картка лікаря ── */}
              {selDoc ? (() => {
                const docInfo = selDeptDocs.find(d => d.лікар === selDoc)
                const top7d   = selDocDiag.slice(0, 7)
                const maxPctD = top7d.reduce((m, d) => Math.max(m, Number(d.відс) || 0), 0) || 1
                return (
                  <div>
                    {/* Посада / спеціалізація */}
                    {docInfo && (
                      <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                        {docInfo.посада && <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>{docInfo.посада}</div>}
                        {!isNeuro && docInfo.спеціалізація && docInfo.спеціалізація !== '—' && (
                          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{docInfo.спеціалізація}</div>
                        )}
                      </div>
                    )}

                    {/* KPI */}
                    {!selDocProf
                      ? <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 16 }}>завантаження…</div>
                      : <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                          {[
                            { l: 'Випадків',    v: selDocProf.випадків?.toLocaleString('uk') },
                            { l: 'Унікальних',  v: selDocProf.унікальних?.toLocaleString('uk') },
                            { l: 'Ліжкодень',   v: selDocProf.ліжкодень },
                            { l: 'Летальність', v: selDocProf.летальність != null ? selDocProf.летальність + '%' : null },
                          ].filter(k => k.v != null).map(k => (
                            <div key={k.l}>
                              <div style={{ fontSize: 18, fontWeight: 300, fontFamily: 'var(--mono)', color: cfg.color, lineHeight: 1.1 }}>{k.v}</div>
                              <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)', marginTop: 2 }}>{k.l}</div>
                            </div>
                          ))}
                        </div>
                    }

                    {/* Топ діагнози */}
                    {top7d.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 10 }}>Топ діагнози МКХ-10</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {top7d.map((d, i) => (
                            <div key={i}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                <span style={{ fontFamily: 'var(--mono)', color: cfg.color, fontSize: 10, minWidth: 36, flexShrink: 0 }}>{d.код}</span>
                                <span style={{ color: 'var(--text2)', flex: 1, fontSize: 11, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.діагноз}</span>
                                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: 10, flexShrink: 0 }}>{d.відс}%</span>
                              </div>
                              <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
                                <div style={{ width: `${Math.round((Number(d.відс) / maxPctD) * 100)}%`, height: '100%', background: cfg.color + 'cc', borderRadius: 2, transition: 'width .5s' }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {selDocDiag.length === 0 && selDocProf && (
                      <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 16 }}>Діагнози не знайдено</div>
                    )}
                  </div>
                )
              })() : null}

              {/* Завідувач */}
              {!selDoc && head && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 6 }}>Завідувач</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      onClick={() => setSelDoc(head.лікар)}
                      style={{ width: 30, height: 30, borderRadius: '50%', background: cfg.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 500, flexShrink: 0, cursor: 'pointer' }}
                    >
                      {initials(head.лікар)}
                    </div>
                    <div>
                      <div onClick={() => setSelDoc(head.лікар)} style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.color = cfg.color}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text)'}
                      >{head.лікар}</div>
                      {!isNeuro && head.спеціалізація && head.спеціалізація !== '—' && (
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{head.спеціалізація}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Ординатори */}
              {!selDoc && others.length > 0 && (
                <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 8 }}>
                    Ординатори <span style={{ color: cfg.color }}>({others.length})</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                    {others.map((d, i) => (
                      <div key={i}
                        onClick={() => setSelDoc(d.лікар)}
                        style={{ fontSize: 12, color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                        onMouseEnter={e => e.currentTarget.style.color = cfg.color}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text2)'}
                      >
                        {isNeuro
                          ? <span><span style={{ color: 'var(--text3)', fontSize: 10 }}>{d.посада || 'Ординатор'} </span>{d.лікар}</span>
                          : <span>{d.лікар}{d.спеціалізація && d.спеціалізація !== '—' ? <span style={{ color: 'var(--text3)', fontSize: 10, fontFamily: 'var(--mono)' }}> · {d.спеціалізація}</span> : ''}</span>
                        }
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* KPI показники */}
              {!selDoc && (
                !deptProfile
                  ? <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 16 }}>завантаження показників…</div>
                  : kpis.length > 0 && (
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                      {kpis.map(k => (
                        <div key={k.l}>
                          <div style={{ fontSize: 18, fontWeight: 300, fontFamily: 'var(--mono)', color: cfg.color, lineHeight: 1.1 }}>{k.v}</div>
                          <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)', marginTop: 2 }}>{k.l}</div>
                        </div>
                      ))}
                    </div>
                  )
              )}

              {/* Топ-7 діагнозів МКХ-10 — горизонтальні бари */}
              {!selDoc && top7.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 10 }}>Топ діагнози МКХ-10</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {top7.map((d, i) => (
                      <div key={i}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontFamily: 'var(--mono)', color: cfg.color, fontSize: 10, minWidth: 36, flexShrink: 0 }}>{d.код}</span>
                          <span style={{ color: 'var(--text2)', flex: 1, fontSize: 11, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.діагноз}</span>
                          <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: 10, flexShrink: 0 }}>{d.відс}%</span>
                        </div>
                        <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
                          <div style={{ width: `${Math.round((Number(d.відс) / maxPct) * 100)}%`, height: '100%', background: cfg.color + 'cc', borderRadius: 2, transition: 'width .5s' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!selDoc && deptDiag.length === 0 && deptProfile && (
                <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Діагнози не знайдено</div>
              )}

              {/* Лінійні графіки трендів */}
              {!selDoc && (deptTrend.length > 0 || deptTrendM.length > 0) && (
                <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 14 }}>
                    Тренд госпіталізацій · топ-3 діагнози
                  </div>

                  {/* Річний тренд (помісячно) */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 6, letterSpacing: '0.04em' }}>
                      12 місяців (помісячно)
                    </div>
                    <SvgLineChart rows={deptTrend} xKey="місяць" />
                  </div>

                  {/* Поточний місяць (по днях) */}
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 6, letterSpacing: '0.04em' }}>
                      Поточний місяць (по днях)
                    </div>
                    <SvgLineChart rows={deptTrendM} xKey="день" />
                  </div>
                </div>
              )}

            </div>
          )
        })()}

        {/* Empty state */}
        {!loading && blocks.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12 }}>
            Дані структури не завантажились. Перевірте підключення.
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 32, fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
          ЛСМД · Чернівці · реальні дані Supabase
        </div>
      </div>
    </>
  )
}
