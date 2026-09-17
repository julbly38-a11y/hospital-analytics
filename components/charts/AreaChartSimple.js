import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ChartCard, ChartTooltip, axisTick, slugId } from './common'

/**
 * AreaChartSimple — площинний графік динаміки одного показника, з градієнтною заливкою.
 *
 * Props:
 *   data    — [{ [xKey]: string, [dataKey]: number }]
 *   xKey    — поле часу/категорії (вісь X)
 *   dataKey — числове поле
 *   title, color, height
 */
export function AreaChartSimple({ data, xKey, dataKey, title, color = 'var(--accent)', height = 220 }) {
  const gradId = `area-${slugId(dataKey)}`
  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ left: 0, right: 24 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey={xKey} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2}
            fill={`url(#${gradId})`}
            isAnimationActive animationDuration={1600} animationEasing="ease-out" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
