import { useState, useRef, useEffect, useMemo } from 'react'
import Head from 'next/head'
import { createClient } from '../lib/supabase'
import { useRouter } from 'next/router'

/* ============================================================
   Примітиви дизайн-системи «Медична» (інлайн для Next.js)
   ============================================================ */
const ICONS = {
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  users: 'M9 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0|M1 21a8 8 0 0 1 16 0|M18 9a4 4 0 0 1 4 4',
  user: 'M12 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0|M4 21a8 8 0 0 1 16 0',
  chart: 'M3 3v18h18|M7 15l4-6 4 3 5-7',
  database: 'M12 5m-9 0a9 3 0 1 0 18 0a9 3 0 1 0 -18 0|M3 5v14a9 3 0 0 0 18 0V5|M3 12a9 3 0 0 0 18 0',
  pill: 'M2 8h20v8H2z|M12 8v8',
  microscope: 'M6 18h8M3 22h18|M14 22a7 7 0 1 0 0-14h-1|M8 6l4-4 4 4|M12 6v8',
  search: 'M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0|M21 21l-4.3-4.3',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9|M13.7 21a2 2 0 0 1-3.4 0',
  settings: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0|M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|M16 17l5-5-5-5M21 12H9',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
}

function Icon({ name, size = 16, stroke = 1.6, color = 'currentColor', style = {} }) {
  const d = ICONS[name]
  if (!d) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {d.split('|').map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}

function Avatar({ name = '', size = 32 }) {
  const initials = name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  const palette = ['#0E4F4F', '#2F6A86', '#3F7A4F', '#B07A18', '#B2412E', '#D96A4A']
  const pick = palette[(name.charCodeAt(0) || 0) % palette.length]
  return (
    <div style={{ width: size, height: size, borderRadius: 999, background: pick, color: '#FAF7F2',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600,
      fontSize: size * 0.38, flexShrink: 0 }}>{initials}</div>
  )
}

function Badge({ tone = 'neutral', children }) {
  const tones = {
    positive: { bg: 'var(--positive-soft)', color: '#2F5D3B', dot: 'var(--positive)' },
    caution: { bg: 'var(--caution-soft)', color: '#7E5712', dot: 'var(--caution)' },
    critical: { bg: 'var(--critical-soft)', color: '#8F2E1F', dot: 'var(--critical)' },
    info: { bg: 'var(--info-soft)', color: '#1F4A5E', dot: 'var(--info)' },
    neutral: { bg: 'var(--paper-3)', color: 'var(--ink-2)', dot: 'var(--ink-3)' },
    brand: { bg: 'var(--teal-ink-soft)', color: 'var(--teal-ink)', dot: 'var(--teal-ink)' },
  }
  const t = tones[tone] || tones.neutral
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px',
      borderRadius: 999, background: t.bg, color: t.color, fontSize: 11, fontWeight: 500, lineHeight: 1.4 }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: t.dot }} />
      {children}
    </span>
  )
}

function Card({ children, padding = 16, style = {} }) {
  return (
    <div style={{ background: 'var(--paper)', border: '1px solid var(--border)', borderRadius: 10,
      padding, boxShadow: '0 1px 2px rgba(15,30,31,0.06)', ...style }}>{children}</div>
  )
}

/* ---------- Приклади (збережено з попередньої версії) ---------- */
const ALL_EXAMPLES = [
  'Загальна статистика лікарні','Показники по напрямках (терапевтичний/хірургічний)',
  'Картка пацієнта (введіть ПІБ)','Скільки всього госпіталізацій','Скільки унікальних пацієнтів',
  'Середній ліжкодень по лікарні','Загальна летальність лікарні','Хірургічна активність лікарні',
  'Показники по всіх відділеннях','Летальність по відділеннях','Відділення з найдовшим ліжкоднем',
  'Топ відділень за кількістю операцій','Летальність реанімації','Топ 10 діагнозів за кількістю випадків',
  'Летальність по діагнозах','Скільки інсультів пролікувано за 2024 рік','Скільки інфарктів міокарда за 2024',
  'Повторні госпіталізації 30 і 90 днів','Розподіл за статтю та віком','Летальність по віковим групам',
  'Пікові навантаження по годинах','Динаміка по місяцях','Нічні vs денні поступлення',
  'Статистика за регіонами','Скільки пацієнтів з Чернівецької області',
  'Топ діагнозів неврологічного відділення','Статистика хірургічного відділення',
  'Скільки лікарів хірургічного напрямку','Покажи всіх хірургів',
]
const DOCTOR_EXAMPLES = [
  'Скільки пацієнтів я пролікував за 2024 рік','Скільки моїх пацієнтів за перше півріччя 2024',
  'Скільки нічних поступлень у мене за 2024','Скільки діб чергування у мене за 2024',
  'Скільки вихідних діб у мене за 2024','Летальність моїх пацієнтів',
  'Покажи мої випадки інсульту за 2024','Мої пацієнти з епілепсією','Мої випадки розсіяного склерозу',
  'Мої пацієнти з транзиторною ішемічною атакою',
]
const DOCTOR_GENERAL_EXAMPLES = [
  'Загальна статистика лікарні','Показники по напрямках (терапевтичний/хірургічний)',
  'Летальність по відділеннях','Топ 10 діагнозів за кількістю випадків','Летальність реанімації',
  'Пікові навантаження по годинах','Динаміка по місяцях','Летальність по віковим групам',
]

const COL_LABELS = {
  doctor_name: 'Лікар', patient_name: 'Пацієнт', відділення: 'Відділення', завідувач: 'Завідувач',
  bed_days: 'Ліжко-днів', discharge_status: 'Статус', region: 'Регіон', count: 'Кількість',
}

/* ---------- Формат значень (укр. формат: десятковий розділювач — кома) ---------- */
function formatValue(key, val) {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}[T ]/.test(val))
    return new Date(val).toLocaleDateString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric' })
  if (typeof val === 'number' && !Number.isInteger(val)) return val.toFixed(1).replace('.', ',')
  if (typeof val === 'number') return val.toLocaleString('uk-UA').replace(/,/g, ' ')
  return String(val)
}
function colLabel(key) { return COL_LABELS[key] || key.replace(/_/g, ' ') }
function formatNum(n) {
  if (n === null || n === undefined || n === '') return '—'
  return Number(n).toLocaleString('uk-UA').replace(/,/g, ' ')
}

/* ---------- Тон бейджа за статусом/летальністю ---------- */
function toneForStatus(s) {
  const v = String(s).toLowerCase()
  if (v.includes('помер') || v.includes('погірш')) return 'critical'
  if (v.includes('покращ') || v.includes('одужан') || v.includes('виписан')) return 'positive'
  if (v.includes('без змін')) return 'caution'
  return 'neutral'
}
function toneForRate(pct) {
  const n = Number(pct)
  if (isNaN(n)) return 'neutral'
  if (n >= 20) return 'critical'
  if (n >= 5) return 'caution'
  return 'positive'
}

/* ============================================================
   ResultView — відображення результату у стилі «Медична»
   ============================================================ */
const LABEL_CSS = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--ink-3)', fontWeight: 500 }

function ResultView({ rows }) {
  if (!rows || rows.length === 0) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
      Результатів не знайдено</div>
  }
  const cols = Object.keys(rows[0])
  const single = rows.length === 1 && cols.length === 1 && typeof Object.values(rows[0])[0] === 'number'
  const smallStat = rows.length === 1 && cols.length <= 5

  // Одне число — великий показник (Instrument Serif)
  if (single) {
    const key = cols[0]
    return (
      <Card padding={24} style={{ display: 'inline-block', minWidth: 220 }}>
        <div style={LABEL_CSS}>{colLabel(key)}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 48, lineHeight: 1.1,
          color: 'var(--ink)', marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
          {formatValue(key, rows[0][key])}</div>
      </Card>
    )
  }

  // Один рядок, кілька полів — сітка карток-показників
  if (smallStat) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(cols.length, 4)}, 1fr)`, gap: 12 }}>
        {cols.map(key => {
          const isRate = /летальн|активн|відс|pct|_пр/.test(key.toLowerCase())
          return (
            <Card key={key} padding={16}>
              <div style={LABEL_CSS}>{colLabel(key)}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, lineHeight: 1.1,
                color: 'var(--ink)', marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
                {formatValue(key, rows[0][key])}{isRate && typeof rows[0][key] === 'number'
                  ? <span style={{ fontSize: 14, color: 'var(--ink-3)' }}> %</span> : null}</div>
            </Card>
          )
        })}
      </div>
    )
  }

  // Таблиця — hairline rules, моноширинні цифри, бейджі для статусів
  return (
    <Card padding={0} style={{ overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-2)' }}>
              {cols.map(c => {
                const num = typeof rows[0][c] === 'number'
                return <th key={c} style={{ ...LABEL_CSS, padding: '10px 14px',
                  textAlign: num ? 'right' : 'left' }}>{colLabel(c)}</th>
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                {cols.map(c => {
                  const v = row[c]
                  const num = typeof v === 'number'
                  const isStatus = /статус|вислід|discharge/.test(c.toLowerCase())
                  const isRate = /летальн|активн|відс|pct|_пр/.test(c.toLowerCase())
                  return (
                    <td key={c} style={{ padding: '10px 14px', textAlign: num ? 'right' : 'left',
                      fontFamily: num ? 'var(--font-mono)' : 'var(--font-sans)',
                      fontVariantNumeric: 'tabular-nums', color: 'var(--ink)',
                      whiteSpace: num ? 'nowrap' : 'normal' }}>
                      {isStatus && v
                        ? <Badge tone={toneForStatus(v)}>{v}</Badge>
                        : isRate && num
                          ? <span style={{ color: `var(--${toneForRate(v) === 'neutral' ? 'ink' : toneForRate(v)})`,
                              fontWeight: 500 }}>{formatValue(c, v)}</span>
                          : formatValue(c, v)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '8px 14px', ...LABEL_CSS, borderTop: '1px solid var(--border)' }}>
        {rows.length} {rows.length === 1 ? 'запис' : 'записів'}</div>
    </Card>
  )
}

/* ============================================================
   Sidebar — навігація «Медична»
   ============================================================ */
function Sidebar({ role, me, onLogout, globalStats }) {
  const nav = [
    { icon: 'home', label: 'Огляд', active: true },
    { icon: 'users', label: 'Пацієнти' },
    { icon: 'database', label: 'Відділення' },
    { icon: 'chart', label: 'Аналітика' },
  ]
  // Реальне ім'я/посада залогіненого користувача (з /api/me → empl)
  const displayName = me?.name || (role === 'admin' ? 'Адміністратор' : 'Користувач')
  const subtitle = me?.specialization || me?.position
    ? [me.position, me.specialization].filter(Boolean).join(' · ')
    : (role === 'admin' ? 'Повний доступ' : '')
  return (
    <aside style={{ width: 232, background: 'var(--paper)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100vh', position: 'sticky', top: 0 }}>
      <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid var(--border)' }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--teal-ink)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="activity" size={16} color="#FAF7F2" /></div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink)' }}>Медична</div>
      </div>
      <nav style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div style={{ ...LABEL_CSS, fontSize: 10, padding: '6px 10px 8px' }}>
          {role === 'doctor' ? 'Моя робота' : 'Аналітика ЛСМД'}</div>
        {nav.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
            borderRadius: 6, fontSize: 13, fontWeight: it.active ? 500 : 400,
            color: it.active ? 'var(--teal-ink)' : 'var(--ink-2)',
            background: it.active ? 'var(--teal-ink-soft)' : 'transparent',
            boxShadow: it.active ? 'inset 2px 0 0 var(--teal-ink)' : 'none', cursor: 'pointer' }}>
            <Icon name={it.icon} size={15} /><span>{it.label}</span>
          </div>
        ))}
      </nav>
      {globalStats && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', marginTop: 8 }}>
          <div style={{ ...LABEL_CSS, marginBottom: 8 }}>Лікарня</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-2)', lineHeight: 2 }}>
            <div>{formatNum(globalStats.total_cases || 110206)} госпіталізацій</div>
            <div>{formatNum(globalStats.unique_patients || 67856)} пацієнтів</div>
          </div>
        </div>
      )}
      <div style={{ marginTop: 'auto', padding: 12, borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={displayName} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
          {subtitle && <div style={{ fontSize: 11, color: 'var(--ink-3)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
        </div>
        <button onClick={onLogout} title="Вийти" style={{ background: 'transparent', border: 0,
          cursor: 'pointer', color: 'var(--ink-3)', display: 'flex' }}>
          <Icon name="logout" size={15} /></button>
      </div>
    </aside>
  )
}

/* ============================================================
   Home — dashboard (логіка збережена з попередньої версії)
   ============================================================ */
export default function Home() {
  const router = useRouter()
  const supabase = useMemo(() => (typeof window !== 'undefined' ? createClient() : null), [])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [globalStats, setGlobalStats] = useState(null)
  const [role, setRole] = useState(null)
  const [me, setMe] = useState(null)
  const bottomRef = useRef(null)

  async function handleLogout() { await supabase?.auth.signOut(); router.push('/login') }

  useEffect(() => { fetch('/api/me').then(r => r.json()).then(d => { setRole(d.role); setMe(d) }).catch(() => {}) }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])
  useEffect(() => { fetch('/api/stats').then(r => r.json()).then(setGlobalStats).catch(() => {}) }, [])

  async function send(question) {
    if (!question.trim() || loading) return
    setInput(''); setLoading(true)
    setMessages(prev => [...prev, { role: 'user', content: question }])
    try {
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history, provider: 'groq' })
      })
      const data = await res.json()
      if (data.error) setMessages(prev => [...prev, { role: 'assistant', error: data.error }])
      else setMessages(prev => [...prev, { role: 'assistant', content: question,
        explanation: data.explanation, rows: data.rows || [] }])
    } catch (e) { setMessages(prev => [...prev, { role: 'assistant', error: e.message }]) }
    setLoading(false)
  }

  const examples = role === 'doctor' ? [...DOCTOR_EXAMPLES, ...DOCTOR_GENERAL_EXAMPLES] : ALL_EXAMPLES
  const showWelcome = messages.length === 0

  return (
    <>
      <Head>
        <title>Медична — Аналітика ЛСМД</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--paper-2)' }}>
        <Sidebar role={role} me={me} onLogout={handleLogout} globalStats={globalStats} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* TopBar */}
          <header style={{ padding: '18px 28px 16px', borderBottom: '1px solid var(--border)',
            background: 'var(--paper)', position: 'sticky', top: 0, zIndex: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6 }}>
              {role === 'doctor' ? `Клінічна робота · ${me?.specialization || 'Лікар'}` : 'Аналітика · ЛСМД'}</div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 400,
              letterSpacing: '-0.01em', color: 'var(--ink)', lineHeight: 1.1 }}>
              {role === 'doctor' ? 'Мої показники' : 'Огляд лікарні'}</h1>
          </header>

          {/* Контент */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
            {showWelcome ? (
              <div style={{ maxWidth: 760 }}>
                <Card padding={24} style={{ marginBottom: 24 }}>
                  <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 24,
                    fontWeight: 400, color: 'var(--ink)' }}>Запитайте про дані лікарні</h2>
                  <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.5 }}>
                    Сформулюйте запит природною мовою — статистика, відділення, діагнози, пацієнти.
                    Оберіть приклад нижче або введіть власний запит.</p>
                </Card>
                <div style={{ ...LABEL_CSS, marginBottom: 12 }}>Приклади запитів</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                  {examples.map((ex, i) => (
                    <button key={i} onClick={() => send(ex)} style={{ textAlign: 'left', padding: '12px 14px',
                      background: 'var(--paper)', border: '1px solid var(--border)', borderRadius: 8,
                      fontSize: 13, color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      transition: 'background 120ms' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--paper-2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--paper)'}>{ex}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ maxWidth: 980, display: 'flex', flexDirection: 'column', gap: 20 }}>
                {messages.map((msg, i) => msg.role === 'user' ? (
                  <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ background: 'var(--teal-ink)', color: 'var(--paper)', padding: '10px 16px',
                      borderRadius: 10, fontSize: 14, maxWidth: '70%' }}>{msg.content}</div>
                  </div>
                ) : (
                  <div key={i}>
                    {msg.error ? (
                      <Card padding={16} style={{ borderColor: 'var(--critical)', background: 'var(--critical-soft)' }}>
                        <div style={{ color: 'var(--critical)', fontSize: 13 }}>{msg.error}</div>
                      </Card>
                    ) : (
                      <>
                        {msg.explanation && <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 10 }}>
                          {msg.explanation}</div>}
                        <ResultView rows={msg.rows} />
                      </>
                    )}
                  </div>
                ))}
                {loading && <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Обробка запиту…</div>}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Поле вводу */}
          <div style={{ borderTop: '1px solid var(--border)', background: 'var(--paper)', padding: '16px 28px' }}>
            <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', gap: 10 }}>
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send(input)}
                placeholder="Запитайте про дані лікарні…"
                style={{ flex: 1, fontFamily: 'var(--font-sans)', fontSize: 14, padding: '11px 16px',
                  background: 'var(--paper-2)', border: '1px solid var(--border)', borderRadius: 8,
                  color: 'var(--ink)', outline: 'none' }} />
              <button onClick={() => send(input)} disabled={loading || !input.trim()}
                style={{ background: 'var(--teal-ink)', color: 'var(--paper)', border: 0, borderRadius: 8,
                  padding: '0 16px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.4 : 1,
                  display: 'flex', alignItems: 'center' }}>
                <Icon name="send" size={16} color="#FAF7F2" /></button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
