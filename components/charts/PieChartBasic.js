import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { ChartCard, ChartTooltip, CHART_COLORS } from './common'

/**
 * PieChartBasic — кругова діаграма розподілу за категоріями.
 *
 * Props:
 *   data    — [{ [nameKey]: string, [dataKey]: number }]
 *   nameKey — поле назви сегмента
 *   dataKey — числове поле (розмір сегмента)
 *   colors  — масив кольорів по сегментах
 *   title, height
 */
export function PieChartBasic({ data, nameKey, dataKey, colors = CHART_COLORS, title, height = 260 }) {
  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey={dataKey} nameKey={nameKey} cx="50%" cy="50%" outerRadius="75%"
            isAnimationActive animationDuration={1000}>
            {data?.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--mono)' }} />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
