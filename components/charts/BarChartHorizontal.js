import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ChartCard, ChartTooltip, axisTick } from './common'

/**
 * BarChartHorizontal — горизонтальна стовпчикова діаграма (топ-N категорій
 * з довгими підписами — відділення, лікарі, діагнози тощо).
 *
 * Props:
 *   data       — [{ [xKey]: string, [dataKey]: number }], зазвичай відсортовано спаданням
 *   xKey       — поле категорії (вісь Y)
 *   dataKey    — числове поле (довжина стовпця)
 *   labelWidth — ширина колонки підписів, px
 *   title, color, height
 */
export function BarChartHorizontal({ data, xKey, dataKey, title, color = 'var(--accent)', labelWidth = 160, height = 280 }) {
  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey={xKey} width={labelWidth}
            tick={{ ...axisTick, fill: 'var(--text2)' }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey={dataKey} fill={color} radius={[0, 3, 3, 0]}
            isAnimationActive animationDuration={1200} animationEasing="ease-out" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
