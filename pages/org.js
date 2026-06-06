import { useState, useEffect, useMemo } from 'react'
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

async function fetchStats(key) {
  const r = await fetch('/api/stats', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key })
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{dept.лікарів} лікарів</span>
        {hasDoc && <span style={{ fontSize: 10, color: 'var(--text3)' }}>{active ? '▲' : '▼'}</span>}
      </div>
    </div>
  )
}

/* ── Doctor chip ──────────────────────────────────── */
function DocChip({ doc, cfg }) {
  const isHead = doc.посада?.toLowerCase().includes('завідувач')
  const ini = initials(doc.лікар || '')
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 10px 5px 5px',
      border: '1px solid var(--border)', borderRadius: 8,
      background: 'var(--surface)',
    }}>
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
  const [depts, setDepts]   = useState([])
  const [docs, setDocs]     = useState([])
  const [loading, setLoading] = useState(true)
  const [selBlock, setSelBlock] = useState(null)
  const [selDept,  setSelDept]  = useState(null)

  useEffect(() => {
    Promise.all([fetchStats('orgDepts'), fetchStats('orgDocs')])
      .then(([d, dc]) => { setDepts(d); setDocs(dc); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Group depts by block → add head doctor name
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

  // Docs for selected dept
  const selDeptDocs = useMemo(() => {
    if (!selDept) return []
    return docs.filter(d => d.відділення === selDept)
  }, [docs, selDept])

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

        {/* Doctors */}
        {selDept && selDeptDocs.length > 0 && (() => {
          const cfg = BLOCK_CFG[selBlock] || { icon: '⊞', color: '#6b6760', label: selBlock }
          return (
            <div>
              <SectionLabel text={`Лікарський склад · ${selDept}`} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {selDeptDocs.map((d, i) => (
                  <DocChip key={i} doc={d} cfg={cfg} />
                ))}
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
