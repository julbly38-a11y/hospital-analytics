export const SANS = { fontFamily: '"IBM Plex Sans", sans-serif' }
export const MONO = { fontFamily: '"IBM Plex Mono", monospace' }

export function fmt(n, suffix = '') {
  if (n == null || n === '') return '—'
  const num = Number(n)
  if (isNaN(num)) return String(n)
  return num.toLocaleString('uk-UA') + suffix
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
}

export const glass = {
  background: 'rgba(255,255,255,0.6)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(0,0,0,0.08)',
  borderRadius: 14,
}

export const THERAPEUTIC = [
  'Терапевтичне відділення №1',
  'Гематологічне відділення',
  'Терапевтичне відділення №2',
  'Гастроентерологічне відділення',
  'Центр невідкладної неврології',
  'Відділення анестезіології з ліжками інтенсивної терапії',
]

export const SURGICAL = [
  'Опікове відділення',
  'Травматологічне відділення для дітей',
  'Травматологічне відділення для дорослих',
  'Нейрохірургічне відділення',
  'Урологічне відділення',
  'Хірургічне відділення №2',
  'Хірургічне відділення №1',
]

// Усі відділення, для форм (напр. admit.js), відсортовано за алфавітом
export const DEPARTMENTS = [...THERAPEUTIC, ...SURGICAL].sort((a, b) => a.localeCompare(b, 'uk'))

// Клінічний блок відділення → колір і назва (org.js, doctors.js)
export const BLOCK_CFG = {
  'приймально_діагностичний': { color: '#c0392b', label: 'Приймально-діагностичний' },
  'клінічний':                { color: '#4a9870', label: 'Клінічні відділення' },
  'анестезіологія_іт':        { color: '#2563eb', label: 'Анестезіологія та ІТ' },
  'параклінічний':            { color: '#6b7280', label: 'Параклінічні' },
  'адміністративний':         { color: '#7c3aed', label: 'Адміністративний' },
}

// Статус виписки → колір бейджа (cabinet.js, DoctorPanel.js)
export const STATUS_COLORS = {
  'Лікується': '#5ab0ff', 'З поліпшенням': '#7fd99a', 'Без змін': '#cfae5a',
  'З погіршенням': '#e0a060', 'Помер': '#e08080', 'Переведений в інший заклад': '#a08ae0',
}

// Кругова діаграма топ МКХ-10 (dept.js, DeptPanel.js) — той самий діагноз має
// той самий колір незалежно від того, на якій сторінці показаний
export const PIE_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2']

// Поля форм (admit.js, import.js)
export const formInputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  color: 'var(--text)',
  fontSize: '14px',
  fontFamily: 'var(--mono)',
  outline: 'none',
  boxSizing: 'border-box',
}

export const formLabelStyle = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '11px',
  color: 'var(--text3)',
  fontFamily: 'var(--mono)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

export async function fetchStats(key, param) {
  const body = param !== undefined ? { key, param } : { key }
  const r = await fetch('/api/stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const d = await r.json()
  return d.rows || []
}
