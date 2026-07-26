import Head from 'next/head'
import Link from 'next/link'
import {
  BarChartVertical, BarChartHorizontal, BarChartStacked,
  LineChartSingle, LineChartMulti,
  PieChartBasic, DonutChart,
  AreaChartSimple, AreaChartStacked,
} from '../components/charts'

/* ── Демо-дані (синтетичні, для ілюстрації графіків — не реальна статистика) ── */

const weekdayData = [
  { день: 'Пн', поступлень: 620 }, { день: 'Вт', поступлень: 540 },
  { день: 'Ср', поступлень: 560 }, { день: 'Чт', поступлень: 580 },
  { день: 'Пт', поступлень: 610 }, { день: 'Сб', поступлень: 390 },
  { день: 'Нд', поступлень: 340 },
]

const deptData = [
  { відділення: 'Терапевтичне',  випадків: 4200 },
  { відділення: 'Хірургічне',    випадків: 3650 },
  { відділення: 'Кардіологічне', випадків: 2980 },
  { відділення: 'Неврологічне',  випадків: 2410 },
  { відділення: 'Урологічне',    випадків: 1870 },
  { відділення: 'Онкологічне',   випадків: 1520 },
  { відділення: 'Приймальне',    випадків: 1180 },
]

const MONTHS = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру']

const urgencyMonthly = MONTHS.map((місяць, i) => ({
  місяць,
  ургентних: 640 + Math.round(90 * Math.sin(i / 2)),
  планових: 190 + Math.round(40 * Math.cos(i / 3)),
}))

const admissionsMonthly = MONTHS.map((місяць, i) => ({
  місяць,
  поступлень: 850 + Math.round(120 * Math.sin(i / 2 + 1)),
  померло: 14 + Math.round(6 * Math.cos(i / 2)),
}))

const bedDaysMonthly = MONTHS.map((місяць, i) => ({
  місяць,
  ліжкодень: +(10.8 + 1.2 * Math.sin(i / 2.5)).toFixed(1),
}))

const shiftMonthly = MONTHS.map((місяць, i) => ({
  місяць,
  денна: 830 + Math.round(60 * Math.sin(i / 3)),
  нічна: 55 + Math.round(10 * Math.cos(i / 3)),
}))

const statusData = [
  { статус: 'З поліпшенням', кейсів: 6200 },
  { статус: 'Без змін',      кейсів: 540 },
  { статус: 'З погіршенням', кейсів: 210 },
  { статус: 'Переведено',    кейсів: 380 },
  { статус: 'Помер',         кейсів: 150 },
]

const ageData = [
  { група: '0–17',  пацієнтів: 480 },
  { група: '18–34', пацієнтів: 1620 },
  { група: '35–54', пацієнтів: 2410 },
  { група: '55–74', пацієнтів: 2980 },
  { група: '75+',   пацієнтів: 1310 },
]

export default function ChartsGallery() {
  return (
    <>
      <Head>
        <title>ЛСМД — Бібліотека графіків</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      </Head>

      <style jsx global>{`
        .recharts-cartesian-axis-tick-value { font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
      `}</style>

      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <header style={{
          background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          padding: '0 40px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', height: 56,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 300, color: 'var(--accent)' }}>+</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 500 }}>ЛСМД</span>
            <span style={{ color: 'var(--border)' }}>|</span>
            <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>Бібліотека графіків</span>
          </div>
          <Link href="/analytics" style={{
            fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)',
            textDecoration: 'none', padding: '6px 12px', borderRadius: 6,
            border: '1px solid var(--border)',
          }}>← Аналітика</Link>
        </header>

        <div style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto' }}>
          <p style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 24 }}>
            Готові компоненти графіків з <code>components/charts/</code> — синтетичні демо-дані,
            підключення до реальних показників описано в <code>components/charts/README.md</code>.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <BarChartVertical data={weekdayData} xKey="день" dataKey="поступлень"
              title="Стовпчикова · вертикальна — поступлення по днях тижня" />
            <BarChartHorizontal data={deptData} xKey="відділення" dataKey="випадків"
              title="Стовпчикова · горизонтальна — топ відділень" color="var(--brand)" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <BarChartStacked data={urgencyMonthly} xKey="місяць"
              series={[
                { key: 'ургентних', name: 'Ургентних', color: 'var(--brand)' },
                { key: 'планових', name: 'Планових', color: 'var(--text3)' },
              ]}
              title="Стовпчикова · з накопиченням — ургентні vs планові по місяцях" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <LineChartSingle data={admissionsMonthly} xKey="місяць" dataKey="поступлень"
              title="Лінійна · одна серія — поступлення по місяцях" />
            <LineChartMulti data={admissionsMonthly} xKey="місяць"
              series={[
                { key: 'поступлень', name: 'Поступлень', color: 'var(--accent)' },
                { key: 'померло', name: 'Померло', color: 'var(--brand)' },
              ]}
              title="Лінійна · кілька серій — поступлення vs летальність" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <PieChartBasic data={statusData} nameKey="статус" dataKey="кейсів"
              title="Кругова — розподіл за статусом виписки" />
            <DonutChart data={ageData} nameKey="група" dataKey="пацієнтів" centerLabel="пацієнтів"
              title="Кільцева — розподіл за віковою групою" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <AreaChartSimple data={bedDaysMonthly} xKey="місяць" dataKey="ліжкодень"
              title="Площинна · одна серія — середній ліжко-день по місяцях" color="#4a9870" />
            <AreaChartStacked data={shiftMonthly} xKey="місяць"
              series={[
                { key: 'денна', name: 'Денна зміна', color: 'var(--accent)' },
                { key: 'нічна', name: 'Нічна зміна', color: '#e8a020' },
              ]}
              title="Площинна · з накопиченням — денна vs нічна зміна" />
          </div>

          <div style={{ textAlign: 'center', padding: '16px 0 8px', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
            ЛСМД · демо-дані, не реальна статистика
          </div>
        </div>
      </div>
    </>
  )
}
