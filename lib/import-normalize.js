// Утиліти нормалізації "брудних" значень для механізму імпорту.
// Приймають довільний текст із джерела (raw_*) і намагаються звести
// його до очікуваного формату бази (resolved_*). Повертають null,
// якщо значення розпізнати не вдалося — тоді рядок позначається
// статусом "error" з поясненням у notes.

function clean(s) {
  if (s === null || s === undefined) return ''
  return String(s).trim().replace(/\s+/g, ' ')
}

function stripDiacritics(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function norm(s) {
  return stripDiacritics(clean(s).toLowerCase())
}

// --- Дати -------------------------------------------------------------

const MONTHS_UA = {
  'січня': 1, 'січень': 1, 'лютого': 2, 'лютий': 2, 'березня': 3, 'березень': 3,
  'квітня': 4, 'квітень': 4, 'травня': 5, 'травень': 5, 'червня': 6, 'червень': 6,
  'липня': 7, 'липень': 7, 'серпня': 8, 'серпень': 8, 'вересня': 9, 'вересень': 9,
  'жовтня': 10, 'жовтень': 10, 'листопада': 11, 'листопад': 11, 'грудня': 12, 'грудень': 12,
}

function pad2(n) { return String(n).padStart(2, '0') }

function isValidYMD(y, m, d) {
  if (!y || !m || !d) return false
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  if (y < 1900 || y > 2100) return false
  return true
}

// Перетворює довільне написання дати у формат YYYY-MM-DD (ISO) або null.
export function parseFlexibleDate(raw) {
  const s = clean(raw)
  if (!s) return null

  // Excel серійний номер дати (наприклад 45123)
  if (/^\d{4,6}(\.\d+)?$/.test(s) && Number(s) > 20000 && Number(s) < 80000) {
    const epoch = new Date(Date.UTC(1899, 11, 30))
    const d = new Date(epoch.getTime() + Math.round(Number(s)) * 86400000)
    if (!isNaN(d.getTime())) return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
  }

  // YYYY-MM-DD або YYYY/MM/DD
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/)
  if (m) {
    const [, y, mo, d] = m.map(Number)
    if (isValidYMD(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`
  }

  // DD.MM.YYYY або DD/MM/YYYY або DD-MM-YYYY
  m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/)
  if (m) {
    const [, d, mo, y] = m.map(Number)
    if (isValidYMD(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`
  }

  // DD.MM.YY (двозначний рік)
  m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2})$/)
  if (m) {
    const d = Number(m[1]), mo = Number(m[2])
    let y = Number(m[3])
    y += y < 50 ? 2000 : 1900
    if (isValidYMD(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`
  }

  // "12 січня 2024" / "12 січня 2024 р."
  m = norm(s).match(/^(\d{1,2})\s+([а-яіїєґ']+)\s+(\d{4})/)
  if (m) {
    const d = Number(m[1])
    const mo = MONTHS_UA[m[2]]
    const y = Number(m[3])
    if (mo && isValidYMD(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`
  }

  // Останній шанс — стандартний парсер JS (ISO з часом тощо)
  const d2 = new Date(s)
  if (!isNaN(d2.getTime()) && d2.getFullYear() > 1900 && d2.getFullYear() < 2100) {
    return `${d2.getFullYear()}-${pad2(d2.getMonth() + 1)}-${pad2(d2.getDate())}`
  }
  return null
}

// Перетворює ISO-дату (YYYY-MM-DD) у формат бази ДД.ММ.РРРР, який
// використовується в текстових полях lsmd (admission_date, birth_date тощо).
export function isoToDmy(iso) {
  if (!iso) return null
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return `${m[3]}.${m[2]}.${m[1]}`
}

// --- Стать -------------------------------------------------------------

export function normalizeGender(raw) {
  const s = norm(raw)
  if (!s) return null
  if (['ч', 'чол', 'чоловіча', 'чоловік', 'm', 'male', 'm.', '1', 'муж', 'мужской', 'мужчина'].includes(s)) return 'Ч'
  if (['ж', 'жін', 'жіноча', 'жінка', 'f', 'female', 'f.', '2', 'жен', 'женский', 'женщина'].includes(s)) return 'Ж'
  if (s.startsWith('чол')) return 'Ч'
  if (s.startsWith('жін') || s.startsWith('жен')) return 'Ж'
  if (s.startsWith('m')) return 'Ч'
  if (s.startsWith('f') || s.startsWith('ж')) return 'Ж'
  return null
}

// --- Тип госпіталізації --------------------------------------------------

export function normalizeAdmissionType(raw) {
  const s = norm(raw)
  if (!s) return null
  if (s.startsWith('екстр') || s.startsWith('терміново') || s.startsWith('швидк') || s === 'emergency') return 'Екстренна'
  if (s.startsWith('план') || s === 'planned' || s === 'routine') return 'Планова'
  return null
}

// --- Нечітке зіставлення рядків (для відділень, лікарів тощо) -----------

function levenshtein(a, b) {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1])
      prev = tmp
    }
  }
  return dp[n]
}

function similarity(a, b) {
  const na = norm(a), nb = norm(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.9
  const dist = levenshtein(na, nb)
  return 1 - dist / Math.max(na.length, nb.length)
}

// Повертає найкращий збіг із переліку кандидатів разом із оцінкою (0..1).
export function bestMatch(raw, candidates) {
  const s = clean(raw)
  if (!s || !candidates || !candidates.length) return { match: null, score: 0 }
  let best = null, bestScore = 0
  for (const c of candidates) {
    const score = similarity(s, c)
    if (score > bestScore) { bestScore = score; best = c }
  }
  return { match: best, score: bestScore }
}

// --- МКХ-10 --------------------------------------------------------------

// Нормалізує написання коду МКХ-10 до канонічного вигляду "A00.0".
export function normalizeIcdCode(raw) {
  const s = clean(raw).toUpperCase().replace(/\s+/g, '')
  const m = s.match(/^([A-Z]\d{2})[.,]?(\d+)?/)
  if (!m) return null
  return m[2] ? `${m[1]}.${m[2]}` : m[1]
}

export { norm, clean }
