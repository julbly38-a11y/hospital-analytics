import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'
import styles from '../styles/Home.module.css'

const ALL_EXAMPLES = [
  'Загальна статистика лікарні',
  'Показники по всіх відділеннях',
  'Летальність по відділеннях',
  'Топ 10 діагнозів за кількістю випадків',
  'Ургентні vs планові по відділеннях',
  'Розподіл за статтю та віком',
  'Повторні госпіталізації 30 і 90 днів',
  'Статистика за регіонами',
  'Пікові навантаження по годинах',
  'Навантаження по днях тижня',
  'Динаміка по місяцях',
  'Вихідні vs робочі дні',
  'Нічні vs денні поступлення',
  'Скільки вихідних діб в лікаря Грабовського за перше півріччя 2023',
  'Яка спеціалізація у лікаря Арійчука О.І',
  'Скільки нічних поступлень у Блинду за липень 2024',
  'Відділення з найдовшим ліжкоднем',
  'Скільки інсультів пролікувано за 2024 рік',
  'Топ відділень за кількістю операцій',
  'Скільки пацієнтів з Чернівецького району',
  'Скільки дітей госпіталізовано за 2024',
  'Навантаження по тижнях 2024',
  'Нічні поступлення по відділеннях',
  'Скільки пацієнтів пролікував Грабовський за 2023 рік',
  'Хірургічна активність по відділеннях',
]
const PAGE_SIZE = 8
const ROTATE_MS = 60000

// Спливаючі підказки про доступні VIEW (показуються періодично)
const VIEW_HINTS = [
  { view: 'v_hospital_summary', desc: 'загальна статистика лікарні' },
  { view: 'v_department_stats', desc: 'летальність та активність по відділеннях' },
  { view: 'v_case_metrics', desc: '35 прапорців кожного випадку' },
  { view: 'v_urgency_stats', desc: 'ургентні проти планових' },
  { view: 'v_readmission_metrics', desc: 'повторні госпіталізації 30/90 днів' },
  { view: 'v_diagnosis_stats', desc: 'статистика по діагнозах МКХ-10' },
  { view: 'v_patient_stats', desc: 'розподіл за статтю та віком' },
  { view: 'v_region_stats', desc: 'географія пацієнтів' },
  { view: 'v_peak_by_hour', desc: 'навантаження по годинах' },
  { view: 'v_peak_by_weekday', desc: 'навантаження по днях тижня' },
  { view: 'v_peak_by_month', desc: 'динаміка по місяцях' },
]

const COL_LABELS = {
  doctor_name: 'Лікар', patient_name: 'Пацієнт', department_name: 'Відділення',
  відділення: 'Відділення', завідувач: 'Завідувач', штат_лікарів: 'Штат',
  admission_at: 'Дата госпіталізації', discharge_at: 'Дата виписки',
  bed_days: 'Ліжко-днів', discharge_status: 'Статус виписки',
  diagnosis_main: 'Основний діагноз', icd_main: 'МКХ', patient_age: 'Вік',
  patient_gender: 'Стать', region: 'Регіон', count: 'Кількість',
  година: 'Година', всього: 'Всього', екстрених: 'Екстрених',
  летальність_відсоток: 'Летальність %', хірургічна_активність: 'Хір.акт %',
  відсоток_ургенції: 'Ургенція %', середній_ліжкодень: 'Сер.ліжкодень',
}

function formatValue(key, val) {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}T/)) {
    return new Date(val).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2} /)) {
    return new Date(val).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  if (typeof val === 'number' && !Number.isInteger(val)) return val.toFixed(1)
  if (typeof val === 'number') return String(val)
  return String(val)
}

function colLabel(key) {
  return COL_LABELS[key] || key.replace(/_/g, ' ')
}

function ResultView({ rows }) {
  if (!rows || rows.length === 0) {
    return <div className={styles.emptyResult}><span>○</span><p>Результатів не знайдено</p></div>
  }
  const cols = Object.keys(rows[0])
  const isSingleNumber = rows.length === 1 && cols.length === 1 && typeof Object.values(rows[0])[0] === 'number'
  const isSmallStat = rows.length === 1 && cols.length <= 4

  if (isSingleNumber) {
    const key = cols[0]
    return <div className={styles.bigCard}><p className={styles.bigNum}>{rows[0][key]}</p><p className={styles.bigLabel}>{colLabel(key)}</p></div>
  }
  if (isSmallStat) {
    return <div className={styles.statGrid}>
      {cols.map(key => (
        <div key={key} className={styles.statCard}>
          <p className={styles.statVal}>{formatValue(key, rows[0][key])}</p>
          <p className={styles.statKey}>{colLabel(key)}</p>
        </div>
      ))}
    </div>
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr>{cols.map(c => <th key={c}>{colLabel(c)}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i}>{cols.map(c => <td key={c}>{formatValue(c, row[c])}</td>)}</tr>)}</tbody>
      </table>
      <div className={styles.tableFooter}>{rows.length} записів</div>
    </div>
  )
}

function formatCost(cost) {
  if (cost === 0) return '$0.00'
  if (cost < 0.01) return `$${cost.toFixed(6)}`
  return `$${cost.toFixed(4)}`
}

function formatNum(n) {
  if (n === null || n === undefined || n === '') return '—'
  return Number(n).toLocaleString('en-US')
}

function TokenBadge({ tokens }) {
  if (!tokens) return null
  return (
    <div style={{display: 'inline-flex', gap: '10px', marginTop: '10px', padding: '6px 10px', background: 'var(--bg2)', borderRadius: '6px', fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text2)', flexWrap: 'wrap'}}>
      <span>{tokens.provider}</span>
      <span>↓ {tokens.tokens_in}</span>
      <span>↑ {tokens.tokens_out}</span>
      <span>Σ {tokens.tokens_total}</span>
      <span style={{color: tokens.free ? '#16a34a' : 'var(--text2)'}}>{tokens.free ? 'безкоштовно' : formatCost(tokens.cost_usd)}</span>
    </div>
  )
}

export default function Home() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSql, setShowSql] = useState({})
  const [stats, setStats] = useState({ count: 0, tokensIn: 0, tokensOut: 0, cost: 0 })
  const [limits, setLimits] = useState(null)
  const [hint, setHint] = useState(null)
  const [exPage, setExPage] = useState(0)
  const [globalStats, setGlobalStats] = useState(null)
  const [icuStats, setIcuStats] = useState(null)
  const provider = 'groq'
  const bottomRef = useRef(null)
  const totalPages = Math.ceil(ALL_EXAMPLES.length / PAGE_SIZE)
  const visibleExamples = ALL_EXAMPLES.slice(exPage * PAGE_SIZE, exPage * PAGE_SIZE + PAGE_SIZE)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Завантажуємо глобальну статистику при старті
  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setGlobalStats).catch(() => {})
    fetch('/api/icu').then(r => r.json()).then(setIcuStats).catch(() => {})
  }, [])

  // Оновлюємо після кожного запиту
  useEffect(() => {
    if (stats.count > 0)
      fetch('/api/stats').then(r => r.json()).then(setGlobalStats).catch(() => {})
  }, [stats.count])

  // Ротація прикладів кожні 12 сек
  useEffect(() => {
    const timer = setInterval(() => setExPage(p => (p + 1) % totalPages), ROTATE_MS)
    return () => clearInterval(timer)
  }, [totalPages])


  // Спливаючі підказки про VIEW — періодична ротація
  useEffect(() => {
    let idx = 0
    const show = () => {
      setHint(VIEW_HINTS[idx % VIEW_HINTS.length])
      idx++
      setTimeout(() => setHint(null), 4000) // показ 4 сек
    }
    const first = setTimeout(show, 3000)      // перша через 3 сек
    const loop = setInterval(show, 11000)     // потім кожні 11 сек
    return () => { clearTimeout(first); clearInterval(loop) }
  }, [])

  async function send(question) {
    if (!question.trim() || loading) return
    setInput('')
    setLoading(true)
    setMessages(prev => [...prev, { role: 'user', content: question }])

    try {
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history, provider })
      })
      const data = await res.json()
      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', error: data.error }])
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant', content: question,
          explanation: data.explanation, sql: data.sql, rows: data.rows || [],
          tokens: data.tokens
        }])
        if (data.tokens) {
          setStats(prev => ({
            count: prev.count + 1,
            tokensIn: prev.tokensIn + data.tokens.tokens_in,
            tokensOut: prev.tokensOut + data.tokens.tokens_out,
            cost: prev.cost + data.tokens.cost_usd
          }))
          if (data.tokens.limits) setLimits(data.tokens.limits)
        }
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', error: e.message }])
    }
    setLoading(false)
  }

  return (
    <>
      <Head>
        <title>ЛСМД — Медичний Асистент</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      </Head>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.logo}>
            <span className={styles.logoMark}>+</span>
            <div className={styles.logoText}>ЛСМД<small>AI Асистент</small></div>
          </div>
          <div className={styles.sideSection}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'6px'}}>
              <p className={styles.sideLabel} style={{margin:0}}>Приклади</p>
              <span style={{fontSize:'10px',color:'var(--text3)',fontFamily:'var(--mono)'}}>{exPage+1}/{totalPages}</span>
            </div>
            {visibleExamples.map((ex, i) => (
              <button key={`${exPage}-${i}`} className={styles.exBtn} onClick={() => send(ex)}>{ex}</button>
            ))}
            <div style={{display:'flex',gap:'4px',marginTop:'6px'}}>
              {Array.from({length:totalPages}).map((_,i) => (
                <button key={i} onClick={() => setExPage(i)}
                  style={{flex:1,height:'3px',border:'none',borderRadius:'2px',cursor:'pointer',
                    background: i===exPage ? 'var(--accent)' : 'var(--border)'}}/>
              ))}
            </div>
          </div>
          <div className={styles.sideFooter}>
            <p>110,206 госпіталізацій</p>
            <p>72,293 пацієнти</p>
            <p>20 відділень · 265 лікарів</p>
            <a href="/analytics" style={{
              display: 'block', marginTop: '10px', padding: '6px 10px',
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: '6px', fontSize: '11px', color: 'var(--text2)',
              fontFamily: 'var(--mono)', textDecoration: 'none',
              textAlign: 'center', transition: 'all .15s'
            }}>📊 Графічна аналітика →</a>

            {icuStats && icuStats.icu_mortality != null && (
              <div style={{
                marginTop: '12px', borderRadius: '8px', padding: '10px 12px',
                background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)',
                fontSize: '10px', lineHeight: '1.8'
              }}>
                <p style={{color:'rgba(239,68,68,0.8)', letterSpacing:'0.08em',
                  textTransform:'uppercase', marginBottom:'6px',
                  fontFamily:'var(--mono)', fontSize:'9px'}}>
                  🏥 Реанімаційна летальність
                </p>
                <p style={{fontSize:'22px', fontWeight:600, color:'rgba(239,68,68,0.9)',
                  margin:'0 0 4px', fontFamily:'var(--mono)'}}>
                  {Number(icuStats.icu_mortality).toFixed(1)}%
                </p>
                <p style={{color:'var(--text2)', margin:0, fontSize:'10px'}}>
                  {formatNum(icuStats.died)} / {formatNum(icuStats.total_admitted)} за поступленнями
                </p>
              </div>
            )}

            <div style={{marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)', fontSize: '10px', lineHeight: '1.8'}}>
              <p style={{color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px'}}>Ця сесія</p>
              <p>Запитів: <strong>{stats.count}</strong></p>
              <p>Токенів ↓: <strong>{formatNum(stats.tokensIn)}</strong></p>
              <p>Токенів ↑: <strong>{formatNum(stats.tokensOut)}</strong></p>
              <p>Ціна: <strong>{formatCost(stats.cost)}</strong></p>
            </div>
            {globalStats && (
              <div style={{marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)', fontSize: '10px', lineHeight: '1.8'}}>
                <p style={{color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px'}}>Всього за весь час</p>
                <p>Запитів: <strong>{formatNum(globalStats.total_requests)}</strong></p>
                <p>Токенів: <strong>{formatNum(globalStats.total_tokens)}</strong></p>
                <p>Витрачено: <strong>{formatCost(Number(globalStats.total_cost))}</strong></p>
                <p>Активних днів: <strong>{globalStats.active_days}</strong></p>
                {globalStats.last_request && (
                  <p style={{color:'var(--text3)',marginTop:'4px'}}>
                    Останній: {new Date(globalStats.last_request).toLocaleString('uk-UA', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
                  </p>
                )}
              </div>
            )}

            {limits && provider === 'groq' && (
              <div style={{marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)', fontSize: '10px', lineHeight: '1.8'}}>
                <p style={{color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px'}}>Ліміти Groq</p>
                <p>Запитів: <strong>{formatNum(limits.requests_remaining)}</strong> / {formatNum(limits.requests_limit)}</p>
                <p>Токенів: <strong>{formatNum(limits.tokens_remaining)}</strong> / {formatNum(limits.tokens_limit)}</p>
              </div>
            )}
          </div>
        </aside>

        <main className={styles.main}>
          <div className={styles.chatArea}>
            {messages.length === 0 && (
              <div className={styles.welcome}>
                <div className={styles.welcomeIcon}>+</div>
                <h1>Медичний AI Асистент</h1>
                <p>Запитуйте про госпіталізації, пацієнтів, лікарів, діагнози та статистику лікарні — відповідаю даними з бази.</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`${styles.msg} ${styles[msg.role]}`}>
                {msg.role === 'user' && <div className={styles.userBubble}>{msg.content}</div>}
                {msg.role === 'assistant' && (
                  <div className={styles.agentBubble}>
                    {msg.error && (
                      <div className={styles.errorBox}>
                        <span className={styles.errorIcon}>!</span>
                        <p>{msg.error}</p>
                      </div>
                    )}
                    {msg.explanation && <p className={styles.explanation}>{msg.explanation}</p>}
                    {msg.rows && <ResultView rows={msg.rows} />}
                    {msg.sql && (
                      <div className={styles.sqlBlock}>
                        <button className={styles.sqlToggle} onClick={() => setShowSql(p => ({...p, [i]: !p[i]}))}>
                          {showSql[i] ? '▲ сховати SQL' : '▼ показати SQL'}
                        </button>
                        {showSql[i] && <pre className={styles.sqlCode}>{msg.sql}</pre>}
                      </div>
                    )}
                    {msg.tokens && <TokenBadge tokens={msg.tokens} />}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className={`${styles.msg} ${styles.assistant}`}>
                <div className={styles.agentBubble}><div className={styles.typing}><span/><span/><span/></div></div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className={styles.inputArea}>
            <input
              className={styles.input}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send(input)}
              placeholder="Запитайте про дані лікарні..."
              disabled={loading}
            />
            <button className={styles.sendBtn} onClick={() => send(input)} disabled={loading || !input.trim()}>→</button>
          </div>
        </main>
      </div>

      {/* Спливаюче вікно: періодично показує доступні VIEW */}
      {hint && (
        <div
          onClick={() => send(`Покажи дані з ${hint.view}`)}
          style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 50,
            background: 'var(--surface, #1a1a1a)', border: '1px solid var(--accent, #4ade80)',
            borderRadius: '10px', padding: '12px 16px', maxWidth: '320px', cursor: 'pointer',
            boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
            animation: 'hintIn 0.4s ease', fontFamily: "'IBM Plex Mono', monospace"
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ color: 'var(--accent, #4ade80)', fontSize: '11px', letterSpacing: '0.05em' }}>📊 VIEW</span>
            <code style={{ color: 'var(--text, #fff)', fontSize: '13px', fontWeight: 500 }}>{hint.view}</code>
          </div>
          <p style={{ color: 'var(--text2, #999)', fontSize: '12px', margin: 0, lineHeight: 1.4 }}>{hint.desc}</p>
          <p style={{ color: 'var(--text3, #666)', fontSize: '10px', margin: '6px 0 0', fontStyle: 'italic' }}>натисни щоб спробувати →</p>
        </div>
      )}

      <style jsx global>{`
        @keyframes hintIn {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  )
}
