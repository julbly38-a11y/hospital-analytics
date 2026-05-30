// ResultView, SqlBlock, TokenBadge, Bubble — message-content components.
const { useState: useStateRV } = React;

const COL_LABELS = {
  doctor_name: 'Лікар', patient_name: 'Пацієнт', department_name: 'Відділення',
  відділення: 'Відділення', завідувач: 'Завідувач', штат_лікарів: 'Штат',
  admission_at: 'Дата госпіталізації', discharge_at: 'Дата виписки',
  bed_days: 'Ліжко-днів', discharge_status: 'Статус виписки',
  diagnosis_main: 'Основний діагноз', icd_main: 'МКХ', patient_age: 'Вік',
  patient_gender: 'Стать', region: 'Регіон', count: 'Кількість',
  година: 'Година', всього: 'Всього', екстрених: 'Екстрених',
  летальність_відсоток: 'Летальність %', хірургічна_активність: 'Хір.акт %',
  відсоток_ургенції: 'Ургенція %', середній_ліжкодень: 'Сер.ліжкодень',
  // Real-schema additions (from Supabase project LSMD):
  унік_пацієнтів: 'Унік. пацієнтів', лікар: 'Лікар', спеціалізація: 'Спеціалізація',
  всього_випадків: 'Всього випадків', померло: 'Померло',
  icd_code: 'МКХ', diagnosis: 'Діагноз',
  chapter_letter: 'Розділ', chapter_name: 'Назва розділу',
  вік: 'Вік', пацієнтів: 'Пацієнтів', регіон: 'Регіон',
  операційних_кейсів: 'Операційних кейсів', всього_госпіталізацій: 'Всього госпіталізацій',
  хір_активність_відсоток: 'Хір.активність %',
};

function colLabel(k) { return COL_LABELS[k] || k.replace(/_/g, ' '); }
function fmtVal(k, v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number' && !Number.isInteger(v)) return v.toFixed(1);
  if (typeof v === 'number') return Number(v).toLocaleString('en-US');
  return String(v);
}

function ResultView({ rows }) {
  if (!rows || rows.length === 0) {
    return <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'8px',padding:'24px'}}>
      <span style={{fontFamily:'var(--mono)',fontSize:'24px',color:'var(--text3)',lineHeight:1}}>○</span>
      <p style={{fontSize:'13px',color:'var(--text2)'}}>Результатів не знайдено</p>
    </div>;
  }
  const cols = Object.keys(rows[0]);
  const isSingleNumber = rows.length === 1 && cols.length === 1 && typeof Object.values(rows[0])[0] === 'number';
  const isSmallStat = rows.length === 1 && cols.length <= 4;

  if (isSingleNumber) {
    const k = cols[0];
    return <div className="bigCard">
      <p className="bigNum">{fmtVal(k, rows[0][k])}</p>
      <p className="bigLabel">{colLabel(k)}</p>
    </div>;
  }
  if (isSmallStat) {
    return <div className="statGrid">
      {cols.map((k) => (
        <div key={k} className="statCard">
          <p className="statVal">{fmtVal(k, rows[0][k])}</p>
          <p className="statKey">{colLabel(k)}</p>
        </div>
      ))}
    </div>;
  }
  return (
    <div className="tableWrap">
      <table className="table">
        <thead><tr>{cols.map((c) => <th key={c}>{colLabel(c)}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i}>{cols.map((c) => <td key={c}>{fmtVal(c, row[c])}</td>)}</tr>)}</tbody>
      </table>
      <div className="tableFooter">{rows.length} записів</div>
    </div>
  );
}

function SqlBlock({ sql }) {
  const [show, setShow] = useStateRV(false);
  return (
    <div className="sqlBlock">
      <button className="sqlToggle" onClick={() => setShow(!show)}>
        {show ? '▲ сховати SQL' : '▼ показати SQL'}
      </button>
      {show && <pre className="sqlCode">{sql}</pre>}
    </div>
  );
}

function TokenBadge({ tokens }) {
  if (!tokens) return null;
  const fmtCost = (c) => c === 0 ? '$0.00' : c < 0.01 ? `$${c.toFixed(6)}` : `$${c.toFixed(4)}`;
  return (
    <div className="tokenBadge">
      <span>{tokens.provider}</span>
      <span>↓ {tokens.tokens_in}</span>
      <span>↑ {tokens.tokens_out}</span>
      <span>Σ {tokens.tokens_total}</span>
      <span className={tokens.free ? 'free' : ''}>{tokens.free ? 'безкоштовно' : fmtCost(tokens.cost_usd)}</span>
    </div>
  );
}

function UserBubble({ children }) {
  return <div className="msg user"><div className="userBubble">{children}</div></div>;
}

function AgentBubble({ msg }) {
  return (
    <div className="msg assistant">
      <div className="agentBubble">
        {msg.error && (
          <div className="errorBox">
            <span className="errorIcon">!</span>
            <p>{msg.error}</p>
          </div>
        )}
        {msg.explanation && <p className="explanation">{msg.explanation}</p>}
        {msg.rows && <ResultView rows={msg.rows} />}
        {msg.sql && <SqlBlock sql={msg.sql} />}
        {msg.tokens && <TokenBadge tokens={msg.tokens} />}
      </div>
    </div>
  );
}

function TypingBubble() {
  return <div className="msg assistant"><div className="agentBubble"><div className="typing"><span/><span/><span/></div></div></div>;
}

Object.assign(window, { ResultView, SqlBlock, TokenBadge, UserBubble, AgentBubble, TypingBubble });

## Змінні оточення (Vercel)

Обовʼязкові:
- `NEXT_PUBLIC_SUPABASE_URL` — URL проєкту Supabase (використовується і клієнтом, і серверними REST-викликами).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — публічний anon-ключ (auth, middleware).
- `SUPABASE_SERVICE_KEY` — service_role ключ (серверні виклики `execute_sql`, лише на бекенді).

LLM-провайдери (опційно, для запитів, що не покриває роутер):
- `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.

> Примітка: код також підтримує застарілу `SUPABASE_URL` як fallback,
> але канонічна змінна — `NEXT_PUBLIC_SUPABASE_URL`.
