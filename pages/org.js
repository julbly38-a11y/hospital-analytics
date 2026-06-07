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

  // Підгрузка профілю і діагнозів відділення при виборі
  useEffect(() => {
    if (!selDept) { setDeptProfile(null); setDeptDiag([]); return }
    setDeptProfile(null); setDeptDiag([])
    Promise.all([
      fetchStats('deptProfile', selDept),
      fetchStats('deptDiag', selDept),
    ]).then(([prof, diag]) => {
      setDeptProfile(prof[0] || null)
      setDeptDiag(diag)
    })
  }, [selDept])

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

          // Склад за посадами
          const byPosition = {}
          selDeptDocs.forEach(d => {
            const pos = d.посада || 'Інше'
            if (!byPosition[pos]) byPosition[pos] = []
            byPosition[pos].push(d)
          })

          const kpis = deptProfile ? [
            { l: 'Випадків',   v: deptProfile.випадків?.toLocaleString('uk') },
            { l: 'Ліжкодень',  v: deptProfile.ліжкодень },
            { l: 'Летальність',v: deptProfile.летальність != null ? deptProfile.летальність + '%' : null },
            { l: 'Ургентних',  v: deptProfile.ургентних_відс != null ? deptProfile.ургентних_відс + '%' : null },
            { l: 'Операцій',   v: deptProfile.операцій?.toLocaleString('uk') },
            { l: 'Серед. вік', v: deptProfile.середній_вік },
          ].filter(k => k.v != null) : []

          return (
            <div style={{
              border: `1px solid ${cfg.color}33`,
              borderLeft: `3px solid ${cfg.color}`,
              borderRadius: 8, padding: '16px 20px',
              marginBottom: 24, background: 'var(--surface)'
            }}>
              {/* Заголовок */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{selDept}</div>
                <button onClick={() => setSelDept(null)} style={{ fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)' }}>✕</button>
              </div>

              {/* KPI показники */}
              {kpis.length > 0 && (
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                  {kpis.map(k => (
                    <div key={k.l}>
                      <div style={{ fontSize: 18, fontWeight: 300, fontFamily: 'var(--mono)', color: cfg.color, lineHeight: 1.1 }}>{k.v}</div>
                      <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)', marginTop: 2 }}>{k.l}</div>
                    </div>
                  ))}
                  {!deptProfile && <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', alignSelf: 'center' }}>завантаження…</div>}
                </div>
              )}
              {!deptProfile && kpis.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 14 }}>завантаження показників…</div>
              )}

              {/* Дві колонки: склад + діагнози */}
              <div style={{ display: 'grid', gridTemplateColumns: deptDiag.length > 0 ? '1fr 1fr' : '1fr', gap: 24 }}>

                {/* Склад за посадами */}
                <div>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 10 }}>Склад</div>
                  {Object.entries(byPosition).length > 0
                    ? Object.entries(byPosition).map(([pos, pdocs]) => (
                        <div key={pos} style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 10, color: cfg.color, fontFamily: 'var(--mono)', marginBottom: 5 }}>
                            {pos} <span style={{ color: 'var(--text3)' }}>({pdocs.length})</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {pdocs.map((d, i) => (
                              <DocChip key={i} doc={d} cfg={cfg}
                                onAsk={() => {
                                  const surname = (d.лікар || '').split(' ')[0]
                                  router.push('/?q=' + encodeURIComponent('Статистика лікаря ' + surname))
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      ))
                    : <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Дані відсутні</div>
                  }
                </div>

                {/* Топ діагнози */}
                {deptDiag.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 10 }}>Топ діагнози МКХ-10</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {deptDiag.map((d, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <span style={{ fontFamily: 'var(--mono)', color: cfg.color, fontSize: 10, minWidth: 34, paddingTop: 1 }}>{d.код}</span>
                          <span style={{ color: 'var(--text2)', flex: 1, fontSize: 11, lineHeight: 1.4 }}>{d.діагноз}</span>
                          <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: 10, whiteSpace: 'nowrap', paddingTop: 1 }}>
                            {Number(d.випадків).toLocaleString('uk')}{d.відс ? ` · ${d.відс}%` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
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
