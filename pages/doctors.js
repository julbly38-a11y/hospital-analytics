import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'

/* ── Block colors (same as org.js) ─────────────────── */
const BLOCK_CFG = {
  'приймально_діагностичний': { color: '#c0392b' },
  'клінічний':                { color: '#4a9870' },
  'анестезіологія_іт':        { color: '#2563eb' },
  'параклінічний':            { color: '#6b6760' },
  'адміністративний':         { color: '#7c3aed' },
}
const DEFAULT_COLOR = '#2563eb'

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
  return name.split(/[\s.]+/).filter(p => p.length > 1).slice(0, 2).map(p => p[0].toUpperCase()).join('')
}

function Kpi({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 300, fontFamily: 'var(--mono)', color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--mono)', marginTop: 3 }}>{label}</div>
    </div>
  )
}

export default function DoctorPage() {
  const router = useRouter()
  const name = router.query?.name

  const [profile,  setProfile]  = useState(null)
  const [diag,     setDiag]     = useState([])
  const [allDocs,  setAllDocs]  = useState([])
  const [allDepts, setAllDepts] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!name) return
    setLoading(true)
    Promise.all([
      fetchStats('docProfile', name),
      fetchStats('docDiag', name),
      fetchStats('orgDocs'),
      fetchStats('orgDepts'),
    ]).then(([prof, d, docs, depts]) => {
      setProfile(prof[0] || null)
      setDiag(d)
      setAllDocs(docs)
      setAllDepts(depts)
      setLoading(false)
    })
  }, [name])

  const docInfo = useMemo(() => allDocs.find(d => d.лікар === name), [allDocs, name])

  // Знаходимо колір блоку через відділення
  const accentColor = useMemo(() => {
    if (!docInfo?.відділення) return DEFAULT_COLOR
    const dept = allDepts.find(d => d.відділення === docInfo.відділення)
    const block = dept?.block?.toLowerCase().replace(/\s+/g, '_') || ''
    return BLOCK_CFG[block]?.color || DEFAULT_COLOR
  }, [docInfo, allDepts])

  const letPct = profile
    ? (profile.випадків > 0 ? ((profile.померло / profile.випадків) * 100).toFixed(2) : '0.00')
    : null

  const improvePct = profile
    ? (profile.випадків > 0 ? ((profile.поліпшення / profile.випадків) * 100).toFixed(0) : null)
    : null

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

      <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px 32px', maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link href="/org" style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', textDecoration: 'none', padding: '5px 12px', border: '1px solid var(--border)', borderRadius: 6 }}>
              ← Структура
            </Link>
            {docInfo?.відділення && (
              <>
                <span style={{ color: 'var(--border)' }}>›</span>
                <Link
                  href={`/org?dept=${encodeURIComponent(docInfo.відділення)}`}
                  style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', textDecoration: 'none' }}
                >
                  {docInfo.відділення}
                </Link>
              </>
            )}
          </div>
          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>ЛСМД · Кабінет лікаря</span>
        </div>

        {loading && (
          <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>завантаження…</div>
        )}

        {!loading && !profile && (
          <div style={{ fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Лікаря не знайдено.</div>
        )}

        {!loading && profile && (
          <>
            {/* Картка лікаря */}
            <div style={{
              border: `1px solid ${accentColor}33`,
              borderLeft: `4px solid ${accentColor}`,
              borderRadius: 10, padding: '24px 28px',
              background: 'var(--surface)', marginBottom: 24
            }}>
              {/* Ім'я + аватар */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: accentColor, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontFamily: 'var(--mono)', fontWeight: 500, flexShrink: 0
                }}>
                  {initials(name)}
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{name}</div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                    {docInfo?.посада && (
                      <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>{docInfo.посада}</span>
                    )}
                    {!isNeuro && docInfo?.спеціалізація && docInfo.спеціалізація !== '—' && (
                      <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>· {docInfo.спеціалізація}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* KPI */}
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
                <Kpi label="Випадків"   value={profile.випадків?.toLocaleString('uk')}  color={accentColor} />
                <Kpi label="Унікальних" value={profile.унікальних?.toLocaleString('uk')} color={accentColor} />
                <Kpi label="Ліжкодень"  value={profile.ліжкодень}                        color={accentColor} />
                <Kpi label="Летальність" value={letPct + '%'}                             color={accentColor} />
                {improvePct !== null && (
                  <Kpi label="Поліпшення" value={improvePct + '%'} color={accentColor} />
                )}
              </div>

              {/* Додаткова статистика */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px 24px', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
                {[
                  { l: 'Денних госп.',   v: profile.денних?.toLocaleString('uk') },
                  { l: 'Нічних госп.',   v: profile.нічних?.toLocaleString('uk') },
                  { l: 'У вихідні',      v: profile.вихідних?.toLocaleString('uk') },
                  { l: 'Померло',        v: profile.померло?.toLocaleString('uk') },
                  { l: 'Перший випадок', v: profile.перший ? String(profile.перший).slice(0, 10) : null },
                  { l: 'Останній',       v: profile.останній ? String(profile.останній).slice(0, 10) : null },
                ].filter(k => k.v != null).map(k => (
                  <div key={k.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.l}</span>
                    <span style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{k.v}</span>
                  </div>
                ))}
              </div>

              {/* Топ діагнози */}
              {top10.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 12 }}>
                    Топ діагнози МКХ-10 ({top10.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {top10.map((d, i) => {
                      const barW = Math.round((Number(d.випадків) / maxCases) * 100)
                      const letD = profile.випадків > 0
                        ? ((Number(d.померло) / profile.випадків) * 100).toFixed(1)
                        : null
                      return (
                        <div key={i}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontFamily: 'var(--mono)', color: accentColor, fontSize: 10, minWidth: 36, flexShrink: 0 }}>{d.код}</span>
                            <span style={{ color: 'var(--text2)', flex: 1, fontSize: 12, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.діагноз}</span>
                            <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: 10, flexShrink: 0 }}>{d.випадків} вип.</span>
                            {letD > 0 && (
                              <span style={{ fontFamily: 'var(--mono)', color: '#e74c3c', fontSize: 10, flexShrink: 0 }}>{letD}% лет.</span>
                            )}
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
              {diag.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Діагнози не знайдено</div>
              )}
            </div>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: 32, fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
          ЛСМД · Чернівці · реальні дані Supabase
        </div>
      </div>
    </>
  )
}
