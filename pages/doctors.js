import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'

const BLOCK_CFG = {
  'приймально_діагностичний': { color: '#c0392b' },
  'клінічний':                { color: '#4a9870' },
  'анестезіологія_іт':        { color: '#2563eb' },
  'параклінічний':            { color: '#6b6760' },
  'адміністративний':         { color: '#7c3aed' },
}
const DEFAULT_COLOR = '#2563eb'
const MONO = { fontFamily: 'var(--mono)' }
const lbl  = { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', ...MONO }

/* ── 5 ієрархічних метрик ───────────────────────── */
const METRICS = [
  { key: 'госпіталізацій', label: 'Госпіталізацій', fmt: v => Number(v).toLocaleString('uk') },
  { key: 'пацієнтів',      label: 'Пацієнтів',      fmt: v => Number(v).toLocaleString('uk') },
  { key: 'летальність',    label: 'Летальність',     fmt: v => v + '%' },
  { key: 'середній_вік',   label: 'Середній вік',    fmt: v => v + ' р.' },
  { key: 'ліжкодень',      label: 'Ліжко-день',      fmt: v => v + ' дн.' },
]

function HierStatsBar({ stats, loading, accent = '#cfae5a', label = '' }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '12px 20px',
      display: 'flex', gap: 0, flexWrap: 'wrap', alignItems: 'center',
    }}>
      {label && <div style={{ ...lbl, flexBasis: '100%', marginBottom: 8 }}>{label}</div>}
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

async function fetchStats(key, param) {
  const body = param !== undefined ? { key, param } : { key }
  const r = await fetch('/api/stats', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const d = await r.json()
  return d.rows || []
}

async function fetchHier(scope, id, from, to) {
  const r = await fetch('/api/hier-stats', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope, id, dateFrom: from || '', dateTo: to || '' })
  })
  const d = await r.json()
  return d.stats || null
}

function initials(name = '') {
  return name.split(/[\s.]+/).filter(p => p.length > 1).slice(0, 2).map(p => p[0].toUpperCase()).join('')
}

export default function DoctorPage() {
  const router = useRouter()
  const name = router.query?.name

  const [allDocs,    setAllDocs]    = useState([])
  const [allDepts,   setAllDepts]   = useState([])
  const [diag,       setDiag]       = useState([])
  const [profile,    setProfile]    = useState(null)

  const [docStats,   setDocStats]   = useState(null)
  const [docLoading, setDocLoading] = useState(false)
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    fetchStats('orgDocs').then(setAllDocs)
    fetchStats('orgDepts').then(setAllDepts)
  }, [])

  useEffect(() => {
    if (!name) return
    setLoading(true)
    setDocLoading(true)

    fetchStats('docProfile', name).then(prof => {
      setProfile(prof[0] || null)
      setLoading(false)
    })
    fetchStats('docDiag', name).then(setDiag)
    fetchHier('doctor', name, '', '').then(s => {
      setDocStats(s)
      setDocLoading(false)
    })
  }, [name])

  const docInfo = useMemo(() => allDocs.find(d => d.лікар === name), [allDocs, name])

  const accentColor = useMemo(() => {
    if (!docInfo?.відділення) return DEFAULT_COLOR
    const dept = allDepts.find(d => d.відділення === docInfo.відділення)
    const block = dept?.block?.toLowerCase().replace(/\s+/g, '_') || ''
    return BLOCK_CFG[block]?.color || DEFAULT_COLOR
  }, [docInfo, allDepts])

  const top10 = diag.slice(0, 10)
  const maxCases = top10.reduce((m, d) => Math.max(m, Number(d.випадків) || 0), 1)
  const isNeuro = /невро|нейро/i.test(docInfo?.відділення || '')

  return (
    <>
      <Head>
        <title>ЛСМД · {name || 'Лікар'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px 32px', maxWidth: 960, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link href="/org" style={{ fontSize: 11, ...MONO, color: 'var(--text3)', textDecoration: 'none', padding: '5px 12px', border: '1px solid var(--border)', borderRadius: 6 }}>
              ← Структура
            </Link>
            {docInfo?.відділення && (
              <>
                <span style={{ color: 'var(--border)' }}>›</span>
                <Link href={`/dept?dept=${encodeURIComponent(docInfo.відділення)}`}
                  style={{ fontSize: 11, ...MONO, color: 'var(--text3)', textDecoration: 'none' }}>
                  {docInfo.відділення}
                </Link>
              </>
            )}
          </div>
          <span style={{ fontSize: 10, ...MONO, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>ЛСМД · Кабінет лікаря</span>
        </div>

        {/* Картка лікаря */}
        {profile && (
          <div style={{
            border: `1px solid ${accentColor}33`, borderLeft: `4px solid ${accentColor}`,
            borderRadius: 10, padding: '20px 24px', background: 'var(--surface)', marginBottom: 24
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', background: accentColor, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, ...MONO, fontWeight: 500, flexShrink: 0
              }}>
                {initials(name)}
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--text)', ...MONO }}>{name}</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                  {docInfo?.посада && <span style={{ fontSize: 11, color: 'var(--text2)', ...MONO }}>{docInfo.посада}</span>}
                  {!isNeuro && docInfo?.спеціалізація && docInfo.спеціалізація !== '—' && (
                    <span style={{ fontSize: 11, color: 'var(--text3)', ...MONO }}>· {docInfo.спеціалізація}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {loading && <div style={{ fontSize: 12, color: 'var(--text3)', ...MONO }}>завантаження…</div>}

        {/* ── 5 показників лікаря ── */}
        {!loading && (
          <div style={{ marginBottom: 24 }}>
            <HierStatsBar stats={docStats} loading={docLoading} accent={accentColor} />
          </div>
        )}

        {/* Додаткова статистика */}
        {profile && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '16px 20px', marginBottom: 24
          }}>
            <div style={{ ...lbl, marginBottom: 12 }}>Деталі</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px 24px' }}>
              {[
                { l: 'Денних госп.',   v: profile.денних?.toLocaleString('uk') },
                { l: 'Нічних госп.',   v: profile.нічних?.toLocaleString('uk') },
                { l: 'У вихідні',      v: profile.вихідних?.toLocaleString('uk') },
                { l: 'Померло',        v: profile.померло?.toLocaleString('uk') },
                { l: 'Перший випадок', v: profile.перший ? String(profile.перший).slice(0, 10) : null },
                { l: 'Останній',       v: profile.останній ? String(profile.останній).slice(0, 10) : null },
              ].filter(k => k.v != null).map(k => (
                <div key={k.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 10, color: 'var(--text3)', ...MONO, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.l}</span>
                  <span style={{ fontSize: 13, ...MONO, color: 'var(--text2)' }}>{k.v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Топ діагнози */}
        {top10.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ ...lbl, marginBottom: 12 }}>Топ діагнози МКХ-10 ({top10.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {top10.map((d, i) => {
                const barW = Math.round((Number(d.випадків) / maxCases) * 100)
                const letD = profile?.випадків > 0
                  ? ((Number(d.померло) / profile.випадків) * 100).toFixed(1)
                  : null
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ ...MONO, color: accentColor, fontSize: 10, minWidth: 36, flexShrink: 0 }}>{d.код}</span>
                      <span style={{ color: 'var(--text2)', flex: 1, fontSize: 12, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.діагноз}</span>
                      <span style={{ ...MONO, color: 'var(--text3)', fontSize: 10, flexShrink: 0 }}>{d.випадків} вип.</span>
                      {letD > 0 && <span style={{ ...MONO, color: '#e74c3c', fontSize: 10, flexShrink: 0 }}>{letD}% лет.</span>}
                    </div>
                    <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
                      <div style={{ width: barW + '%', height: '100%', background: accentColor + 'cc', borderRadius: 2, transition: 'width .5s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 32, fontSize: 10, color: 'var(--text3)', ...MONO }}>
          ЛСМД · Чернівці · реальні дані Supabase
        </div>
      </div>
    </>
  )
}
