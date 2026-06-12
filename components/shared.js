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
