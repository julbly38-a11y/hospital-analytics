import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/router'
import * as XLSX from 'xlsx'
import { IMPORT_TABLES, IMPORT_TABLE_KEYS } from '../lib/import-config'

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

const cardStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '16px',
}

const btnPrimary = {
  background: 'var(--accent)',
  border: '1px solid var(--accent)',
  borderRadius: '6px',
  color: 'var(--bg)',
  padding: '10px 18px',
  cursor: 'pointer',
  fontFamily: 'var(--mono)',
  fontSize: '13px',
  fontWeight: 600,
}

const btnSecondary = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  color: 'var(--text)',
  padding: '10px 18px',
  cursor: 'pointer',
  fontFamily: 'var(--mono)',
  fontSize: '13px',
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

// Нормалізація рядка для нечіткого зіставлення заголовків.
function norm(s) {
  return String(s || '').toLowerCase().trim().replace(/[\s_\-.]+/g, ' ').replace(/[«»"']/g, '')
}

// Підбір найбільш схожого заголовка файлу для поля цільової таблиці.
function guessHeader(field, headers) {
  const fLabel = norm(field.label)
  const fKey = norm(field.key.replace(/^raw_/, ''))
  let best = null, bestScore = 0
  for (const h of headers) {
    const nh = norm(h)
    if (!nh) continue
    let score = 0
    if (nh === fLabel || nh === fKey) score = 1
    else if (nh.includes(fLabel) || fLabel.includes(nh)) score = 0.8
    else if (nh.includes(fKey) || fKey.includes(nh)) score = 0.7
    else {
      const hw = nh.split(' '), fw = fLabel.split(' ')
      const common = hw.filter((w) => fw.includes(w) && w.length > 2)
      if (common.length) score = 0.4 + 0.1 * common.length
    }
    if (score > bestScore) { bestScore = score; best = h }
  }
  return bestScore >= 0.4 ? best : null
}

const STEP_LABELS = ['Таблиця', 'Файл', 'Зіставлення', 'Перевірка', 'Імпорт']

export default function ImportPage() {
  const router = useRouter()
  const fileInputRef = useRef(null)

  const [me, setMe] = useState(null)
  const [step, setStep] = useState(0)
  const [error, setError] = useState(null)

  const [table, setTable] = useState('lsmd')
  const [fileName, setFileName] = useState(null)
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [mapping, setMapping] = useState({})

  const [batchId, setBatchId] = useState(null)
  const [phase, setPhase] = useState(null) // 'staging' | 'resolving' | 'committing' | 'done' | 'error'
  const [stageResult, setStageResult] = useState(null)
  const [resolveResult, setResolveResult] = useState(null)
  const [commitResult, setCommitResult] = useState(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    fetch('/api/me').then((r) => r.json()).then(setMe).catch(() => setMe({ role: null }))
  }, [])

  const cfg = IMPORT_TABLES[table]

  const mappedRows = useMemo(() => {
    const entries = Object.entries(mapping).filter(([, h]) => h)
    if (!entries.length) return []
    return rows.map((row) => {
      const out = {}
      for (const [fieldKey, header] of entries) {
        const v = row[header]
        if (v !== undefined && v !== null && String(v).trim() !== '') out[fieldKey] = String(v).trim()
      }
      return out
    }).filter((r) => Object.keys(r).length > 0)
  }, [rows, mapping])

  const resetAll = () => {
    setStep(0); setError(null); setFileName(null); setHeaders([]); setRows([])
    setMapping({}); setBatchId(null); setPhase(null)
    setStageResult(null); setResolveResult(null); setCommitResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const onSelectTable = (key) => {
    setTable(key)
    setMapping({})
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: false })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })
      if (!json.length) { setError('Файл порожній або не вдалось розпізнати таблицю'); return }
      const hdrs = Object.keys(json[0])
      setFileName(file.name)
      setHeaders(hdrs)
      setRows(json)

      const guess = {}
      for (const f of cfg.fields) {
        const h = guessHeader(f, hdrs)
        if (h) guess[f.key] = h
      }
      setMapping(guess)
      setStep(2)
    } catch (err) {
      setError(`Не вдалось прочитати файл: ${err.message}`)
    }
  }

  const setMap = (fieldKey, header) => setMapping((m) => ({ ...m, [fieldKey]: header || undefined }))

  const runImport = async () => {
    setWorking(true)
    setError(null)
    setStep(4)
    try {
      setPhase('staging')
      let r = await fetch('/api/import-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, sourceFile: fileName, rows: mappedRows }),
      })
      let data = await r.json()
      if (!r.ok || !data.ok) throw new Error(data.error || 'Помилка завантаження у проміжну таблицю')
      setStageResult(data)
      setBatchId(data.batchId)

      setPhase('resolving')
      r = await fetch('/api/import-resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, batchId: data.batchId }),
      })
      data = await r.json()
      if (!r.ok || !data.ok) throw new Error(data.error || 'Помилка нормалізації даних')
      setResolveResult(data)

      setPhase('committing')
      r = await fetch('/api/import-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, batchId: data.batchId || batchId }),
      })
      const commitData = await r.json()
      if (!r.ok || !commitData.ok) throw new Error(commitData.error || 'Помилка запису у фінальну таблицю')
      setCommitResult(commitData)
      setPhase('done')
    } catch (err) {
      setError(err.message)
      setPhase('error')
    } finally {
      setWorking(false)
    }
  }

  if (me && me.role !== 'admin') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '14px', marginBottom: '12px' }}>Імпорт даних доступний лише адміністраторам.</div>
          <button onClick={() => router.push('/')} style={btnSecondary}>На головну</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--mono)', padding: '32px 16px' }}>
      <div style={{ maxWidth: '880px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '8px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>Імпорт даних</h1>
          <button onClick={() => router.push('/')} style={{ ...btnSecondary, padding: '6px 12px', fontSize: '12px', color: 'var(--text3)' }}>← Назад</button>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '24px' }}>
          Завантаження файлів (CSV / Excel) у таблиці бази даних незалежно від структури джерела: завантаження → нормалізація → запис.
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {STEP_LABELS.map((label, i) => (
            <div key={label} style={{
              padding: '6px 12px', borderRadius: '6px', fontSize: '11px',
              border: '1px solid var(--border)',
              background: i === step ? 'var(--accent)' : 'var(--surface)',
              color: i === step ? 'var(--bg)' : i < step ? 'var(--text)' : 'var(--text3)',
              fontWeight: i === step ? 600 : 400,
            }}>
              {i + 1}. {label}
            </div>
          ))}
        </div>

        {error && (
          <div style={{ ...cardStyle, borderColor: '#c0392b', color: '#e74c3c', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {step === 0 && (
          <div style={cardStyle}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '16px', color: 'var(--accent)' }}>Куди імпортувати?</div>
            <Field label="Цільова таблиця">
              <select style={inputStyle} value={table} onChange={(e) => onSelectTable(e.target.value)}>
                {IMPORT_TABLE_KEYS.map((k) => (
                  <option key={k} value={k}>{IMPORT_TABLES[k].label}</option>
                ))}
              </select>
            </Field>
            <button style={btnPrimary} onClick={() => setStep(1)}>Далі →</button>
          </div>
        )}

        {step === 1 && (
          <div style={cardStyle}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '16px', color: 'var(--accent)' }}>
              Завантажте файл — {cfg.label}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '16px' }}>
              Підтримуються .csv, .xlsx, .xls. Перший рядок має містити назви колонок — структура та порядок колонок можуть бути будь-якими, ви зіставите їх на наступному кроці.
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={onFile}
              style={{ ...inputStyle, padding: '8px' }}
            />
            <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
              <button style={btnSecondary} onClick={() => setStep(0)}>← Назад</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={cardStyle}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: 'var(--accent)' }}>Зіставлення колонок</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '16px' }}>
              Файл: <span style={{ color: 'var(--text)' }}>{fileName}</span> · {rows.length} рядків · {headers.length} колонок.
              Систему запропонувала зіставлення автоматично — перевірте та скоригуйте за потреби. Поля без зіставлення буде проігноровано.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
              {cfg.fields.map((f) => (
                <div key={f.key}>
                  <label style={labelStyle}>{f.label}</label>
                  <select style={inputStyle} value={mapping[f.key] || ''} onChange={(e) => setMap(f.key, e.target.value)}>
                    <option value="">— не зіставлено —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
              <button style={btnSecondary} onClick={() => setStep(1)}>← Назад</button>
              <button style={btnPrimary} disabled={!mappedRows.length} onClick={() => setStep(3)}>
                Перегляд →
              </button>
            </div>
            {!mappedRows.length && (
              <div style={{ marginTop: '12px', fontSize: '12px', color: '#e74c3c' }}>Зіставте хоча б одну колонку, щоб продовжити.</div>
            )}
          </div>
        )}

        {step === 3 && (
          <div style={cardStyle}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: 'var(--accent)' }}>Перевірка перед імпортом</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '16px' }}>
              Буде завантажено <strong style={{ color: 'var(--text)' }}>{mappedRows.length}</strong> рядків у проміжну таблицю «{cfg.staging}»,
              далі — автоматична нормалізація (дати, стать, відділення, МКХ-10 тощо), і нарешті запис у «{cfg.target}».
              Рядки з критичними помилками не потраплять у фінальну таблицю — їх можна буде переглянути після завершення.
            </div>
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '11px' }}>
                <thead>
                  <tr>
                    {cfg.fields.filter((f) => mapping[f.key]).map((f) => (
                      <th key={f.key} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mappedRows.slice(0, 8).map((r, i) => (
                    <tr key={i}>
                      {cfg.fields.filter((f) => mapping[f.key]).map((f) => (
                        <td key={f.key} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r[f.key] || ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {mappedRows.length > 8 && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text3)' }}>… та ще {mappedRows.length - 8} рядків</div>
            )}
            <div style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
              <button style={btnSecondary} onClick={() => setStep(2)}>← Назад</button>
              <button style={btnPrimary} disabled={working} onClick={runImport}>
                {working ? 'Імпортуємо…' : 'Почати імпорт'}
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div style={cardStyle}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '16px', color: 'var(--accent)' }}>Перебіг імпорту</div>

            <ProgressLine label="1. Завантаження у проміжну таблицю" active={phase === 'staging'} done={!!stageResult}
              detail={stageResult ? `Завантажено рядків: ${stageResult.staged ?? mappedRows.length}` : null} />
            <ProgressLine label="2. Нормалізація даних" active={phase === 'resolving'} done={!!resolveResult}
              detail={resolveResult ? `Опрацьовано: ${resolveResult.processed} · готово: ${resolveResult.resolved} · з помилками: ${resolveResult.errors} · попереджень: ${resolveResult.warnings}` : null} />
            <ProgressLine label="3. Запис у фінальну таблицю" active={phase === 'committing'} done={!!commitResult}
              detail={commitResult ? summarizeCommit(table, commitResult) : null} />

            {phase === 'done' && (
              <div style={{ marginTop: '16px', padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}>
                <div style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: '6px' }}>Імпорт завершено</div>
                <div style={{ color: 'var(--text3)' }}>Партія: {batchId}</div>
                {commitResult?.counts && (
                  <div style={{ marginTop: '6px', color: 'var(--text3)' }}>
                    Підсумок за статусами: {Object.entries(commitResult.counts).map(([k, v]) => `${statusLabel(k)} — ${v}`).join(' · ')}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
              {phase === 'done' && (
                <button style={btnPrimary} onClick={resetAll}>Новий імпорт</button>
              )}
              {phase === 'error' && (
                <button style={btnSecondary} onClick={() => { setError(null); setPhase(null); setStep(3) }}>← До перевірки</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ProgressLine({ label, active, done, detail }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{
        width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0, marginTop: '1px',
        border: '1px solid var(--border)',
        background: done ? 'var(--accent)' : active ? 'transparent' : 'var(--bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '10px', color: done ? 'var(--bg)' : 'var(--text3)',
      }}>
        {done ? '✓' : active ? '…' : ''}
      </div>
      <div>
        <div style={{ fontSize: '12px', color: active || done ? 'var(--text)' : 'var(--text3)' }}>{label}</div>
        {detail && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{detail}</div>}
      </div>
    </div>
  )
}

function statusLabel(status) {
  return { pending: 'очікує', resolved: 'нормалізовано', error: 'помилка', inserted: 'записано' }[status] || status
}

function summarizeCommit(table, res) {
  if (table === 'patients_best') {
    return `Створено нових: ${res.inserted ?? 0} · зіставлено з існуючими: ${res.linked ?? 0} · помилок: ${res.errors ?? 0}`
  }
  return `Записано: ${res.inserted ?? 0} · помилок: ${res.errors ?? 0}`
}
