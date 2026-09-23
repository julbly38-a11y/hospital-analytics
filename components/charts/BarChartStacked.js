import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { ChartCard, ChartTooltip, axisTick, CHART_COLORS } from './common'

/**
 * BarChartStacked — стовпчикова діаграма з накопиченням (кілька серій в одному стовпці).
 *
 * Props:
 *   data    — [{ [xKey]: string, [series[].key]: number, ... }]
 *   xKey    — поле категорії (вісь X)
 *   series  — [{ key, name, color? }] — серії, що складаються в стовпець
 *   title, height
 */
export function BarChartStacked({ data, xKey, series, title, height = 260 }) {
  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ left: 0, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey={xKey} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--mono)' }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} stackId="stack"
              fill={s.color || CHART_COLORS[i % CHART_COLORS.length]}
              radius={i === series.length - 1 ? [3, 3, 0, 0] : 0}
              isAnimationActive animationDuration={1200} animationEasing="ease-out" />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
