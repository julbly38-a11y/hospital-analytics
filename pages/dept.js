import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const SANS = { fontFamily: '"IBM Plex Sans", sans-serif' }
const MONO = { fontFamily: '"IBM Plex Mono", monospace' }

const PIE_COLORS = ['#4e9af1', '#6dd5c0', '#f7c948', '#e86a4e', '#a78bfa']

async function fetchStats(key, param) {
  const r = await fetch('/api/stats', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(param !== undefined ? { key, param } : { key }),
  })
  const d = await r.json()
  return d.rows || []
}

function fmt(v, suffix = '') {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return isNaN(n) ? '—' : n.toLocaleString('uk') + suffix
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
}

/* ── Same Stat as index.js ───────────────────────────── */
function Stat({ value, label, large }) {
  return (
    <div>
      <div style={{ fontSize: large ? 52 : 32, fontWeight: 300, color: '#1a1a1a', ...MONO, lineHeight: 1, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {label && (
        <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 6, ...MONO }}>
          {label}
        </div>
      )}
    </div>
  )
}

/* ── Dept selector ───────────────────────────────────── */
function DeptSelector({ depts, onSelect }) {
  return (
    <div style={{ padding: '32px 40px', maxWidth: 640 }}>
      <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 14 }}>Оберіть відділення</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {depts.map(d => (
          <button key={d.відділення} onClick={() => onSelect(d.відділення)} style={{
            textAlign: 'left', padding: '11px 18px',
            background: 'rgba(255,255,255,0.55)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            transition: 'background .12s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.8)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.55)'}
          >
            <span style={{ fontSize: 13, color: '#1a1a1a', ...SANS }}>{d.відділення}</span>
            <span style={{ fontSize: 10, color: '#999', ...MONO }}>{fmt(d.випадків)} випадків</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Main page ───────────────────────────────────────── */
export default function DeptPage() {
  const router = useRouter()
  const [me, setMe]               = useState(null)
  const [hospitalKpi, setHospitalKpi] = useState(null)
  const [doctorCnt, setDoctorCnt] = useState(null)
  const [allDepts, setAllDepts]   = useState([])
  const [allYears, setAllYears]   = useState([])
  const [chartYear, setChartYear] = useState('all')

  const [selDept, setSelDept]     = useState(null)
  const [loading, setLoading]     = useState(false)

  const [deptProfile, setDeptProfile] = useState(null)
  const [deptHead, setDeptHead]   = useState(null)
  const [deptToday, setDeptToday] = useState(null)
  const [deptIcd, setDeptIcd]     = useState([])
  const [deptDocs, setDeptDocs]   = useState([])

  /* Initial load */
  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(d => {
      setMe(d)
      if (d?.role === 'head_dept' && d?.department) setSelDept(d.department)
    }).catch(() => {})

    fetchStats('doctorCount').then(rows => setDoctorCnt(rows[0]?.cnt ?? null))
    fetchStats('allYears').then(rows => setAllYears(rows.map(r => r.year).filter(Boolean)))
    fetchStats('wDept').then(rows => setAllDepts(rows))
  }, [])

  /* URL param */
  useEffect(() => {
    const p = router.query?.dept
    if (p && !selDept) setSelDept(p)
  }, [router.query?.dept])

  /* KPI by year */
  useEffect(() => {
    setHospitalKpi(null)
    fetchStats('ovKpiYear', chartYear === 'all' ? 'all' : String(chartYear))
      .then(rows => setHospitalKpi(rows[0] || null))
  }, [chartYear])

  /* Dept data — перезавантажується при зміні відділення АБО року */
  useEffect(() => {
    if (!selDept) {
      setDeptProfile(null); setDeptHead(null); setDeptToday(null)
      setDeptIcd([]); setDeptDocs([])
      return
    }
    setLoading(true)
    const y = chartYear === 'all' ? 'all' : String(chartYear)
    Promise.all([
      fetchStats('deptProfileYear', `${selDept}|${y}`),
      fetchStats('deptHead', selDept),
      fetchStats('deptToday', selDept),
      fetchStats('deptIcdPieYear', `${selDept}|${y}`),
      fetchStats('deptDocs2', selDept),
    ]).then(([prof, head, today, icd, docs]) => {
      setDeptProfile(prof[0] || null)
      setDeptHead(head[0] || null)
      setDeptToday(today[0] || null)
      setDeptIcd(icd)
      setDeptDocs(docs)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [selDept, chartYear])

  const headDoc = deptDocs.find(d => d.посада?.toLowerCase().includes('завідувач'))
  const ordDocs = deptDocs.filter(d => !d.посада?.toLowerCase().includes('завідувач'))

  /* Особиста статистика завідувача */
  const [headCabinet, setHeadCabinet] = useState(null)
  useEffect(() => {
    if (!headDoc?.emp_name) { setHeadCabinet(null); return }
    fetch(`/api/cabinet?emp=${encodeURIComponent(headDoc.emp_name)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setHeadCabinet(d))
      .catch(() => {})
  }, [headDoc?.emp_name])

  return (
    <>
      <Head>
        <title>ЛСМД · Кабінет відділення</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', background: '#eeeae4', ...SANS }}>

        {/* ══ ВЕРХНЯ ЗОНА: градієнт + рік + статистика ══ */}
        <div style={{
          background: 'linear-gradient(135deg, #cfe0ea 0%, #ddd0e8 30%, #eaddd0 60%, #d0e8da 100%)',
          position: 'relative', overflow: 'hidden',
          padding: '0 40px',
        }}>
          <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: 400, height: 400, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: '-20%', right: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />

          {/* Лого + назва + навігація */}
          <div style={{ position: 'relative', zIndex: 1, paddingTop: 28, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 22, color: '#c0392b', ...MONO, lineHeight: 1 }}>+</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', letterSpacing: '0.06em', ...MONO }}>ЛСМД</div>
              <div style={{ fontSize: 10, color: '#666', marginTop: 1, ...SANS }}>Кабінет відділення</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {me?.role === 'admin' && (
                <button onClick={() => router.push('/org')} style={{
                  background: 'rgba(0,0,0,0.08)', border: 'none', borderRadius: 8,
                  padding: '5px 14px', cursor: 'pointer', fontSize: 11, color: '#444', ...MONO,
                }}>← Структура</button>
              )}
              <button onClick={() => router.push('/')} style={{
                background: 'rgba(0,0,0,0.08)', border: 'none', borderRadius: 8,
                padding: '5px 14px', cursor: 'pointer', fontSize: 11, color: '#444', ...MONO,
              }}>← Головна</button>
            </div>
          </div>

          {/* Перемикач року */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 4, marginBottom: 16 }}>
            <button onClick={() => setChartYear('all')} style={{
              padding: '3px 12px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.15)',
              background: chartYear === 'all' ? 'rgba(0,0,0,0.12)' : 'transparent',
              fontSize: 10, cursor: 'pointer', ...MONO, color: '#444',
            }}>Всі</button>
            {allYears.map(y => (
              <button key={y} onClick={() => setChartYear(y)} style={{
                padding: '3px 12px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.15)',
                background: chartYear === y ? 'rgba(0,0,0,0.12)' : 'transparent',
                fontSize: 10, cursor: 'pointer', ...MONO, color: '#444',
              }}>{y}</button>
            ))}
          </div>

          {/* Лікарняні показники */}
          <div style={{
            position: 'relative', zIndex: 1,
            display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap',
            gap: '16px 32px', paddingBottom: 28,
          }}>
            <Stat value={hospitalKpi ? fmt(hospitalKpi.total_cases)      : '…'} label="ГОСПІТАЛІЗАЦІЙ" />
            <Stat value={hospitalKpi ? fmt(hospitalKpi.unique_patients)  : '…'} label="ПАЦІЄНТІВ" />
            <Stat value={doctorCnt != null ? fmt(doctorCnt)              : '…'} label="ЛІКАРІВ" />
            <Stat value={allDepts.length || '…'}                                label="ВІДДІЛЕНЬ" />
            <Stat value={hospitalKpi ? fmt(hospitalKpi.death_rate_pct, '%') : '…'} label="ЛЕТАЛЬНІСТЬ" />
            <Stat value={chartYear === 'all' ? 'Всі' : String(chartYear)} large />
          </div>
        </div>

        {/* ══ КОНТЕНТ ══ */}
        <div style={{ padding: '28px 40px' }}>

          {/* Без відділення — вибір */}
          {!selDept && <DeptSelector depts={allDepts} onSelect={setSelDept} />}

          {/* З відділенням — кабінет */}
          {selDept && (
            <div>

              {/* Рядок 1: назва + head + 4 stats | сьогодні + клінічні */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>

                {/* Ліво: назва + статистика */}
                <div style={{
                  flex: '0 0 auto', width: 'min(55%, 600px)',
                  background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: 14, padding: '22px 28px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', lineHeight: 1.3, ...SANS }}>{selDept}</div>
                      <div style={{ fontSize: 11, color: '#666', marginTop: 5, ...MONO }}>
                        Завідувач: {deptHead?.name || (loading ? '…' : '—')}
                      </div>
                    </div>
                    {me?.role !== 'head_dept' && (
                      <button onClick={() => setSelDept(null)} style={{
                        fontSize: 10, color: '#888', background: 'rgba(0,0,0,0.06)',
                        border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', ...MONO,
                      }}>змінити ▾</button>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 0 }}>
                    {[
                      { label: 'ВИПАДКІВ',  value: fmt(deptProfile?.випадків) },
                      { label: 'ПАЦІЄНТІВ', value: fmt(deptProfile?.унікальних) },
                      { label: 'ЛІЖОК',     value: deptHead?.beds ? fmt(deptHead.beds) : '—' },
                      { label: 'ЛІКАРІВ',   value: deptHead?.doctors ? fmt(deptHead.doctors) : '—' },
                    ].map((s, i) => (
                      <div key={i} style={{ flex: 1, padding: '0 16px', borderLeft: i > 0 ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
                        <div style={{ fontSize: 28, fontWeight: 300, color: '#2563eb', ...MONO, lineHeight: 1 }}>
                          {loading ? '…' : s.value}
                        </div>
                        <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4, ...MONO }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Право: сьогодні + клінічні */}
                <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 12 }}>

                  {/* Сьогодні */}
                  <div style={{
                    background: 'rgba(26,39,68,0.88)', backdropFilter: 'blur(8px)',
                    borderRadius: 14, padding: '16px 24px', color: '#fff',
                  }}>
                    <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.14em', ...MONO, marginBottom: 10 }}>Сьогодні</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                      <div>
                        <span style={{ fontSize: 32, fontWeight: 300, ...MONO }}>{loading ? '…' : (deptToday?.discharged ?? '—')}</span>
                        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 3, ...MONO }}>ВИПИСАНО</div>
                      </div>
                      <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.2)', fontWeight: 200 }}>/</div>
                      <div>
                        <span style={{ fontSize: 32, fontWeight: 300, ...MONO }}>{loading ? '…' : (deptToday?.admitted ?? '—')}</span>
                        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 3, ...MONO }}>ПОСТУПИЛО</div>
                      </div>
                    </div>
                  </div>

                  {/* Клінічні метрики */}
                  <div style={{
                    background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(0,0,0,0.08)',
                    borderRadius: 14, padding: '16px 24px', flex: 1,
                  }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
                      {[
                        { label: 'ЛЕТАЛЬНІСТЬ',  value: fmt(deptProfile?.летальність, '%') },
                        { label: 'ЛІЖКО-ДЕНЬ',   value: fmt(deptProfile?.ліжкодень, ' дн.') },
                        { label: 'СЕРЕДНІЙ ВІК', value: fmt(deptProfile?.середній_вік, ' р.') },
                        { label: 'ПОЛІПШЕННЯ',   value: fmt(deptProfile?.поліпшення) },
                        { label: 'ПОВТОРНІ',     value: fmt(deptProfile?.повторні) },
                      ].map((s, i) => (
                        <div key={i} style={{ flex: '1 1 30%', padding: '8px 12px 8px 0' }}>
                          <div style={{ fontSize: 20, fontWeight: 300, color: '#1a1a1a', ...MONO, lineHeight: 1 }}>
                            {loading ? '…' : s.value}
                          </div>
                          <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.09em', marginTop: 3, ...MONO }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Рядок 2: ординаторська + donut + стать */}
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>

                {/* Ординаторська */}
                <div style={{
                  width: 210, flexShrink: 0,
                  background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: 14, padding: '20px 22px',
                }}>
                  <div style={{ fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: '0.14em', ...MONO, marginBottom: 14 }}>Ординаторська</div>

                  {headDoc && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                        background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 600, color: '#fff', ...MONO,
                      }}>{initials(headDoc.emp_name)}</div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 500, color: '#1a1a1a', lineHeight: 1.3, ...SANS }}>{headDoc.emp_name}</div>
                        <div style={{ fontSize: 9, color: '#2563eb', ...MONO, marginTop: 1 }}>завідувач</div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {ordDocs.map((d, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                          background: 'rgba(0,0,0,0.06)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 8, color: '#666', ...MONO,
                        }}>{initials(d.emp_name)}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: '#1a1a1a', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...SANS }}>{d.emp_name}</div>
                          {d.спеціалізація && d.спеціалізація !== '—' && (
                            <div style={{ fontSize: 8, color: '#888', ...MONO }}>{d.спеціалізація}</div>
                          )}
                        </div>
                      </div>
                    ))}
                    {loading && <div style={{ fontSize: 10, color: '#aaa', ...MONO }}>завантаження…</div>}
                  </div>
                </div>

                {/* Donut ICD */}
                <div style={{
                  flex: 1, minWidth: 280,
                  background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: 14, padding: '20px 24px',
                }}>
                  <div style={{ fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: '0.14em', ...MONO, marginBottom: 16 }}>Топ категорій МКХ-10</div>
                  {deptIcd.length > 0 ? (
                    <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                      <div style={{ width: 160, height: 160, flexShrink: 0 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={deptIcd} dataKey="випадків" innerRadius={44} outerRadius={72} paddingAngle={2} startAngle={90} endAngle={-270}>
                              {deptIcd.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                            </Pie>
                            <Tooltip
                              contentStyle={{ background: 'rgba(26,26,26,0.9)', border: 'none', borderRadius: 8, fontSize: 11 }}
                              formatter={(v, n, p) => [p.payload.відс + '%  (' + fmt(v) + ' випадків)', '']}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {deptIcd.map((d, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                            <div style={{ flex: 1, fontSize: 11, color: '#333', lineHeight: 1.35, ...SANS }}>{d.назва || d.код}</div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: '#2563eb', ...MONO }}>{d.відс}%</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: '#aaa', ...MONO }}>{loading ? 'завантаження…' : 'Немає даних'}</div>
                  )}
                </div>

                {/* Стать */}
                <div style={{
                  width: 180, flexShrink: 0,
                  background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: 14, padding: '20px 22px',
                }}>
                  <div style={{ fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: '0.14em', ...MONO, marginBottom: 16 }}>Стать</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 32, fontWeight: 300, color: '#c0392b', ...MONO, lineHeight: 1 }}>
                        {loading ? '…' : fmt(deptProfile?.жінки)}
                      </div>
                      <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4, ...MONO }}>ЖІНКА</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 32, fontWeight: 300, color: '#2563eb', ...MONO, lineHeight: 1 }}>
                        {loading ? '…' : fmt(deptProfile?.чоловіки)}
                      </div>
                      <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4, ...MONO }}>ЧОЛОВІК</div>
                    </div>
                  </div>
                </div>
              </div>


            {/* ── Особиста статистика завідувача ── */}
            {headCabinet && headCabinet.summary && (
              <div style={{ marginTop: 24, background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(12px)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: '20px 28px' }}>
                <div style={{ fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: '0.14em', ...MONO, marginBottom: 16 }}>
                  Статистика завідувача · {headDoc?.emp_name}
                </div>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                  {[
                    { l: 'ВСЬОГО ВИПАДКІВ',  v: fmt(headCabinet.summary['всього']) },
                    { l: 'ЗАРАЗ ЛІКУЮТЬСЯ', v: fmt(headCabinet.summary['активних']) },
                    { l: 'СЕРЕД. ЛІЖКОДЕНЬ', v: fmt(headCabinet.summary['серед_ліжкодень'], ' дн.') },
                    { l: 'УРГЕНТНИХ',        v: fmt(headCabinet.summary['ургентних']) },
                    { l: 'З ПОЛІПШЕННЯМ',    v: fmt(headCabinet.summary['поліпшення']) },
                    { l: 'ЛЕТАЛЬНІСТЬ',      v: fmt(headCabinet.summary['померло']) },
                  ].map(k => (
                    <div key={k.l}>
                      <div style={{ fontSize: 28, fontWeight: 300, color: '#2563eb', ...MONO, lineHeight: 1 }}>{k.v}</div>
                      <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4, ...MONO }}>{k.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>

          )}
        </div>
      </div>
    </>
  )
}
