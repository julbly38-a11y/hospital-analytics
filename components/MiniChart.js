import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { MONO } from './shared'

export function MiniChart({ data, loading, color = '#8b8fa8', height = 90 }) {
  if (loading) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 10, ...MONO }}>
      завантаження…
    </div>
  )
  if (!data?.length) return null
  const rows = data.map(r => ({ м: r.місяць?.slice(5, 7), випадків: Number(r.випадків) || 0 }))
  return (
    <div style={{ marginTop: 10 }}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" />
          <XAxis dataKey="м" tick={{ fontSize: 9, fontFamily: 'IBM Plex Mono', fill: '#999' }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 6, fontSize: 11, fontFamily: 'IBM Plex Mono' }}
            formatter={v => [Number(v).toLocaleString('uk'), 'Поступлень']}
            labelFormatter={l => `Місяць ${l}`}
          />
          <Line type="monotone" dataKey="випадків" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color, strokeWidth: 0 }} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
