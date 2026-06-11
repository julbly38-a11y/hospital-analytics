import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'

const card   = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }
const lbl    = { fontSize: '10px', color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }
const MONO   = { fontFamily: 'var(--mono)' }

/* ── HierStatsBar ────────────────────────────────── */
const METRICS = [
  { key: 'госпіталізацій', label: 'Госпіталізацій', fmt: v => Number(v).toLocaleString('uk') },
  { key: 'пацієнтів',      label: 'Пацієнтів',      fmt: v => Number(v).toLocaleString('uk') },
  { key: 'летальність',    label: 'Летальність',     fmt: v => v + '%' },
  { key: 'ліжкодень',      label: 'Ліжко-день',      fmt: v => v + ' дн.' },
  { key: 'середній_вік',   label: 'Середній вік',    fmt: v => v + ' р.' },
]

function HierStatsBar({ stats, loading, accent = '#cfae5a', level = '' }) {
  return (
    <div style={{ ...card, padding: '12px 16px', marginBottom: 0 }}>
      {level && <div style={{ ...lbl, marginBottom: 8 }}>{level}</div>}
      <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
        {METRICS.map((m, i) => (
          <div key={m.key} style={{
            flex: '1 1 90px', padding: '4px 12px',
            borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ fontSize: 20, fontWeight: 300, color: accent, ...MONO, lineHeight: 1, marginBottom: 3 }}>
              {loading ? '…' : (stats?.[m.key] != null ? m.fmt(stats[m.key]) : '—')}
            </div>
            <div style={{ ...lbl }}>{m.label}</div>
          </div>
        ))}
      </div>
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
          style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14 }}>×</button>
      )}
    </div>
  )
}

/* ── StatBox (legacy small stats) ───────────────── */
function StatBox({ value, label, accent }) {
  return (
    <div style={{ ...card, padding: '14px', textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent ? 'var(--accent)' : 'var(--text)', ...MONO }}>{value ?? '—'}</div>
      <div style={{ ...lbl, marginTop: 6 }}>{label}</div>
    </div>
  )
}

const STATUS_COLORS = {
  'Лікується': '#5ab0ff', 'З поліпшенням': '#7fd99a', 'Без змін': '#cfae5a',
  'З погіршенням': '#e0a060', 'Помер': '#e08080', 'Переведений в інший заклад': '#a08ae0',
}
function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || 'var(--text3)'
  return <span style={{ fontSize: 11, color: c, border: `1px solid ${c}55`, borderRadius: '999px', padding: '2px 9px', whiteSpace: 'nowrap' }}>{status || '—'}</span>
}

async function fetchStats(key, param) {
  const r = await fetch('/api/stats', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(param !== undefined ? { key, param } : { key }),
  })
  const d = await r.json()
  return d.rows || []
}

/* ── Main Page ───────────────────────────────────── */
export default function Cabinet() {
  const router = useRouter()

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  const [data,    setData]    = useState(null)
  const [error,   setError]   = useState(null)
  const [tab,     setTab]     = useState('recent') // recent | active | diag

  const [hospKpi, setHospKpi] = useState(null)

  // Завантаження кабінету
  useEffect(() => {
    const emp = router.query?.emp
    const url = emp ? `/api/cabinet?emp=${encodeURIComponent(emp)}` : '/api/cabinet'
    fetch(url)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) { setError(j.error || 'Помилка завантаження'); return }
        setData(j)
      })
      .catch(() => setError('Помилка з\'єднання'))
  }, [router.query?.emp])

  // Статичні лікарняні показники (одноразово)
  useEffect(() => {
    fetchStats('ovKpiYear', 'all').then(rows => setHospKpi(rows[0] || null))
  }, [])

  const handleDateChange = (from, to) => { setDateFrom(from); setDateTo(to) }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', ...MONO }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, marginBottom: 12, color: '#e08080' }}>{error}</div>
          <button onClick={() => router.push('/')} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '8px 16px', cursor: 'pointer', ...MONO }}>На головну</button>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, ...MONO }}>
        Завантаження кабінету...
      </div>
    )
  }

  const { profile, summary, recent, active, topDiag, notice } = data
  const rows = tab === 'recent' ? recent : tab === 'active' ? active : topDiag

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', ...MONO, padding: '24px 16px' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{profile?.full_name || 'Кабінет лікаря'}</h1>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
              {[profile?.position, profile?.specialization].filter(Boolean).join(' · ')}
              {profile?.department && (
                <>
                  {(profile?.position || profile?.specialization) ? ' · ' : ''}
                  <span
                    onClick={() => router.push('/dept?dept=' + encodeURIComponent(profile.department))}
                    style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', color: 'var(--text3)' }}
                    title="Перейти до відділення"
                  >{profile.department}</span>
                </>
              )}
              {!profile?.position && !profile?.specialization && !profile?.department && profile?.email}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <DateFilter from={dateFrom} to={dateTo} onChange={handleDateChange} />
            {!profile?.viewedByAdmin && (
              <button onClick={() => router.push('/admit')} style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600, ...MONO }}>+ Новий випадок</button>
            )}
            <button onClick={() => router.push(profile?.viewedByAdmin ? '/org' : '/')} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text3)', padding: '8px 14px', cursor: 'pointer', fontSize: 12, ...MONO }}>
              {profile?.viewedByAdmin ? '← Структура' : '← Дашборд'}
            </button>
          </div>
        </div>

        {notice && (
          <div style={{ background: 'rgba(207,174,90,0.1)', border: '1px solid rgba(207,174,90,0.3)', borderRadius: 8, padding: '12px 16px', margin: '12px 0', fontSize: 13, color: '#cfae5a' }}>
            {notice}
          </div>
        )}

        {/* Показники */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '20px 0' }}>
          {/* Лікарня */}
          <div style={{ ...card, padding: '12px 16px' }}>
            <div style={{ ...lbl, marginBottom: 8 }}>ЛІКАРНЯ</div>
            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
              {[
                { l: 'ГОСПІТАЛІЗАЦІЙ', v: hospKpi ? Number(hospKpi.total_cases).toLocaleString('uk') : '…' },
                { l: 'ПАЦІЄНТІВ',      v: hospKpi ? Number(hospKpi.unique_patients).toLocaleString('uk') : '…' },
                { l: 'ЛЕТАЛЬНІСТЬ',    v: hospKpi ? hospKpi.death_rate_pct + '%' : '…' },
                { l: 'ЛІЖКО-ДЕНЬ',     v: hospKpi ? hospKpi.avg_bed_days + ' дн.' : '…' },
              ].map((m, i) => (
                <div key={m.l} style={{ flex: '1 1 90px', padding: '4px 12px', borderLeft: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: 20, fontWeight: 300, color: '#cfae5a', ...MONO, lineHeight: 1, marginBottom: 3 }}>{m.v}</div>
                  <div style={{ ...lbl }}>{m.l}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Лікар */}
          <div style={{ ...card, padding: '12px 16px' }}>
            <div style={{ ...lbl, marginBottom: 8 }}>МОЯ СТАТИСТИКА</div>
            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
              {[
                { l: 'ВИПАДКІВ',    v: summary ? Number(summary['всього']).toLocaleString('uk') : '…' },
                { l: 'АКТИВНИХ',    v: summary ? summary['активних'] : '…' },
                { l: 'ЛІЖКО-ДЕНЬ',  v: summary ? summary['серед_ліжкодень'] + ' дн.' : '…' },
                { l: 'УРГЕНТНИХ',   v: summary ? summary['ургентних'] : '…' },
              ].map((m, i) => (
                <div key={m.l} style={{ flex: '1 1 90px', padding: '4px 12px', borderLeft: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: 20, fontWeight: 300, color: '#7fd99a', ...MONO, lineHeight: 1, marginBottom: 3 }}>{m.v}</div>
                  <div style={{ ...lbl }}>{m.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legacy summary boxes */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, margin: '0 0 24px' }}>
            <StatBox value={summary['всього']} label="Всього випадків" accent />
            <StatBox value={summary['активних']} label="Зараз лікуються" />
            <StatBox value={summary['серед_ліжкодень']} label="Серед. ліжкодень" />
            <StatBox value={summary['ургентних']} label="Ургентних" />
            <StatBox value={summary['поліпшення']} label="З поліпшенням" />
            <StatBox value={summary['померло']} label="Летальність" />
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            { key: 'recent', label: 'Останні випадки' },
            { key: 'active', label: 'Активні пацієнти' },
            { key: 'diag',   label: 'Топ діагнози' },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              background: tab === t.key ? 'var(--accent)' : 'transparent',
              color: tab === t.key ? '#000' : 'var(--text3)',
              border: '1px solid ' + (tab === t.key ? 'var(--accent)' : 'var(--border)'),
              borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 12,
              fontWeight: tab === t.key ? 600 : 400, ...MONO,
            }}>{t.label}</button>
          ))}
        </div>

        {/* Table */}
        <div style={card}>
          {(!rows || rows.length === 0) && (
            <div style={{ color: 'var(--text3)', fontSize: 13, padding: '12px 0' }}>Немає даних.</div>
          )}
          {rows && rows.length > 0 && tab !== 'diag' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['№','Пацієнт','Дата','Відділення','Діагноз', tab === 'recent' ? 'Статус' : 'Ліжкодень'].map(h => (
                      <th key={h} style={{ ...lbl, textAlign: 'left', padding: '6px 10px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px', color: 'var(--text3)' }}>{r['номер']}</td>
                      <td style={{ padding: '8px 10px' }}>{r['пацієнт']}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text3)' }}>{r['дата']}{r['час'] ? ' · ' + r['час'] : ''}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text3)' }}>{r['відділення']}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text3)' }}>{r['діагноз']}</td>
                      <td style={{ padding: '8px 10px' }}>
                        {tab === 'recent' ? <StatusBadge status={r['статус']} /> : (r['ліжкодень'] != null ? r['ліжкодень'] + ' дн.' : '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows && rows.length > 0 && tab === 'diag' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Діагноз','Код','Випадків','Померло'].map(h => (
                      <th key={h} style={{ ...lbl, textAlign: 'left', padding: '6px 10px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px' }}>{r['діагноз']}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text3)' }}>{r['код']}</td>
                      <td style={{ padding: '8px 10px' }}>{r['випадків']}</td>
                      <td style={{ padding: '8px 10px', color: r['померло'] > 0 ? '#e08080' : 'var(--text3)' }}>{r['померло']}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
