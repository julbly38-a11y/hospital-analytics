import { MONO } from './shared'

export function Stat({ value, label, large }) {
  return (
    <div>
      <div style={{
        fontSize: large ? 52 : 32, fontWeight: 300,
        color: '#1a1a1a', ...MONO, lineHeight: 1, letterSpacing: '-0.02em',
      }}>
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
