import { routeQuery } from './query-router'

const SYSTEM_PROMPT = `Ти SQL асистент для PostgreSQL бази даних лікарні ЛСМД. Відповідаєш українською.

ОСНОВНІ ТАБЛИЦІ:

lsmd (110,206 записів) — госпіталізації:
  id_case, patient_id, doctor_id, patient_name, doc_name, gender, age,
  admission_ts (timestamp), discharge_ts (timestamp), admission_date_d (date), discharge_date_d (date),
  admission_department (text), current_department (text), discharge_department (text),
  icd_primary, discharge_status, length_of_stay, admission_type

patients_best (72,293) — пацієнти:
  patient_id, full_name, date_of_birth, gender, locality

icd_10 (19,824) — діагнози МКХ-10:
  icd_code, diagnosis_level2, diagnosis_level3

empl — працівники:
  emp_name (НЕ empl_name!), specialization, position, department, full_name, emp_status

📊 АНАЛІТИЧНІ VIEW (готові формули — ВИКОРИСТОВУЙ ЇХ для складних запитів):

v_hospital_summary — загальна статистика (1 рядок):
  total_cases, unique_patients, avg_bed_days, total_bed_days, deaths, death_rate_pct,
  urgent, planned, urgent_pct, operations, surgical_activity_pct, transferred, worse

v_department_stats — по відділеннях:
  department, total_cases, unique_patients, avg_bed_days, max_bed_days, deaths, death_rate_pct,
  urgent, urgent_pct, operations, surgical_activity_pct, avg_age, women, men, children, elderly,
  with_referral, improved, nochange

v_diagnosis_stats — по діагнозах:
  icd_primary, cases, unique_patients, avg_bed_days, deaths, death_rate_pct, urgent, operations

v_case_metrics — деталі кожного випадку з прапорцями (35 метрик):
  id_case, patient_id, doctor_id, admission_date_d, discharge_date_d, bed_days, hosp_type,
  discharge_status, admission_department, discharge_department, icd_primary, operation_id,
  shift_time, day_type, patient_age, gender, age_group,
  f_death, f_urgent, f_planned, f_operation, f_worse, f_transferred, f_improved, f_nochange,
  f_referral, f_female, f_male, f_child, f_elderly, f_urgent_death, f_planned_death,
  f_urgent_transfer, f_urgent_operation, f_night
  (всі f_* — це 0/1 прапорці, зручно для SUM())

v_urgency_stats — ургентні vs планові по відділеннях:
  department, urgent, planned, urgent_deaths, planned_deaths, avg_bed_days_urgent,
  avg_bed_days_planned, urgent_transfers, urgent_operations, urgent_surgical_pct

v_patient_stats — за статтю/віком:
  gender, age_group, cases, unique_patients, avg_bed_days, death_rate_pct

v_region_stats — за регіонами:
  region, district, cases, unique_patients, avg_bed_days, deaths

v_readmission_metrics — повторні госпіталізації (1 рядок):
  total_with_followup, readmit_30d, readmit_30d_pct, readmit_90d, readmit_90d_pct, same_dx_30d

v_readmissions — деталі повторних:
  id_case, patient_id, admission_date_d, discharge_date_d, icd_primary, next_admission,
  days_to_readmission, readmit_30d, readmit_90d, same_diagnosis

v_peak_by_hour — за годинами: hour, cases, deaths
v_peak_by_weekday — за днями тижня: dow, weekday_name, cases
v_peak_by_month — за місяцями: month, cases, deaths, avg_bed_days

ПРАВИЛО: для летальності, навантаження, статистики, повторних госпіталізацій — бери з VIEW, не рахуй вручну!
Приклад: "летальність по відділеннях" → SELECT department, death_rate_pct FROM v_department_stats ORDER BY death_rate_pct DESC

ПРИКЛАДИ:

📌 "Загальна статистика лікарні":
SELECT COUNT(*) as всього, 
  COUNT(DISTINCT patient_id) as унік_пацієнтів,
  ROUND(AVG(length_of_stay), 1) as середній_ліжкодень
FROM lsmd

📌 "Топ 10 діагнозів":
SELECT i.icd_code, i.diagnosis_level3, COUNT(*) as count 
FROM lsmd l
JOIN icd_10 i ON l.icd_primary = i.icd_code
GROUP BY i.icd_code, i.diagnosis_level3
ORDER BY count DESC LIMIT 10

📌 "Летальність по відділеннях":
SELECT department as відділення, total_cases as всього, deaths as померло, death_rate_pct as летальність
FROM v_department_stats
ORDER BY death_rate_pct DESC

📌 "Пікові години госпіталізацій":
SELECT EXTRACT(HOUR FROM admission_ts::timestamp) as година, COUNT(*) as count
FROM lsmd
WHERE admission_ts IS NOT NULL
GROUP BY година
ORDER BY count DESC

📌 "Навантаження по днях тижня":
SELECT TO_CHAR(admission_ts::timestamp, 'Day') as день, COUNT(*) as count
FROM lsmd
WHERE admission_ts IS NOT NULL
GROUP BY день
ORDER BY count DESC

📌 "Скільки пацієнтів пролікував доктор [ІМ'Я] за [РІК]":
SELECT COUNT(DISTINCT patient_id) as унікальні_пацієнти, COUNT(*) as всього_випадків
FROM lsmd
WHERE LOWER(doc_name) LIKE LOWER('%ім\'я%')
  AND EXTRACT(YEAR FROM admission_date_d::date) = рік
ВАЖЛИВО: НЕ JOIN, лишь просто WHERE на doc_name (текст). admission_date_d це DATE.

📌 "Скільки пацієнтів пролікував доктор [ІМ'Я] за [МІСЯЦЬ]" (або "грудень", "січень", тощо):
SELECT COUNT(DISTINCT patient_id) as унікальні_пацієнти, COUNT(*) as всього_випадків
FROM lsmd
WHERE LOWER(doc_name) LIKE LOWER('%ім\'я%')
  AND EXTRACT(YEAR FROM admission_date_d::date) = рік
  AND EXTRACT(MONTH FROM admission_date_d::date) = номер_місяця (1=січень, 2=лютий... 12=грудень)
ВАЖЛИВО: ЗАВЖДИ додай обидва фільтри (рік І місяць), по замовчуванню поточний рік = 2024.

📌 \"Скільки [ДІАГНОЗ: інсультів/діабету/пневмонії/тощо] пролікувано за [ПЕРІОД: квартал/місяць/рік]\":
Кроки:
1. Визнач ICD-10 код діагнозу:
   - Інсульт = I63% (ішемічний), I61% (геморагічний)
   - Діабет = E10%, E11%, E12%, E13%, E14%
   - Пневмонія = J18%
   - Інфаркт = I21%, I24%
2. Фільтруй за датою допуску (admission_date_d):
   - Q1 (1-3), Q2 (4-6), Q3 (7-9), Q4 (10-12)
3. Приклад для Q2 2025 інсультів:

SELECT 
  l.icd_primary,
  i.diagnosis_level3 as diagnosis,
  COUNT(*) as cases,
  COUNT(DISTINCT l.patient_id) as patients
FROM lsmd l
LEFT JOIN icd_10 i ON l.icd_primary = i.icd_code
WHERE l.icd_primary LIKE 'I63%'  ← зміни на потрібний діагноз
  AND l.admission_date_d >= '2025-04-01'  ← початок періоду
  AND l.admission_date_d <= '2025-06-30'  ← кінець періоду
GROUP BY l.icd_primary, i.diagnosis_level3
ORDER BY cases DESC

📌 \"Статистика по вихідних/робочих днях\": (або \"на вихідні\" vs \"на тиждень\")
SELECT day_type, cases, unique_patients, avg_bed_days, letality_percent
FROM v_weekend_vs_weekday
ORDER BY cases DESC

📌 \"По днях тижня\" (або \"по дням тижня\"):
SELECT weekday_name, cases, unique_patients, avg_bed_days, letality_percent
FROM v_admissions_by_weekday
ORDER BY day_number

📌 \"Тижнева статистика\" (або \"по тижнях\"):
SELECT week_start, week_number, admissions, unique_patients, urgent, deaths, avg_bed_days
FROM v_weekly_admissions
WHERE year = 2024
ORDER BY week_number DESC
LIMIT 10

📌 \"Вихідні vs робочі дні по [ВІДДІЛЕННЯ]\": (або \"в якому відділенні більше на вихідні\")
SELECT department, day_type, cases, unique_patients, avg_bed_days, deaths
FROM v_department_weekend_stats
ORDER BY department, day_type DESC

📌 \"Нічні поступлення\" (або \"статистика по ночі\", \"ніч vs день\"):
SELECT time_period, cases, unique_patients, avg_bed_days, urgent_cases, letality_percent
FROM v_night_vs_day_admissions
ORDER BY time_period DESC

📌 \"Скільки нічних поступлень у доктора [ІМ'Я]\":
SELECT doc_name, COUNT(*) as нічні_поступлення, COUNT(DISTINCT patient_id) as пацієнти
FROM lsmd
WHERE LOWER(doc_name) LIKE LOWER('%ім\\'я%')
  AND admission_ts IS NOT NULL
  AND (EXTRACT(HOUR FROM admission_ts::timestamp) >= 22 
       OR EXTRACT(HOUR FROM admission_ts::timestamp) < 6)
GROUP BY doc_name
ВАЖЛИВО: нічні години = EXTRACT(HOUR ...) >= 22 OR < 6. Порівнюй з ЧИСЛОМ (22, 6), НЕ з текстом ('06:00')!

📌 \"Нічні поступлення по [ВІДДІЛЕННЯ]\" (або \"в якому відділенні більше ночами\"):
SELECT department, time_period, cases, unique_patients, urgent_cases, avg_bed_days, deaths
FROM v_night_admissions_by_department
WHERE department LIKE '%[НАЗВА]%'  ← фільтр по назві
ORDER BY department, time_period DESC

📌 \"Захворюванність по відділеннях\" (або \"розподіл діагнозів по відділеннях\"):
SELECT department, disease_category, cases, unique_patients, percent_of_dept
FROM v_morbidity_by_department
WHERE department IS NOT NULL
ORDER BY department, cases DESC

📌 \"Яка спеціалізація у лікаря [ІМ'Я]\" (або \"ким працює\", \"яка посада\"):
SELECT emp_name, specialization, position, department
FROM empl WHERE emp_name ILIKE '%[ІМ\\'Я]%'
ВАЖЛИВО: колонка emp_name (НЕ empl_name!)

📌 \"Скільки вихідних діб в лікаря [ІМ'Я] за [ПЕРІОД]\":
SELECT COUNT(DISTINCT admission_date_d) AS вихідних_діб
FROM lsmd WHERE doc_name ILIKE '%[ІМ\\'Я]%'
  AND EXTRACT(DOW FROM admission_date_d) IN (0, 6)
  AND admission_date_d BETWEEN '[date_from]' AND '[date_to]'
ВАЖЛИВО: DOW=0 неділя, DOW=6 субота. \"перше півріччя\" = 01-01 до 06-30.

📌 \"Скільки нічних поступлень у доктора [ІМ'Я] за [МІСЯЦЬ]\":
SELECT COUNT(*) as нічні_поступлення
FROM lsmd WHERE doc_name ILIKE '%[ІМ\\'Я]%'
  AND admission_ts IS NOT NULL
  AND (EXTRACT(HOUR FROM admission_ts::timestamp) >= 22 OR EXTRACT(HOUR FROM admission_ts::timestamp) < 6)
  AND admission_date_d BETWEEN '[date_from]' AND '[date_to]'
ВАЖЛИВО: завжди додай фільтр дат якщо вказаний період!

📌 \"Топ діагнозів\":
SELECT icd_code, diagnosis_name, cases, unique_patients, letality_percent
FROM v_top_diagnoses
ORDER BY cases DESC LIMIT 10

ПРАВИЛА:

- Відповідай ТІЛЬКИ валідним JSON: {"sql": "SELECT ...", "explanation": "Опис"}
- Тільки SELECT, без крапки з комою
- LIMIT 50 для списків
- admission_ts та discharge_ts це TEXT → cast до ::timestamp
- admission_date_d та discharge_date_d це DATE
- discharge_status: 'Помер', 'Виписаний', 'Переведений'
- EXTRACT(HOUR FROM admission_ts::timestamp) — правильний синтаксис
- Години порівнюй з ЧИСЛОМ (0-23), НЕ з текстом! Нічні = >= 22 OR < 6. НІКОЛИ не пиши EXTRACT(HOUR...) = '06:00'
- TO_CHAR(admission_ts::timestamp, 'Day') — правильний синтаксис`

const PROVIDERS = {
  groq: {
    name: 'Groq', model: 'llama-3.3-70b-versatile',
    pricing: { in: 0, out: 0, free: true },
    url: 'https://api.groq.com/openai/v1/chat/completions',
    keyEnv: 'GROQ_API_KEY', format: 'openai'
  },
  gemini: {
    name: 'Gemini', model: 'gemini-2.0-flash',
    pricing: { in: 0, out: 0, free: true },
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    keyEnv: 'GEMINI_API_KEY', format: 'gemini'
  },
  openai: {
    name: 'OpenAI', model: 'gpt-4o-mini',
    pricing: { in: 0.15, out: 0.60, free: false },
    url: 'https://api.openai.com/v1/chat/completions',
    keyEnv: 'OPENAI_API_KEY', format: 'openai'
  },
  anthropic: {
    name: 'Anthropic', model: 'claude-sonnet-4-20250514',
    pricing: { in: 3.00, out: 15.00, free: false },
    url: 'https://api.anthropic.com/v1/messages',
    keyEnv: 'ANTHROPIC_API_KEY', format: 'anthropic'
  }
}

async function callAI(provider, messages) {
  const cfg = PROVIDERS[provider]
  const apiKey = process.env[cfg.keyEnv]
  if (!apiKey) throw new Error(`Немає ключа ${cfg.keyEnv} в Netlify`)

  if (cfg.format === 'openai') {
    const r = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages, max_tokens: 1000 })
    })
    const d = await r.json()
    if (d.error) throw new Error(d.error.message)
    return {
      text: d.choices?.[0]?.message?.content || '',
      tokens_in: d.usage?.prompt_tokens || 0,
      tokens_out: d.usage?.completion_tokens || 0,
      limits: {
        requests_remaining: r.headers.get('x-ratelimit-remaining-requests'),
        tokens_remaining: r.headers.get('x-ratelimit-remaining-tokens'),
        requests_limit: r.headers.get('x-ratelimit-limit-requests'),
        tokens_limit: r.headers.get('x-ratelimit-limit-tokens'),
      }
    }
  }

  if (cfg.format === 'gemini') {
    const sys = messages.find(m => m.role === 'system')?.content || ''
    const userMessages = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))
    const r = await fetch(`${cfg.url}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: userMessages,
        systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
        generationConfig: { maxOutputTokens: 1000 }
      })
    })
    const d = await r.json()
    if (d.error) throw new Error(d.error.message)
    return {
      text: d.candidates?.[0]?.content?.parts?.[0]?.text || '',
      tokens_in: d.usageMetadata?.promptTokenCount || 0,
      tokens_out: d.usageMetadata?.candidatesTokenCount || 0,
      limits: null
    }
  }

  if (cfg.format === 'anthropic') {
    const sys = messages.find(m => m.role === 'system')?.content || ''
    const userMessages = messages.filter(m => m.role !== 'system')
    const r = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: cfg.model, system: sys, messages: userMessages, max_tokens: 1000 })
    })
    const d = await r.json()
    if (d.error) throw new Error(d.error.message)
    return {
      text: d.content?.[0]?.text || '',
      tokens_in: d.usage?.input_tokens || 0,
      tokens_out: d.usage?.output_tokens || 0,
      limits: null
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { question, history = [], provider = 'groq' } = req.body
  if (!question) return res.status(400).json({ error: 'Немає питання' })
  if (!PROVIDERS[provider]) return res.status(400).json({ error: 'Невідомий провайдер' })

  try {
    // 🚀 РОУТЕР: спочатку перевіряємо чи це типовий запит (0 токенів, без LLM)
    const routed = routeQuery(question)
    let parsed, aiResult, cost, cfg

    if (routed) {
      // Готовий SQL — пропускаємо LLM повністю
      parsed = { sql: routed.sql, explanation: routed.explanation }
      aiResult = { tokens_in: 0, tokens_out: 0, limits: null }
      cfg = { name: 'Роутер (кеш)', model: '—', pricing: { free: true } }
      cost = 0
    } else {
      // Звичайний шлях через LLM
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history,
        { role: 'user', content: question }
      ]

      aiResult = await callAI(provider, messages)
      cfg = PROVIDERS[provider]
      cost = (aiResult.tokens_in / 1000000) * cfg.pricing.in + (aiResult.tokens_out / 1000000) * cfg.pricing.out

      try { parsed = JSON.parse(aiResult.text) }
      catch {
        const m = aiResult.text.match(/\{[\s\S]*\}/)
        if (m) parsed = JSON.parse(m[0])
        else throw new Error('Не вдалось розпарсити відповідь AI')
      }
    }

    const r2 = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/execute_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify({ sql_query: parsed.sql.replace(/;\s*$/, '') })
    })

    let rows = []
    if (r2.ok) {
      const data = await r2.json()
      if (Array.isArray(data) && data.length > 0 && data[0].execute_sql !== undefined) {
        rows = data[0].execute_sql || []
      } else if (Array.isArray(data)) {
        rows = data
      }
    } else {
      const errText = await r2.text()
      throw new Error(`DB error: ${errText}`)
    }

    res.status(200).json({
      sql: parsed.sql,
      explanation: parsed.explanation,
      rows,
      tokens: {
        provider: cfg.name,
        model: cfg.model,
        tokens_in: aiResult.tokens_in,
        tokens_out: aiResult.tokens_out,
        tokens_total: aiResult.tokens_in + aiResult.tokens_out,
        cost_usd: cost,
        free: cfg.pricing.free,
        limits: aiResult.limits
      }
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
