import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

const SANS = { fontFamily: '"IBM Plex Sans", sans-serif' }
const MONO = { fontFamily: '"IBM Plex Mono", monospace' }

const BLOCK_CFG = {
  'приймально_діагностичний': { color: '#c0392b', label: 'Приймально-діагностичний' },
  'клінічний':                { color: '#4a9870', label: 'Клінічні відділення' },
  'анестезіологія_іт':        { color: '#2563eb', label: 'Анестезіологія та ІТ' },
  'параклінічний':            { color: '#6b7280', label: 'Параклінічні' },
  'адміністративний':         { color: '#7c3aed', label: 'Адміністративний' },
}
const BLOCK_ORDER = ['приймально_діагностичний', 'клінічний', 'анестезіологія_іт', 'параклінічний', 'адміністративний']

async function fetchStats(key, param) {
  const r = await fetch('/api/stats', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(param !== undefined ? { key, param } : { key }),
  })
  const d = await r.json()
  return d.rows || []
}

function fmt(v, suffix = '') {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return isNaN(n) ? '—' : n.toLocaleString('uk') + suffix
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
}

/* ── Stat number (same as index.js) ─────────────────── */
function Stat({ value, label, large }) {
  return (
    <div>
      <div style={{ fontSize: large ? 52 : 32, fontWeight: 300, color: '#1a1a1a', ...MONO, lineHeight: 1, letterSpacing: '-0.02em' }}>
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

/* ── Block pill ──────────────────────────────────────── */
function BlockPill({ blk, cfg, depts, active, onClick }) {
  const totalDocs = depts.reduce((s, d) => s + (Number(d.лікарів) || 0), 0)
  return (
    <div onClick={onClick} style={{
      background: active ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.45)',
      border: `1px solid ${active ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.08)'}`,
      borderTop: `3px solid ${cfg.color}`,
      borderRadius: 10, padding: '14px 18px', cursor: 'pointer',
      backdropFilter: 'blur(8px)',
      transition: 'all .18s',
      boxShadow: active ? '0 4px 16px rgba(0,0,0,0.1)' : 'none',
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.6)' }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.45)' }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', marginBottom: 8, lineHeight: 1.3, ...SANS }}>{cfg.label}</div>
      <div style={{ fontSize: 11, color: '#555', ...MONO }}>{depts.length} відд. · {totalDocs} лікарів</div>
      <div style={{ fontSize: 10, color: active ? cfg.color : '#999', marginTop: 8, ...MONO }}>{active ? '▲ Згорнути' : '▼ Відкрити'}</div>
    </div>
  )
}

/* ── Dept card ───────────────────────────────────────── */
function DeptCard({ dept, cfg, active, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: active ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)',
      border: `1px solid ${active ? cfg.color + '55' : 'rgba(0,0,0,0.08)'}`,
      borderRadius: 8, padding: '11px 14px', cursor: 'pointer',
      backdropFilter: 'blur(6px)',
      transition: 'all .15s',
      boxShadow: active ? `0 3px 12px ${cfg.color}18` : 'none',
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.7)' }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.5)' }}
    >
      <div style={{ fontSize: 12, fontWeight: 500, color: '#1a1a1a', lineHeight: 1.35, marginBottom: 4, ...SANS }}>{dept.відділення}</div>
      {dept._head && <div style={{ fontSize: 10, color: cfg.color, ...MONO, marginBottom: 4 }}>↳ {dept._head}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#888', ...MONO }}>{dept.лікарів} лікарів</span>
        <span style={{ fontSize: 10, color: active ? cfg.color : '#bbb' }}>{active ? '▲' : '▼'}</span>
      </div>
    </div>
  )
}

/* ── Main page ───────────────────────────────────────── */
export default function OrgPage() {
  const router = useRouter()

  const [depts,   setDepts]   = useState([])
  const [docs,    setDocs]    = useState([])
  const [loading, setLoading] = useState(true)

  const [kpi,       setKpi]       = useState(null)
  const [doctorCnt, setDoctorCnt] = useState(null)
  const [allYears,  setAllYears]  = useState([])
  const [chartYear, setChartYear] = useState('all')

  const [selBlock,    setSelBlock]    = useState(null)
  const [selDept,     setSelDept]     = useState(null)
  const [deptProfile, setDeptProfile] = useState(null)
  const [deptDiag,    setDeptDiag]    = useState([])

  /* Initial load */
  useEffect(() => {
    Promise.all([
      fetchStats('orgDepts'),
      fetchStats('orgDocs'),
      fetchStats('doctorCount'),
      fetchStats('allYears'),
    ]).then(([d, dc, cnt, yrs]) => {
      setDepts(d); setDocs(dc)
      setDoctorCnt(cnt[0]?.cnt ?? null)
      setAllYears(yrs.map(r => r.year).filter(Boolean))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  /* KPI by year */
  useEffect(() => {
    setKpi(null)
    fetchStats('ovKpiYear', chartYear === 'all' ? 'all' : String(chartYear))
      .then(rows => setKpi(rows[0] || null))
  }, [chartYear])

  const blocks = useMemo(() => {
    const headMap = {}
    docs.forEach(d => {
      if (d.посада?.toLowerCase().includes('завідувач') && !headMap[d.відділення])
        headMap[d.відділення] = d.лікар
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

  /* URL param */
  useEffect(() => {
    const p = router.query?.dept
    if (!p || loading || !blocks.length) return
    setSelDept(p)
    const blk = blocks.find(b => b.depts.some(d => d.відділення === p))
    if (blk) setSelBlock(blk.id)
  }, [router.query?.dept, loading, blocks])

  /* Dept stats — оновлюється при зміні відділення АБО року */
  useEffect(() => {
    if (!selDept) { setDeptProfile(null); setDeptDiag([]); return }
    setDeptProfile(null); setDeptDiag([])
    const y = chartYear === 'all' ? 'all' : String(chartYear)
    Promise.all([
      fetchStats('deptProfileYear', `${selDept}|${y}`),
      fetchStats('deptDiag', selDept),
    ]).then(([prof, diag]) => {
      setDeptProfile(prof[0] || null)
      setDeptDiag(diag)
    })
  }, [selDept, chartYear])

  const selCfg     = selBlock ? (BLOCK_CFG[selBlock] || { color: '#6b7280' }) : null
  const head       = selDeptDocs.find(d => d.посада?.toLowerCase().includes('завідувач'))
  const others     = selDeptDocs.filter(d => !d.посада?.toLowerCase().includes('завідувач'))
  const top7       = deptDiag.slice(0, 7)
  const maxPct     = top7.reduce((m, d) => Math.max(m, Number(d.відс) || 0), 0) || 1

  return (
    <>
      <Head>
        <title>ЛСМД · Структура лікарні</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', background: '#eeeae4', ...SANS }}>

        {/* ══ ВЕРХНЯ ЗОНА: статистика + рік ══ */}
        <div style={{
          background: 'linear-gradient(135deg, #cfe0ea 0%, #ddd0e8 30%, #eaddd0 60%, #d0e8da 100%)',
          position: 'relative', overflow: 'hidden',
          padding: '0 40px',
        }}>
          {/* Декоративні кола */}
          <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: 400, height: 400, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: '-20%', right: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />

          {/* Лого + назва */}
          <div style={{ position: 'relative', zIndex: 1, paddingTop: 28, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 22, color: '#c0392b', ...MONO, lineHeight: 1 }}>+</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', letterSpacing: '0.06em', ...MONO }}>ЛСМД</div>
              <div style={{ fontSize: 10, color: '#666', marginTop: 1, ...SANS }}>Структура лікарні</div>
            </div>
            {/* Кнопка назад */}
            <button onClick={() => router.push('/')} style={{
              marginLeft: 'auto', background: 'rgba(0,0,0,0.08)', border: 'none',
              borderRadius: 8, padding: '5px 14px', cursor: 'pointer',
              fontSize: 11, color: '#444', ...MONO,
            }}>← Головна</button>
          </div>

          {/* Перемикач року */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 4, marginBottom: 16 }}>
            <button onClick={() => setChartYear('all')} style={{
              padding: '3px 12px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.15)',
              background: chartYear === 'all' ? 'rgba(0,0,0,0.12)' : 'transparent',
              fontSize: 10, cursor: 'pointer', ...MONO, color: '#444',
            }}>Всі</button>
            {allYears.map(y => (
              <button key={y} onClick={() => setChartYear(y)} style={{
                padding: '3px 12px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.15)',
                background: chartYear === y ? 'rgba(0,0,0,0.12)' : 'transparent',
                fontSize: 10, cursor: 'pointer', ...MONO, color: '#444',
              }}>{y}</button>
            ))}
          </div>

          {/* Головні показники */}
          <div style={{
            position: 'relative', zIndex: 1,
            display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap',
            gap: '16px 32px', paddingBottom: 28,
          }}>
            <Stat value={kpi ? fmt(kpi.total_cases)       : '…'} label="ГОСПІТАЛІЗАЦІЙ" />
            <Stat value={kpi ? fmt(kpi.unique_patients)   : '…'} label="ПАЦІЄНТІВ" />
            <Stat value={doctorCnt != null ? fmt(doctorCnt) : '…'} label="ЛІКАРІВ" />
            <Stat value={depts.length || '…'}                     label="ВІДДІЛЕНЬ" />
            <Stat value={kpi ? fmt(kpi.death_rate_pct, '%') : '…'} label="ЛЕТАЛЬНІСТЬ" />
            <Stat value={chartYear === 'all' ? 'Всі' : String(chartYear)} large />
          </div>
        </div>

        {/* ══ КОНТЕНТ: блоки + відділення ══ */}
        <div style={{ padding: '28px 40px', maxWidth: 1280, margin: '0 auto' }}>

          {/* Section label */}
          <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 16 }}>
            Клінічні напрямки {loading && '· завантаження…'}
          </div>

          {/* Block pills */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: 24 }}>
            {blocks.map(blk => {
              const cfg = BLOCK_CFG[blk.id] || { color: '#6b7280', label: blk.id }
              return (
                <BlockPill key={blk.id} blk={blk.id} cfg={cfg} depts={blk.depts}
                  active={selBlock === blk.id}
                  onClick={() => { setSelBlock(selBlock === blk.id ? null : blk.id); setSelDept(null) }}
                />
              )
            })}
          </div>

          {/* Dept grid */}
          {selBlock && (() => {
            const blk = blocks.find(b => b.id === selBlock)
            const cfg = BLOCK_CFG[selBlock] || { color: '#6b7280' }
            return (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 14 }}>
                  Відділення · {cfg.label}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
                  {blk.depts.map(dept => (
                    <DeptCard key={dept.відділення} dept={dept} cfg={cfg}
                      active={selDept === dept.відділення}
                      onClick={() => setSelDept(selDept === dept.відділення ? null : dept.відділення)}
                    />
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Dept detail panel */}
          {selDept && selCfg && (
            <div style={{
              background: 'rgba(255,255,255,0.65)',
              backdropFilter: 'blur(12px)',
              border: `1px solid rgba(0,0,0,0.08)`,
              borderLeft: `4px solid ${selCfg.color}`,
              borderRadius: 12, padding: '22px 28px', marginBottom: 24,
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: '#1a1a1a', ...SANS }}>{selDept}</div>
                  {head && (
                    <div style={{ fontSize: 11, color: '#666', marginTop: 4, ...MONO }}>
                      Завідувач:{' '}
                      <span onClick={() => router.push('/dept?dept=' + encodeURIComponent(selDept))}
                        style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                        {head.лікар}
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => router.push('/dept?dept=' + encodeURIComponent(selDept))} style={{
                    fontSize: 11, color: selCfg.color, background: 'none',
                    border: `1px solid ${selCfg.color}55`, borderRadius: 7,
                    padding: '6px 14px', cursor: 'pointer', ...MONO, fontWeight: 500,
                  }}>Кабінет відділення →</button>
                  <button onClick={() => setSelDept(null)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>

                {/* KPI */}
                <div>
                  {!deptProfile ? (
                    <div style={{ fontSize: 11, color: '#aaa', ...MONO }}>завантаження…</div>
                  ) : (
                    <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                      {[
                        { l: 'ВИПАДКІВ',    v: fmt(deptProfile.випадків) },
                        { l: 'ПАЦІЄНТІВ',   v: fmt(deptProfile.унікальних) },
                        { l: 'ЛІЖКО-ДЕНЬ',  v: fmt(deptProfile.ліжкодень, ' дн.') },
                        { l: 'ЛЕТАЛЬНІСТЬ', v: fmt(deptProfile.летальність, '%') },
                        { l: 'ПОВТОРНІ',    v: fmt(deptProfile.повторні) },
                      ].map(k => (
                        <div key={k.l}>
                          <div style={{ fontSize: 24, fontWeight: 300, color: selCfg.color, ...MONO, lineHeight: 1 }}>{k.v}</div>
                          <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4, ...MONO }}>{k.l}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Лікарі */}
                {others.length > 0 && (
                  <div>
                    <div style={{ fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', ...MONO, marginBottom: 10 }}>
                      Ординатори ({others.length})
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', maxWidth: 440 }}>
                      {others.map((d, i) => (
                        <span key={i} onClick={() => router.push('/cabinet?emp=' + encodeURIComponent(d.лікар))}
                          style={{ fontSize: 12, color: '#444', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', ...SANS }}>
                          {d.лікар}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Топ діагнози */}
                {top7.length > 0 && (
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', ...MONO, marginBottom: 10 }}>Топ МКХ-10</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {top7.map((d, i) => (
                        <div key={i}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                            <span style={{ color: selCfg.color, fontSize: 10, minWidth: 34, ...MONO }}>{d.код}</span>
                            <span style={{ color: '#555', flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...SANS }}>{d.діагноз}</span>
                            <span style={{ color: '#888', fontSize: 10, ...MONO }}>{d.відс}%</span>
                          </div>
                          <div style={{ height: 2, background: 'rgba(0,0,0,0.06)', borderRadius: 1 }}>
                            <div style={{ width: `${Math.round((Number(d.відс) / maxPct) * 100)}%`, height: '100%', background: selCfg.color + 'aa', borderRadius: 1, transition: 'width .4s' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!loading && blocks.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#aaa', fontSize: 12, ...MONO }}>
              Дані не завантажились
            </div>
          )}
        </div>
      </div>
    </>
  )
}
