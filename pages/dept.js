import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'

/* ── Tokens ─────────────────────────────────────── */
const MONO = { fontFamily: 'var(--mono)' }
const lbl  = { fontSize: '10px', color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }

/* ── Fetch helpers ───────────────────────────────── */
async function fetchStats(key, param) {
  const r = await fetch('/api/stats', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(param !== undefined ? { key, param } : { key }),
  })
  const d = await r.json()
  return d.rows || []
}

async function fetchHier(scope, id, dateFrom, dateTo) {
  const body = { scope }
  if (id)       body.id       = id
  if (dateFrom) body.dateFrom = dateFrom
  if (dateTo)   body.dateTo   = dateTo
  const r = await fetch('/api/hier-stats', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) return {}
  return r.json()
}

/* ── HierStatsBar ────────────────────────────────── */
const METRICS = [
  { key: 'госпіталізацій', label: 'Госпіталізацій', fmt: v => Number(v).toLocaleString('uk') },
  { key: 'пацієнтів',      label: 'Пацієнтів',      fmt: v => Number(v).toLocaleString('uk') },
  { key: 'летальність',    label: 'Летальність',     fmt: v => v + '%' },
  { key: 'ліжкодень',      label: 'Ліжко-день',      fmt: v => v + ' дн.' },
  { key: 'середній_вік',   label: 'Середній вік',    fmt: v => v + ' р.' },
]

function HierStatsBar({ stats, loading, accent = '#cfae5a', label = '' }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '12px 20px',
      display: 'flex', gap: 0, flexWrap: 'wrap', alignItems: 'center',
    }}>
      {label && (
        <div style={{ ...lbl, flexBasis: '100%', marginBottom: 8 }}>{label}</div>
      )}
      {METRICS.map((m, i) => (
        <div key={m.key} style={{
          flex: '1 1 90px', padding: '4px 14px',
          borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
        }}>
          <div style={{ fontSize: 22, fontWeight: 300, color: accent, ...MONO, lineHeight: 1, marginBottom: 3 }}>
            {loading ? '…' : (stats?.[m.key] != null ? m.fmt(stats[m.key]) : '—')}
          </div>
          <div style={{ ...lbl }}>{m.label}</div>
        </div>
      ))}
    </div>
  )
}

/* ── DateFilter ──────────────────────────────────── */
function DateFilter({ from, to, onChange }) {
  const inp = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4,
    color: 'var(--text)', padding: '3px 7px', fontSize: 11, ...MONO,
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...MONO }}>
      <span style={{ fontSize: 10, color: 'var(--text3)' }}>З</span>
      <input type="date" value={from} onChange={e => onChange(e.target.value, to)} style={inp} />
      <span style={{ fontSize: 10, color: 'var(--text3)' }}>до</span>
      <input type="date" value={to}   onChange={e => onChange(from, e.target.value)} style={inp} />
      {(from || to) && (
        <button onClick={() => onChange('', '')}
          style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>×</button>
      )}
    </div>
  )
}

/* ── DiagBars ────────────────────────────────────── */
function DiagBars({ rows, accent }) {
  if (!rows?.length) return <div style={{ fontSize: 11, color: 'var(--text3)', ...MONO }}>Немає діагнозів</div>
  const top = rows.slice(0, 8)
  const maxPct = top.reduce((m, d) => Math.max(m, Number(d.відс) || 0), 0) || 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {top.map((d, i) => (
        <div key={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ ...MONO, color: accent, fontSize: 10, minWidth: 38, flexShrink: 0 }}>{d.код}</span>
            <span style={{ color: 'var(--text2)', flex: 1, fontSize: 11, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.діагноз}</span>
            <span style={{ ...MONO, color: 'var(--text3)', fontSize: 10, flexShrink: 0 }}>{d.відс ?? d.випадків}</span>
          </div>
          {d.відс != null && (
            <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
              <div style={{ width: `${Math.round((Number(d.відс) / maxPct) * 100)}%`, height: '100%', background: accent + 'bb', borderRadius: 2, transition: 'width .4s' }} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ── DocChip ─────────────────────────────────────── */
function initials(name = '') {
  return name.split(/[\s.]+/).filter(p => p.length > 1).slice(0, 2).map(p => p[0].toUpperCase()).join('')
}

function DocChip({ doc, accent, isHead, active, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 10px 6px 6px',
      border: `1px solid ${active ? accent : 'var(--border)'}`,
      borderRadius: 8, background: active ? 'var(--bg2)' : 'var(--surface)',
      cursor: 'pointer', transition: 'all .12s', minWidth: 0,
    }}
    onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = accent + '88'; e.currentTarget.style.background = 'var(--bg2)' } }}
    onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' } }}
    >
      <div style={{
        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
        background: isHead ? accent : 'var(--bg)',
        color: isHead ? '#000' : 'var(--text3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 600, ...MONO,
      }}>{initials(doc.emp_name || doc.doc_name || '')}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: isHead ? 500 : 400, color: 'var(--text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {doc.emp_name || doc.doc_name}
        </div>
        {doc.спеціалізація && doc.спеціалізація !== '—' && (
          <div style={{ fontSize: 9, color: 'var(--text3)', ...MONO }}>{doc.спеціалізація}</div>
        )}
      </div>
      {isHead && (
        <div style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: accent + '22', color: accent, ...MONO, flexShrink: 0 }}>завід.</div>
      )}
    </div>
  )
}

/* ── Main Page ───────────────────────────────────── */
export default function DeptPage() {
  const router = useRouter()

  // Дата фільтр
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  // Рівень: лікарня
  const [hospStats,   setHospStats]   = useState(null)
  const [hospLoading, setHospLoading] = useState(true)

  // Список відділень
  const [allDepts,     setAllDepts]     = useState([])
  const [deptsLoading, setDeptsLoading] = useState(true)

  // Вибране відділення
  const [selDept,     setSelDept]     = useState(null)
  const [deptStats,   setDeptStats]   = useState(null)
  const [deptLoading, setDeptLoading] = useState(false)
  const [deptProfile, setDeptProfile] = useState(null)
  const [deptDiag,    setDeptDiag]    = useState([])
  const [deptTrend,   setDeptTrend]   = useState([])
  const [deptDocs,    setDeptDocs]    = useState([])

  // Вибраний лікар
  const [selDoc,     setSelDoc]     = useState(null)  // { doc_name, emp_name, посада }
  const [docStats,   setDocStats]   = useState(null)
  const [docLoading, setDocLoading] = useState(false)
  const [docProfile, setDocProfile] = useState(null)
  const [docDiag,    setDocDiag]    = useState([])

  const ACCENT = '#5ab0ff'   // dept level
  const DOC_ACCENT = '#7fd99a' // doctor level

  // Завантаження списку відділень (одноразово)
  useEffect(() => {
    fetchStats('wDept').then(rows => { setAllDepts(rows); setDeptsLoading(false) })
      .catch(() => setDeptsLoading(false))
  }, [])

  // Синхронізація з URL
  useEffect(() => {
    const d = router.query?.dept
    if (d && d !== selDept) setSelDept(d)
  }, [router.query?.dept])

  // Лікарняна ієрархічна статистика (залежить від дат)
  useEffect(() => {
    setHospLoading(true)
    fetchHier('hospital', null, dateFrom, dateTo)
      .then(d => { setHospStats(d); setHospLoading(false) })
      .catch(() => setHospLoading(false))
  }, [dateFrom, dateTo])

  // Статистика відділення (залежить від selDept + дат)
  useEffect(() => {
    if (!selDept) {
      setDeptStats(null); setDeptProfile(null); setDeptDiag([])
      setDeptTrend([]); setDeptDocs([]); setSelDoc(null)
      return
    }
    setDeptLoading(true); setSelDoc(null)
    Promise.all([
      fetchHier('dept', selDept, dateFrom, dateTo),
      fetchStats('deptProfile', selDept),
      fetchStats('deptDiag', selDept),
      fetchStats('deptTrend12m', selDept),
      fetchStats('deptDocs2', selDept),
    ]).then(([hier, prof, diag, trend, docs]) => {
      setDeptStats(hier); setDeptLoading(false)
      setDeptProfile(prof[0] || null)
      setDeptDiag(diag); setDeptTrend(trend)
      setDeptDocs(docs)
    }).catch(() => setDeptLoading(false))
  }, [selDept, dateFrom, dateTo])

  // Статистика лікаря (залежить від selDoc + дат)
  useEffect(() => {
    if (!selDoc) { setDocStats(null); setDocProfile(null); setDocDiag([]); return }
    setDocLoading(true)
    Promise.all([
      fetchStats('docProfile', selDoc.doc_name),
      fetchStats('docDiag', selDoc.doc_name),
      fetchHier('doctor', selDoc.doc_name, dateFrom, dateTo),
    ]).then(([prof, diag, hier]) => {
      setDocProfile(prof[0] || null); setDocDiag(diag)
      setDocStats(hier); setDocLoading(false)
    }).catch(() => setDocLoading(false))
  }, [selDoc, dateFrom, dateTo])

  const handleDateChange = (from, to) => { setDateFrom(from); setDateTo(to) }
  const handleDeptClick  = (dept) => {
    const next = selDept === dept ? null : dept
    setSelDept(next)
    router.replace({ query: next ? { dept: next } : {} }, undefined, { shallow: true })
  }

  const head   = deptDocs.find(d => d.посада?.toLowerCase().includes('завідувач'))
  const others = deptDocs.filter(d => !d.посада?.toLowerCase().includes('завідувач'))

  return (
    <>
      <Head>
        <title>ЛСМД · Кабінет відділення</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', ...MONO }}>

        {/* ── Header ─────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 24px', borderBottom: '1px solid var(--border)',
          gap: 12, flexWrap: 'wrap', background: 'var(--bg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>ЛСМД</span>
            <span style={{ color: 'var(--border)' }}>·</span>
            <span style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Кабінет відділення</span>
            {selDept && !selDoc && (
              <><span style={{ color: 'var(--border)' }}>›</span>
              <span style={{ fontSize: 11, color: ACCENT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{selDept}</span></>
            )}
            {selDoc && (
              <>
                <span style={{ color: 'var(--border)' }}>›</span>
                <button onClick={() => setSelDoc(null)} style={{ fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selDept}</button>
                <span style={{ color: 'var(--border)' }}>›</span>
                <span style={{ fontSize: 11, color: DOC_ACCENT }}>{selDoc.emp_name || selDoc.doc_name}</span>
              </>
            )}
          </div>
          <DateFilter from={dateFrom} to={dateTo} onChange={handleDateChange} />
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {[['← Дашборд', '/'], ['Структура', '/org']].map(([t, h]) => (
              <Link key={h} href={h} style={{
                fontSize: 11, color: 'var(--text3)', textDecoration: 'none',
                padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 5,
              }}>{t}</Link>
            ))}
          </div>
        </div>

        {/* ── Hospital HierStats ──────────────────── */}
        <div style={{ padding: '14px 24px 0' }}>
          <HierStatsBar stats={hospStats} loading={hospLoading} accent="#cfae5a"
            label={(dateFrom || dateTo) ? `ЛІКАРНЯ · ${dateFrom || '?'} — ${dateTo || '?'}` : 'ЛІКАРНЯ · УСІ РОКИ'} />
        </div>

        {/* ── Two-column layout ───────────────────── */}
        <div style={{ display: 'flex', height: 'calc(100vh - 165px)', overflow: 'hidden' }}>

          {/* ── Left sidebar ────────────────────── */}
          <div style={{
            width: 230, flexShrink: 0, borderRight: '1px solid var(--border)',
            overflowY: 'auto', paddingTop: 12,
          }}>
            <div style={{ ...lbl, padding: '0 16px', marginBottom: 8 }}>
              {deptsLoading ? 'Завантаження…' : `${allDepts.length} відділень`}
            </div>
            {allDepts.map(d => {
              const active = selDept === d.відділення
              return (
                <button key={d.відділення} onClick={() => handleDeptClick(d.відділення)} style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 14px 8px 14px', border: 'none', cursor: 'pointer',
                  background: active ? 'var(--bg2)' : 'transparent',
                  color: active ? '#cfae5a' : 'var(--text2)', fontSize: 12, ...MONO,
                  borderLeft: active ? '2px solid #cfae5a' : '2px solid transparent',
                  transition: 'all .1s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg2)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                >
                  {d.відділення}
                  {d.випадків != null && (
                    <span style={{ display: 'block', fontSize: 9, color: 'var(--text3)', marginTop: 1 }}>
                      {Number(d.випадків).toLocaleString('uk')} випадків
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* ── Right content ───────────────────── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', minWidth: 0 }}>

            {/* No dept selected */}
            {!selDept && (
              <div style={{ color: 'var(--text3)', fontSize: 12, paddingTop: 60, textAlign: 'center' }}>
                Оберіть відділення зі списку ліворуч
              </div>
            )}

            {/* Dept selected */}
            {selDept && (
              <div>
                {/* Dept header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: 'var(--text)' }}>
                    {selDoc ? (selDoc.emp_name || selDoc.doc_name) : selDept}
                  </h2>
                  <button onClick={() => { setSelDoc(null); handleDeptClick(selDept) }}
                    style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16, ...MONO }}>✕</button>
                </div>

                {/* Dept hier stats */}
                {!selDoc && (
                  <div style={{ marginBottom: 16 }}>
                    <HierStatsBar stats={deptStats} loading={deptLoading} accent={ACCENT} label="ВІДДІЛЕННЯ" />
                  </div>
                )}

                {/* Doctor detail */}
                {selDoc && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ ...lbl, marginBottom: 4 }}>
                      {selDoc.посада || 'Ординатор'}{selDoc.спеціалізація && selDoc.спеціалізація !== '—' ? ' · ' + selDoc.спеціалізація : ''}
                    </div>
                    <HierStatsBar stats={docStats} loading={docLoading} accent={DOC_ACCENT} label="ЛІКАР" />

                    {/* Top diagnoses */}
                    {(docDiag.length > 0 || !docLoading) && (
                      <div style={{ marginTop: 20 }}>
                        <div style={{ ...lbl, marginBottom: 10 }}>Топ діагнози МКХ-10</div>
                        <DiagBars rows={docDiag} accent={DOC_ACCENT} />
                      </div>
                    )}

                    {/* Link to cabinet if doc has doc_name */}
                    {docProfile && selDoc.doc_name && (
                      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                        <button onClick={() => router.push('/doctors?name=' + encodeURIComponent(selDoc.doc_name))}
                          style={{ fontSize: 11, ...MONO, color: DOC_ACCENT, background: 'none', border: `1px solid ${DOC_ACCENT}55`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>
                          Кабінет лікаря →
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Ординаторська */}
                {!selDoc && deptDocs.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ ...lbl, marginBottom: 10 }}>
                      Ординаторська <span style={{ color: ACCENT }}>({deptDocs.length})</span>
                    </div>
                    {head && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ ...lbl, color: 'var(--text3)', marginBottom: 6 }}>Завідувач</div>
                        <div style={{ display: 'inline-block' }}>
                          <DocChip doc={head} accent={ACCENT} isHead active={selDoc?.doc_name === head.doc_name}
                            onClick={() => setSelDoc(head)} />
                        </div>
                      </div>
                    )}
                    {others.length > 0 && (
                      <div>
                        <div style={{ ...lbl, marginBottom: 8 }}>Ординатори ({others.length})</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {others.map((d, i) => (
                            <DocChip key={i} doc={d} accent={ACCENT} isHead={false}
                              active={selDoc?.doc_name === d.doc_name}
                              onClick={() => setSelDoc(d)} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Top diagnoses (dept level) */}
                {!selDoc && deptDiag.length > 0 && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                    <div style={{ ...lbl, marginBottom: 10 }}>Топ діагнози МКХ-10</div>
                    <DiagBars rows={deptDiag} accent={ACCENT} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
