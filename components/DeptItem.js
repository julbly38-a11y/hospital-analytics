import { SANS, MONO, fmt } from './shared'

export function DeptItem({ name, hovered, stats, onEnter, onLeave }) {
  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        borderRadius: 6, margin: '1px 8px', transition: 'background .15s',
        background: hovered ? 'rgba(0,0,0,0.04)' : 'transparent',
      }}
    >
      <div style={{
        padding: '5px 32px', fontSize: 14,
        color: hovered ? '#1a1a1a' : '#333',
        textAlign: 'right', cursor: 'default', ...SANS,
      }}>
        {name}
      </div>

      {hovered && (
        <div style={{ padding: '8px 32px 10px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          {!stats ? (
            <div style={{ fontSize: 10, color: '#aaa', textAlign: 'right', ...MONO }}>завантаження…</div>
          ) : (
            <>
              {stats.head && (
                <div style={{ fontSize: 12, color: '#555', textAlign: 'right', marginBottom: 10, ...SANS }}>
                  <span style={{ color: '#aaa', fontSize: 11 }}>Завідувач:&nbsp;</span>{stats.head}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 0 }}>
                {[
                  { v: fmt(stats.випадків),   l: 'ВИПАДКІВ' },
                  { v: fmt(stats.унікальних), l: 'ПАЦІЄНТІВ' },
                  { v: fmt(stats.doctors),    l: 'ЛІКАРІВ' },
                  { v: stats.beds ? fmt(stats.beds) : '—', l: 'ЛІЖОК' },
                ].map((it, i) => (
                  <div key={i} style={{
                    textAlign: 'center', padding: '0 14px',
                    borderLeft: i > 0 ? '1px solid rgba(0,0,0,0.08)' : 'none',
                  }}>
                    <div style={{ fontSize: 18, fontWeight: 300, color: '#1a1a1a', lineHeight: 1, ...MONO }}>{it.v}</div>
                    <div style={{ fontSize: 7, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4, ...MONO }}>{it.l}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
