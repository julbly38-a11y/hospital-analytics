import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { ChartCard, ChartTooltip, axisTick, CHART_COLORS } from './common'

/**
 * AreaChartStacked — накопичувальний площинний графік для кількох серій.
 *
 * Props:
 *   data   — [{ [xKey]: string, [series[].key]: number, ... }]
 *   xKey   — поле часу/категорії (вісь X)
 *   series — [{ key, name, color? }]
 *   title, height
 */
export function AreaChartStacked({ data, xKey, series, title, height = 240 }) {
  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ left: 0, right: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey={xKey} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--mono)' }} />
          {series.map((s, i) => {
            const color = s.color || CHART_COLORS[i % CHART_COLORS.length]
            return (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stackId="stack"
                stroke={color} fill={color} fillOpacity={0.5}
                isAnimationActive animationDuration={1600} animationEasing="ease-out" />
            )
          })}
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
