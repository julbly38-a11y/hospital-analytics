import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ChartCard, ChartTooltip, axisTick } from './common'

/**
 * BarChartVertical — вертикальна стовпчикова діаграма, одна серія.
 *
 * Props:
 *   data     — [{ [xKey]: string, [dataKey]: number }]
 *   xKey     — поле категорії (вісь X)
 *   dataKey  — числове поле (висота стовпця)
 *   title    — заголовок картки
 *   color    — колір стовпців
 *   height   — висота графіка, px
 */
export function BarChartVertical({ data, xKey, dataKey, title, color = 'var(--accent)', height = 260 }) {
  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ left: 0, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey={xKey} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey={dataKey} fill={color} radius={[3, 3, 0, 0]}
            isAnimationActive animationDuration={1000} animationEasing="ease-out" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
