import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { ChartCard, ChartTooltip, CHART_COLORS } from './common'

/**
 * DonutChart — кільцева діаграма з підсумком у центрі.
 *
 * Props:
 *   data        — [{ [nameKey]: string, [dataKey]: number }]
 *   nameKey     — поле назви сегмента
 *   dataKey     — числове поле (розмір сегмента)
 *   centerLabel — підпис під центральним числом
 *   colors, title, height
 */
export function DonutChart({ data, nameKey, dataKey, centerLabel, colors = CHART_COLORS, title, height = 260 }) {
  const total = (data || []).reduce((sum, d) => sum + (Number(d[dataKey]) || 0), 0)
  return (
    <ChartCard title={title}>
      <div style={{ position: 'relative' }}>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie data={data} dataKey={dataKey} nameKey={nameKey} cx="50%" cy="50%"
              innerRadius="58%" outerRadius="80%" paddingAngle={2}
              isAnimationActive animationDuration={1000}>
              {data?.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          textAlign: 'center', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 26, fontFamily: 'var(--mono)', fontWeight: 300, color: 'var(--text)' }}>
            {total.toLocaleString('uk')}
          </div>
          {centerLabel && (
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {centerLabel}
            </div>
          )}
        </div>
      </div>
    </ChartCard>
  )
}
