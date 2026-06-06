import { useState, useRef, useEffect, useMemo } from 'react'
import Head from 'next/head'
import { createClient } from '../lib/supabase'
import { useRouter } from 'next/router'

/* Стилі дашборду (з дизайн-системи ЛСМД, ui_kits/dashboard/dashboard.css) */
const DASH_CSS = `
.dashboard { display: flex; height: 100vh; overflow: hidden; }
.dash-sidebar { width: 248px; min-width: 248px; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; }
.dash-sidebar .brand { padding: 20px 20px 18px; border-bottom: 1px solid var(--border); display:flex; align-items:center; gap:10px; cursor:pointer; }
.dash-sidebar .brand .mark { font-family: var(--mono); font-weight: 300; font-size: 26px; color: var(--brand); line-height: 1; }
.dash-sidebar .brand .name { font-weight: 500; font-size: 14px; color: var(--text); letter-spacing: 0.02em; }
.dash-nav { padding: 16px 12px; flex: 1; overflow-y: auto; }
.dash-nav .group { margin-bottom: 22px; }
.dash-nav .group-label { font-family: var(--mono); font-weight: 500; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text3); padding: 0 8px; margin-bottom: 8px; }
.dash-nav-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; margin-bottom: 2px; font-size: 13px; color: var(--text2); border-radius: 6px; cursor: pointer; transition: 0.15s; white-space: nowrap; }
.dash-nav-item .gl { font-family: var(--mono); font-size: 14px; color: var(--text3); width: 16px; text-align: center; }
.dash-nav-item:hover { background: var(--bg); color: var(--text); }
.dash-nav-item.active { background: var(--brand-soft); color: var(--brand); font-weight: 500; }
.dash-nav-item.active .gl { color: var(--brand); }
.dash-user { padding: 14px 16px; border-top: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
.dash-user .ava { width: 30px; height: 30px; border-radius: 50%; background: var(--bg2); display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-weight: 500; font-size: 12px; color: var(--text); flex-shrink:0; }
.dash-user .who { line-height: 1.2; min-width: 0; flex: 1; }
.dash-user .name { font-size: 13px; color: var(--text); white-space: nowrap; overflow:hidden; text-overflow:ellipsis; }
.dash-user .role { font-size: 11px; color: var(--text3); font-family: var(--mono); }
.dash-user .lo { background:none; border:0; cursor:pointer; color:var(--text3); font-family:var(--mono); font-size:11px; }
.dash-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.dash-header { padding: 20px 32px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; background: var(--bg); flex-shrink:0; }
.dash-header h1 { font-family: var(--mono); font-weight: 300; font-size: 24px; color: var(--text); }
.dash-header .crumbs { font-family: var(--mono); font-size: 11px; color: var(--text3); margin-bottom: 4px; letter-spacing: 0.05em; text-transform: uppercase; }
.dash-content { flex: 1; overflow-y: auto; padding: 28px 32px; }
.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
.kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 18px; }
.kpi .lbl { font-family: var(--mono); font-weight: 500; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text3); margin-bottom: 8px; }
.kpi .val { font-family: var(--mono); font-weight: 300; font-size: 28px; color: var(--text); line-height: 1; }
.kpi .delta { font-family: var(--mono); font-size: 11px; margin-top: 8px; color: var(--text3); }
.kpi .delta.down { color: var(--brand); }
.chart-row { display: grid; grid-template-columns: 2fr 1fr; gap: 14px; margin-bottom: 24px; }
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 20px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.panel-head h3 { font-family: var(--mono); font-weight: 500; font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text2); }
.panel-head .filter { font-family: var(--mono); font-size: 11px; color: var(--text3); }
.barchart { display: flex; align-items: flex-end; gap: 6px; height: 180px; padding: 8px 0 0; border-bottom: 1px solid var(--border); }
.barchart .bar { flex: 1; background: var(--text); border-radius: 2px 2px 0 0; transition: 0.2s; }
.barchart .bar.peak { background: var(--brand); }
.barchart-x { display: flex; gap: 6px; margin-top: 6px; font-family: var(--mono); font-size: 10px; color: var(--text3); }
.barchart-x span { flex: 1; text-align: center; }
.dept-list { display: flex; flex-direction: column; gap: 10px; }
.dept-row { display: flex; align-items: center; gap: 10px; font-family: var(--mono); font-size: 11px; }
.dept-row .name { flex: 1; color: var(--text); }
.dept-row .bar-wrap { height: 4px; background: var(--bg2); border-radius: 2px; overflow: hidden; }
.dept-row .bar-fill { height: 100%; background: var(--text); }
.dept-row .pct { color: var(--text3); text-align: right; }
.table-wrap { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.dtable { width: 100%; border-collapse: collapse; font-size: 13px; font-family: var(--mono); }
.dtable th { background: var(--bg2); padding: 10px 14px; text-align: left; font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text2); border-bottom: 1px solid var(--border); }
.dtable td { padding: 10px 14px; border-bottom: 1px solid var(--border); color: var(--text); }
.dtable tr:last-child td { border-bottom: none; }
.dtable tr:hover td { background: var(--bg); }
.btn-secondary { padding: 8px 14px; background: transparent; color: var(--text); border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-family: var(--sans); cursor: pointer; }
.btn-secondary:hover { border-color: var(--text); }
@media (max-width: 900px) {
  .dash-sidebar { display: none; }
  .kpi-row { grid-template-columns: repeat(2,1fr); }
  .chart-row { grid-template-columns: 1fr; }
}
`

/* Навігація (з дизайну ui_kits/dashboard) */
const DASH_NAV = [
  { id: 'overview',    label: 'Загальна',     gl: '⊕', group: 'Аналітика' },  // медичний хрест у колі
  { id: 'departments', label: 'Відділення',   gl: '⊞', group: 'Аналітика' },  // сітка відділень
  { id: 'diagnoses',   label: 'Діагнози МКХ', gl: '℞', group: 'Аналітика' },  // символ рецепту Rx
  { id: 'doctors',     label: 'Лікарі',       gl: '⚕', group: 'Аналітика' },  // жезл Ескулапа
  { id: 'patients',    label: 'Пацієнти',     gl: '♡', group: 'Аналітика' },  // серце
  { id: 'geography',   label: 'Географія',    gl: '◎', group: 'Аналітика' },  // ціль / локація
  { id: 'peaks',       label: 'Піки',         gl: '↑', group: 'Аналітика' },  // стрілка вгору
  { id: 'night',       label: 'Нічні зміни',  gl: '☾', group: 'Аналітика' },  // місяць
  { id: 'urgency',     label: 'Ургентність',  gl: '⚡', group: 'Аналітика' },  // блискавка = екстрено
  { id: 'operations',  label: 'Операції',     gl: '✂', group: 'Аналітика' },  // ножиці = хірургія
  { id: 'org',         label: 'Структура',    gl: '⊞', group: 'Інструменти', url: '/org' },
  { id: 'cabinet',     label: 'Кабінет лікаря',     gl: '⚕', group: 'Інструменти', url: '/cabinet' },
  { id: 'admit',       label: 'Госпіталізація пацієнта', gl: '+', group: 'Інструменти', url: '/admit' },
  { id: 'asystent',    label: 'AI Асистент',  gl: '✦', group: 'Інструменти' }, // зірка
  { id: 'reports',     label: 'Звіти',        gl: '≡', group: 'Інструменти' }, // документ
  { id: 'settings',    label: 'Налаштування', gl: '⚙', group: 'Інструменти' }, // шестерня
]
/* Хвиля 1 додала: Відділення, Пацієнти, Піки, Ургентність (живі дані).
   Майбутні (наступні хвилі): Діагнози, Лікарі, Географія, Нічні, Приймальне, Операції, Звіти, Налаштування */

function fmt(n) {
  if (n === null || n === undefined || n === '') return '—'
  const num = Number(n)
  if (isNaN(num)) return String(n)
  return num.toLocaleString('uk-UA').replace(/\u00A0/g, ' ').replace(/,/g, ' ')
}
const ICD_NAMES = {
  K: 'Хвороби органів травлення', S: 'Травми та отруєння', I: 'Хвороби системи кровообігу',
  G: 'Хвороби нервової системи', N: 'Хвороби сечостатевої системи', C: 'Новоутворення',
  M: "Хвороби кістково-м'язової системи", J: 'Хвороби органів дихання', E: 'Ендокринні хвороби',
}
const STATUS_COLOR = {
  'З поліпшенням': 'var(--green)', 'Помер': 'var(--brand)', 'З погіршенням': 'var(--amber)',
}

function Sidebar({ active, setActive, me, role, onLogout }) {
  const groups = [...new Set(DASH_NAV.map(n => n.group))]
  const name = me?.name || (role === 'admin' ? 'Адміністратор' : 'Користувач')
  const subtitle = [me?.position, me?.specialization].filter(Boolean).join(' · ') || (role === 'admin' ? 'повний доступ' : '')
  const initials = name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  return (
    <aside className="dash-sidebar">
      <div className="brand">
        <span className="mark">+</span><span className="name">ЛСМД</span>
      </div>
      <div className="dash-nav">
        {groups.map(g => (
          <div key={g} className="group">
            <div className="group-label">{g}</div>
            {DASH_NAV.filter(n => n.group === g).map(n => (
              <div key={n.id} className={`dash-nav-item${active === n.id ? ' active' : ''}`}
                onClick={() => n.url ? (window.location.href = n.url) : setActive(n.id)}>
                <span className="gl">{n.gl}</span><span>{n.label}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="dash-user">
        <div className="ava">{initials}</div>
        <div className="who">
          <div className="name">{name}</div>
          <div className="role">{subtitle}</div>
        </div>
        <button className="lo" onClick={onLogout} title="Вийти">↪</button>
      </div>
    </aside>
  )
}

/* ОГЛЯД — живі дані з /api/stats (ключі ovKpi/ovHours/ovStatus/ovIcd) */
function OverviewPage() {
  const [kpi, setKpi] = useState(null)
  const [hours, setHours] = useState([])
  const [status, setStatus] = useState([])
  const [icd, setIcd] = useState([])
  const [err, setErr] = useState(null)
  const [years, setYears] = useState([])
  const [year, setYear] = useState('all')

  async function load(key, param) {
    const body = param !== undefined ? { key, param } : { key }
    const r = await fetch('/api/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body) })
    const d = await r.json()
    if (d.error) throw new Error(d.error)
    return d.rows || []
  }

  // Список доступних років для селектора (раз при завантаженні)
  useEffect(() => {
    load('ovYears').then(rows => setYears(rows.map(r => r.рік).filter(Boolean))).catch(() => {})
  }, [])

  // Дані огляду — або за весь час, або відфільтровані по обраному року
  useEffect(() => {
    const isAll = year === 'all'
    const tasks = isAll
      ? [load('ovKpi'), load('ovHours'), load('ovStatus'), load('ovIcd')]
      : [load('ovKpiYear', String(year)), load('ovHoursYear', String(year)), load('ovStatusYear', String(year)), load('ovIcdYear', String(year))]
    Promise.all(tasks)
      .then(([k, h, s, i]) => { setKpi(k[0] || null); setHours(h); setStatus(s); setIcd(i); setErr(null) })
      .catch(e => setErr(e.message))
  }, [year])

  const maxHour = hours.length ? Math.max(...hours.map(h => h.випадків)) : 1
  const peakIdx = hours.length ? hours.reduce((mi, h, i, a) => h.випадків > a[mi].випадків ? i : mi, 0) : -1
  const maxIcd = icd.length ? icd[0].випадків : 1
  const totalStatus = status.reduce((s, r) => s + Number(r.випадків), 0) || 1

  return (
    <>
      <div className="dash-header">
        <div>
          <div className="crumbs">Аналітика · Огляд</div>
          <h1>Дашборд лікарні</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="btn-secondary" value={year} onChange={e => setYear(e.target.value)}
            style={{ cursor: 'pointer', fontFamily: 'var(--mono)' }}>
            <option value="all">Період: усі роки</option>
            {years.map(y => <option key={y} value={y}>Рік: {y}</option>)}
          </select>
        </div>
      </div>
      <div className="dash-content">
        {err && <div className="panel" style={{ borderColor: 'var(--brand)', color: 'var(--brand)', marginBottom: 16 }}>Помилка завантаження: {err}</div>}

        {/* KPI */}
        <div className="kpi-row">
          <div className="kpi"><div className="lbl">✚ Госпіталізацій</div>
            <div className="val">{kpi ? fmt(kpi.total_cases) : '…'}</div>
            <div className="delta">{kpi ? `${fmt(kpi.unique_patients)} унікальних пацієнтів` : ''}</div></div>
          <div className="kpi"><div className="lbl">♡ Летальність</div>
            <div className="val">{kpi ? `${kpi.death_rate_pct}%` : '…'}</div>
            <div className="delta down">{kpi ? `${fmt(kpi.deaths)} випадків` : ''}</div></div>
          <div className="kpi"><div className="lbl">≋ Сер. ліжко-день</div>
            <div className="val">{kpi ? kpi.avg_bed_days : '…'}</div>
            <div className="delta">по всій лікарні</div></div>
          <div className="kpi"><div className="lbl">✂ Хірургічна активність</div>
            <div className="val">{kpi ? `${kpi.surgical_activity_pct}%` : '…'}</div>
            <div className="delta">{kpi ? `${fmt(kpi.operations)} операцій` : ''}</div></div>
        </div>

        {/* Години + тип госпіталізації */}
        <div className="chart-row">
          <div className="panel">
            <div className="panel-head"><h3>Пікові години госпіталізацій</h3><span className="filter">{year === 'all' ? 'усі роки' : year}</span></div>
            <div className="barchart">
              {hours.map((h, i) => (
                <div key={i} className={`bar${i === peakIdx ? ' peak' : ''}`}
                  style={{ height: `${(h.випадків / maxHour) * 100}%` }}
                  title={`${String(h.година).padStart(2, '0')}:00 · ${fmt(h.випадків)}`} />
              ))}
            </div>
            <div className="barchart-x">
              {hours.map((h, i) => <span key={i}>{i % 4 === 0 ? String(h.година).padStart(2, '0') : ''}</span>)}
            </div>
            {peakIdx >= 0 && <p style={{ marginTop: 10, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
              Пік о <strong style={{ color: 'var(--brand)' }}>{String(hours[peakIdx].година).padStart(2, '0')}:00</strong> — {fmt(hours[peakIdx].випадків)} госпіталізацій.</p>}
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Тип госпіталізації</h3><span className="filter">{kpi ? fmt(kpi.total_cases) : ''}</span></div>
            {kpi && [{ l: 'Екстрена', v: kpi.urgent, p: kpi.urgent_pct, c: 'var(--brand)' },
              { l: 'Планова', v: kpi.planned, p: (100 - Number(kpi.urgent_pct)).toFixed(2), c: 'var(--text)' }].map((row, i) => (
              <div key={i} style={{ marginTop: i ? 14 : 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 12, marginBottom: 4 }}>
                  <span>{row.l}</span><span style={{ color: row.c === 'var(--brand)' ? 'var(--brand)' : 'inherit' }}>{row.p}%</span>
                </div>
                <div style={{ height: 8, background: 'var(--bg2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${row.p}%`, height: '100%', background: row.c }} /></div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{fmt(row.v)} випадків</div>
              </div>
            ))}
          </div>
        </div>

        {/* Розділи МКХ */}
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-head"><h3>Розподіл за розділами МКХ-10</h3><span className="filter">топ-7 з 22</span></div>
          <div className="dept-list">
            {icd.map(c => (
              <div key={c.розділ} className="dept-row">
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 500, color: 'var(--brand)', width: 20 }}>{c.розділ}</span>
                <span className="name" style={{ flex: '1 1 auto' }}>{ICD_NAMES[c.розділ] || 'Інші'}</span>
                <span className="bar-wrap" style={{ width: 160 }}><span className="bar-fill" style={{ width: `${(c.випадків / maxIcd) * 100}%` }} /></span>
                <span className="pct" style={{ width: 60 }}>{fmt(c.випадків)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Статуси виписки */}
        <div className="panel">
          <div className="panel-head"><h3>Виписки — статус</h3><span className="filter">{fmt(totalStatus)} всього</span></div>
          <div className="table-wrap">
            <table className="dtable">
              <thead><tr><th>Статус</th><th style={{ textAlign: 'right' }}>Випадків</th><th style={{ textAlign: 'right' }}>%</th><th style={{ minWidth: 120 }}>Розподіл</th></tr></thead>
              <tbody>
                {status.map((s, i) => (
                  <tr key={i}>
                    <td>{s.статус}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(s.випадків)}</td>
                    <td style={{ textAlign: 'right' }}>{s.відс}%</td>
                    <td><div style={{ height: 4, background: 'var(--bg2)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${s.відс}%`, height: '100%', background: STATUS_COLOR[s.статус] || 'var(--text2)' }} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Хвиля 1: спільний хук завантаження ── */
function useStat(key) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    fetch('/api/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }) })
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setRows(d.rows || []) })
      .catch(e => setErr(e.message))
  }, [key])
  return { rows, err }
}

function PageHead({ crumb, title, right }) {
  return (
    <div className="dash-header">
      <div><div className="crumbs">{crumb}</div><h1>{title}</h1></div>
      {right && <div style={{ display: 'flex', gap: 8 }}>{right}</div>}
    </div>
  )
}

/* ВІДДІЛЕННЯ — список з кліком на картку відділення */
function DepartmentsPage() {
  const { rows, err } = useStat('wDept')
  const [selected, setSelected] = useState(null)
  const max = rows && rows.length ? Math.max(...rows.map(r => Number(r.випадків))) : 1

  if (selected) return <DeptCard name={selected} onBack={() => setSelected(null)} />

  return (
    <>
      <PageHead crumb="Аналітика · Відділення" title="Відділення" />
      <div className="dash-content">
        {err && <div className="panel" style={{ borderColor: 'var(--brand)', color: 'var(--brand)', marginBottom: 16 }}>Помилка: {err}</div>}
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>Клікніть на відділення для детальних показників →</div>
        <div className="table-wrap">
          <table className="dtable">
            <thead><tr>
              <th>Відділення</th>
              <th style={{ textAlign: 'right' }}>Випадків</th>
              <th style={{ textAlign: 'right' }}>Унік.</th>
              <th style={{ textAlign: 'right' }}>Ліжко-день</th>
              <th style={{ textAlign: 'right' }}>Летальність</th>
              <th style={{ textAlign: 'right' }}>Операцій</th>
              <th style={{ textAlign: 'right' }}>Хір. активність</th>
              <th style={{ minWidth: 110 }}>Обсяг</th>
            </tr></thead>
            <tbody>
              {!rows && <tr><td colSpan={8} style={{ color: 'var(--text3)' }}>завантаження…</td></tr>}
              {rows && rows.map((r, i) => (
                <tr key={i} onClick={() => setSelected(r.відділення)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontFamily: 'var(--sans)', color: 'var(--brand)' }}>{r.відділення}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.випадків)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{fmt(r.унікальних)}</td>
                  <td style={{ textAlign: 'right' }}>{r.ліжкодень}</td>
                  <td style={{ textAlign: 'right', color: Number(r.летальність) > 2 ? 'var(--brand)' : 'var(--text2)' }}>{r.летальність}%</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.операцій)}</td>
                  <td style={{ textAlign: 'right' }}>{r.хір_активність}%</td>
                  <td><div style={{ height: 6, background: 'var(--bg2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${(Number(r.випадків) / max) * 100}%`, height: '100%', background: 'var(--text)' }} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/* КАРТКА ВІДДІЛЕННЯ — профіль + топ-діагнози (параметризовані запити) */
function DeptCard({ name, onBack }) {
  const [prof, setProf] = useState(null)
  const [diag, setDiag] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    async function load(key) {
      const r = await fetch('/api/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, param: name }) })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      return d.rows || []
    }
    Promise.all([load('deptProfile'), load('deptDiag')])
      .then(([p, dg]) => { setProf(p[0] || null); setDiag(dg) })
      .catch(e => setErr(e.message))
  }, [name])

  const p = prof || {}
  const sexTotal = (Number(p.жінки) + Number(p.чоловіки)) || 1
  const maxDiag = diag && diag.length ? Math.max(...diag.map(d => Number(d.випадків))) : 1

  return (
    <>
      <PageHead crumb="Аналітика · Відділення" title={name}
        right={<button className="btn-secondary" onClick={onBack}>← Усі відділення</button>} />
      <div className="dash-content">
        {err && <div className="panel" style={{ borderColor: 'var(--brand)', color: 'var(--brand)', marginBottom: 16 }}>Помилка: {err}</div>}
        {!prof && !err && <div className="panel" style={{ color: 'var(--text3)' }}>завантаження…</div>}
        {prof && (
          <>
            <div className="kpi-row">
              <div className="kpi"><div className="lbl">Випадків</div><div className="val">{fmt(p.випадків)}</div><div className="delta">{fmt(p.унікальних)} унікальних</div></div>
              <div className="kpi"><div className="lbl">Летальність</div><div className="val">{p.летальність}%</div><div className="delta down">середній вік {p.середній_вік}</div></div>
              <div className="kpi"><div className="lbl">Сер. ліжко-день</div><div className="val">{p.ліжкодень}</div><div className="delta">ургентних {p.ургентних_відс}%</div></div>
              <div className="kpi"><div className="lbl">Хір. активність</div><div className="val">{p.хір_активність}%</div><div className="delta">{fmt(p.операцій)} операцій</div></div>
            </div>
            <div className="chart-row">
              <div className="panel">
                <div className="panel-head"><h3>Топ-діагнози відділення</h3><span className="filter">з department_diagnoses</span></div>
                <div className="dept-list">
                  {!diag && <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12 }}>завантаження…</div>}
                  {(diag || []).map((d, i) => (
                    <div key={i} className="dept-row" style={{ alignItems: 'flex-start' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 500, color: 'var(--brand)', width: 56 }}>{d.код}</span>
                      <span className="name" style={{ flex: '1 1 auto', whiteSpace: 'normal', lineHeight: 1.4 }}>{d.діагноз}</span>
                      <span className="bar-wrap" style={{ width: 90, marginTop: 5 }}><span className="bar-fill" style={{ width: `${(Number(d.випадків) / maxDiag) * 100}%` }} /></span>
                      <span className="pct" style={{ width: 48, marginTop: 2 }}>{fmt(d.випадків)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="panel">
                <div className="panel-head"><h3>Стать</h3><span className="filter">{fmt(sexTotal)}</span></div>
                {[{ l: 'Чоловіки', v: Number(p.чоловіки), c: 'var(--text)' }, { l: 'Жінки', v: Number(p.жінки), c: 'var(--text2)' }].map((row, i) => (
                  <div key={i} style={{ marginTop: i ? 16 : 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 12, marginBottom: 6 }}>
                      <span>{row.l}</span><span>{((row.v / sexTotal) * 100).toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 10, background: 'var(--bg2)', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${(row.v / sexTotal) * 100}%`, height: '100%', background: row.c }} /></div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{fmt(row.v)}</div>
                  </div>
                ))}
                <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)', lineHeight: 1.8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Діти</span><span>{fmt(p.діти)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Літні</span><span>{fmt(p.літні)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>З поліпшенням</span><span>{fmt(p.поліпшення)}</span></div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

/* ПОШУК ПАЦІЄНТА — лише admin (персональні дані) */
function PatientSearch() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [picked, setPicked] = useState(null)

  async function search() {
    if (q.trim().length < 2) return
    setLoading(true); setErr(null); setResults(null)
    try {
      const r = await fetch('/api/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'patSearch', param: q.trim() }) })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setResults(d.rows || [])
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }

  if (picked) return <PatientCard pid={picked} onBack={() => setPicked(null)} />

  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head"><h3>Пошук пацієнта за ПІБ</h3><span className="filter">admin · персональні дані</span></div>
      <div style={{ display: 'flex', gap: 10, marginBottom: results ? 14 : 0 }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Прізвище або частина ПІБ…" style={{ flex: 1, fontFamily: 'var(--sans)', fontSize: 14,
            padding: '10px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', outline: 'none' }} />
        <button onClick={search} disabled={loading || q.trim().length < 2} className="btn-secondary"
          style={{ opacity: loading || q.trim().length < 2 ? 0.4 : 1 }}>{loading ? '…' : 'Знайти'}</button>
      </div>
      {err && <div style={{ color: 'var(--brand)', fontSize: 13, fontFamily: 'var(--mono)' }}>{err}</div>}
      {results && results.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 13, fontFamily: 'var(--mono)' }}>Нічого не знайдено</div>}
      {results && results.length > 0 && (
        <div className="table-wrap">
          <table className="dtable">
            <thead><tr><th>ПІБ</th><th style={{ textAlign: 'right' }}>Вік</th><th>Стать</th><th>Населений пункт</th></tr></thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} onClick={() => setPicked(r.patient_id)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontFamily: 'var(--sans)', fontWeight: 500, color: 'var(--brand)' }}>{r.піб}</td>
                  <td style={{ textAlign: 'right' }}>{r.вік ?? '—'}</td>
                  <td style={{ color: 'var(--text2)' }}>{r.стать || '—'}</td>
                  <td style={{ color: 'var(--text2)' }}>{r.нп || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* КАРТКА ПАЦІЄНТА — профіль + історія госпіталізацій (admin) */
function PatientCard({ pid, onBack }) {
  const [card, setCard] = useState(null)
  const [hist, setHist] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    async function load(key) {
      const r = await fetch('/api/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, param: String(pid) }) })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      return d.rows || []
    }
    Promise.all([load('patCard'), load('patHistory')])
      .then(([c, h]) => { setCard(c[0] || null); setHist(h) })
      .catch(e => setErr(e.message))
  }, [pid])
  const c = card || {}
  return (
    <div className="panel" style={{ marginBottom: 20, borderColor: 'var(--brand)' }}>
      <div className="panel-head">
        <h3>Картка пацієнта</h3>
        <button className="btn-secondary" onClick={onBack} style={{ padding: '4px 10px' }}>← Пошук</button>
      </div>
      {err && <div style={{ color: 'var(--brand)', fontSize: 13, fontFamily: 'var(--mono)' }}>{err}</div>}
      {!card && !err && <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 13 }}>завантаження…</div>}
      {card && (
        <>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 20, color: 'var(--text)', marginBottom: 8 }}>{c.піб}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)', lineHeight: 1.9 }}>
              <span style={{ marginRight: 18 }}>Вік: {c.вік ?? '—'}</span>
              <span style={{ marginRight: 18 }}>Стать: {c.стать || '—'}</span>
              <span style={{ marginRight: 18 }}>Нар.: {c.дата_нар || '—'}</span>
              <span>Тел.: {c.телефон || '—'}</span><br />
              <span>{[c.нп, c.район, c.область].filter(Boolean).join(' · ') || '—'}</span>
            </div>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Історія госпіталізацій {hist ? `(${hist.length})` : ''}
          </div>
          <div className="table-wrap">
            <table className="dtable">
              <thead><tr><th>Поступив</th><th>Виписаний</th><th>Діагноз</th><th>Відділення</th><th>Статус</th><th style={{ textAlign: 'right' }}>ЛД</th></tr></thead>
              <tbody>
                {!hist && <tr><td colSpan={6} style={{ color: 'var(--text3)' }}>завантаження…</td></tr>}
                {(hist || []).map((h, i) => (
                  <tr key={i}>
                    <td>{h.поступив}</td>
                    <td style={{ color: 'var(--text2)' }}>{h.виписаний || '—'}</td>
                    <td style={{ fontWeight: 500, color: 'var(--brand)' }}>{h.діагноз}</td>
                    <td style={{ fontFamily: 'var(--sans)', color: 'var(--text2)' }}>{h.відділення}</td>
                    <td style={{ color: h.статус === 'Помер' ? 'var(--brand)' : 'var(--text2)' }}>{h.статус}</td>
                    <td style={{ textAlign: 'right' }}>{h.ліжкодень ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

/* ПАЦІЄНТИ — демографія за статтю і віком */
function PatientsPage({ role }) {
  const { rows, err } = useStat('wPat')
  const byAge = useMemo(() => {
    if (!rows) return []
    const m = {}
    rows.forEach(r => { m[r.вік] = (m[r.вік] || 0) + Number(r.випадків) })
    return Object.entries(m).map(([вік, n]) => ({ вік, n })).sort((a, b) => a.вік.localeCompare(b.вік))
  }, [rows])
  const maxAge = byAge.length ? Math.max(...byAge.map(a => a.n)) : 1
  const totals = useMemo(() => {
    if (!rows) return { ч: 0, ж: 0 }
    let ч = 0, ж = 0
    rows.forEach(r => { if (r.стать === 'Ч') ч += Number(r.випадків); if (r.стать === 'Ж') ж += Number(r.випадків) })
    return { ч, ж }
  }, [rows])
  const totalSex = (totals.ч + totals.ж) || 1
  return (
    <>
      <PageHead crumb="Аналітика · Пацієнти" title="Демографія пацієнтів" />
      <div className="dash-content">
        {role === 'admin' && <PatientSearch />}
        {err && <div className="panel" style={{ borderColor: 'var(--brand)', color: 'var(--brand)', marginBottom: 16 }}>Помилка: {err}</div>}
        <div className="chart-row">
          <div className="panel">
            <div className="panel-head"><h3>Розподіл за віком</h3><span className="filter">випадків</span></div>
            <div className="dept-list">
              {!rows && <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12 }}>завантаження…</div>}
              {byAge.map(a => (
                <div key={a.вік} className="dept-row">
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 500, color: 'var(--text)', width: 64 }}>{a.вік}</span>
                  <span className="bar-wrap" style={{ flex: 1 }}><span className="bar-fill" style={{ width: `${(a.n / maxAge) * 100}%`, background: a.n === maxAge ? 'var(--brand)' : 'var(--text)' }} /></span>
                  <span className="pct" style={{ width: 64 }}>{fmt(a.n)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Стать</h3><span className="filter">{fmt(totalSex)}</span></div>
            {[{ l: 'Чоловіча', v: totals.ч, c: 'var(--text)' }, { l: 'Жіноча', v: totals.ж, c: 'var(--text2)' }].map((row, i) => (
              <div key={i} style={{ marginTop: i ? 18 : 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 12, marginBottom: 6 }}>
                  <span>{row.l}</span><span>{((row.v / totalSex) * 100).toFixed(1)}%</span>
                </div>
                <div style={{ height: 10, background: 'var(--bg2)', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${(row.v / totalSex) * 100}%`, height: '100%', background: row.c }} /></div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{fmt(row.v)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

/* ПІКИ — години + дні тижня */
function PeaksPage() {
  const { rows: hours } = useStat('ovHours')
  const { rows: dow } = useStat('wWeekday')
  const maxH = hours && hours.length ? Math.max(...hours.map(h => Number(h.випадків))) : 1
  const peakH = hours && hours.length ? hours.reduce((mi, h, i, a) => Number(h.випадків) > Number(a[mi].випадків) ? i : mi, 0) : -1
  const maxD = dow && dow.length ? Math.max(...dow.map(d => Number(d.поступлень))) : 1
  return (
    <>
      <PageHead crumb="Аналітика · Піки навантаження" title="Коли надходять пацієнти" />
      <div className="dash-content">
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-head"><h3>За годинами доби</h3>{peakH >= 0 && <span className="filter">пік {String(hours[peakH].година).padStart(2, '0')}:00</span>}</div>
          <div className="barchart">
            {(hours || []).map((h, i) => (
              <div key={i} className={`bar${i === peakH ? ' peak' : ''}`} style={{ height: `${(Number(h.випадків) / maxH) * 100}%` }}
                title={`${String(h.година).padStart(2, '0')}:00 · ${fmt(h.випадків)}`} />
            ))}
          </div>
          <div className="barchart-x">{(hours || []).map((h, i) => <span key={i}>{i % 4 === 0 ? String(h.година).padStart(2, '0') : ''}</span>)}</div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>За днями тижня</h3><span className="filter">випадків</span></div>
          <div className="dept-list">
            {!dow && <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12 }}>завантаження…</div>}
            {(dow || []).map(d => (
              <div key={d.день} className="dept-row">
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 500, color: 'var(--text)', width: 90 }}>{d.назва}</span>
                <span className="bar-wrap" style={{ flex: 1 }}><span className="bar-fill" style={{ width: `${(Number(d.поступлень) / maxD) * 100}%`, background: Number(d.поступлень) === maxD ? 'var(--brand)' : 'var(--text)' }} /></span>
                <span className="pct" style={{ width: 64 }}>{fmt(d.поступлень)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

/* УРГЕНТНІСТЬ — екстрені vs планові по відділеннях */
function UrgencyPage() {
  const { rows, err } = useStat('wUrgency')
  return (
    <>
      <PageHead crumb="Аналітика · Ургентність" title="Екстрені vs планові" />
      <div className="dash-content">
        {err && <div className="panel" style={{ borderColor: 'var(--brand)', color: 'var(--brand)', marginBottom: 16 }}>Помилка: {err}</div>}
        <div className="table-wrap">
          <table className="dtable">
            <thead><tr>
              <th>Відділення</th>
              <th style={{ textAlign: 'right' }}>Екстрених</th>
              <th style={{ textAlign: 'right' }}>Планових</th>
              <th style={{ minWidth: 160 }}>Частка екстрених</th>
            </tr></thead>
            <tbody>
              {!rows && <tr><td colSpan={4} style={{ color: 'var(--text3)' }}>завантаження…</td></tr>}
              {rows && rows.map((r, i) => {
                const u = Number(r.ургентних), p = Number(r.планових), tot = (u + p) || 1
                const pct = (u / tot) * 100
                return (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--sans)' }}>{r.відділення}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(u)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{fmt(p)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--bg2)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand)' }} /></div>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', width: 44, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/* ДІАГНОЗИ МКХ — топ-20 кодів */
function DiagnosesPage() {
  const { rows, err } = useStat('wDiag')
  const max = rows && rows.length ? Math.max(...rows.map(r => Number(r.випадків))) : 1
  return (
    <>
      <PageHead crumb="Аналітика · Діагнози МКХ-10" title="Топ діагнозів" />
      <div className="dash-content">
        {err && <div className="panel" style={{ borderColor: 'var(--brand)', color: 'var(--brand)', marginBottom: 16 }}>Помилка: {err}</div>}
        <div className="panel">
          <div className="panel-head"><h3>Топ-20 кодів МКХ-10</h3><span className="filter">за всі роки</span></div>
          <div className="dept-list">
            {!rows && <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12 }}>завантаження…</div>}
            {(rows || []).map((r, i) => (
              <div key={i} className="dept-row" style={{ alignItems: 'flex-start' }}>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 500, color: 'var(--brand)', width: 64 }}>{r.код}</span>
                <span className="name" style={{ flex: '1 1 auto', whiteSpace: 'normal', lineHeight: 1.4 }}>{r.діагноз}</span>
                <span className="bar-wrap" style={{ width: 120, marginTop: 5 }}><span className="bar-fill" style={{ width: `${(Number(r.випадків) / max) * 100}%` }} /></span>
                <span className="pct" style={{ width: 56, marginTop: 2 }}>{fmt(r.випадків)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

/* ЛІКАРІ — топ-20 за обсягом */
function DoctorsPage() {
  const { rows, err } = useStat('wDoctors')
  const [selected, setSelected] = useState(null)
  if (selected) return <DocCard name={selected} onBack={() => setSelected(null)} />
  return (
    <>
      <PageHead crumb="Аналітика · Лікарі" title="Топ лікарів за обсягом" />
      <div className="dash-content">
        {err && <div className="panel" style={{ borderColor: 'var(--brand)', color: 'var(--brand)', marginBottom: 16 }}>Помилка: {err}</div>}
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>Клікніть на лікаря для детальної картки →</div>
        <div className="table-wrap">
          <table className="dtable">
            <thead><tr>
              <th>Лікар</th>
              <th style={{ textAlign: 'right' }}>Випадків</th>
              <th style={{ textAlign: 'right' }}>Унік.</th>
              <th style={{ textAlign: 'right' }}>З поліпш.</th>
              <th style={{ textAlign: 'right' }}>Померло</th>
              <th style={{ textAlign: 'right' }}>Сер. ЛД</th>
            </tr></thead>
            <tbody>
              {!rows && <tr><td colSpan={6} style={{ color: 'var(--text3)' }}>завантаження…</td></tr>}
              {(rows || []).map((r, i) => (
                <tr key={i} onClick={() => setSelected(r.лікар)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontFamily: 'var(--sans)', fontWeight: 500, color: 'var(--brand)' }}>{r.лікар}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.випадків)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{fmt(r.унікальних)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--green)' }}>{fmt(r.поліпшення)}</td>
                  <td style={{ textAlign: 'right', color: Number(r.померло) > 50 ? 'var(--brand)' : 'var(--text2)' }}>{fmt(r.померло)}</td>
                  <td style={{ textAlign: 'right' }}>{r.ліжкодень}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/* КАРТКА ЛІКАРЯ — профіль + топ-діагнози */
function DocCard({ name, onBack }) {
  const [prof, setProf] = useState(null)
  const [diag, setDiag] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    async function load(key) {
      const r = await fetch('/api/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, param: name }) })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      return d.rows || []
    }
    Promise.all([load('docProfile'), load('docDiag')])
      .then(([p, dg]) => { setProf(p[0] || null); setDiag(dg) })
      .catch(e => setErr(e.message))
  }, [name])
  const p = prof || {}
  const maxDiag = diag && diag.length ? Math.max(...diag.map(d => Number(d.випадків))) : 1
  return (
    <>
      <PageHead crumb="Аналітика · Лікарі" title={name}
        right={<button className="btn-secondary" onClick={onBack}>← Усі лікарі</button>} />
      <div className="dash-content">
        {err && <div className="panel" style={{ borderColor: 'var(--brand)', color: 'var(--brand)', marginBottom: 16 }}>Помилка: {err}</div>}
        {!prof && !err && <div className="panel" style={{ color: 'var(--text3)' }}>завантаження…</div>}
        {prof && (
          <>
            <div className="kpi-row">
              <div className="kpi"><div className="lbl">Випадків</div><div className="val">{fmt(p.випадків)}</div><div className="delta">{fmt(p.унікальних)} унікальних</div></div>
              <div className="kpi"><div className="lbl">З поліпшенням</div><div className="val">{fmt(p.поліпшення)}</div><div className="delta">померло {fmt(p.померло)}</div></div>
              <div className="kpi"><div className="lbl">Сер. ліжко-день</div><div className="val">{p.ліжкодень}</div><div className="delta">денних {fmt(p.денних)} · нічних {fmt(p.нічних)}</div></div>
              <div className="kpi"><div className="lbl">Вихідних</div><div className="val">{fmt(p.вихідних)}</div><div className="delta">{p.перший} → {p.останній}</div></div>
            </div>
            <div className="panel">
              <div className="panel-head"><h3>Топ-діагнози лікаря</h3><span className="filter">з doctor_diagnoses</span></div>
              <div className="dept-list">
                {!diag && <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12 }}>завантаження…</div>}
                {(diag || []).map((d, i) => (
                  <div key={i} className="dept-row" style={{ alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 500, color: 'var(--brand)', width: 56 }}>{d.код}</span>
                    <span className="name" style={{ flex: '1 1 auto', whiteSpace: 'normal', lineHeight: 1.4 }}>{d.діагноз}</span>
                    <span className="bar-wrap" style={{ width: 90, marginTop: 5 }}><span className="bar-fill" style={{ width: `${(Number(d.випадків) / maxDiag) * 100}%` }} /></span>
                    <span className="pct" style={{ width: 48, marginTop: 2 }}>{fmt(d.випадків)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

/* НІЧНІ ЗМІНИ — день vs ніч */
function NightPage() {
  const { rows, err } = useStat('wNight')
  const total = rows ? rows.reduce((s, r) => s + Number(r.випадків), 0) : 0
  return (
    <>
      <PageHead crumb="Аналітика · Нічні зміни" title="Денні vs нічні" />
      <div className="dash-content">
        {err && <div className="panel" style={{ borderColor: 'var(--brand)', color: 'var(--brand)', marginBottom: 16 }}>Помилка: {err}</div>}
        {!rows && <div className="panel" style={{ color: 'var(--text3)' }}>завантаження…</div>}
        {rows && (
          <>
            <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              {rows.map((r, i) => (
                <div key={i} className="kpi">
                  <div className="lbl">{r.період}</div>
                  <div className="val">{fmt(r.випадків)}</div>
                  <div className={`delta${r.період === 'Ніч' ? ' down' : ''}`}>{total ? ((Number(r.випадків) / total) * 100).toFixed(1) : 0}% · летальність {r.летальність}%</div>
                </div>
              ))}
              <div className="kpi">
                <div className="lbl">Контраст летальності</div>
                <div className="val" style={{ color: 'var(--brand)' }}>
                  {rows.length === 2 ? `×${(Number(rows.find(r => r.період === 'Ніч')?.летальність || 0) / Number(rows.find(r => r.період === 'День')?.летальність || 1)).toFixed(1)}` : '—'}
                </div>
                <div className="delta">ніч проти дня</div>
              </div>
            </div>
            <div className="panel">
              <div className="panel-head"><h3>Розподіл за змінами</h3><span className="filter">{fmt(total)} всього</span></div>
              {rows.map((r, i) => {
                const pct = total ? (Number(r.випадків) / total) * 100 : 0
                return (
                  <div key={i} style={{ marginTop: i ? 16 : 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 13, marginBottom: 6 }}>
                      <span style={{ color: r.період === 'Ніч' ? 'var(--brand)' : 'var(--text)', fontWeight: 500 }}>{r.період}</span>
                      <span>{pct.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 12, background: 'var(--bg2)', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: r.період === 'Ніч' ? 'var(--brand)' : 'var(--text)' }} /></div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>{fmt(r.випадків)} випадків · ліжко-день {r.ліжкодень} · померло {fmt(r.померло)}</div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}

/* ОПЕРАЦІЇ — обсяг по відділеннях */
function OperationsPage() {
  const { rows, err } = useStat('wOps')
  const totalOps = rows ? rows.reduce((s, r) => s + Number(r.операцій), 0) : 0
  const max = rows && rows.length ? Math.max(...rows.map(r => Number(r.операцій))) : 1
  return (
    <>
      <PageHead crumb="Аналітика · Операції" title="Операційна активність" />
      <div className="dash-content">
        {err && <div className="panel" style={{ borderColor: 'var(--brand)', color: 'var(--brand)', marginBottom: 16 }}>Помилка: {err}</div>}
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          <div className="kpi"><div className="lbl">Операційних кейсів</div><div className="val">{fmt(totalOps)}</div><div className="delta">по всіх відділеннях</div></div>
          <div className="kpi"><div className="lbl">Хір. відділень</div><div className="val">{rows ? rows.length : '…'}</div><div className="delta">з операціями</div></div>
          <div className="kpi"><div className="lbl">Лідер</div><div className="val" style={{ fontSize: 18 }}>{rows && rows[0] ? rows[0].відділення.split(' ').slice(0, 2).join(' ') : '…'}</div><div className="delta">{rows && rows[0] ? `${fmt(rows[0].операцій)} операцій` : ''}</div></div>
        </div>
        <div className="table-wrap">
          <table className="dtable">
            <thead><tr>
              <th>Відділення</th>
              <th style={{ textAlign: 'right' }}>Операцій</th>
              <th style={{ textAlign: 'right' }}>Випадків</th>
              <th style={{ textAlign: 'right' }}>Хір. активність</th>
              <th style={{ minWidth: 110 }}>Обсяг</th>
            </tr></thead>
            <tbody>
              {!rows && <tr><td colSpan={5} style={{ color: 'var(--text3)' }}>завантаження…</td></tr>}
              {(rows || []).map((r, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'var(--sans)' }}>{r.відділення}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.операцій)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{fmt(r.випадків)}</td>
                  <td style={{ textAlign: 'right' }}>{r.хір_активність}%</td>
                  <td><div style={{ height: 6, background: 'var(--bg2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${(Number(r.операцій) / max) * 100}%`, height: '100%', background: 'var(--text)' }} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/* ГЕОГРАФІЯ — топ районів за пацієнтами (живі дані v_region_stats) */
function GeographyPage() {
  const { rows, err } = useStat('wGeo')
  const max = rows && rows.length ? Math.max(...rows.map(r => Number(r.пацієнтів))) : 1
  const totalPat = rows ? rows.reduce((s, r) => s + Number(r.пацієнтів), 0) : 0
  return (
    <>
      <PageHead crumb="Аналітика · Географія" title="Звідки пацієнти" />
      <div className="dash-content">
        {err && <div className="panel" style={{ borderColor: 'var(--brand)', color: 'var(--brand)', marginBottom: 16 }}>Помилка: {err}</div>}
        <div className="panel">
          <div className="panel-head"><h3>Топ-25 районів за кількістю пацієнтів</h3><span className="filter">{fmt(totalPat)} у вибірці</span></div>
          <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="dtable">
              <thead><tr>
                <th>Область</th>
                <th>Район</th>
                <th style={{ textAlign: 'right' }}>Пацієнтів</th>
                <th style={{ textAlign: 'right' }}>Випадків</th>
                <th style={{ textAlign: 'right' }}>Ліжко-день</th>
                <th style={{ minWidth: 120 }}>Обсяг</th>
              </tr></thead>
              <tbody>
                {!rows && <tr><td colSpan={6} style={{ color: 'var(--text3)' }}>завантаження…</td></tr>}
                {(rows || []).map((r, i) => {
                  const cher = r.область === 'Чернівецька'
                  return (
                    <tr key={i}>
                      <td style={{ fontFamily: 'var(--sans)', color: cher ? 'var(--text)' : 'var(--text2)' }}>{r.область}</td>
                      <td style={{ fontFamily: 'var(--sans)', color: 'var(--text2)' }}>{r.район}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.пацієнтів)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{fmt(r.випадків)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{r.ліжкодень}</td>
                      <td><div style={{ height: 6, background: 'var(--bg2)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${(Number(r.пацієнтів) / max) * 100}%`, height: '100%', background: cher ? 'var(--brand)' : 'var(--text)' }} /></div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel" style={{ marginTop: 16, padding: 16, background: 'var(--bg2)' }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
            Дані з <code style={{ fontFamily: 'var(--mono)' }}>v_region_stats</code> (область + район). Інтерактивна карта з геокодуванням населених пунктів — у наступній ітерації.</p>
        </div>
      </div>
    </>
  )
}

/* ЗВІТИ — інформаційна сторінка */
function ReportsPage() {
  return (
    <>
      <PageHead crumb="Інструменти · Звіти" title="Звіти" />
      <div className="dash-content">
        <div className="panel" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 24, color: 'var(--text3)', marginBottom: 10 }}>Σ</div>
          <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, maxWidth: 460, margin: '0 auto' }}>
            Експорт у CSV/PDF, шаблони МОЗ та заплановані звіти на пошту — у розробці. Поки що звіти можна формувати через <strong>AI Асистент</strong> природною мовою.</p>
        </div>
      </div>
    </>
  )
}

/* НАЛАШТУВАННЯ — інфраструктура (з реального стану) */
function SettingsPage() {
  const rows = [
    ['Supabase PostgreSQL', 'підключено', 'таблиці + аналітичні view · eu-west-1'],
    ['AI Асистент', 'активний', 'Groq (безкоштовно) · Gemini · OpenAI · Anthropic'],
    ['Авторизація', 'увімкнено', 'Supabase Auth · ролі через app_users'],
    ['Хостинг', 'Vercel', 'гілка design-medychna (preview)'],
  ]
  return (
    <>
      <PageHead crumb="Інструменти · Налаштування" title="Інфраструктура" />
      <div className="dash-content">
        <div className="table-wrap">
          <table className="dtable">
            <thead><tr><th>Компонент</th><th>Статус</th><th>Опис</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{r[0]}</td>
                  <td><span style={{ display: 'inline-block', padding: '2px 8px', background: 'var(--brand-soft)', color: 'var(--brand)', borderRadius: 4, fontSize: 10, fontWeight: 500, letterSpacing: '0.05em', fontFamily: 'var(--mono)' }}>{r[1]}</span></td>
                  <td style={{ color: 'var(--text2)' }}>{r[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/* AI АСИСТЕНТ — робочий чат (логіка збережена) у стилі дашборду */
const ALL_EXAMPLES = [
  'Загальна статистика лікарні','Показники по напрямках','Скільки всього госпіталізацій',
  'Летальність по відділеннях','Топ 10 діагнозів','Летальність реанімації',
  'Покажи всіх хірургів','Статистика хірургічного відділення','Картка пацієнта (введіть ПІБ)',
]
const DOCTOR_EXAMPLES = [
  'Скільки пацієнтів я пролікував за 2024','Летальність моїх пацієнтів','Мої випадки інсульту за 2024',
  'Скільки діб чергування у мене за 2024','Загальна статистика лікарні','Топ 10 діагнозів',
]

function AsystentTab({ role }) {
  const router = useRouter()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  // Pre-fill from URL ?q= param (перехресне посилання з /org)
  useEffect(() => {
    const q = router.query?.q
    if (q && messages.length === 0) setInput(decodeURIComponent(q))
  }, [router.query?.q])

  async function send(q) {
    if (!q.trim() || loading) return
    setInput(''); setLoading(true)
    setMessages(prev => [...prev, { role: 'user', content: q }])
    try {
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history, provider: 'groq' }) })
      const data = await res.json()
      if (data.error) setMessages(prev => [...prev, { role: 'assistant', error: data.error }])
      else setMessages(prev => [...prev, { role: 'assistant', explanation: data.explanation, rows: data.rows || [] }])
    } catch (e) { setMessages(prev => [...prev, { role: 'assistant', error: e.message }]) }
    setLoading(false)
  }
  const examples = role === 'doctor' ? DOCTOR_EXAMPLES : ALL_EXAMPLES

  return (
    <>
      <div className="dash-header">
        <div><div className="crumbs">Інструменти · AI Асистент</div><h1>Запитайте дані звичайною мовою</h1></div>
      </div>
      <div className="dash-content" style={{ display: 'flex', flexDirection: 'column' }}>
        {messages.length === 0 ? (
          <div>
            <div className="panel" style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>
                Сформулюйте запит природною мовою — статистика, відділення, діагнози, пацієнти.</p>
            </div>
            <div className="dept-list" style={{ gap: 8 }}>
              {examples.map((ex, i) => (
                <button key={i} onClick={() => send(ex)} style={{ textAlign: 'left', padding: '11px 14px',
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
                  fontSize: 13, color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--sans)' }}>{ex}</button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
            {messages.map((m, i) => m.role === 'user' ? (
              <div key={i} style={{ alignSelf: 'flex-end', background: 'var(--accent-bg)', color: 'var(--accent-text)',
                padding: '10px 16px', borderRadius: '18px 18px 4px 18px', fontSize: 14, maxWidth: '70%' }}>{m.content}</div>
            ) : (
              <div key={i}>
                {m.error ? (
                  <div className="panel" style={{ borderColor: 'var(--brand)', color: 'var(--brand)', fontSize: 13 }}>{m.error}</div>
                ) : (
                  <>
                    {m.explanation && <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 8, fontFamily: 'var(--mono)' }}>{m.explanation}</div>}
                    <ResultTable rows={m.rows} />
                  </>
                )}
              </div>
            ))}
            {loading && <div style={{ color: 'var(--text3)', fontSize: 13, fontFamily: 'var(--mono)' }}>обробка…</div>}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
      <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', padding: '16px 32px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send(input)}
            placeholder="Запитайте про дані лікарні…" style={{ flex: 1, fontFamily: 'var(--sans)', fontSize: 14,
              padding: '11px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', outline: 'none' }} />
          <button onClick={() => send(input)} disabled={loading || !input.trim()}
            style={{ background: 'var(--brand)', color: '#fff', border: 0, borderRadius: 8, padding: '0 18px',
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.4 : 1, fontFamily: 'var(--mono)' }}>→</button>
        </div>
      </div>
    </>
  )
}

/* Таблиця результату чату — стиль дашборду */
function ResultTable({ rows }) {
  if (!rows || rows.length === 0) return <div style={{ color: 'var(--text3)', fontSize: 13, fontFamily: 'var(--mono)' }}>Немає даних</div>
  const cols = Object.keys(rows[0])
  if (rows.length === 1 && cols.length === 1) {
    return <div className="kpi" style={{ display: 'inline-block', minWidth: 200 }}>
      <div className="lbl">{cols[0].replace(/_/g, ' ')}</div><div className="val">{fmt(rows[0][cols[0]])}</div></div>
  }
  return (
    <div className="table-wrap">
      <table className="dtable">
        <thead><tr>{cols.map(c => { const num = typeof rows[0][c] === 'number'
          return <th key={c} style={{ textAlign: num ? 'right' : 'left' }}>{c.replace(/_/g, ' ')}</th> })}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}>{cols.map(c => { const num = typeof r[c] === 'number'
            return <td key={c} style={{ textAlign: num ? 'right' : 'left' }}>{num ? fmt(r[c]) : (r[c] ?? '—')}</td> })}</tr>)}
        </tbody>
      </table>
      <div style={{ padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', borderTop: '1px solid var(--border)' }}>{rows.length} записів</div>
    </div>
  )
}

/* HOME — оболонка дашборду */
export default function Home() {
  const router = useRouter()
  const supabase = useMemo(() => (typeof window !== 'undefined' ? createClient() : null), [])
  const [active, setActive] = useState('overview')
  const [role, setRole] = useState(null)
  const [me, setMe] = useState(null)

  useEffect(() => { fetch('/api/me').then(r => r.json()).then(d => { setRole(d.role); setMe(d) }).catch(() => {}) }, [])
  async function handleLogout() { await supabase?.auth.signOut(); router.push('/login') }

  return (
    <>
      <Head><title>ЛСМД — Дашборд лікарні</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <style jsx global>{DASH_CSS}</style>
      <div className="dashboard">
        <Sidebar active={active} setActive={setActive} me={me} role={role} onLogout={handleLogout} />
        <div className="dash-main">
          {active === 'overview' && <OverviewPage />}
          {active === 'departments' && <DepartmentsPage />}
          {active === 'diagnoses' && <DiagnosesPage />}
          {active === 'doctors' && <DoctorsPage />}
          {active === 'patients' && <PatientsPage role={role} />}
          {active === 'geography' && <GeographyPage />}
          {active === 'peaks' && <PeaksPage />}
          {active === 'night' && <NightPage />}
          {active === 'urgency' && <UrgencyPage />}
          {active === 'operations' && <OperationsPage />}
          {active === 'reports' && <ReportsPage />}
          {active === 'settings' && <SettingsPage />}
          {active === 'asystent' && <AsystentTab role={role} />}
        </div>
      </div>
    </>
  )
}
