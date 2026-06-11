const MONO = { fontFamily: '"IBM Plex Mono", monospace' }
const SANS = { fontFamily: '"IBM Plex Sans", sans-serif' }

/**
 * SplitBar — горизонтальна смужка з двома сегментами у відсотках
 *
 * Props:
 *   label      — назва діаграми (необов'язково)
 *   leftLabel  — назва лівого сегменту
 *   rightLabel — назва правого сегменту
 *   leftValue  — числове значення лівого (або відсоток 0-100)
 *   rightValue — числове значення правого
 *   leftColor  — колір лівого сегменту
 *   rightColor — колір правого сегменту
 *   isPercent  — true якщо значення вже у відсотках (0-100)
 */
export function SplitBar({
  label,
  leftLabel, rightLabel,
  leftValue, rightValue,
  leftColor = '#6b8cba',
  rightColor = '#c4a882',
  isPercent = false,
  height = 10,
}) {
  const lv = Number(leftValue) || 0
  const rv = Number(rightValue) || 0
  const total = lv + rv

  const leftPct  = isPercent ? lv : (total > 0 ? Math.round(lv / total * 100) : 0)
  const rightPct = isPercent ? rv : 100 - leftPct

  return (
    <div style={{ marginBottom: 16 }}>
      {label && (
        <div style={{ fontSize: 9, color: 'var(--text3, #888)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, ...MONO }}>
          {label}
        </div>
      )}

      {/* Смужка */}
      <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', height }}>
        <div style={{ width: leftPct + '%', background: leftColor, transition: 'width .5s ease' }} />
        <div style={{ width: rightPct + '%', background: rightColor, transition: 'width .5s ease' }} />
      </div>

      {/* Підписи */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: leftColor, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'var(--text2, #555)', ...SANS }}>{leftLabel}</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text, #1a1a1a)', ...MONO }}>{leftPct}%</span>
          {!isPercent && <span style={{ fontSize: 10, color: 'var(--text3, #888)', ...MONO }}>({lv.toLocaleString('uk')})</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!isPercent && <span style={{ fontSize: 10, color: 'var(--text3, #888)', ...MONO }}>({rv.toLocaleString('uk')})</span>}
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text, #1a1a1a)', ...MONO }}>{rightPct}%</span>
          <span style={{ fontSize: 11, color: 'var(--text2, #555)', ...SANS }}>{rightLabel}</span>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: rightColor, flexShrink: 0 }} />
        </div>
      </div>
    </div>
  )
}

/**
 * GenderBar — Чоловіки / Жінки
 */
export function GenderBar({ male, female }) {
  return (
    <SplitBar
      label="Стать"
      leftLabel="Чоловіки" rightLabel="Жінки"
      leftValue={male} rightValue={female}
      leftColor="#5b7fa6" rightColor="#c47a8a"
    />
  )
}

/**
 * UrgencyBar — Ургентні / Планові
 */
export function UrgencyBar({ urgent, planned }) {
  return (
    <SplitBar
      label="Тип госпіталізації"
      leftLabel="Ургентні" rightLabel="Планові"
      leftValue={urgent} rightValue={planned}
      leftColor="#c0623a" rightColor="#6a9e6e"
    />
  )
}

/**
 * OutcomeBar — Померли / З покращенням
 */
export function OutcomeBar({ deaths, improved }) {
  return (
    <SplitBar
      label="Результат"
      leftLabel="Померли" rightLabel="З покращенням"
      leftValue={deaths} rightValue={improved}
      leftColor="#a05050" rightColor="#5a8f6a"
    />
  )
}
