import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '../lib/supabase'

const DEPARTMENTS = [
  'Відділення анестезіології з ліжками інтенсивної терапії',
  'Гастроентерологічне відділення',
  'Гематологічне відділення',
  'Нейрохірургічне відділення',
  'Опікове відділення',
  'Терапевтичне відділення №1',
  'Терапевтичне відділення №2',
  'Травматологічне відділення для дітей',
  'Травматологічне відділення для дорослих',
  'Урологічне відділення',
  'Хірургічне відділення №1',
  'Хірургічне відділення №2',
  'Центр невідкладної неврології',
]

const inputStyle = {
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

const labelStyle = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '11px',
  color: 'var(--text3)',
  fontFamily: 'var(--mono)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

function calcAge(birthDateStr) {
  // очікує "DD.MM.YYYY"
  const m = String(birthDateStr).match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) return ''
  const [, d, mo, y] = m
  const birth = new Date(Number(y), Number(mo) - 1, Number(d))
  if (isNaN(birth.getTime())) return ''
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const beforeBirthday = (now.getMonth() < birth.getMonth()) ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
  if (beforeBirthday) age--
  return age >= 0 && age < 130 ? String(age) : ''
}

function todayDMY() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

function nowHM() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const initialForm = {
  patient_name: '',
  gender: 'Ч',
  birth_date: '',
  age: '',
  phone_number: '',
  address: '',
  admission_type: 'Екстренна',
  admission_date: todayDMY(),
  admission_time: nowHM(),
  admission_department: '',
  icd_primary: '',
  icd_label: '',
}

export default function Admit() {
  const router = useRouter()
  const [me, setMe] = useState(null)
  const [form, setForm] = useState(initialForm)
  const [icdResults, setIcdResults] = useState([])
  const [icdQuery, setIcdQuery] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null) // { ok, error, case }

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(setMe).catch(() => setMe({ role: null }))
  }, [])

  useEffect(() => {
    if (form.birth_date && /^\d{2}\.\d{2}\.\d{4}$/.test(form.birth_date)) {
      const a = calcAge(form.birth_date)
      if (a) setForm((f) => ({ ...f, age: a }))
    }
  }, [form.birth_date])

  // Пошук МКХ-10 коду через існуючий whitelist API (icdSearch)
  useEffect(() => {
    const q = icdQuery.trim()
    if (q.length < 2) { setIcdResults([]); return }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/stats?key=icdSearch&param=${encodeURIComponent(q)}`)
        const data = await r.json()
        setIcdResults(Array.isArray(data) ? data.slice(0, 8) : [])
      } catch { setIcdResults([]) }
    }, 350)
    return () => clearTimeout(t)
  }, [icdQuery])

  const set = (k) => (e) => {
    const v = e.target.value
    setForm((f) => ({ ...f, [k]: v }))
    if ((k === 'admission_department' || k === 'admission_date' || k === 'admission_time') ) {
      setResult((r) => (r?.error ? null : r))
    }
  }

  const pickIcd = (row) => {
    setForm((f) => ({ ...f, icd_primary: row['код'], icd_label: row['назва'] }))
    setIcdQuery('')
    setIcdResults([])
    setResult((r) => (r?.error ? null : r))
  }

  const clearIcd = () => {
    setForm((f) => ({ ...f, icd_primary: '', icd_label: '' }))
  }

  const submit = async (e) => {
    e.preventDefault()
    setResult(null)
    if (!form.admission_department) { setResult({ error: 'Оберіть відділення госпіталізації' }); return }
    if (!form.icd_primary) { setResult({ error: 'Оберіть діагноз (МКХ-10)' }); return }
    setSubmitting(true)
    try {
      const r = await fetch('/api/admit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await r.json()
      if (!r.ok) { setResult({ error: data.error || 'Помилка збереження' }); return }
      setResult({ ok: true, case: data.case })
      setForm({ ...initialForm, admission_date: todayDMY(), admission_time: nowHM() })
    } catch (err) {
      setResult({ error: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  if (me && me.role !== 'doctor' && me.role !== 'admin') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '14px', marginBottom: '12px' }}>Доступ до форми мають лише лікарі та адміністратори.</div>
          <button onClick={() => router.push('/')} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', padding: '8px 16px', cursor: 'pointer', fontFamily: 'var(--mono)' }}>На головну</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--mono)', padding: '32px 16px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>Реєстрація госпіталізації</h1>
          <button onClick={() => router.push('/')} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text3)', padding: '6px 12px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '12px' }}>← Назад</button>
        </div>

        {me?.name && (
          <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '24px' }}>
            Лікар: {me.name}{me.position ? ` · ${me.position}` : ''}
          </div>
        )}

        <form onSubmit={submit}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '16px', color: 'var(--accent)' }}>Дані пацієнта</div>

            <Field label="ПІБ пацієнта *">
              <input style={inputStyle} value={form.patient_name} onChange={set('patient_name')} placeholder="Прізвище Ім'я По батькові" required />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Field label="Стать *">
                <select style={inputStyle} value={form.gender} onChange={set('gender')}>
                  <option value="Ч">Чоловіча</option>
                  <option value="Ж">Жіноча</option>
                </select>
              </Field>
              <Field label="Дата народження * (ДД.ММ.РРРР)">
                <input style={inputStyle} value={form.birth_date} onChange={set('birth_date')} placeholder="01.01.1990" required />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Field label="Вік (розраховується автоматично)">
                <input style={inputStyle} value={form.age} onChange={set('age')} placeholder="—" />
              </Field>
              <Field label="Телефон">
                <input style={inputStyle} value={form.phone_number} onChange={set('phone_number')} placeholder="+380..." />
              </Field>
            </div>

            <Field label="Адреса">
              <input style={inputStyle} value={form.address} onChange={set('address')} placeholder="Місто, область, вулиця, будинок" />
            </Field>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '16px', color: 'var(--accent)' }}>Госпіталізація</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Field label="Тип госпіталізації *">
                <select style={inputStyle} value={form.admission_type} onChange={set('admission_type')}>
                  <option value="Екстренна">Екстренна</option>
                  <option value="Планова">Планова</option>
                </select>
              </Field>
              <Field label="Відділення госпіталізації *">
                <select style={inputStyle} value={form.admission_department} onChange={set('admission_department')} required>
                  <option value="">— оберіть —</option>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Field label="Дата госпіталізації * (ДД.ММ.РРРР)">
                <input style={inputStyle} value={form.admission_date} onChange={set('admission_date')} required />
              </Field>
              <Field label="Час госпіталізації * (ГГ:ХХ)">
                <input style={inputStyle} value={form.admission_time} onChange={set('admission_time')} required />
              </Field>
            </div>

            <Field label="Діагноз — МКХ-10 *">
              {form.icd_primary ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...inputStyle }}>
                  <span><strong style={{ color: 'var(--accent)' }}>{form.icd_primary}</strong> — {form.icd_label}</span>
                  <button type="button" onClick={clearIcd} style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '13px' }}>✕</button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <input style={inputStyle} value={icdQuery} onChange={(e) => setIcdQuery(e.target.value)} placeholder="Введіть код (J44) або назву діагнозу..." />
                  {icdResults.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', zIndex: 10, maxHeight: '240px', overflowY: 'auto' }}>
                      {icdResults.map((row, i) => (
                        <div key={i} onClick={() => pickIcd(row)} style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', borderBottom: i < icdResults.length - 1 ? '1px solid var(--border)' : 'none' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                          <strong style={{ color: 'var(--accent)' }}>{row['код']}</strong> — {row['назва']}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Field>
          </div>

          {result?.error && (
            <div style={{ background: 'rgba(220,80,80,0.1)', border: '1px solid rgba(220,80,80,0.3)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#e08080' }}>
              {result.error}
            </div>
          )}
          {result?.ok && (
            <div style={{ background: 'rgba(80,200,120,0.1)', border: '1px solid rgba(80,200,120,0.3)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#7fd99a' }}>
              Випадок №{result.case?.id_case} успішно зареєстровано.
            </div>
          )}

          <button type="submit" disabled={submitting} style={{
            width: '100%', padding: '12px', background: 'var(--accent)', color: '#000',
            border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
            fontFamily: 'var(--mono)', cursor: submitting ? 'default' : 'pointer',
            opacity: submitting ? 0.6 : 1,
          }}>
            {submitting ? 'Збереження...' : 'Зареєструвати госпіталізацію'}
          </button>
        </form>
      </div>
    </div>
  )
}
