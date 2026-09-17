import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { ChartCard, ChartTooltip, axisTick, CHART_COLORS } from './common'

/**
 * LineChartMulti — лінійний графік для порівняння кількох показників у часі.
 *
 * Props:
 *   data   — [{ [xKey]: string, [series[].key]: number, ... }]
 *   xKey   — поле часу/категорії (вісь X)
 *   series — [{ key, name, color? }]
 *   title, height
 */
export function LineChartMulti({ data, xKey, series, title, height = 240 }) {
  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ left: 0, right: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey={xKey} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--mono)' }} />
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name}
              stroke={s.color || CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2}
              dot={{ r: 3 }} activeDot={{ r: 5 }}
              isAnimationActive animationDuration={1800 + i * 200} animationEasing="ease-out" />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
