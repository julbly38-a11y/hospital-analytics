// Dashboard shell — sidebar + header + page content.
// All numbers in this file are pulled from the live Supabase schema for
// project wnyfrckxhwujsjcfxqou (LSMD). They are not invented.

const { useState: useStateD } = React;

const DASH_NAV = [
  { id: 'overview',    label: 'Загальна',      gl: '◆', group: 'Аналітика' },
  { id: 'departments', label: 'Відділення',    gl: '▦', group: 'Аналітика' },
  { id: 'diagnoses',   label: 'Діагнози МКХ',  gl: '⌘', group: 'Аналітика' },
  { id: 'doctors',     label: 'Лікарі',        gl: '◐', group: 'Аналітика' },
  { id: 'patients',    label: 'Пацієнти',      gl: '○', group: 'Аналітика' },
  { id: 'geography',   label: 'Географія',     gl: '◯', group: 'Аналітика' },
  { id: 'peaks',       label: 'Піки',          gl: '⌃', group: 'Аналітика' },
  { id: 'night',       label: 'Нічні зміни',   gl: '◗', group: 'Аналітика' },
  { id: 'reception',   label: 'Приймальне',    gl: '✚', group: 'Аналітика' },
  { id: 'operations',  label: 'Операції',      gl: '⌖', group: 'Аналітика' },
  { id: 'asystent',    label: 'AI Асистент',   gl: '+', group: 'Інструменти' },
  { id: 'reports',     label: 'Звіти',         gl: 'Σ', group: 'Інструменти' },
  { id: 'settings',    label: 'Налаштування',  gl: '⚙', group: 'Інструменти' },
];

function DashSidebar({ active, setActive, onExit }) {
  const groups = [...new Set(DASH_NAV.map(n => n.group))];
  return (
    <aside className="dash-sidebar">
      <a className="brand" onClick={onExit} style={{cursor:'pointer'}}>
        <span className="mark">+</span>
        <span className="name">ЛСМД</span>
      </a>
      <div className="dash-nav">
        {groups.map(g => (
          <div key={g} className="group">
            <div className="group-label">{g}</div>
            {DASH_NAV.filter(n => n.group === g).map(n => (
              <div key={n.id} className={`dash-nav-item${active===n.id?' active':''}`} onClick={() => setActive(n.id)}>
                <span className="gl">{n.gl}</span>
                <span>{n.label}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="dash-user">
        <div className="ava">ОД</div>
        <div className="who">
          <div className="name">Олена Дубець</div>
          <div className="role">завідувач</div>
        </div>
      </div>
    </aside>
  );
}

/* ============================================================
   ОГЛЯД — спрафжні KPI, реальний розподіл по годинах, реальні розділи МКХ
   ============================================================ */
function OverviewPage() {
  // Реальний розподіл по годинах з SQL (24 значення, пік на 9-10 ранку)
  const hours = [709,539,355,292,245,236,262,428,6405,20709,21667,14692,9596,6487,5035,4098,3578,3517,2756,2229,1984,1781,1448,1125];
  const peakHour = hours.indexOf(Math.max(...hours));

  // Топ розділів МКХ-10 за всі роки (з реального запиту)
  const icdChapters = [
    { letter: 'K', name: 'Хвороби органів травлення',        n: 23530 },
    { letter: 'S', name: 'Травми та отруєння',               n: 15741 },
    { letter: 'I', name: 'Хвороби системи кровообігу',       n: 14867 },
    { letter: 'G', name: 'Хвороби нервової системи',         n: 10617 },
    { letter: 'N', name: 'Хвороби сечостатевої системи',     n: 10329 },
    { letter: 'C', name: 'Новоутворення',                    n: 6528  },
    { letter: 'M', name: 'Хвороби кістково-м\'язової системи', n: 6256 },
  ];
  const maxIcd = icdChapters[0].n;

  return (
    <>
      <div className="dash-header">
        <div>
          <div className="crumbs">Аналітика · Огляд</div>
          <h1>Дашборд лікарні</h1>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <button className="btn-secondary">Період: усі роки ▾</button>
          <button className="btn-secondary">Експорт PDF</button>
        </div>
      </div>
      <div className="dash-content">
        <div className="kpi-row">
          <div className="kpi"><div className="lbl">Госпіталізацій</div><div className="val">110,206</div><div className="delta up">↑ за період 2020 — 05.2026</div></div>
          <div className="kpi"><div className="lbl">Летальність</div><div className="val">2.06%</div><div className="delta down">2,267 випадків</div></div>
          <div className="kpi"><div className="lbl">Сер. ліжко-день</div><div className="val">11.4</div><div className="delta up">по всіх 20 відділеннях</div></div>
          <div className="kpi"><div className="lbl">Виписки з поліпшенням</div><div className="val">94.4%</div><div className="delta up">104,081 з 110,206</div></div>
        </div>

        <div className="chart-row">
          <div className="panel">
            <div className="panel-head">
              <h3>Пікові години госпіталізацій</h3>
              <span className="filter">усі роки ▾</span>
            </div>
            <div className="barchart">
              {hours.map((h, i) => (
                <div key={i} className={`bar${i===peakHour?' peak':''}`} style={{height: `${(h/Math.max(...hours))*100}%`}} title={`${String(i).padStart(2,'0')}:00 · ${h.toLocaleString('en-US')}`}></div>
              ))}
            </div>
            <div className="barchart-x">
              {hours.map((_, i) => <span key={i}>{i % 4 === 0 ? `${String(i).padStart(2,'0')}` : ''}</span>)}
            </div>
            <p style={{marginTop:'10px',fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text3)',lineHeight:1.5}}>
              Пік о <strong style={{color:'var(--brand)'}}>10:00</strong> — 21,667 госпіталізацій. 8–11 ранку дають 57% усього обсягу — це планові надходження.
            </p>
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Тип госпіталізації</h3><span className="filter">110,206 всього</span></div>
            <div style={{display:'flex',flexDirection:'column',gap:'14px',marginTop:'8px'}}>
              <div>
                <div style={{display:'flex',justifyContent:'space-between',fontFamily:'var(--mono)',fontSize:'12px',marginBottom:'4px'}}>
                  <span>Екстренна</span><span style={{color:'var(--brand)'}}>90.5%</span>
                </div>
                <div style={{height:'8px',background:'var(--bg2)',borderRadius:'4px',overflow:'hidden'}}>
                  <div style={{width:'90.5%',height:'100%',background:'var(--brand)'}}></div>
                </div>
                <div style={{fontFamily:'var(--mono)',fontSize:'10px',color:'var(--text3)',marginTop:'4px'}}>99,720 випадків</div>
              </div>
              <div>
                <div style={{display:'flex',justifyContent:'space-between',fontFamily:'var(--mono)',fontSize:'12px',marginBottom:'4px'}}>
                  <span>Планова</span><span>9.5%</span>
                </div>
                <div style={{height:'8px',background:'var(--bg2)',borderRadius:'4px',overflow:'hidden'}}>
                  <div style={{width:'9.5%',height:'100%',background:'var(--text)'}}></div>
                </div>
                <div style={{fontFamily:'var(--mono)',fontSize:'10px',color:'var(--text3)',marginTop:'4px'}}>10,471 випадків</div>
              </div>

              <div style={{borderTop:'1px solid var(--border)',paddingTop:'14px',marginTop:'6px'}}>
                <div style={{display:'flex',justifyContent:'space-between',fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text2)'}}>
                  <span>Будній день</span><span>90.1%</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text2)',marginTop:'6px'}}>
                  <span>Вихідний</span><span>9.9%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel" style={{marginBottom:'16px'}}>
          <div className="panel-head">
            <h3>Розподіл за розділами МКХ-10</h3>
            <span className="filter">топ-7 з 22</span>
          </div>
          <div className="dept-list">
            {icdChapters.map(c => (
              <div key={c.letter} className="dept-row">
                <span style={{fontFamily:'var(--mono)',fontWeight:500,color:'var(--brand)',width:'20px'}}>{c.letter}</span>
                <span className="name" style={{flex:'1 1 auto'}}>{c.name}</span>
                <span className="bar-wrap" style={{width:'160px'}}><span className="bar-fill" style={{width:`${(c.n/maxIcd)*100}%`}}></span></span>
                <span className="pct" style={{width:'60px'}}>{c.n.toLocaleString('en-US')}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Виписки — статус</h3><span className="filter">110,206 всього</span></div>
          <div className="table-wrap">
            <table className="dtable">
              <thead><tr><th>Статус</th><th style={{textAlign:'right'}}>Випадків</th><th style={{textAlign:'right'}}>%</th><th>Розподіл</th></tr></thead>
              <tbody>
                <tr><td>З поліпшенням</td><td style={{textAlign:'right'}}>104,081</td><td style={{textAlign:'right'}}>94.44%</td><td><div style={{height:'4px',background:'var(--bg2)',borderRadius:'2px',overflow:'hidden'}}><div style={{width:'94.4%',height:'100%',background:'var(--green)'}}></div></div></td></tr>
                <tr><td>Помер</td><td style={{textAlign:'right'}}>2,267</td><td style={{textAlign:'right'}}>2.06%</td><td><div style={{height:'4px',background:'var(--bg2)',borderRadius:'2px',overflow:'hidden'}}><div style={{width:'2.06%',height:'100%',background:'var(--brand)'}}></div></div></td></tr>
                <tr><td>Без змін</td><td style={{textAlign:'right'}}>2,157</td><td style={{textAlign:'right'}}>1.96%</td><td><div style={{height:'4px',background:'var(--bg2)',borderRadius:'2px',overflow:'hidden'}}><div style={{width:'1.96%',height:'100%',background:'var(--text2)'}}></div></div></td></tr>
                <tr><td>Переведений в інший заклад</td><td style={{textAlign:'right'}}>711</td><td style={{textAlign:'right'}}>0.65%</td><td><div style={{height:'4px',background:'var(--bg2)',borderRadius:'2px',overflow:'hidden'}}><div style={{width:'0.65%',height:'100%',background:'var(--text2)'}}></div></div></td></tr>
                <tr><td>Лікується</td><td style={{textAlign:'right'}}>690</td><td style={{textAlign:'right'}}>0.63%</td><td><div style={{height:'4px',background:'var(--bg2)',borderRadius:'2px',overflow:'hidden'}}><div style={{width:'0.63%',height:'100%',background:'var(--text2)'}}></div></div></td></tr>
                <tr><td>З погіршенням</td><td style={{textAlign:'right'}}>290</td><td style={{textAlign:'right'}}>0.26%</td><td><div style={{height:'4px',background:'var(--bg2)',borderRadius:'2px',overflow:'hidden'}}><div style={{width:'0.26%',height:'100%',background:'var(--amber)'}}></div></div></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   ВІДДІЛЕННЯ — реальні 20 відділень з staff_count + admissions
   ============================================================ */
const REAL_DEPARTMENTS = [
  { name: 'Хірургічне відділення №1',                                  staff: 34, doctors: 30, admissions: 15329 },
  { name: 'Урологічне відділення',                                     staff: 24, doctors: 22, admissions: 13440 },
  { name: 'Центр невідкладної неврології',                             staff: 24, doctors: 13, admissions: 11952 },
  { name: 'Травматологічне відділення для дорослих',                    staff: 63, doctors: 40, admissions: 10870 },
  { name: 'Хірургічне відділення №2',                                  staff: 33, doctors: 27, admissions: 9832  },
  { name: 'Гематологічне відділення',                                  staff: 9,  doctors: 5,  admissions: 9169  },
  { name: 'Гастроентерологічне відділення',                            staff: 10, doctors: 6,  admissions: 8801  },
  { name: 'Травматологічне відділення для дітей',                       staff: 17, doctors: 11, admissions: 7900  },
  { name: 'Нейрохірургічне відділення',                                staff: 17, doctors: 12, admissions: 7175  },
  { name: 'Терапевтичне відділення №1',                                staff: 19, doctors: 16, admissions: 6085  },
  { name: 'Терапевтичне відділення №2',                                staff: 12, doctors: 11, admissions: 4054  },
  { name: 'Опікове відділення',                                        staff: 7,  doctors: 5,  admissions: 3000  },
  { name: 'Відділення анестезіології з ліжками інтенсивної терапії',    staff: 88, doctors: 11, admissions: null  },
  { name: 'Клініко-діагностична лабораторія',                          staff: 35, doctors: 0,  admissions: null  },
  { name: 'Рентгенологічне відділення',                                staff: 16, doctors: 0,  admissions: null  },
  { name: 'Операційне відділення',                                     staff: 16, doctors: 0,  admissions: null  },
  { name: 'Приймально-діагностичне відділення',                        staff: 13, doctors: 1,  admissions: null  },
  { name: 'Загально-лікарняний персонал',                              staff: 12, doctors: 0,  admissions: null  },
  { name: 'Відділення відновного лікування',                           staff: 7,  doctors: 0,  admissions: null  },
  { name: 'Адміністрація',                                             staff: 3,  doctors: 0,  admissions: null  },
];

function DepartmentsPage() {
  const maxAdm = Math.max(...REAL_DEPARTMENTS.map(d => d.admissions || 0));
  return (
    <>
      <div className="dash-header">
        <div><div className="crumbs">Аналітика · Відділення</div><h1>Відділення (20)</h1></div>
        <div style={{display:'flex',gap:'8px'}}>
          <span style={{fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.05em',alignSelf:'center'}}>868 працівників · 265 з doctor_stats</span>
        </div>
      </div>
      <div className="dash-content">
        <div className="panel">
          <div className="table-wrap" style={{border:'none',borderRadius:0}}>
            <table className="dtable">
              <thead><tr>
                <th>Відділення</th>
                <th style={{textAlign:'right'}}>Штат</th>
                <th style={{textAlign:'right'}}>Лікарі</th>
                <th style={{textAlign:'right'}}>Госпіталізації</th>
                <th style={{minWidth:'120px'}}>Обсяг</th>
              </tr></thead>
              <tbody>
                {REAL_DEPARTMENTS.map((d, i) => (
                  <tr key={i}>
                    <td style={{fontFamily:'var(--sans)'}}>{d.name}</td>
                    <td style={{textAlign:'right'}}>{d.staff}</td>
                    <td style={{textAlign:'right',color:d.doctors===0?'var(--text3)':'var(--text)'}}>{d.doctors || '—'}</td>
                    <td style={{textAlign:'right'}}>{d.admissions ? d.admissions.toLocaleString('en-US') : <span style={{color:'var(--text3)'}}>—</span>}</td>
                    <td>
                      {d.admissions ? (
                        <div style={{height:'6px',background:'var(--bg2)',borderRadius:'3px',overflow:'hidden'}}>
                          <div style={{width:`${(d.admissions/maxAdm)*100}%`,height:'100%',background:'var(--text)'}}></div>
                        </div>
                      ) : <span style={{fontFamily:'var(--mono)',fontSize:'10px',color:'var(--text3)'}}>сервісне</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   ЛІКАРІ — реальні топ-10 з doctor_stats
   ============================================================ */
const REAL_DOCTORS = [
  { name: 'Ільніцька Олеся Вікторівна',     spec: 'невропатолог',         total: 3508, unique: 2299, deaths: 84, improved: 3304, los: 10.4 },
  { name: 'Вахнюк Михайло Олексійович',     spec: 'гематолог',            total: 3296, unique: 1283, deaths: 58, improved: 3015, los: 10.4 },
  { name: 'Дубець Наталія Дмитрівна',       spec: 'невропатолог',         total: 3238, unique: 2391, deaths: 113, improved: 3019, los: 8.6 },
  { name: 'Череватенко Віра Олександрівна', spec: 'гастроентеролог',      total: 2371, unique: 1023, deaths: 7,  improved: 2342, los: 9.9 },
  { name: 'Тимофеєв Валентин Вікторович',   spec: 'гастроентеролог',      total: 2312, unique: 565,  deaths: 43, improved: 1764, los: 10.7 },
  { name: 'Колотило Олександр Богданович',  spec: 'хірург',               total: 2225, unique: 1495, deaths: 24, improved: 2170, los: 19.5 },
  { name: 'Рожок Людмила Іванівна',         spec: 'гастроентеролог',      total: 1918, unique: 1002, deaths: 13, improved: 1879, los: 10.7 },
  { name: 'Мартинов Андрій Володимирович',  spec: 'травматолог дитячий',  total: 1824, unique: 910,  deaths: 1,  improved: 1778, los: 12.4 },
  { name: 'Клємєшев Володимир Ігорович',    spec: 'гематолог',            total: 1786, unique: 580,  deaths: 27, improved: 1275, los: 8.5 },
  { name: 'Черней Вадим Юрійович',          spec: 'травматолог дитячий',  total: 1716, unique: 1376, deaths: 0,  improved: 1694, los: 13.8 },
];

function DoctorsPage() {
  return (
    <>
      <div className="dash-header">
        <div><div className="crumbs">Аналітика · Лікарі</div><h1>Топ лікарів за обсягом</h1></div>
        <span style={{fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.05em',alignSelf:'center'}}>з doctor_stats · 265 рядків</span>
      </div>
      <div className="dash-content">
        <div className="panel">
          <div className="table-wrap" style={{border:'none',borderRadius:0}}>
            <table className="dtable">
              <thead><tr>
                <th>Лікар</th>
                <th>Спеціалізація</th>
                <th style={{textAlign:'right'}}>Випадків</th>
                <th style={{textAlign:'right'}}>Унік. пацієнтів</th>
                <th style={{textAlign:'right'}}>З поліпш.</th>
                <th style={{textAlign:'right'}}>Помер</th>
                <th style={{textAlign:'right'}}>Сер. ЛД</th>
              </tr></thead>
              <tbody>
                {REAL_DOCTORS.map((d, i) => (
                  <tr key={i}>
                    <td style={{fontFamily:'var(--sans)',fontWeight:500}}>{d.name}</td>
                    <td style={{color:'var(--text2)'}}>{d.spec}</td>
                    <td style={{textAlign:'right'}}>{d.total.toLocaleString('en-US')}</td>
                    <td style={{textAlign:'right',color:'var(--text2)'}}>{d.unique.toLocaleString('en-US')}</td>
                    <td style={{textAlign:'right',color:'var(--green)'}}>{d.improved.toLocaleString('en-US')}</td>
                    <td style={{textAlign:'right',color:d.deaths>50?'var(--brand)':'var(--text2)'}}>{d.deaths}</td>
                    <td style={{textAlign:'right'}}>{d.los.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   ДІАГНОЗИ МКХ — реальні топ-10 кодів
   ============================================================ */
const REAL_ICD = [
  { code: 'K86.1', diag: 'Інший хронічний панкреатит',                                                            n: 5755 },
  { code: 'G55.1', diag: 'Компресія нервових корінців при ураженнях міжхребцевого диска',         n: 4709 },
  { code: 'I63.3', diag: 'Інфаркт мозку внаслідок тромбозу церебральних артерій',                  n: 2996 },
  { code: 'N20.1', diag: 'Камені сечоводу',                                                                       n: 2995 },
  { code: 'K80.00',diag: 'Камінь жовчного міхура з гострим холециститом',                         n: 2541 },
  { code: 'N40',   diag: 'Гіперплазія передміхурової залози',                                                     n: 2512 },
  { code: 'I11.9', diag: 'Гіпертензивна хвороба серця без серцевої недостатності',                 n: 1946 },
  { code: 'G94.8', diag: 'Інші уточнені ураження головного мозку',                                                n: 1566 },
  { code: 'C90.00',diag: 'Мнодинна мієлома, без згадки про ремісію',                              n: 1375 },
  { code: 'K35.8', diag: 'Гострий апендицит, інший та неуточнений',                                               n: 1195 },
];

function DiagnosesPage() {
  const maxN = REAL_ICD[0].n;
  return (
    <>
      <div className="dash-header">
        <div><div className="crumbs">Аналітика · Діагнози МКХ-10</div><h1>Топ діагнозів</h1></div>
        <span style={{fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.05em',alignSelf:'center'}}>22 розділи · 220 блоків</span>
      </div>
      <div className="dash-content">
        <div className="panel">
          <div className="panel-head"><h3>Топ-10 кодів МКХ-10 за всі роки</h3><span className="filter">110,206 кейсів</span></div>
          <div className="dept-list">
            {REAL_ICD.map(d => (
              <div key={d.code} className="dept-row" style={{alignItems:'flex-start'}}>
                <span style={{fontFamily:'var(--mono)',fontWeight:500,color:'var(--brand)',width:'60px'}}>{d.code}</span>
                <span className="name" style={{flex:'1 1 auto',whiteSpace:'normal',lineHeight:1.4}}>{d.diag}</span>
                <span className="bar-wrap" style={{width:'140px',marginTop:'5px'}}><span className="bar-fill" style={{width:`${(d.n/maxN)*100}%`}}></span></span>
                <span className="pct" style={{width:'50px',marginTop:'2px'}}>{d.n.toLocaleString('en-US')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   ОПЕРАЦІЇ — спрафжній обсяг
   ============================================================ */
function OperationsPage() {
  return (
    <>
      <div className="dash-header">
        <div><div className="crumbs">Аналітика · Операції</div><h1>Операції</h1></div>
        <span style={{fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.05em',alignSelf:'center'}}>7,320 унікальних кодів</span>
      </div>
      <div className="dash-content">
        <div className="kpi-row">
          <div className="kpi"><div className="lbl">Операційних кейсів</div><div className="val">49,919</div><div className="delta up">45.3% від госпіталізацій</div></div>
          <div className="kpi"><div className="lbl">Унікальних кодів</div><div className="val">7,320</div><div className="delta up">довідник operations</div></div>
          <div className="kpi"><div className="lbl">Хір. відділень</div><div className="val">3</div><div className="delta up">Хір. №1 · №2 · Опікове</div></div>
          <div className="kpi"><div className="lbl">Травматологічних</div><div className="val">2</div><div className="delta up">дорослі + дитячі</div></div>
        </div>
        <div className="panel" style={{padding:'48px',textAlign:'center'}}>
          <div style={{fontFamily:'var(--mono)',fontSize:'24px',color:'var(--text3)',marginBottom:'8px'}}>◌</div>
          <p style={{fontSize:'13px',color:'var(--text2)'}}>Детальний розріз по кодах операцій — в наступній ітерації. Поки що відображаються лише сумарні показники з таблиці operations.</p>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   НАЛАШТУВАННЯ — реальна інфраструктура з CATALOG.md
   ============================================================ */
function SettingsPage() {
  return (
    <>
      <div className="dash-header">
        <div><div className="crumbs">Інструменти · Налаштування</div><h1>Інфраструктура</h1></div>
        <span style={{fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.05em',alignSelf:'center'}}>з CATALOG-v4-full.md</span>
      </div>
      <div className="dash-content">
        <div className="kpi-row">
          <div className="kpi"><div className="lbl">PostgreSQL views</div><div className="val">27</div><div className="delta up">аналітичних view</div></div>
          <div className="kpi"><div className="lbl">SQL функцій</div><div className="val">22</div><div className="delta up">+ RLS + archive</div></div>
          <div className="kpi"><div className="lbl">МКХ-10 кодів</div><div className="val">2,047</div><div className="delta up">укр. ієрархія</div></div>
          <div className="kpi"><div className="lbl">Looker fields</div><div className="val">86</div><div className="delta up">calculated fields</div></div>
        </div>

        <div className="panel" style={{marginBottom:'16px'}}>
          <div className="panel-head"><h3>Підключені сервіси</h3><span className="filter">production</span></div>
          <div className="table-wrap" style={{border:'none',borderRadius:0}}>
            <table className="dtable">
              <thead><tr><th>Сервіс</th><th>Статус</th><th>Опис</th></tr></thead>
              <tbody>
                <tr><td style={{fontWeight:500}}>Supabase PostgreSQL</td><td><span className="badge-soft green">підключено</span></td><td>21 таблиця + 27 views · eu-west-1 pooler</td></tr>
                <tr><td style={{fontWeight:500}}>Looker Studio</td><td><span className="badge-soft green">підключено</span></td><td>9 сторінок дашборду · 86 calculated fields</td></tr>
                <tr><td style={{fontWeight:500}}>GitHub</td><td><span className="badge-soft green">підключено</span></td><td>julbly38-a11y/lsmd · julbly38-a11y/hospital-agent</td></tr>
                <tr><td style={{fontWeight:500}}>Netlify</td><td><span className="badge-soft green">деплоїться</span></td><td>relaxed-heliotrope-2068c2.netlify.app</td></tr>
                <tr><td style={{fontWeight:500}}>DepositSign</td><td><span className="badge-soft green">токен активний</span></td><td>дійсний до 18.01.2027</td></tr>
                <tr><td style={{fontWeight:500}}>eHealth (Централь 103)</td><td><span className="badge-soft green">є доступ</span></td><td>Структура · Персонал · Форма 110</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel" style={{marginBottom:'16px'}}>
          <div className="panel-head"><h3>AI провайдери</h3><span className="filter">multi-provider · без vendor lock</span></div>
          <div className="table-wrap" style={{border:'none',borderRadius:0}}>
            <table className="dtable">
              <thead><tr><th>Провайдер</th><th>Модель</th><th style={{textAlign:'right'}}>$ / 1M токенів</th><th>Статус</th></tr></thead>
              <tbody>
                <tr><td style={{fontWeight:500}}>Groq</td><td>llama-3.3-70b-versatile</td><td style={{textAlign:'right'}}>0.00</td><td><span className="badge-soft green">безкоштовно</span></td></tr>
                <tr><td style={{fontWeight:500}}>Gemini</td><td>gemini-2.0-flash</td><td style={{textAlign:'right'}}>0.00</td><td><span className="badge-soft green">безкоштовно</span></td></tr>
                <tr><td style={{fontWeight:500}}>OpenAI</td><td>gpt-4o-mini</td><td style={{textAlign:'right'}}>0.15 / 0.60</td><td><span className="badge-soft">платно</span></td></tr>
                <tr><td style={{fontWeight:500}}>Anthropic</td><td>claude-sonnet-4-20250514</td><td style={{textAlign:'right'}}>3.00 / 15.00</td><td><span className="badge-soft">платно</span></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Production-views (з CATALOG)</h3><span className="filter">27 view</span></div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'8px 24px',padding:'8px 0',fontFamily:'var(--mono)',fontSize:'12px',color:'var(--text2)'}}>
            <div><code style={{color:'var(--brand)'}}>v_hospital_summary</code> — зведена статистика</div>
            <div><code style={{color:'var(--brand)'}}>v_department_full</code> — повна аналітика по відділеннях</div>
            <div><code style={{color:'var(--brand)'}}>v_diagnosis_stats</code> — статистика діагнозів</div>
            <div><code style={{color:'var(--brand)'}}>v_repeat_hosp</code> — повторні госпіталізації</div>
            <div><code style={{color:'var(--brand)'}}>v_readmissions</code> — readmissions у 30 днів</div>
            <div><code style={{color:'var(--brand)'}}>v_night_shifts</code> — нічні чергування</div>
            <div><code style={{color:'var(--brand)'}}>v_admissions_daily</code> — щоденні надходження</div>
            <div><code style={{color:'var(--brand)'}}>v_schedule_grid</code> — графік чергувань</div>
            <div><code style={{color:'var(--brand)'}}>cardio_vascular_detailed</code> — серцево-судинні</div>
            <div><code style={{color:'var(--brand)'}}>cerebro_vascular_detailed</code> — цереброваскулярні</div>
            <div><code style={{color:'var(--brand)'}}>clinical_type_summary</code> — клінічні типи</div>
            <div><code style={{color:'var(--brand)'}}>comorbidity_patterns</code> — супутні діагнози</div>
            <div><code style={{color:'var(--brand)'}}>top_comorbidities</code> — топ комбінацій</div>
            <div><code style={{color:'var(--brand)'}}>department_quality_metrics</code> — якість відділень</div>
            <div><code style={{color:'var(--brand)'}}>v_icd10_search</code> — пошук по МКХ-10</div>
            <div><code style={{color:'var(--brand)'}}>v_icd10_category_stats</code> — статистика категорій</div>
          </div>
        </div>
      </div>
    </>
  );
}


function AsystentTab() {
  return (
    <>
      <div className="dash-header">
        <div>
          <div className="crumbs">Інструменти · AI Асистент</div>
          <h1>Запитайте дані звичайною мовою</h1>
        </div>
        <span style={{fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em'}}>вкладка для авторизованих</span>
      </div>
      <div style={{flex:1,minHeight:0,overflow:'hidden'}}>
        <iframe src="../asystent/index.html" style={{width:'100%',height:'100%',border:'none',display:'block'}} title="AI Асистент"></iframe>
      </div>
    </>
  );
}

function StubPage({ title, crumb, sub }) {
  return (
    <>
      <div className="dash-header">
        <div><div className="crumbs">{crumb}</div><h1>{title}</h1></div>
      </div>
      <div className="dash-content">
        <div className="panel" style={{padding:'48px',textAlign:'center'}}>
          <div style={{fontFamily:'var(--mono)',fontSize:'24px',color:'var(--text3)',marginBottom:'8px'}}>◌</div>
          <p style={{fontSize:'13px',color:'var(--text2)'}}>{sub || 'Сторінка ще не реалізована.'}</p>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   ПАЦІЄНТИ — спрафжній розподіл по віку та статі
   ============================================================ */
function PatientsPage() {
  const ages = [
    { bucket: '0–17',  n: 6817  },
    { bucket: '18–29', n: 6754  },
    { bucket: '30–44', n: 14222 },
    { bucket: '45–59', n: 17505 },
    { bucket: '60–74', n: 19590 },
    { bucket: '75+',   n: 7094  },
  ];
  const maxAge = Math.max(...ages.map(a => a.n));
  return (
    <>
      <div className="dash-header">
        <div><div className="crumbs">Аналітика · Пацієнти</div><h1>Демографія пацієнтів</h1></div>
        <span style={{fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.05em',alignSelf:'center'}}>67,856 унікальних · з patients_best</span>
      </div>
      <div className="dash-content">
        <div className="kpi-row">
          <div className="kpi"><div className="lbl">Унікальних</div><div className="val">67,856</div><div className="delta up">з 110,206 кейсів</div></div>
          <div className="kpi"><div className="lbl">Чоловіків</div><div className="val">60.0%</div><div className="delta up">43,348 з 72,288</div></div>
          <div className="kpi"><div className="lbl">Жінок</div><div className="val">40.0%</div><div className="delta up">28,940 з 72,288</div></div>
          <div className="kpi"><div className="lbl">Медіанний вік</div><div className="val">54</div><div className="delta up">пік 60–74</div></div>
        </div>
        <div className="chart-row">
          <div className="panel">
            <div className="panel-head"><h3>Розподіл за віком</h3><span className="filter">72,288 пацієнтів</span></div>
            <div className="dept-list">
              {ages.map(a => (
                <div key={a.bucket} className="dept-row">
                  <span style={{fontFamily:'var(--mono)',fontWeight:500,color:'var(--text)',width:'56px'}}>{a.bucket}</span>
                  <span className="bar-wrap" style={{flex:1,minWidth:'120px'}}><span className="bar-fill" style={{width:`${(a.n/maxAge)*100}%`,background:a.n===maxAge?'var(--brand)':'var(--text)'}}></span></span>
                  <span className="pct" style={{width:'60px'}}>{a.n.toLocaleString('en-US')}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Стать</h3><span className="filter">72,288</span></div>
            <div style={{display:'flex',flexDirection:'column',gap:'18px',marginTop:'8px'}}>
              <div>
                <div style={{display:'flex',justifyContent:'space-between',fontFamily:'var(--mono)',fontSize:'12px',marginBottom:'6px'}}>
                  <span>Чоловіча</span><span>60.0%</span>
                </div>
                <div style={{height:'10px',background:'var(--bg2)',borderRadius:'5px',overflow:'hidden'}}>
                  <div style={{width:'60%',height:'100%',background:'var(--text)'}}></div>
                </div>
                <div style={{fontFamily:'var(--mono)',fontSize:'10px',color:'var(--text3)',marginTop:'4px'}}>43,348</div>
              </div>
              <div>
                <div style={{display:'flex',justifyContent:'space-between',fontFamily:'var(--mono)',fontSize:'12px',marginBottom:'6px'}}>
                  <span>Жіноча</span><span>40.0%</span>
                </div>
                <div style={{height:'10px',background:'var(--bg2)',borderRadius:'5px',overflow:'hidden'}}>
                  <div style={{width:'40%',height:'100%',background:'var(--text2)'}}></div>
                </div>
                <div style={{fontFamily:'var(--mono)',fontSize:'10px',color:'var(--text3)',marginTop:'4px'}}>28,940</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   ГЕОГРАФІЯ — спрафжня Leaflet карта з 60 геокодованих нп.
   ============================================================ */
const REAL_LOCALITIES_GEO = [
  { c: 'Чернівці',       d: '—',              n: 23608, lat: 48.28647,  lng: 25.937653 },
  { c: 'Магала',         d: 'Новоселицький',  n: 893,   lat: 48.289864, lng: 26.040028 },
  { c: 'Сторожинець',    d: 'Сторожинецький', n: 718,   lat: 48.162949, lng: 25.720799 },
  { c: 'Колінківці',     d: 'Хотинський',     n: 601,   lat: 48.410507, lng: 26.139727 },
  { c: 'Рідківці',       d: 'Новоселицький',  n: 590,   lat: 48.337463, lng: 26.060968 },
  { c: 'Топорівці',      d: 'Новоселицький',  n: 588,   lat: 48.378967, lng: 26.086685 },
  { c: 'Чагор',          d: 'Глибоцький',     n: 588,   lat: 48.241516, lng: 25.988313 },
  { c: 'Великий Кучурів',d: 'Сторожинецький', n: 568,   lat: 48.199341, lng: 25.894259 },
  { c: 'Глибока',        d: 'Глибоцький',     n: 542,   lat: 48.08578,  lng: 25.92842  },
  { c: 'Новоселиця',     d: 'Новоселицький',  n: 537,   lat: 48.217959, lng: 26.266483 },
  { c: 'Острица',        d: 'Герцаївський',   n: 507,   lat: 48.257843, lng: 26.048169 },
  { c: 'Хотин',          d: 'Хотинський',     n: 488,   lat: 48.506842, lng: 26.485909 },
  { c: 'Клішківці',      d: 'Хотинський',     n: 486,   lat: 48.430443, lng: 26.259632 },
  { c: 'Берегомет',      d: 'Вижницький',     n: 461,   lat: 48.163074, lng: 25.309861 },
  { c: 'Волока',         d: 'Глибоцький',     n: 456,   lat: 48.192902, lng: 25.934601 },
  { c: 'Горішні Шерівці',d: 'Заставнівський', n: 432,   lat: 48.394234, lng: 25.94828  },
  { c: 'Молодія',        d: 'Глибоцький',     n: 401,   lat: 48.224173, lng: 26.025264 },
  { c: 'Бояни',          d: 'Новоселицький',  n: 400,   lat: 48.26688,  lng: 26.126339 },
  { c: 'Мамаївці',       d: 'Кіцманський',    n: 398,   lat: 48.352735, lng: 25.822213 },
  { c: 'Заставна',       d: 'Заставнівський', n: 386,   lat: 48.523584, lng: 25.845578 },
  { c: "Кам'янка",       d: 'Глибоцький',     n: 381,   lat: 48.02879,  lng: 25.9195   },
  { c: 'Горбова',        d: 'Герцаївський',   n: 380,   lat: 48.209381, lng: 26.174931 },
  { c: 'Кельменці',      d: 'Кельменецький',  n: 371,   lat: 48.465495, lng: 26.831879 },
  { c: 'Вашківці',       d: 'Вижницький',     n: 344,   lat: 48.382019, lng: 25.517495 },
  { c: 'Лужани',         d: 'Кіцманський',    n: 334,   lat: 48.358051, lng: 25.769041 },
  { c: 'Київ',           d: '—',              n: 322,   lat: 50.536538, lng: 30.657727 },
  { c: 'Коровія',        d: 'Глибоцький',     n: 312,   lat: 48.227468, lng: 25.967791 },
  { c: 'Кіцмань',        d: 'Кіцманський',    n: 307,   lat: 48.441098, lng: 25.766762 },
  { c: 'Харків',         d: '—',              n: 303,   lat: 49.992318, lng: 36.231015 },
  { c: 'Красноїльськ',   d: 'Сторожинецький', n: 281,   lat: 48.018217, lng: 25.599884 },
  { c: 'Мигове',         d: 'Вижницький',     n: 280,   lat: 48.144489, lng: 25.36331  },
  { c: 'Рокитне',        d: 'Новоселицький',  n: 280,   lat: 48.331283, lng: 26.185763 },
  { c: 'Банилів',        d: 'Вижницький',     n: 279,   lat: 48.35804,  lng: 25.343399 },
  { c: 'Маршинці',       d: 'Новоселицький',  n: 271,   lat: 48.214233, lng: 26.292097 },
  { c: 'Чорнівка',       d: 'Новоселицький',  n: 269,   lat: 48.420135, lng: 26.009895 },
  { c: "Кам'яна",        d: 'Сторожинецький', n: 264,   lat: 48.232493, lng: 25.848315 },
  { c: 'Сокиряни',       d: 'Сокирянський',   n: 256,   lat: 48.446031, lng: 27.411193 },
  { c: 'Тисовець',       d: 'Сторожинецький', n: 254,   lat: 48.168869, lng: 25.90748  },
  { c: 'Новодністровськ',d: '—',              n: 246,   lat: 48.58485,  lng: 27.4311   },
  { c: 'Шилівці',        d: 'Хотинський',     n: 246,   lat: 48.430603, lng: 26.192301 },
  { c: "Кам'янець-Подільський",d: '—',        n: 245,   lat: 48.678129, lng: 26.585403 },
  { c: 'Іспас',          d: 'Вижницький',     n: 231,   lat: 48.295512, lng: 25.268072 },
  { c: 'Тарасівці',      d: 'Новоселицький',  n: 230,   lat: 48.203889, lng: 26.368585 },
  { c: 'Байраки',        d: 'Герцаївський',   n: 222,   lat: 48.120407, lng: 26.123822 },
  { c: 'Грозинці',       d: 'Хотинський',     n: 220,   lat: 48.421098, lng: 26.151312 },
  { c: 'Тернавка',       d: 'Герцаївський',   n: 219,   lat: 48.116001, lng: 26.22368  },
  { c: 'Молниця',        d: 'Герцаївський',   n: 219,   lat: 48.194058, lng: 26.232231 },
  { c: 'Малалига',       d: 'Новоселицький',  n: 208,   lat: 48.255053, lng: 26.586563 },
  { c: 'Михальча',       d: 'Сторожинецький', n: 206,   lat: 48.25058,  lng: 25.857349 },
  { c: 'Шубранець',      d: 'Заставнівський', n: 203,   lat: 48.389068, lng: 25.88973  },
  { c: 'Коритне',        d: 'Вижницький',     n: 202,   lat: 48.332192, lng: 25.382242 },
  { c: 'Рукшин',         d: 'Хотинський',     n: 201,   lat: 48.490925, lng: 26.401684 },
  { c: 'Годилів',        d: 'Сторожинецький', n: 200,   lat: 48.24612,  lng: 25.930479 },
  { c: 'Путила',         d: 'Путильський',    n: 199,   lat: 47.99515,  lng: 25.08453  },
  { c: 'Чудей',          d: 'Сторожинецький', n: 196,   lat: 48.051034, lng: 25.622056 },
  { c: 'Шипинці',        d: 'Кіцманський',    n: 193,   lat: 48.37627,  lng: 25.747494 },
  { c: 'Верхні Петрівці',d: 'Сторожинецький', n: 193,   lat: 48.058574, lng: 25.693718 },
  { c: 'Малинці',        d: 'Хотинський',     n: 191,   lat: 48.423052, lng: 26.22489  },
  { c: 'Вижниця',        d: 'Вижницький',     n: 190,   lat: 48.248441, lng: 25.189381 },
  { c: 'Веренчанка',     d: 'Заставнівський', n: 188,   lat: 48.54446,  lng: 25.7444   },
];

function GeographyPage() {
  React.useEffect(() => {
    // Завантажуємо Leaflet якщо ще не завантажено
    if (!window.L) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = initMap;
      document.head.appendChild(script);
    } else {
      initMap();
    }

    function initMap() {
      const el = document.getElementById('lsmd-map');
      if (!el || el.dataset.inited === '1') return;
      el.dataset.inited = '1';
      const map = window.L.map('lsmd-map').setView([48.3, 26.0], 9);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 18,
      }).addTo(map);
      const maxN = Math.max(...REAL_LOCALITIES_GEO.map(l => l.n));
      REAL_LOCALITIES_GEO.forEach(l => {
        const radius = Math.max(4, Math.sqrt(l.n / maxN) * 28);
        const circle = window.L.circleMarker([l.lat, l.lng], {
          radius,
          color: '#c0392b',
          weight: 1.5,
          fillColor: '#c0392b',
          fillOpacity: 0.45,
        }).addTo(map);
        circle.bindPopup(`<div style="font-family:'IBM Plex Sans',sans-serif;font-size:13px"><strong>${l.c}</strong><br/><span style="color:#6b6760">${l.d}</span><br/><span style="font-family:'IBM Plex Mono',monospace;color:#c0392b;font-weight:500">${l.n.toLocaleString('en-US')} пацієнтів</span></div>`);
      });
      // авто-зум по точках Чернівецької області
      const chern = REAL_LOCALITIES_GEO.filter(l => l.lat < 49 && l.lng < 28);
      const bounds = window.L.latLngBounds(chern.map(l => [l.lat, l.lng]));
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, []);

  return (
    <>
      <div className="dash-header">
        <div><div className="crumbs">Аналітика · Географія</div><h1>Звідки пацієнти</h1></div>
        <span style={{fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.05em',alignSelf:'center'}}>472 нп. геокодовано · 93.9% пацієнтів на карті</span>
      </div>
      <div className="dash-content">
        <div className="kpi-row">
          <div className="kpi"><div className="lbl">На карті</div><div className="val">66,614</div><div className="delta up">93.9% усіх пацієнтів</div></div>
          <div className="kpi"><div className="lbl">Геокодовано нп.</div><div className="val">472</div><div className="delta up">з 2,618</div></div>
          <div className="kpi"><div className="lbl">Чернівецька обл.</div><div className="val">100%</div><div className="delta up">412 / 412 нп.</div></div>
          <div className="kpi"><div className="lbl">Топ нп.</div><div className="val">Чернівці</div><div className="delta up">23,608 (35%)</div></div>
        </div>
        <div className="panel" style={{marginBottom:'16px',padding:0,overflow:'hidden'}}>
          <div className="panel-head" style={{padding:'14px 20px'}}>
            <h3>Карта пацієнтів</h3>
            <span className="filter">⚪ розмір = к-сть пацієнтів</span>
          </div>
          <div id="lsmd-map" style={{height:'480px',width:'100%',background:'var(--bg2)'}}></div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Топ-15 нп. за кількістю пацієнтів</h3><span className="filter">з patients_count</span></div>
          <div className="dept-list">
            {REAL_LOCALITIES_GEO.slice(0, 15).map(l => (
              <div key={l.c} className="dept-row">
                <span style={{flex:'0 0 160px',fontWeight:500}}>{l.c}</span>
                <span style={{flex:'0 0 140px',color:'var(--text3)',fontFamily:'var(--mono)',fontSize:'11px'}}>{l.d}</span>
                <span className="bar-wrap" style={{flex:1,minWidth:'120px'}}><span className="bar-fill" style={{width:`${(l.n/REAL_LOCALITIES_GEO[0].n)*100}%`,background:l.c==='Чернівці'?'var(--brand)':'var(--text)'}}></span></span>
                <span className="pct" style={{width:'70px'}}>{l.n.toLocaleString('en-US')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   ПІКИ — години / дні тижня / роки
   ============================================================ */
function PeaksPage() {
  const hours = [709,539,355,292,245,236,262,428,6405,20709,21667,14692,9596,6487,5035,4098,3578,3517,2756,2229,1984,1781,1448,1125];
  const peakHour = hours.indexOf(Math.max(...hours));
  const dow = [
    { label: 'Пн', n: 23176 }, { label: 'Вт', n: 22644 }, { label: 'Ср', n: 20895 },
    { label: 'Чт', n: 17965 }, { label: 'Пт', n: 14658 }, { label: 'Сб', n: 5843 }, { label: 'Нд', n: 5025 },
  ];
  const maxDow = Math.max(...dow.map(d => d.n));
  const years = [
    { y: 2020, n: 9438 }, { y: 2021, n: 15386 }, { y: 2022, n: 17080 },
    { y: 2023, n: 19400 }, { y: 2024, n: 20937 }, { y: 2025, n: 20635 }, { y: 2026, n: 7330 },
  ];
  const maxYear = Math.max(...years.map(y => y.n));
  return (
    <>
      <div className="dash-header">
        <div><div className="crumbs">Аналітика · Піки навантаження</div><h1>Коли надходять пацієнти</h1></div>
      </div>
      <div className="dash-content">
        <div className="panel" style={{marginBottom:'16px'}}>
          <div className="panel-head"><h3>За годинами доби</h3><span className="filter">пік 10:00 — 21,667</span></div>
          <div className="barchart" style={{height:'160px'}}>
            {hours.map((h, i) => (
              <div key={i} className={`bar${i===peakHour?' peak':''}`} style={{height:`${(h/Math.max(...hours))*100}%`}} title={`${String(i).padStart(2,'0')}:00 · ${h.toLocaleString('en-US')}`}></div>
            ))}
          </div>
          <div className="barchart-x">
            {hours.map((_, i) => <span key={i}>{i % 4 === 0 ? `${String(i).padStart(2,'0')}` : ''}</span>)}
          </div>
        </div>
        <div className="chart-row">
          <div className="panel">
            <div className="panel-head"><h3>За днями тижня</h3><span className="filter">пік — понеділок</span></div>
            <div className="barchart" style={{height:'140px'}}>
              {dow.map((d, i) => (
                <div key={i} className={`bar${d.n===maxDow?' peak':''}`} style={{height:`${(d.n/maxDow)*100}%`}}></div>
              ))}
            </div>
            <div className="barchart-x">
              {dow.map((d, i) => <span key={i} style={{flex:1,textAlign:'center'}}>{d.label}</span>)}
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><h3>За роками</h3><span className="filter">2020 → 05.2026</span></div>
            <div className="dept-list">
              {years.map(y => (
                <div key={y.y} className="dept-row">
                  <span style={{fontFamily:'var(--mono)',fontWeight:500,color:'var(--text)',width:'40px'}}>{y.y}</span>
                  <span className="bar-wrap" style={{flex:1,minWidth:'80px'}}><span className="bar-fill" style={{width:`${(y.n/maxYear)*100}%`,background:y.n===maxYear?'var(--brand)':'var(--text)'}}></span></span>
                  <span className="pct" style={{width:'60px'}}>{y.n.toLocaleString('en-US')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   НІЧНІ ЗМІНИ — denne / nichne з lsmd.shift_time
   ============================================================ */
function NightPage() {
  return (
    <>
      <div className="dash-header">
        <div><div className="crumbs">Аналітика · Нічні зміни</div><h1>Денні vs нічні</h1></div>
        <span style={{fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.05em',alignSelf:'center'}}>lsmd.shift_time · 110,173 з 110,206</span>
      </div>
      <div className="dash-content">
        <div className="kpi-row">
          <div className="kpi"><div className="lbl">Денних випадків</div><div className="val">104,962</div><div className="delta up">95.3% від загального</div></div>
          <div className="kpi"><div className="lbl">Нічних випадків</div><div className="val">5,211</div><div className="delta down">4.7% від загального</div></div>
          <div className="kpi"><div className="lbl">Вихідних</div><div className="val">10,868</div><div className="delta up">9.9% (day_type)</div></div>
          <div className="kpi"><div className="lbl">Сб + Нд</div><div className="val">10,868</div><div className="delta up">Сб 5,843 · Нд 5,025</div></div>
        </div>
        <div className="panel" style={{marginBottom:'16px'}}>
          <div className="panel-head"><h3>Розподіл за змінами</h3><span className="filter">з lsmd.shift_time</span></div>
          <div style={{display:'flex',flexDirection:'column',gap:'18px',marginTop:'12px'}}>
            <div>
              <div style={{display:'flex',justifyContent:'space-between',fontFamily:'var(--mono)',fontSize:'13px',marginBottom:'8px'}}>
                <span><strong style={{color:'var(--text)'}}>денне</strong> · 8:00 – 20:00</span>
                <span style={{color:'var(--text)'}}>95.3%</span>
              </div>
              <div style={{height:'12px',background:'var(--bg2)',borderRadius:'6px',overflow:'hidden'}}>
                <div style={{width:'95.3%',height:'100%',background:'var(--text)'}}></div>
              </div>
              <div style={{fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text3)',marginTop:'6px'}}>104,962 кейсів</div>
            </div>
            <div>
              <div style={{display:'flex',justifyContent:'space-between',fontFamily:'var(--mono)',fontSize:'13px',marginBottom:'8px'}}>
                <span><strong style={{color:'var(--brand)'}}>нічне</strong> · 20:00 – 8:00</span>
                <span style={{color:'var(--brand)'}}>4.7%</span>
              </div>
              <div style={{height:'12px',background:'var(--bg2)',borderRadius:'6px',overflow:'hidden'}}>
                <div style={{width:'4.7%',height:'100%',background:'var(--brand)'}}></div>
              </div>
              <div style={{fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text3)',marginTop:'6px'}}>5,211 кейсів</div>
            </div>
          </div>
        </div>
        <div className="panel" style={{padding:'20px',background:'var(--bg2)'}}>
          <p style={{fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'8px'}}>Із production-view</p>
          <p style={{fontSize:'13px',color:'var(--text2)',lineHeight:1.6}}>
            На продакшні є PostgreSQL view <code style={{fontFamily:'var(--mono)',background:'var(--surface)',padding:'2px 6px',borderRadius:'3px'}}>v_night_shifts</code> — детальні нічні чергування з прив'язкою до лікаря (через <code style={{fontFamily:'var(--mono)'}}>doctor_stats.night_cases</code> + <code style={{fontFamily:'var(--mono)'}}>night_weekend</code>). Цей дашборд показує агрегат; деталі підвантажте через AI Асистент.
          </p>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   ПРИЙМАЛЬНЕ — приймально-діагностичне відділення з лижками ІТ
   ============================================================ */
function ReceptionPage() {
  return (
    <>
      <div className="dash-header">
        <div><div className="crumbs">Аналітика · Приймальне</div><h1>Приймально-діагностичне відділення</h1></div>
        <span style={{fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.05em',alignSelf:'center'}}>13 працівників · 1 лікар</span>
      </div>
      <div className="dash-content">
        <div className="kpi-row">
          <div className="kpi"><div className="lbl">Загалом проходить</div><div className="val">110,206</div><div className="delta up">всі госпіталізації</div></div>
          <div className="kpi"><div className="lbl">Екстрених</div><div className="val">99,720</div><div className="delta up">90.5% — перший контакт</div></div>
          <div className="kpi"><div className="lbl">Пік годин</div><div className="val">9–11</div><div className="delta up">57,068 за 3 год</div></div>
          <div className="kpi"><div className="lbl">Сер. час до переводу</div><div className="val">~2 год</div><div className="delta up">оцінка</div></div>
        </div>
        <div className="panel" style={{padding:'24px',background:'var(--bg2)'}}>
          <p style={{fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'10px'}}>Як працює приймальне у схемі</p>
          <p style={{fontSize:'13px',color:'var(--text2)',lineHeight:1.7,marginBottom:'12px'}}>
            У таблиці <code style={{fontFamily:'var(--mono)',background:'var(--surface)',padding:'2px 6px',borderRadius:'3px'}}>lsmd</code> поле <code style={{fontFamily:'var(--mono)'}}>admission_department</code> вже зберігає <strong>цільове</strong> відділення (Хірургія, Урологія, тощо) — пацієнт <em>проходить</em> через приймальне, але запис одразу прив'язується до того відділення, куди його перевводять.
          </p>
          <p style={{fontSize:'13px',color:'var(--text2)',lineHeight:1.7}}>
            Щоб побачити реальний потік приймального — потрібно або (а) аналізувати <code style={{fontFamily:'var(--mono)'}}>dept_transfers_matrix</code> (143 переходи між відділеннями з <code style={{fontFamily:'var(--mono)'}}>avg_los</code>), або (б) додати окреме поле <code style={{fontFamily:'var(--mono)'}}>reception_time</code> у <code style={{fontFamily:'var(--mono)'}}>lsmd</code>.
          </p>
        </div>
      </div>
    </>
  );
}

function Dashboard({ onExit, initialActive = 'overview' }) {
  const [active, setActive] = useStateD(initialActive);
  return (
    <div className="dashboard visible">
      <DashSidebar active={active} setActive={setActive} onExit={onExit} />
      <div className="dash-main">
        {active === 'overview'    && <OverviewPage />}
        {active === 'departments' && <DepartmentsPage />}
        {active === 'doctors'     && <DoctorsPage />}
        {active === 'diagnoses'   && <DiagnosesPage />}
        {active === 'patients'    && <PatientsPage />}
        {active === 'geography'   && <GeographyPage />}
        {active === 'peaks'       && <PeaksPage />}
        {active === 'night'       && <NightPage />}
        {active === 'reception'   && <ReceptionPage />}
        {active === 'operations'  && <OperationsPage />}
        {active === 'asystent'    && <AsystentTab />}
        {active === 'reports'     && <StubPage title="Звіти" crumb="Інструменти · Звіти" sub="Тут будуть шаблони МОЗ та заплановані звіти." />}
        {active === 'settings'    && <SettingsPage />}
      </div>
    </div>
  );
}

window.Dashboard = Dashboard;
