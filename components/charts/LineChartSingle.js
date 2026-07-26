import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ChartCard, ChartTooltip, axisTick } from './common'

/**
 * LineChartSingle — лінійний графік динаміки одного показника (часовий ряд).
 *
 * Props:
 *   data    — [{ [xKey]: string, [dataKey]: number }]
 *   xKey    — поле часу/категорії (вісь X)
 *   dataKey — числове поле
 *   title, color, height
 */
export function LineChartSingle({ data, xKey, dataKey, title, color = 'var(--accent)', height = 220 }) {
  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ left: 0, right: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey={xKey} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2}
            dot={{ r: 3 }} activeDot={{ r: 5 }}
            isAnimationActive animationDuration={1800} animationEasing="ease-out" />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
