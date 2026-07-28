import { MONO, fmt } from './shared'

export function BlockStats({ stats, loading, color }) {
  if (loading) return <div style={{ fontSize: 12, color: '#999', ...MONO }}>завантаження…</div>
  if (!stats) return null

  const items = [
    { l: 'СЕРЕДНІЙ ВІК',  v: stats.середній_вік },
    { l: 'ЛІЖКО-ДЕНЬ',    v: stats.ліжкодень },
    { l: 'ПОВТОРНІ',      v: fmt(stats.повторні) },
    { l: 'З ПОКРАЩЕННЯМ', v: stats.випадків > 0 ? (Number(stats.поліпшення) / Number(stats.випадків) * 100).toFixed(1) + '%' : '—' },
    { l: 'ЛЕТАЛЬНІСТЬ',   v: stats.летальність + '%' },
  ]

  return (
    <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
      {items.map((it, i) => (
        <div key={i} style={{
          flex: '1 1 80px', textAlign: 'center',
          padding: '8px 12px',
          borderLeft: i > 0 ? '1px solid rgba(0,0,0,0.08)' : 'none',
        }}>
          <div style={{ fontSize: 22, fontWeight: 300, color: color || '#1a1a1a', ...MONO, lineHeight: 1 }}>
            {it.v ?? '—'}
          </div>
          <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 5, ...MONO }}>
            {it.l}
          </div>
        </div>
      ))}
    </div>
  )
}
