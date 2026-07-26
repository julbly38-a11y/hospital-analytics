// Shared building blocks for components/charts/*.
// Matches the editorial-monochrome design tokens from styles/globals.css
// (var(--surface), var(--border), var(--accent), var(--mono), ...) — the
// same tokens pages/analytics.js uses, so these charts drop into any
// page without extra styling.

export const CHART_COLORS = [
  'var(--accent)', 'var(--brand)', '#4a9870', '#e8a020', '#6b6760', '#9c9890',
]

export const axisTick = { fontSize: 11, fontFamily: 'var(--mono)' }

export function ChartCard({ title, subtitle, children }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '20px 24px',
    }}>
      {title && (
        <p style={{
          fontSize: 10, fontFamily: 'var(--mono)', textTransform: 'uppercase',
          letterSpacing: '0.08em', color: 'var(--text3)', marginBottom: subtitle ? 2 : 16,
        }}>{title}</p>
      )}
      {subtitle && (
        <p style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 16 }}>{subtitle}</p>
      )}
      {children}
    </div>
  )
}

export function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '8px 12px', fontSize: 12, fontFamily: 'var(--mono)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    }}>
      {label != null && <p style={{ color: 'var(--text2)', marginBottom: 4 }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.payload?.fill || 'var(--text)' }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toLocaleString('uk') : p.value}</strong>
        </p>
      ))}
    </div>
  )
}

export function slugId(key) {
  return String(key).replace(/[^a-zA-Z0-9_-]/g, '_')
}
