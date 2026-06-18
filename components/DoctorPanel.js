import { SANS, MONO, fmt } from './shared'
import { SplitBar } from './SplitBar'

const STATUS_COLORS = {
  'Лікується': '#5ab0ff', 'З поліпшенням': '#7fd99a', 'Без змін': '#cfae5a',
  'З погіршенням': '#e0a060', 'Помер': '#e08080', 'Переведений в інший заклад': '#a08ae0',
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || '#999'
  return (
    <span style={{ fontSize: 10, color: c, border: `1px solid ${c}55`, borderRadius: 999, padding: '1px 7px', whiteSpace: 'nowrap' }}>
      {status || '—'}
    </span>
  )
}

export function DoctorPanel({ cabinet, tab, setTab }) {
  if (!cabinet) return (
    <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.3)', ...MONO }}>завантаження кабінету…</div>
    </div>
  )

  const { profile, summary, recent, active, topDiag } = cabinet
  const rows = tab === 'recent' ? recent : tab === 'active' ? active : topDiag
  const glass = { background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14 }

  return (
    <div style={{ position: 'relative', zIndex: 1, flex: 1, padding: '20px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', ...SANS }}>
        {profile?.full_name}
        <span style={{ marginLeft: 10, fontSize: 10, color: '#888', fontWeight: 400, ...MONO }}>
          {profile?.specialization || profile?.position}
        </span>
      </div>

      {summary && (
        <div style={{ ...glass, padding: '16px 20px' }}>
          <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 12 }}>Моя статистика</div>
          <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
            {[
              { l: 'ВИПАДКІВ',    v: fmt(summary['всього']) },
              { l: 'АКТИВНИХ',    v: fmt(summary['активних']) },
              { l: 'ЛІЖКО-ДЕНЬ',  v: fmt(summary['серед_ліжкодень']) },
              { l: 'ПОВТОРНІ',    v: fmt(summary['повторні']) },
              { l: 'ПОЛІПШЕННЯ',  v: fmt(summary['поліпшення']) },
              { l: 'ЛЕТАЛЬНІСТЬ', v: fmt(summary['померло']) },
            ].map((s, i) => (
              <div key={i} style={{ flex: '1 1 80px', padding: '4px 14px', borderLeft: i > 0 ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
                <div style={{ fontSize: 22, fontWeight: 300, color: '#2563eb', ...MONO, lineHeight: 1 }}>{s.v}</div>
                <div style={{ fontSize: 7, color: '#888', textTransform: 'uppercase', letterSpacing: '0.09em', marginTop: 4, ...MONO }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary && (
        <div style={{ ...glass, padding: '16px 20px' }}>
          <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', ...MONO, marginBottom: 14 }}>Розподіл</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 28px' }}>
            <SplitBar label="Стать" leftLabel="Жінки" rightLabel="Чоловіки"
              leftValue={summary['жінки']} rightValue={summary['чоловіки']}
              leftColor="#c0392b" rightColor="#2563eb" />
            <SplitBar label="Ургенція" leftLabel="Ургентних" rightLabel="Планових"
              leftValue={summary['ургентних']} rightValue={summary['планових']}
              leftColor="#d97706" rightColor="#6b8cba" />
            <SplitBar label="Покращення" leftLabel="З поліпшенням" rightLabel="Інші"
              leftValue={summary['поліпшення']} rightValue={Number(summary['всього']) - Number(summary['поліпшення'])}
              leftColor="#059669" rightColor="#cbd5e1" />
            <SplitBar label="Летальність" leftLabel="Померло" rightLabel="Виписано"
              leftValue={summary['померло']} rightValue={Number(summary['всього']) - Number(summary['померло'])}
              leftColor="#dc2626" rightColor="#7fd99a" />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { k: 'recent', l: 'Останні' },
          { k: 'active', l: 'Активні' },
          { k: 'diag',   l: 'Діагнози' },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            background: tab === t.k ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.5)',
            border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8,
            fontSize: 10, cursor: 'pointer', padding: '4px 14px', ...MONO, color: '#333',
            fontWeight: tab === t.k ? 600 : 400,
          }}>{t.l}</button>
        ))}
      </div>

      <div style={{ ...glass, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 260 }}>
          {(!rows || rows.length === 0) ? (
            <div style={{ padding: '14px 18px', fontSize: 11, color: '#aaa', ...MONO }}>Немає даних.</div>
          ) : tab !== 'diag' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.07)', background: 'rgba(255,255,255,0.4)' }}>
                  {['№', 'Пацієнт', 'Дата', 'Діагноз', tab === 'recent' ? 'Статус' : 'Ліжкодень'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', ...MONO, fontWeight: 400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <td style={{ padding: '7px 10px', color: '#999', ...MONO }}>{r['номер']}</td>
                    <td style={{ padding: '7px 10px', ...SANS }}>{r['пацієнт']}</td>
                    <td style={{ padding: '7px 10px', color: '#888', ...MONO }}>{r['дата']}</td>
                    <td style={{ padding: '7px 10px', color: '#666', ...SANS, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r['діагноз']}</td>
                    <td style={{ padding: '7px 10px' }}>
                      {tab === 'recent' ? <StatusBadge status={r['статус']} /> : (r['ліжкодень'] != null ? r['ліжкодень'] + ' дн.' : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.07)', background: 'rgba(255,255,255,0.4)' }}>
                  {['Діагноз', 'Код', 'Випадків', 'Померло'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', ...MONO, fontWeight: 400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <td style={{ padding: '7px 10px', ...SANS }}>{r['діагноз']}</td>
                    <td style={{ padding: '7px 10px', color: '#888', ...MONO }}>{r['код']}</td>
                    <td style={{ padding: '7px 10px', ...MONO }}>{r['випадків']}</td>
                    <td style={{ padding: '7px 10px', color: r['померло'] > 0 ? '#e08080' : '#aaa', ...MONO }}>{r['померло']}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
