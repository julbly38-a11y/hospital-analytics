import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { SANS, MONO, fmt, initials, glass } from './shared'
import { SplitBar } from './SplitBar'

const PIE_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2']

export function DeptPanel({ dept, deptProfile, deptHead, deptDocs, deptIcd, deptToday, headCabinet, loading }) {
  const headDoc = deptDocs.find(d => d.посада?.toLowerCase().includes('завідувач'))
  const ordDocs = deptDocs.filter(d => !d.посада?.toLowerCase().includes('завідувач'))
  const val = (v, suf = '') => loading ? '…' : fmt(v) + (fmt(v) !== '—' ? suf : '')

  return (
    <div style={{ position: 'relative', zIndex: 1, flex: 1, padding: '20px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', ...SANS }}>{dept}</div>

      {/* Показники відділення */}
      <div style={{ ...glass, padding: '16px 20px' }}>
        <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 12 }}>Показники відділення</div>
        <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
          {[
            { l: 'ВИПАДКІВ',    v: val(deptProfile?.випадків) },
            { l: 'ПАЦІЄНТІВ',   v: val(deptProfile?.унікальних) },
            { l: 'ЛЕТАЛЬНІСТЬ', v: val(deptProfile?.летальність, '%') },
            { l: 'ЛІЖКО-ДЕНЬ',  v: val(deptProfile?.ліжкодень, ' дн.') },
            { l: 'СЕР. ВІК',    v: val(deptProfile?.середній_вік, ' р.') },
            { l: 'ЛІЖОК',       v: deptHead?.beds ? fmt(deptHead.beds) : '—' },
          ].map((s, i) => (
            <div key={i} style={{ flex: '1 1 80px', padding: '4px 14px', borderLeft: i > 0 ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
              <div style={{ fontSize: 22, fontWeight: 300, color: '#2563eb', ...MONO, lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 7, color: '#888', textTransform: 'uppercase', letterSpacing: '0.09em', marginTop: 4, ...MONO }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Сьогодні + Ординаторська + Топ ICD */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>

        <div style={{ background: 'rgba(26,39,68,0.85)', backdropFilter: 'blur(8px)', borderRadius: 14, padding: '14px 20px', color: '#fff', minWidth: 140 }}>
          <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.14em', ...MONO, marginBottom: 8 }}>Сьогодні</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 300, ...MONO }}>{loading ? '…' : (deptToday?.discharged ?? '—')}</div>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginTop: 2, ...MONO }}>ВИПИСАНО</div>
            </div>
            <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.2)', fontWeight: 200 }}>/</div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 300, ...MONO }}>{loading ? '…' : (deptToday?.admitted ?? '—')}</div>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginTop: 2, ...MONO }}>ПОСТУПИЛО</div>
            </div>
          </div>
        </div>

        <div style={{ ...glass, padding: '14px 18px', flex: '0 0 auto', minWidth: 160, maxHeight: 200, overflowY: 'auto' }}>
          <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 10 }}>Ординаторська</div>
          {headDoc && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 600, color: '#fff', flexShrink: 0, ...MONO }}>
                {initials(headDoc.emp_name)}
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 500, color: '#1a1a1a', ...SANS }}>{headDoc.emp_name}</div>
                <div style={{ fontSize: 8, color: '#2563eb', ...MONO }}>завідувач</div>
              </div>
            </div>
          )}
          {ordDocs.slice(0, 6).map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: '#666', flexShrink: 0, ...MONO }}>
                {initials(d.emp_name)}
              </div>
              <div style={{ fontSize: 10, color: '#333', ...SANS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.emp_name}</div>
            </div>
          ))}
          {loading && <div style={{ fontSize: 9, color: '#aaa', ...MONO }}>завантаження…</div>}
        </div>

        {deptIcd.length > 0 && (
          <div style={{ ...glass, padding: '14px 18px', flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 10 }}>Топ МКХ-10</div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <ResponsiveContainer width={100} height={100}>
                <PieChart>
                  <Pie data={deptIcd} dataKey="випадків" innerRadius={28} outerRadius={46} paddingAngle={2}>
                    {deptIcd.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ fontSize: 10, borderRadius: 6, border: 'none', background: 'rgba(26,26,26,0.9)', color: '#fff' }}
                    formatter={(v, n, p) => [p.payload.відс + '% (' + fmt(v) + ')', '']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1 }}>
                {deptIcd.slice(0, 4).map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                    <div style={{ fontSize: 10, color: '#333', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...SANS }}>{d.назва || d.код}</div>
                    <div style={{ fontSize: 10, fontWeight: 500, color: '#2563eb', ...MONO }}>{d.відс}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Особиста статистика завідувача */}
      {headCabinet?.summary && (
        <div style={{ ...glass, padding: '16px 20px' }}>
          <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 12 }}>
            Особиста статистика · {headDoc?.emp_name}
          </div>
          <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
            {[
              { l: 'ВИПАДКІВ',    v: fmt(headCabinet.summary['всього']) },
              { l: 'АКТИВНИХ',    v: fmt(headCabinet.summary['активних']) },
              { l: 'ЛІЖКО-ДЕНЬ',  v: fmt(headCabinet.summary['серед_ліжкодень']) },
              { l: 'ПОВТОРНІ',    v: fmt(headCabinet.summary['повторні']) },
              { l: 'ПОЛІПШЕННЯ',  v: fmt(headCabinet.summary['поліпшення']) },
              { l: 'ЛЕТАЛЬНІСТЬ', v: fmt(headCabinet.summary['померло']) },
            ].map((s, i) => (
              <div key={i} style={{ flex: '1 1 80px', padding: '4px 14px', borderLeft: i > 0 ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
                <div style={{ fontSize: 22, fontWeight: 300, color: '#059669', ...MONO, lineHeight: 1 }}>{s.v}</div>
                <div style={{ fontSize: 7, color: '#888', textTransform: 'uppercase', letterSpacing: '0.09em', marginTop: 4, ...MONO }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 28px', marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <SplitBar label="Стать" leftLabel="Жінки" rightLabel="Чоловіки"
              leftValue={headCabinet.summary['жінки']} rightValue={headCabinet.summary['чоловіки']}
              leftColor="#c0392b" rightColor="#2563eb" />
            <SplitBar label="Ургенція" leftLabel="Ургентних" rightLabel="Планових"
              leftValue={headCabinet.summary['ургентних']} rightValue={headCabinet.summary['планових']}
              leftColor="#d97706" rightColor="#6b8cba" />
            <SplitBar label="Покращення" leftLabel="З поліпшенням" rightLabel="Інші"
              leftValue={headCabinet.summary['поліпшення']} rightValue={Number(headCabinet.summary['всього']) - Number(headCabinet.summary['поліпшення'])}
              leftColor="#059669" rightColor="#cbd5e1" />
            <SplitBar label="Летальність" leftLabel="Померло" rightLabel="Виписано"
              leftValue={headCabinet.summary['померло']} rightValue={Number(headCabinet.summary['всього']) - Number(headCabinet.summary['померло'])}
              leftColor="#dc2626" rightColor="#7fd99a" />
          </div>
        </div>
      )}
    </div>
  )
}
