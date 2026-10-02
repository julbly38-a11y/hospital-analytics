import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { SANS, MONO } from '../components/shared'

// Порядок і назви — з lpz.lpz_quality_check_catalog (API віддає в data.catalog);
// тут лише порядок показу (блокує оплату → невідомо → не блокує) і фолбек-назва,
// якщо рядка в каталозі ще нема.
const CHECK_ORDER = [
  'no_esoz', 'negative_card_number', 'no_primary',
  'no_doctor', 'los_over_30d', 'no_signer', 'no_disposition', 'no_interventions',
  'single_dx', 'injury_no_type',
]
const CHECK_FALLBACK_LABELS = {
  no_primary: 'Немає основного діагнозу',
  no_doctor: 'Немає лікаря',
  injury_no_type: 'Травма без «Виду травми»',
  single_dx: 'Лише один діагноз',
  no_interventions: 'Немає втручань',
  no_esoz: 'Не завершено в ЕСОЗ',
  negative_card_number: 'Картка-примара (травень–червень)',
  los_over_30d: 'Госпіталізація понад 30 діб',
  no_signer: 'Немає підпису виписки',
  no_disposition: 'Немає результату лікування',
}
const BLOCKS_COLOR = { 'так': '#c0392b', 'невідомо': '#b8860b', 'ні': '#8a8a8a' }

function fmtDt(s) {
  if (!s) return '—'
  return new Date(s).toLocaleString('uk', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 12.5 }}>{children ?? '—'}</div>
    </div>
  )
}

function codeList(arr) {
  return arr && arr.length ? arr.join(', ') : '—'
}

function ExpandedEpisode({ r }) {
  const helsiUrl = `https://helsi.pro/hospital/cases/${encodeURIComponent(r.helsi_case_id)}?tabName=MAIN`
  const finMessages = r.validation_messages?.messages || r.validation_messages?.message
  const finError = r.validation_messages?.error
  const finSkipped = r.validation_messages?.skipped
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 32px', padding: '14px 16px', background: 'rgba(0,0,0,0.02)' }}>
      <div style={{ minWidth: 220 }}>
        <Field label="Діагнози (основний / супутні / ускладнення)">
          {r.primary_icd || '—'}{r.secondary_icd?.length ? ` · супутні: ${codeList(r.secondary_icd)}` : ''}{r.complication_icd?.length ? ` · ускладнення: ${codeList(r.complication_icd)}` : ''}
        </Field>
        <Field label="Зовнішня причина травми">{codeList(r.external_cause_icd)}</Field>
        <Field label="Вид травми (injury_type)">{r.injury_type ?? '—'}</Field>
        <Field label="Втручання / операції">{codeList(r.intervention_codes)}{r.operation_codes?.length ? ` (з них операції: ${codeList(r.operation_codes)})` : ''}</Field>
      </div>
      <div style={{ minWidth: 220 }}>
        <Field label="Джерело госпіталізації / пріоритет">{r.admit_source || '—'} / {r.priority || '—'}</Field>
        <Field label="Повторна госпіталізація">{r.re_admission ?? '—'}</Field>
        <Field label="Результат лікування (виписка)">{r.discharge_disposition || '—'}</Field>
        <Field label="Стан ЕСОЗ / картки">{r.esoz_episode_status || '—'} / {r.card_status || '—'}{r.resolution_name ? ` (${r.resolution_name})` : ''}</Field>
        <Field label="ehealth-статус виписки / підписант">{r.discharge_ehealth_status || '—'} / {r.discharge_signed_by_position || '—'}</Field>
      </div>
      <div style={{ minWidth: 260 }}>
        <Field label="Пакет / ДСГ (package-validation)">
          {r.package_number ? `№${r.package_number} ${r.package_name || ''}` : 'ще не зібрано'}
          {r.dsg_code ? ` — ${r.dsg_code} ${r.dsg_name || ''}` : ''}
        </Field>
        {r.package_number != null && (
          <Field label="Вага ДСГ / ціна / коеф. частки / факт. оплата">
            {r.dsg_coefficient ?? '—'} / {r.price != null ? `${r.price} грн` : '—'} / {r.adjustment_coefficient ?? '—'} / {r.adjustment_price != null ? `${r.adjustment_price} грн` : '—'}
          </Field>
        )}
        {finMessages && (
          <Field label="Повідомлення package-validation">
            {Array.isArray(finMessages) ? finMessages.map((m, i) => <div key={i}>{m}</div>) : finMessages}
          </Field>
        )}
        {finError && <Field label="Помилка package-validation"><span style={{ color: '#c0392b' }}>{typeof finError === 'string' ? finError : JSON.stringify(finError)}</span></Field>}
        {finSkipped && <Field label="Пропущено">{finSkipped}</Field>}
      </div>
      <div style={{ alignSelf: 'flex-end', marginLeft: 'auto' }}>
        <a href={helsiUrl} target="helsi" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 12, color: '#4a9870' }}>відкрити в helsi ↗</a>
      </div>
    </div>
  )
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer', ...MONO,
        border: `1px solid ${active ? '#4a9870' : 'rgba(0,0,0,0.15)'}`,
        background: active ? 'rgba(74,152,112,0.15)' : '#fff', color: active ? '#2f6b4d' : '#555',
      }}
    >{children}</button>
  )
}

export default function AdminEpisodeFacts() {
  const router = useRouter()
  const [allowed, setAllowed] = useState(null)
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [status, setStatus] = useState('closed')
  const [activeChecks, setActiveChecks] = useState(new Set())
  const [dept, setDept] = useState('all')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(me => {
      if (!me.is_owner) { router.replace('/'); return }
      setAllowed(true)
    })
  }, [router])

  useEffect(() => {
    if (!allowed) return
    setData(null)
    fetch(`/api/lpz-episode-facts?org=43342788&status=${status}`).then(r => {
      if (!r.ok) throw new Error('lpz-episode-facts ' + r.status)
      return r.json()
    }).then(setData).catch(e => setErr(e.message))
  }, [allowed, status])

  const departments = useMemo(() => {
    if (!data) return []
    return [...new Set(data.rows.map(r => r.department_name).filter(Boolean))].sort()
  }, [data])

  const rows = useMemo(() => {
    if (!data) return []
    return data.rows.filter(r => {
      if (dept !== 'all' && r.department_name !== dept) return false
      if (activeChecks.size && ![...activeChecks].some(k => r.checks[k])) return false
      return true
    })
  }, [data, dept, activeChecks])

  const checkCounts = useMemo(() => {
    if (!data) return {}
    const c = {}
    CHECK_ORDER.forEach(k => { c[k] = data.rows.filter(r => r.checks[k]).length })
    return c
  }, [data])

  const labelFor = k => data?.catalog?.[k]?.label_uk || CHECK_FALLBACK_LABELS[k] || k
  const blocksFor = k => data?.catalog?.[k]?.blocks_payment || 'невідомо'

  const toggleCheck = k => setActiveChecks(prev => {
    const next = new Set(prev)
    next.has(k) ? next.delete(k) : next.add(k)
    return next
  })

  if (!allowed) return null

  return (
    <>
      <Head><title>Факти епізодів — адмін</title></Head>
      <div style={{ minHeight: '100vh', background: '#f0ece8', padding: '32px', ...SANS }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4, color: '#1a1a1a' }}>Факти епізодів — травматологія ЛШМД</h1>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 20, ...MONO }}>
          {data ? `${rows.length} з ${data.total}` : 'завантаження…'}
        </div>

        {err && <div style={{ color: '#c0392b', marginBottom: 16 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <Chip active={status === 'closed'} onClick={() => setStatus('closed')}>закриті</Chip>
          <Chip active={status === 'open'} onClick={() => setStatus('open')}>відкриті</Chip>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={dept} onChange={e => setDept(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', fontSize: 13, ...MONO }}>
            <option value="all">усі відділення</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 4, ...MONO, fontSize: 11, color: '#888' }}>
          <span style={{ color: BLOCKS_COLOR['так'] }}>● блокує оплату</span>
          <span style={{ color: BLOCKS_COLOR['невідомо'] }}>● невідомо</span>
          <span style={{ color: BLOCKS_COLOR['ні'] }}>● не блокує (лише якість запису)</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {CHECK_ORDER.map(k => (
            <Chip key={k} active={activeChecks.has(k)} onClick={() => toggleCheck(k)}>
              <span style={{ color: BLOCKS_COLOR[blocksFor(k)], marginRight: 4 }}>●</span>
              {labelFor(k)} ({checkCounts[k] ?? '—'})
            </Chip>
          ))}
        </div>

        <div style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.6)', borderRadius: 10, border: '1px solid rgba(0,0,0,0.08)' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5, ...MONO }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                {['№ карти', 'Госпіталізовано', 'Виписано', 'Відділення', 'Лікар', 'Діагноз', 'Втручань', 'ЕСОЗ', 'Зауваження'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', fontWeight: 600, color: '#666', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const flags = CHECK_ORDER.filter(k => r.checks[k])
                const isOpen = expanded === r.helsi_case_id
                return (
                  <React.Fragment key={r.helsi_case_id}>
                    <tr
                      onClick={() => setExpanded(isOpen ? null : r.helsi_case_id)}
                      style={{ borderBottom: isOpen ? 'none' : '1px solid rgba(0,0,0,0.05)', cursor: 'pointer', background: isOpen ? 'rgba(74,152,112,0.08)' : 'transparent' }}
                      onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = 'rgba(74,152,112,0.08)' }}
                      onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent' }}
                    >
                      <td style={{ padding: '7px 10px' }}>{r.card_number}</td>
                      <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{fmtDt(r.admission_at)}</td>
                      <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{fmtDt(r.discharge_at)}</td>
                      <td style={{ padding: '7px 10px' }}>{(r.department_name || '').replace('Травматологічне відділення для ', '')}</td>
                      <td style={{ padding: '7px 10px' }}>{r.doctor_short_name || '—'}</td>
                      <td style={{ padding: '7px 10px' }}>{r.primary_icd || '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center' }}>{r.intervention_codes?.length || 0}</td>
                      <td style={{ padding: '7px 10px' }}>{r.esoz_episode_status || (r.status === 'closed' ? '—' : '')}</td>
                      <td style={{ padding: '7px 10px' }}>
                        {flags.length
                          ? flags.map(k => (
                              <span key={k} style={{ color: BLOCKS_COLOR[blocksFor(k)], marginRight: 8, whiteSpace: 'nowrap' }}>
                                ● {labelFor(k)}
                              </span>
                            ))
                          : <span style={{ color: '#4a9870' }}>без зауважень</span>}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                        <td colSpan={9} style={{ padding: 0 }}><ExpandedEpisode r={r} /></td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
