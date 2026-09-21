/* Контроль записів (public/quality.html) — епізоди з помилками, що впливають
   на оплату НСЗУ. Епізоди не змінюються: над кожним некоректним епізодом —
   нотатка для того, хто може його виправити (лікар, який веде/підписав, або
   завідувач, якщо лікаря немає). Первинна підказка — що не так і яке правило,
   вторинна — деталі з даних самого епізоду. Обсяг (головний — усе, завідувач —
   відділення, лікар — свої) і сегмент визначає сервер (/api/lpz-case-quality).
   Типи зауважень, нотатки й картка епізоду — public/js/quality-notes.js. */

const Q_SEGMENTS = {
  open: {
    pill: 'ВІДКРИТІ',
    title: 'Пацієнти, які зараз у відділеннях',
    what: 'Помилки, які вже є в записі, і попередження — що стане помилкою, якщо не доповнити до виписки.',
    why: 'Найдешевший момент для виправлення: пацієнт ще у відділенні, лікар пам\'ятає деталі, випадок ще не поданий.',
  },
  fixable: {
    pill: 'МОЖНА ВИПРАВИТИ',
    title: 'Закриті епізоди, які ще можна виправити',
    what: 'Виписані пацієнти з помилками в записі, строк подачі змін яких ще не минув. Найближчі строки — зверху.',
    why: 'Строк — до 10-го робочого дня місяця, наступного за місяцем виписки. Це припущення за правилами НСЗУ, його варто уточнити з економістом лікарні.',
  },
  lost: {
    pill: 'ВЖЕ НЕ ВИПРАВИТИ',
    title: 'Строк виправлення минув',
    what: 'Закриті епізоди з помилками, які вже подані й не можуть бути виправлені.',
    why: 'Фактичні втрати. Показують, які помилки повторюються і в яких відділеннях, щоб не допускати їх надалі.',
  },
  warned: {
    pill: 'ПОПЕРЕДЖЕННЯ',
    title: 'Закриті епізоди лише з попередженнями',
    what: 'Виписані пацієнти, в записах яких немає помилок, а є лише зауваження, що за перевіркою на розрахунку НСЗУ оплату не блокують: немає лікаря, один діагноз, не вказано «Вид травми».',
    why: 'Не рахуються помилками й не мають грошового ризику, але правила НСЗУ можуть змінитись — тому зауваження зберігаються, щоб було видно, що варто виправляти.',
  },
};

const Q_SCOPE_LABEL = { hospital: 'уся лікарня', department: 'моє відділення', doctor: 'мої епізоди' };

// basis: 'all' — усі епізоди (точні за розрахунком НСЗУ + орієнтовні);
// 'nszu' — лише епізоди, для яких є розрахунок НСЗУ (package-validation).
const Q_STATE = { rows: [], flag: null, dept: null, segment: 'open', scope: null, today: null, money: false, pricingSource: null, basis: 'all' };

// Гроші (est_price/est_risk) сервер віддає лише головному лікарю.
const qSum = rows => rows.reduce((s, r) => s + (r.est_risk || 0), 0);
function qMoney(v) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace('.', ',')} млн`;
  if (v >= 1e3) return `${Math.round(v / 1e3)} тис`;
  return `${Math.round(v)}`;
}
function qFmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${qFmtDate(iso).slice(0, 5)} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function qDaysLeft(deadline) { return qDaysBetween(Q_STATE.today, deadline); }

function qSegmentRows(seg = Q_STATE.segment) { return Q_STATE.rows.filter(r => r.segment === seg && qHasIssues(r) && (Q_STATE.basis === 'all' || r.nszu_priced)); }

function qVisibleRows() {
  let rows = qSegmentRows();
  if (Q_STATE.flag) rows = rows.filter(r => qHas(r, Q_STATE.flag));
  if (Q_STATE.dept) rows = rows.filter(r => (r.department_name || '—') === Q_STATE.dept);
  const seg = Q_STATE.segment;
  const headFirst = Q_STATE.scope === 'department';
  return rows.sort((a, b) => {
    if (headFirst && a.addressee !== b.addressee) return a.addressee === 'head' ? -1 : 1;
    if (seg === 'fixable') return (a.fix_deadline || '').localeCompare(b.fix_deadline || '') || (b.flags.length - a.flags.length);
    if (seg === 'lost') return (b.discharge_at || '').localeCompare(a.discharge_at || '');
    return (b.flags.length - a.flags.length) || (b.warnings.length - a.warnings.length) || (Number(b.los_days) - Number(a.los_days));
  });
}

function renderQualityHeader(root, checkedAt) {
  const logo = document.createElement('img');
  logo.className = 'logo';
  logo.alt = 'Логотип';
  root.appendChild(logo);
  root.insertAdjacentHTML('beforeend', `
    <div class="name-block"><div class="title"></div><div class="tagline"></div></div>
    <div class="kpi-row q-kpi-row">
      <div class="kpi"><div class="kpi-num" data-q="checked">—</div><div class="kpi-label">перевірено</div></div>
      <div class="kpi"><div class="kpi-num q-alert" data-q="open">—</div><div class="kpi-label">відкриті</div></div>
      <div class="kpi"><div class="kpi-num q-alert" data-q="fixable">—</div><div class="kpi-label">виправити</div></div>
      <div class="kpi"><div class="kpi-num q-alert" data-q="urgent">—</div><div class="kpi-label">строк ≤ 3 дн.</div></div>
      <div class="kpi"><div class="kpi-num" data-q="lost">—</div><div class="kpi-label">втрачено</div></div>
    </div>
    <div class="year-filter q-pills" id="qPills">
      ${Object.entries(Q_SEGMENTS).map(([k, s]) => `<div class="ypill${k === Q_STATE.segment ? ' active' : ''}" data-seg="${k}">${s.pill} <span class="q-pill-n" data-seg-n="${k}"></span></div>`).join('')}
      <div class="ypill" data-href="/entry.html">← КАБІНЕТ</div>
    </div>
    <div class="year-badge">
      <span class="year-num small">КОНТРОЛЬ</span>
      <span class="year-badge-month">${qFmtTime(checkedAt)}</span>
    </div>
  `);
  root.querySelectorAll('#qPills .ypill').forEach(p => p.addEventListener('click', () => {
    if (p.dataset.href) { window.location.href = p.dataset.href; return; }
    root.querySelectorAll('#qPills .ypill[data-seg]').forEach(x => x.classList.remove('active'));
    p.classList.add('active');
    Q_STATE.segment = p.dataset.seg;
    Q_STATE.flag = null;
    Q_STATE.dept = null;
    renderQualityAll();
  }));
}

function renderQualityFields(root) {
  (root.querySelector('.lf-left-top') || root).insertAdjacentHTML('beforeend', `
    <div class="docs-title">Типи зауважень</div>
    <div class="q-list" id="qFlagList"></div>
  `);
  (root.querySelector('.lf-left-bottom') || root).insertAdjacentHTML('beforeend', `
    <div class="docs-title">${Q_STATE.scope === 'doctor' ? 'Мої епізоди за відділеннями' : 'Відділення'}</div>
    <div class="q-list" id="qDeptList"></div>
  `);
  (root.querySelector('.lf-right-top') || root).insertAdjacentHTML('beforeend', `<div class="q-explain" id="qExplain"></div>`);
  (root.querySelector('.lf-right-bottom') || root).insertAdjacentHTML('beforeend', `
    <div class="census-title q-cases-title" id="qCasesTitle"></div>
    <div class="census-list" id="qCases"></div>
  `);
  const workBand = root.querySelector('.work-band');
  fitHeightTo(document.getElementById('qFlagList'), workBand ? offsetInSlide(workBand) : 500);
  fitHeightTo(document.getElementById('qDeptList'), offsetInSlide(root) + root.clientHeight - 20);
  ['qFlagList', 'qDeptList', 'qCases'].forEach(id => {
    const el = document.getElementById(id);
    enableDragScroll(el, 'y');
    el.addEventListener('scroll', () => updateFadeMask(el, 'y'));
  });
}

function renderQualityKpi() {
  const set = (k, v, label) => {
    const el = document.querySelector(`[data-q="${k}"]`);
    if (!el) return;
    el.textContent = v;
    if (label) el.nextElementSibling.textContent = label;
  };
  const open = qSegmentRows('open');
  const fixable = qSegmentRows('fixable');
  const urgent = fixable.filter(r => (qDaysLeft(r.fix_deadline) ?? 99) <= 3);
  const lost = qSegmentRows('lost');
  set('checked', fmt(Q_STATE.basis === 'nszu' ? Q_STATE.nszuPricedTotal : Q_STATE.totalChecked));
  if (Q_STATE.money) {
    set('open', qMoney(qSum(open)), 'ризик, грн');
    set('fixable', qMoney(qSum(fixable)), 'врятувати, грн');
    set('urgent', qMoney(qSum(urgent)), '≤ 3 дн., грн');
    set('lost', qMoney(qSum(lost)), 'втрачено, грн');
  } else {
    set('open', fmt(open.length));
    set('fixable', fmt(fixable.length));
    set('urgent', fmt(urgent.length));
    set('lost', fmt(lost.length));
  }
  Object.keys(Q_SEGMENTS).forEach(k => {
    const el = document.querySelector(`[data-seg-n="${k}"]`);
    if (el) el.textContent = `· ${qSegmentRows(k).length}`;
  });
}

function renderQualityFlagList() {
  const el = document.getElementById('qFlagList');
  const base = qSegmentRows().filter(r => !Q_STATE.dept || (r.department_name || '—') === Q_STATE.dept);
  const isOpen = Q_STATE.segment === 'open';
  const isWarned = Q_STATE.segment === 'warned';
  const items = Q_FLAG_ORDER.map(code => {
    const errors = base.filter(r => (r.flags || []).includes(code)).length;
    const warnings = base.filter(r => (r.warnings || []).includes(code)).length;
    return { code, errors, warnings, n: errors + warnings };
  }).filter(i => i.n > 0);
  el.innerHTML = items.map(i => {
    const f = Q_FLAGS[i.code];
    const base0 = isOpen
      ? [i.errors && `помилка вже є: ${i.errors}`, i.warnings && `попередження: ${i.warnings}`].filter(Boolean).join(' · ')
      : isWarned ? 'попередження, оплату не блокує'
      : (f.high ? 'високий ризик для оплати' : 'перевірити');
    const sub = Q_STATE.money && !isWarned ? `${base0} · ≈ ${qMoney(qSum(base.filter(r => qHas(r, i.code))))} грн` : base0;
    const high = isWarned ? false : isOpen ? i.errors > 0 : f.high;
    return `
      <div class="q-item${Q_STATE.flag === i.code ? ' active' : ''}${high ? ' q-high' : ''}" data-flag="${i.code}">
        ${f.title}<span class="q-count">${i.n}</span>
        <span class="q-sub">${sub}</span>
      </div>`;
  }).join('') || '<div class="census-empty">Зауважень немає</div>';
  el.querySelectorAll('.q-item').forEach(item => item.addEventListener('click', () => {
    Q_STATE.flag = Q_STATE.flag === item.dataset.flag ? null : item.dataset.flag;
    renderQualityAll();
  }));
  updateFadeMask(el, 'y');
}

function renderQualityDeptList() {
  const el = document.getElementById('qDeptList');
  const base = qSegmentRows().filter(r => !Q_STATE.flag || qHas(r, Q_STATE.flag));
  const map = new Map();
  base.forEach(r => {
    const k = r.department_name || '—';
    const m = map.get(k) || { n: 0, head: 0, urgent: 0, risk: 0 };
    m.n += 1;
    m.risk += r.est_risk || 0;
    if (r.addressee === 'head') m.head += 1;
    if ((qDaysLeft(r.fix_deadline) ?? 99) <= 3) m.urgent += 1;
    map.set(k, m);
  });
  const seg = Q_STATE.segment;
  el.innerHTML = [...map.entries()].sort((a, b) => b[1].n - a[1].n).map(([name, m]) => {
    const parts = [];
    if (Q_STATE.money) parts.push(`≈ ${qMoney(m.risk)} грн`);
    if (Q_STATE.scope !== 'doctor' && m.head) parts.push(`завідувачу (без лікаря): ${m.head}`);
    if (seg === 'fixable' && m.urgent) parts.push(`строк ≤ 3 дн.: ${m.urgent}`);
    if (seg === 'lost') parts.push('втрачено');
    return `
      <div class="q-item${Q_STATE.dept === name ? ' active' : ''}" data-dept="${qEsc(name)}">
        ${qEsc(name)}<span class="q-count">${m.n}</span>
        <span class="q-sub">${parts.join(' · ') || 'усі адресовано лікарям'}</span>
      </div>`;
  }).join('') || '<div class="census-empty">Немає даних</div>';
  el.querySelectorAll('.q-item').forEach(item => item.addEventListener('click', () => {
    Q_STATE.dept = Q_STATE.dept === item.dataset.dept ? null : item.dataset.dept;
    renderQualityAll();
  }));
  updateFadeMask(el, 'y');
}

// Перемикач бази: усі епізоди чи лише ті, що мають розрахунок НСЗУ (точні).
function qBasisSwitchHtml() {
  const b = (k, label) => `<span class="q-basis-opt${Q_STATE.basis === k ? ' active' : ''}" data-basis="${k}">${label}</span>`;
  return `<div class="q-basis">${b('all', `усі епізоди · ${fmt(Q_STATE.totalChecked)}`)}${b('nszu', `реальні дані НСЗУ · ${fmt(Q_STATE.nszuPricedTotal)}`)}</div>`;
}

function renderQualityExplain() {
  const el = document.getElementById('qExplain');
  const seg = Q_SEGMENTS[Q_STATE.segment];
  const visible = qVisibleRows();
  const deptN = new Set(visible.map(r => r.department_name)).size;
  const headN = visible.filter(r => r.addressee === 'head').length;
  const moneyLabel = { open: 'під ризиком, грн (оцінка)', fixable: 'можна врятувати, грн (оцінка)', lost: 'втрачено, грн (оцінка)', warned: 'під ризиком, грн (оцінка)' }[Q_STATE.segment];
  const second = Q_STATE.money
    ? { v: qMoney(qSum(visible)), l: moneyLabel }
    : Q_STATE.segment === 'fixable'
      ? { v: visible.filter(r => (qDaysLeft(r.fix_deadline) ?? 99) <= 3).length, l: 'строк спливає за 3 дні' }
      : { v: headN, l: 'адресовано завідувачам (без лікаря)' };
  const share = Q_STATE.nszuMoneyShare != null ? ` (≈ ${Math.round(Q_STATE.nszuMoneyShare * 100)}% суми)` : '';
  const coverage = `<div class="q-source"><b>Реальні дані НСЗУ (розрахунок package-validation):</b> ${fmt(Q_STATE.nszuPricedTotal)} з ${fmt(Q_STATE.totalChecked)} епізодів${share} — точна ціна; решта — орієнтовна оцінка.</div>`;
  const source = (Q_STATE.money && Q_STATE.pricingSource ? `<div class="q-source">${qEsc(Q_STATE.pricingSource)}</div>` : '') + coverage;
  const stats = `
    <div class="q-explain-stats">
      <div class="q-stat"><div class="q-stat-v">${visible.length}</div><div class="q-stat-l">епізодів</div></div>
      <div class="q-stat"><div class="q-stat-v">${second.v}</div><div class="q-stat-l">${second.l}</div></div>
      <div class="q-stat"><div class="q-stat-v">${deptN}</div><div class="q-stat-l">відділень</div></div>
    </div>`;

  if (!Q_STATE.flag) {
    el.innerHTML = `
      <div class="q-explain-head">
        <div class="q-explain-title">${seg.title}</div>
        <div class="q-explain-level">${Q_STATE.dept ? qEsc(Q_STATE.dept) : Q_SCOPE_LABEL[Q_STATE.scope] || ''}</div>
        ${qBasisSwitchHtml()}
      </div>
      <div class="q-explain-cols">
        <div><div class="q-explain-label">що тут</div><div class="q-explain-text">${seg.what}</div></div>
        <div><div class="q-explain-label">навіщо</div><div class="q-explain-text">${seg.why}</div></div>
        ${stats}
      </div>${source}`;
    return;
  }
  const f = Q_FLAGS[Q_STATE.flag];
  const warningOnly = (Q_STATE.segment === 'open' || Q_STATE.segment === 'warned') && f.warn && !visible.some(r => (r.flags || []).includes(Q_STATE.flag));
  el.innerHTML = `
    <div class="q-explain-head">
      <div class="q-explain-title">${f.title}</div>
      <div class="q-explain-level${f.high && !warningOnly ? ' q-high' : ''}">${warningOnly ? 'попередження' : (f.high ? 'високий ризик для оплати' : 'потребує перевірки')}</div>
      ${qBasisSwitchHtml()}
    </div>
    <div class="q-explain-cols">
      <div><div class="q-explain-label">правило</div><div class="q-explain-text">${f.rule}</div></div>
      <div><div class="q-explain-label">чому це важливо</div><div class="q-explain-text">${warningOnly ? f.warn : f.why}</div></div>
      ${stats}
    </div>${source}`;
}

function renderQualityCases() {
  const title = document.getElementById('qCasesTitle');
  const list = document.getElementById('qCases');
  const rows = qVisibleRows();
  const filters = [Q_STATE.flag && Q_FLAGS[Q_STATE.flag].short, Q_STATE.dept].filter(Boolean);
  title.innerHTML = `${Q_SEGMENTS[Q_STATE.segment].pill} · ${rows.length}${filters.length ? ` · ${qEsc(filters.join(' · '))}<span class="q-reset" id="qReset">✕ скинути</span>` : ''}`;
  const reset = document.getElementById('qReset');
  if (reset) reset.addEventListener('click', () => { Q_STATE.flag = null; Q_STATE.dept = null; renderQualityAll(); });

  list.innerHTML = rows.map(r => qEpisodeHtml(r, Q_STATE.today)).join('') || '<div class="census-empty" style="position:static">Немає епізодів за цим фільтром</div>';
  list.scrollTop = 0;
  updateFadeMask(list, 'y');
}

function renderQualityAll() {
  renderQualityKpi();
  renderQualityFlagList();
  renderQualityDeptList();
  renderQualityExplain();
  renderQualityCases();
  document.querySelectorAll('.q-basis-opt').forEach(o => o.addEventListener('click', () => {
    if (Q_STATE.basis === o.dataset.basis) return;
    Q_STATE.basis = o.dataset.basis;
    Q_STATE.flag = null;
    Q_STATE.dept = null;
    renderQualityAll();
  }));
}

// Лікарня відома лише після /api/me — кольори лікарні застосує initHospitalName
// нижче (utils.js:HOSPITAL_THEME_PENDING).
window.HOSPITAL_THEME_PENDING = true;

function initQuality() {
  // Сторінка контролю записів — частина фінансового режиму (на неї ведуть з
  // ?fin=1), тож завжди в тій самій темній темі (.slide.fin-mode, layout.css),
  // як у wireFinanceEmblem (utils.js). Клас — до запиту, щоб не було світлого
  // спалаху.
  document.getElementById('slideRoot').classList.add('fin-mode');
  document.body.classList.add('fin-mode');
  document.documentElement.classList.add('fin-mode');
  fetch('/api/me').then(r => r.json()).then(me => {
    if (!me || !me.role) { window.location.href = '/layout.html'; return; }
    const org = me.org_edrpou || new URLSearchParams(location.search).get('org');
    if (!org) { document.body.insertAdjacentHTML('afterbegin', '<p style="padding:20px">Оберіть лікарню: /quality.html?org=43342788</p>'); return; }
    window.HOSPITAL_ORG_EDRPOU = org;

    fetch(`/api/lpz-case-quality?org=${encodeURIComponent(org)}&names=1`)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)))
      .then(data => {
        Q_STATE.rows = data.rows || [];
        Q_STATE.totalChecked = data.total_checked ?? Q_STATE.rows.length;
        Q_STATE.nszuPricedTotal = data.nszu_priced_total ?? 0;
        Q_STATE.nszuMoneyShare = data.nszu_money_share ?? null;
        Q_STATE.scope = data.scope;
        Q_STATE.today = data.today;
        Q_STATE.money = Q_STATE.rows.some(r => r.est_price != null);
        Q_STATE.pricingSource = data.pricing_source;
        const root = document.getElementById('slideRoot');
        renderBgLayers(root);
        renderQualityHeader(root, data.checked_at);
        renderDutyBand(root, org);
        renderQualityFields(root);
        renderFieldMe(root, me);
        const cases = document.getElementById('qCases');
        const fieldMe = document.querySelector('.field-me');
        if (cases && fieldMe) fitHeightTo(cases, offsetInSlide(fieldMe), 20);
        renderQualityAll();
        initHospitalName();
      })
      .catch(err => {
        document.getElementById('slideRoot').insertAdjacentHTML('beforeend',
          `<div class="census-empty" style="left:40px;top:40px">${qEsc(err?.error || 'Не вдалося завантажити дані')}</div>`);
      });
  });
}

document.addEventListener('DOMContentLoaded', initQuality);
