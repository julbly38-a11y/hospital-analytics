# components/charts

Готова бібліотека графіків на recharts (уже в `package.json`), стилізована під
дизайн-токени з `styles/globals.css` (`var(--surface)`, `var(--border)`,
`var(--accent)`, `var(--mono)`, ...) — та сама палітра, що й у `pages/analytics.js`.
Компоненти не містять власних даних чи запитів — вони приймають дані через
props, тож підключаються до будь-якого джерела (Supabase `/api/stats`, RPC,
статичний масив) без змін усередині.

Демо з тестовими даними: сторінка `/charts` (`pages/charts.js`).

## Типи графіків

| Компонент             | Тип                                      | Серій   |
|------------------------|-------------------------------------------|---------|
| `BarChartVertical`     | стовпчикова, вертикальна                  | 1       |
| `BarChartHorizontal`   | стовпчикова, горизонтальна (топ-N, довгі підписи) | 1 |
| `BarChartStacked`      | стовпчикова з накопиченням                | 2+      |
| `LineChartSingle`      | лінійна, часовий ряд                      | 1       |
| `LineChartMulti`       | лінійна, порівняння кількох показників    | 2+      |
| `PieChartBasic`        | кругова                                   | —       |
| `DonutChart`           | кільцева, з підсумком у центрі            | —       |
| `AreaChartSimple`      | площинна, з градієнтом                    | 1       |
| `AreaChartStacked`     | площинна з накопиченням                   | 2+      |

## Приклад підключення до реальних даних

Той самий патерн, що й `useQuery` у `pages/analytics.js` — фетч з
`/api/stats`, потім передача рядків напряму в компонент:

```jsx
import { useState, useEffect } from 'react'
import { LineChartSingle } from '../components/charts'

function useStats(key) {
  const [data, setData] = useState([])
  useEffect(() => {
    fetch('/api/stats', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    }).then(r => r.json()).then(d => setData(d.rows || []))
  }, [key])
  return data
}

function MonthlyAdmissions() {
  const rows = useStats('peakMonth') // [{ місяць, поступлень }, ...]
  return (
    <LineChartSingle
      data={rows}
      xKey="місяць"
      dataKey="поступлень"
      title="Поступлення по місяцях"
      color="var(--accent)"
    />
  )
}
```

Для багатосерійних графіків (`BarChartStacked`, `LineChartMulti`,
`AreaChartStacked`) кожен рядок `data` повинен містити всі ключі із `series`:

```jsx
<LineChartMulti
  data={rows} // [{ місяць, поступлень, померло }, ...]
  xKey="місяць"
  series={[
    { key: 'поступлень', name: 'Поступлення', color: 'var(--accent)' },
    { key: 'померло', name: 'Померло', color: 'var(--brand)' },
  ]}
  title="Динаміка по місяцях"
/>
```
