import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }
const label3 = { fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }
const mono = { fontFamily: 'var(--mono)' }

function StatBox({ value, label, accent }) {
  return (
    <div style={{ ...card, padding: '16px', textAlign: 'center' }}>
      <div style={{ fontSize: '26px', fontWeight: 700, color: accent ? 'var(--accent)' : 'var(--text)', ...mono }}>{value ?? '—'}</div>
      <div style={{ ...label3, marginTop: '6px' }}>{label}</div>
    </div>
  )
}

const STATUS_COLORS = {
  'Лікується': '#5ab0ff',
  'З поліпшенням': '#7fd99a',
  'Без змін': '#cfae5a',
  'З погіршенням': '#e0a060',
  'Помер': '#e08080',
  'Переведений в інший заклад': '#a08ae0',
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || 'var(--text3)'
  return <span style={{ fontSize: '11px', color: c, border: `1px solid ${c}55`, borderRadius: '999px', padding: '2px 9px', whiteSpace: 'nowrap' }}>{status || '—'}</span>
}

export default function Cabinet() {
  const router = useRouter()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('recent') // recent | active | diag

  useEffect(() => {
    fetch('/api/cabinet')
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) { setError(j.error || 'Помилка завантаження'); return }
        setData(j)
      })
      .catch(() => setError('Помилка з’єднання'))
  }, [])

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', ...mono }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '14px', marginBottom: '12px', color: '#e08080' }}>{error}</div>
          <button onClick={() => router.push('/')} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', padding: '8px 16px', cursor: 'pointer', ...mono }}>На головну</button>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', ...mono }}>
        Завантаження кабінету...
      </div>
    )
  }

  const { profile, summary, recent, active, topDiag, notice } = data
  const rows = tab === 'recent' ? recent : tab === 'active' ? active : topDiag

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', ...mono, padding: '32px 16px' }}>
      <div style={{ maxWidth: '920px', margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>{profile?.full_name || 'Кабінет лікаря'}</h1>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>
              {[profile?.position, profile?.specialization, profile?.department].filter(Boolean).join(' · ') || profile?.email}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => router.push('/admit')} style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, ...mono }}>+ Новий випадок</button>
            <button onClick={() => router.push('/')} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text3)', padding: '8px 14px', cursor: 'pointer', fontSize: '12px', ...mono }}>← Дашборд</button>
          </div>
        </div>

        {notice && (
          <div style={{ background: 'rgba(207,174,90,0.1)', border: '1px solid rgba(207,174,90,0.3)', borderRadius: '8px', padding: '12px 16px', margin: '16px 0', fontSize: '13px', color: '#cfae5a' }}>
            {notice}
          </div>
        )}

        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '12px', margin: '24px 0' }}>
            <StatBox value={summary['всього']} label="Всього випадків" accent />
            <StatBox value={summary['активних']} label="Зараз лікуються" />
            <StatBox value={summary['серед_ліжкодень']} label="Серед. ліжкодень" />
            <StatBox value={summary['ургентних']} label="Ургентних" />
            <StatBox value={summary['поліпшення']} label="З поліпшенням" />
            <StatBox value={summary['померло']} label="Летальність" />
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {[
            { key: 'recent', label: 'Останні випадки' },
            { key: 'active', label: 'Активні пацієнти' },
            { key: 'diag', label: 'Топ діагнози' },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              background: tab === t.key ? 'var(--accent)' : 'transparent',
              color: tab === t.key ? '#000' : 'var(--text3)',
              border: '1px solid ' + (tab === t.key ? 'var(--accent)' : 'var(--border)'),
              borderRadius: '6px', padding: '7px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: tab === t.key ? 600 : 400, ...mono,
            }}>{t.label}</button>
          ))}
        </div>

        <div style={card}>
          {(!rows || rows.length === 0) && (
            <div style={{ color: 'var(--text3)', fontSize: '13px', padding: '12px 0' }}>Немає даних для відображення.</div>
          )}

          {rows && rows.length > 0 && tab !== 'diag' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ ...label3, textAlign: 'left', padding: '6px 10px' }}>№</th>
                    <th style={{ ...label3, textAlign: 'left', padding: '6px 10px' }}>Пацієнт</th>
                    <th style={{ ...label3, textAlign: 'left', padding: '6px 10px' }}>Дата</th>
                    <th style={{ ...label3, textAlign: 'left', padding: '6px 10px' }}>Відділення</th>
                    <th style={{ ...label3, textAlign: 'left', padding: '6px 10px' }}>Діагноз</th>
                    <th style={{ ...label3, textAlign: 'left', padding: '6px 10px' }}>{tab === 'recent' ? 'Статус' : 'Ліжкодень'}</th>
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
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ ...label3, textAlign: 'left', padding: '6px 10px' }}>Діагноз</th>
                    <th style={{ ...label3, textAlign: 'left', padding: '6px 10px' }}>Код</th>
                    <th style={{ ...label3, textAlign: 'left', padding: '6px 10px' }}>Випадків</th>
                    <th style={{ ...label3, textAlign: 'left', padding: '6px 10px' }}>Померло</th>
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
