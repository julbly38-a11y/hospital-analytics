import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'
import { createClient } from '../lib/supabase'
import { useRouter } from 'next/router'
import styles from '../styles/Home.module.css'

const ALL_EXAMPLES = [
  // Базові показники
  'Загальна статистика лікарні',
  'Скільки всього госпіталізацій',
  'Скільки унікальних пацієнтів',
  'Середній ліжкодень по лікарні',
  'Загальна летальність лікарні',
  'Хірургічна активність лікарні',
  'Скільки ургентних госпіталізацій',
  'Скільки планових госпіталізацій',
  'Скільки операцій виконано',
  'Скільки переведених пацієнтів',
  // Відділення
  'Показники по всіх відділеннях',
  'Летальність по відділеннях',
  'Відділення з найдовшим ліжкоднем',
  'Хірургічна активність по відділеннях',
  'Топ відділень за кількістю операцій',
  'Ургентні vs планові по відділеннях',
  'Смертність при ургентних по відділеннях',
  'Кількість дітей по відділеннях',
  'Середній вік пацієнтів по відділеннях',
  // Реанімація
  'Летальність реанімації',
  'Скільки поступило в реанімацію',
  'Скільки померло в реанімації',
  'Середній ліжкодень реанімації',
  // Діагнози
  'Топ 10 діагнозів за кількістю випадків',
  'Летальність по діагнозах',
  'Хірургічна активність по діагнозах',
  'Скільки інсультів пролікувано за 2024 рік',
  'Скільки інфарктів міокарда за 2024',
  'Скільки пневмоній пролікувано',
  'Скільки діабету пролікувано',
  'Скільки гіпертонічних хворих',
  'Скільки панкреатитів',
  'Скільки апендицитів',
  'Скільки холециститів',
  // Повторні госпіталізації
  'Повторні госпіталізації 30 і 90 днів',
  'Відсоток повторних госпіталізацій за 30 днів',
  'Повторні з тим самим діагнозом',
  // Демографія
  'Розподіл за статтю та віком',
  'Скільки дітей госпіталізовано за 2024',
  'Скільки літніх пацієнтів госпіталізовано',
  'Летальність по віковим групам',
  'Летальність чоловіків vs жінок',
  // Ургентність
  'Летальність ургентних vs планових',
  'Операції при ургентних госпіталізаціях',
  'Середній ліжкодень ургентних vs планових',
  'Переведення при ургентних',
  // Пікові навантаження
  'Пікові навантаження по годинах',
  'Навантаження по днях тижня',
  'Динаміка по місяцях',
  'Навантаження по тижнях 2024',
  // Вихідні та нічні
  'Вихідні vs робочі дні',
  'Нічні vs денні поступлення',
  'Нічні поступлення по відділеннях',
  'Летальність у вихідні vs робочі',
  'Летальність нічних vs денних',
  // Географія
  'Статистика за регіонами',
  'Скільки пацієнтів з Чернівецької області',
  'Скільки пацієнтів з Івано-Франківської',
  'Скільки пацієнтів з Тернопільської',
  // Лікарі
  'Скільки пацієнтів пролікував Грабовський за 2023 рік',
  'Скільки нічних поступлень у Блинду за липень 2024',
  'Скільки вихідних діб в лікаря Грабовського за перше півріччя 2023',
  'Яка спеціалізація у лікаря Арійчука О.І',
  // Конкретні відділення
  'Топ діагнозів неврологічного відділення',
  'Статистика хірургічного відділення',
  'Статистика травматологічного відділення',
  'Летальність гематологічного відділення',
  'Статистика урологічного відділення',
  'Статистика гастроентерологічного відділення',
  // Додаткові
  'Скільки з погіршенням стану',
  'Скільки без змін після лікування',
  'Скільки пацієнтів з направленням',
  'Летальність по діагнозу інсульт',
  'Середній ліжкодень по діагнозах',
  'Скільки нічних поступлень всього',
  'Скільки екстрених операцій',
  'Скільки дітей госпіталізовано за 2023',
]

// Приклади для ролі doctor — лише про власну роботу (решта блокується бекендом)
const DOCTOR_EXAMPLES = [
  'Скільки пацієнтів я пролікував за 2024 рік',
  'Скільки моїх пацієнтів за перше півріччя 2024',
  'Скільки нічних поступлень у мене за 2024',
  'Скільки вихідних діб у мене за 2024',
  'Летальність моїх пацієнтів',
  'Скільки операцій у мене',
  'Скільки моїх пацієнтів з погіршенням стану',
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
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSql, setShowSql] = useState({})
  const [stats, setStats] = useState({ count: 0, tokensIn: 0, tokensOut: 0, cost: 0 })
  const [limits, setLimits] = useState(null)
  const [globalStats, setGlobalStats] = useState(null)
  const [icuStats, setIcuStats] = useState(null)
  const [role, setRole] = useState(null)
  const provider = 'groq'
  const bottomRef = useRef(null)

  // Зчитуємо роль користувача
  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(d => setRole(d.role)).catch(() => {})
  }, [])

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
            </div>
            {(role === 'doctor' ? DOCTOR_EXAMPLES : ALL_EXAMPLES).map((ex, i) => (
              <button key={i} className={styles.exBtn} onClick={() => send(ex)}>{ex}</button>
            ))}
          </div>
          <div className={styles.sideFooter}>
            {role !== 'doctor' && <>
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
            </>}

            <div style={{marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)', fontSize: '10px', lineHeight: '1.8'}}>
            <button onClick={handleLogout} style={{
              width:'100%', padding:'8px', marginBottom:'12px',
              background:'transparent', border:'1px solid var(--border)',
              borderRadius:'6px', color:'var(--text3)', fontSize:'11px',
              fontFamily:'var(--mono)', cursor:'pointer', textAlign:'left'
            }}>← вийти</button>

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

      <style jsx global>{`
        @keyframes hintIn {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  )
}
