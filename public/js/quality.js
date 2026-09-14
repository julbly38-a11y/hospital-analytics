/* Контроль записів (public/quality.html) — щоденна перевірка випадків на
   помилки, що впливають на оплату НСЗУ. Три сегменти: відкриті епізоди,
   закриті з помилками, які ще можна виправити, і закриті, строк виправлення
   яких минув. Обсяг (лікарня / відділення / свої випадки) визначає сервер
   (/api/lpz-case-quality), сегмент і строк — теж сервер. */

const Q_FLAGS = {
  discharge_not_registered: {
    title: 'Виписку не передано в eHealth', short: 'виписку не передано', high: true,
    why: 'Випадок без зареєстрованої в медичній карті виписки може не потрапити до звіту на оплату НСЗУ.',
    check: 'Виписки немає, вона в чернетці, очікує реєстрації, скасована або не має події в медичній карті пацієнта. Дооформити й підписати.',
  },
  no_primary: {
    title: 'Немає основного діагнозу', short: 'без основного діагнозу', high: true,
    why: 'Без основного діагнозу випадок неможливо віднести до групи оплати.',
    check: 'Внести основний діагноз.',
  },
  no_doctor: {
    title: 'Не вказано лікаря', short: 'без лікаря', high: true,
    why: 'У випадку немає ні лікуючого лікаря, ні підпису лікаря у виписці — запис неможливо коректно оформити, а відповідальність ні на кому.',
    check: 'Вказати лікуючого лікаря й перевірити, ким підписано виписку.',
    warn: 'У відкритому епізоді не вказано лікуючого лікаря. Сам по собі це не зменшує оплату, але зауваження до запису нема кому адресувати.',
  },
  overlap: {
    title: 'Накладка з іншою госпіталізацією', short: 'накладка', high: true,
    why: 'Той самий пацієнт одночасно в двох епізодах: один із них може бути не оплачений, а дроблення випадку — привід для перерахунку НСЗУ.',
    check: 'Чи це перевід між відділеннями в межах одного випадку. Об\'єднати або закрити зайвий епізод.',
  },
  injury_no_external_cause: {
    title: 'Травма без зовнішньої причини', short: 'травма без причини', high: true,
    why: 'Для травм (коди S/T) правила кодування вимагають код зовнішньої причини (V–Y). Без нього запис неповний і може бути відхилений або перекваліфікований.',
    check: 'Додати код обставин травми та місця події.',
  },
  symptom_primary: {
    title: 'Симптом як основний діагноз', short: 'симптом як основний', high: true,
    why: 'Код симптому (R) замість встановленої хвороби зазвичай потрапляє в групу з нижчою вагою оплати.',
    check: 'Чи встановлено причину стану. Якщо так — замінити основний діагноз.',
    warn: 'Попередній діагноз-симптом у перші дні — норма. Але якщо до виписки його не замінити на встановлений, випадок піде в групу з нижчою оплатою.',
  },
  death_single_diagnosis: {
    title: 'Летальний випадок з одним діагнозом', short: 'летальний, 1 діагноз', high: true,
    why: 'Для летального випадку єдиний діагноз майже завжди означає неповне кодування і привертає увагу під час перевірки.',
    check: 'Внести ускладнення, безпосередню причину смерті та супутні стани.',
  },
  surgical_no_procedure: {
    title: 'Хірургічне відділення — жодного втручання', short: 'без втручань', high: false,
    why: 'Група оплати хірургічного випадку залежить від втручань. Якщо операцію виконано, але не внесено, випадок оплачується як нехірургічний. Консервативне лікування — не помилка.',
    check: 'Чи була операція чи маніпуляція, і чи внесено її кодом АКМІ.',
    warn: 'Пацієнт у хірургічному відділенні понад дві доби, втручань у записі немає. Якщо операцію вже виконано — внести зараз, поки деталі свіжі.',
  },
  single_diagnosis: {
    title: 'Лише один діагноз', short: 'один діагноз', high: false,
    why: 'Супутні діагнози й ускладнення визначають складність випадку. Без них складний пацієнт оплачується як простий.',
    check: 'Внести супутні стани й ускладнення, якщо вони є.',
    warn: 'Поки що в записі лише один діагноз. Супутні стани краще вносити в міру встановлення, а не згадувати під час виписки.',
  },
  open_too_long: {
    title: 'Відкритий понад 30 діб', short: 'відкритий > 30 діб', high: false,
    why: 'Надто довго відкритий випадок часто означає незакриту в системі виписку — оплата затримується.',
    check: 'Чи пацієнт ще у відділенні. Якщо ні — закрити випадок.',
    warn: 'Епізод відкритий понад 30 діб. Якщо пацієнта вже виписано, а випадок не закрито, оплата не надійде.',
  },
};
const Q_FLAG_ORDER = Object.keys(Q_FLAGS);

const Q_SEGMENTS = {
  open: {
    pill: 'ВІДКРИТІ',
    title: 'Пацієнти, які зараз у відділеннях',
    what: 'Помилки, які вже є в записі, і попередження — що стане помилкою, якщо не доповнити до виписки.',
    why: 'Це найдешевший момент для виправлення: пацієнт ще у відділенні, лікар пам\'ятає деталі, випадок ще не поданий.',
  },
  fixable: {
    pill: 'МОЖНА ВИПРАВИТИ',
    title: 'Закриті випадки, які ще можна виправити',
    what: 'Виписані пацієнти з помилками в записі, строк подачі змін яких ще не минув. Найближчі строки — зверху.',
    why: 'Строк — до 10-го робочого дня місяця, наступного за місяцем виписки. Це припущення за правилами НСЗУ, його варто уточнити з економістом лікарні.',
  },
  lost: {
    pill: 'ВЖЕ НЕ ВИПРАВИТИ',
    title: 'Строк виправлення минув',
    what: 'Закриті випадки з помилками, які вже подані й не можуть бути виправлені.',
    why: 'Це фактичні втрати. Їх цінність — показати, які помилки повторюються і в яких відділеннях, щоб не допускати їх надалі.',
  },
};

const Q_STATE = { rows: [], flag: null, dept: null, segment: 'open', scope: null, today: null };

const qEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function qFmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}
function qFmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${qFmtDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function qDaysLeft(deadline) {
  if (!deadline || !Q_STATE.today) return null;
  return Math.round((new Date(deadline + 'T00:00:00Z') - new Date(Q_STATE.today + 'T00:00:00Z')) / 86400000);
}

function qIssues(r) {
  return [...(r.flags || []).map(code => ({ code, kind: 'error' })), ...(r.warnings || []).map(code => ({ code, kind: 'warning' }))];
}
function qHas(r, code) { return (r.flags || []).includes(code) || (r.warnings || []).includes(code); }
function qHasIssues(r) { return (r.flags || []).length + (r.warnings || []).length > 0; }
function qSegmentRows(seg = Q_STATE.segment) { return Q_STATE.rows.filter(r => r.segment === seg && qHasIssues(r)); }

function qVisibleRows() {
  let rows = qSegmentRows();
  if (Q_STATE.flag) rows = rows.filter(r => qHas(r, Q_STATE.flag));
  if (Q_STATE.dept) rows = rows.filter(r => (r.department_name || '—') === Q_STATE.dept);
  const seg = Q_STATE.segment;
  return rows.sort((a, b) => {
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
      <span class="year-badge-month">${qFmtTime(checkedAt).slice(0, 5)} · ${qFmtTime(checkedAt).slice(11)}</span>
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
    <div class="docs-title">Відділення</div>
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
  const set = (k, v) => { const el = document.querySelector(`[data-q="${k}"]`); if (el) el.textContent = v; };
  const fixable = qSegmentRows('fixable');
  set('checked', fmt(Q_STATE.rows.length));
  set('open', fmt(qSegmentRows('open').length));
  set('fixable', fmt(fixable.length));
  set('urgent', fmt(fixable.filter(r => (qDaysLeft(r.fix_deadline) ?? 99) <= 3).length));
  set('lost', fmt(qSegmentRows('lost').length));
  Object.keys(Q_SEGMENTS).forEach(k => {
    const el = document.querySelector(`[data-seg-n="${k}"]`);
    if (el) el.textContent = `· ${qSegmentRows(k).length}`;
  });
}

function renderQualityFlagList() {
  const el = document.getElementById('qFlagList');
  const base = qSegmentRows().filter(r => !Q_STATE.dept || (r.department_name || '—') === Q_STATE.dept);
  const isOpen = Q_STATE.segment === 'open';
  const items = Q_FLAG_ORDER.map(code => {
    const errors = base.filter(r => (r.flags || []).includes(code)).length;
    const warnings = base.filter(r => (r.warnings || []).includes(code)).length;
    return { code, errors, warnings, n: errors + warnings };
  }).filter(i => i.n > 0);
  el.innerHTML = items.map(i => {
    const f = Q_FLAGS[i.code];
    const sub = isOpen
      ? [i.errors && `помилка вже є: ${i.errors}`, i.warnings && `попередження: ${i.warnings}`].filter(Boolean).join(' · ')
      : (f.high ? 'високий ризик для оплати' : 'перевірити');
    const high = isOpen ? i.errors > 0 : f.high;
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
    const m = map.get(k) || { n: 0, errors: 0, urgent: 0 };
    m.n += 1;
    if ((r.flags || []).length) m.errors += 1;
    if ((qDaysLeft(r.fix_deadline) ?? 99) <= 3) m.urgent += 1;
    map.set(k, m);
  });
  const seg = Q_STATE.segment;
  el.innerHTML = [...map.entries()].sort((a, b) => b[1].n - a[1].n).map(([name, m]) => {
    const sub = seg === 'open' ? `з помилкою вже зараз: ${m.errors}` : seg === 'fixable' ? (m.urgent ? `строк ≤ 3 днів: ${m.urgent}` : 'строк ще є') : 'втрачено';
    return `
      <div class="q-item${Q_STATE.dept === name ? ' active' : ''}" data-dept="${qEsc(name)}">
        ${qEsc(name)}<span class="q-count">${m.n}</span>
        <span class="q-sub">${sub}</span>
      </div>`;
  }).join('') || '<div class="census-empty">Немає даних</div>';
  el.querySelectorAll('.q-item').forEach(item => item.addEventListener('click', () => {
    Q_STATE.dept = Q_STATE.dept === item.dataset.dept ? null : item.dataset.dept;
    renderQualityAll();
  }));
  updateFadeMask(el, 'y');
}

function renderQualityExplain() {
  const el = document.getElementById('qExplain');
  const seg = Q_SEGMENTS[Q_STATE.segment];
  const visible = qVisibleRows();
  const deptN = new Set(visible.map(r => r.department_name)).size;
  const errN = visible.filter(r => (r.flags || []).length).length;
  const second = Q_STATE.segment === 'open'
    ? { v: errN, l: 'з помилкою вже зараз' }
    : Q_STATE.segment === 'fixable'
      ? { v: visible.filter(r => (qDaysLeft(r.fix_deadline) ?? 99) <= 3).length, l: 'строк спливає за 3 дні' }
      : { v: visible.reduce((s, r) => s + (r.flags || []).length, 0), l: 'помилок у цих випадках' };
  const stats = `
    <div class="q-explain-stats">
      <div class="q-stat"><div class="q-stat-v">${visible.length}</div><div class="q-stat-l">випадків</div></div>
      <div class="q-stat"><div class="q-stat-v">${second.v}</div><div class="q-stat-l">${second.l}</div></div>
      <div class="q-stat"><div class="q-stat-v">${deptN}</div><div class="q-stat-l">відділень</div></div>
    </div>`;

  if (!Q_STATE.flag) {
    el.innerHTML = `
      <div class="q-explain-head">
        <div class="q-explain-title">${seg.title}</div>
        <div class="q-explain-level">${Q_STATE.dept ? qEsc(Q_STATE.dept) : 'уся лікарня'}</div>
      </div>
      <div class="q-explain-cols">
        <div><div class="q-explain-label">що тут</div><div class="q-explain-text">${seg.what}</div></div>
        <div><div class="q-explain-label">навіщо</div><div class="q-explain-text">${seg.why}</div></div>
        ${stats}
      </div>`;
    return;
  }
  const f = Q_FLAGS[Q_STATE.flag];
  const warningOnly = Q_STATE.segment === 'open' && f.warn && !visible.some(r => (r.flags || []).includes(Q_STATE.flag));
  el.innerHTML = `
    <div class="q-explain-head">
      <div class="q-explain-title">${f.title}</div>
      <div class="q-explain-level${f.high && !warningOnly ? ' q-high' : ''}">${warningOnly ? 'попередження' : (f.high ? 'високий ризик для оплати' : 'потребує перевірки')}</div>
    </div>
    <div class="q-explain-cols">
      <div><div class="q-explain-label">чому це важливо</div><div class="q-explain-text">${warningOnly ? f.warn : f.why}</div></div>
      <div><div class="q-explain-label">що зробити</div><div class="q-explain-text">${f.check}</div></div>
      ${stats}
    </div>`;
}

function qCaseState(r) {
  if (r.segment === 'open') return `<span class="q-state-open">у відділенні</span> · ${Number(r.los_days).toFixed(1)} доби`;
  const discharged = `виписано ${qFmtDate(r.discharge_at)}`;
  if (r.segment === 'fixable') {
    const left = qDaysLeft(r.fix_deadline);
    const when = left === 0 ? 'сьогодні' : left === 1 ? 'завтра' : `${left} дн.`;
    return `${discharged} · <span class="${left <= 3 ? 'q-deadline-urgent' : 'q-deadline'}">виправити до ${qFmtDate(r.fix_deadline)} (${when})</span>`;
  }
  return `${discharged} · <span class="q-deadline-lost">строк минув ${qFmtDate(r.fix_deadline)}</span>`;
}

function renderQualityCases() {
  const title = document.getElementById('qCasesTitle');
  const list = document.getElementById('qCases');
  const rows = qVisibleRows();
  const filters = [Q_STATE.flag && Q_FLAGS[Q_STATE.flag].short, Q_STATE.dept].filter(Boolean);
  title.innerHTML = `${Q_SEGMENTS[Q_STATE.segment].pill} · ${rows.length}${filters.length ? ` · ${qEsc(filters.join(' · '))}<span class="q-reset" id="qReset">✕ скинути</span>` : ''}`;
  const reset = document.getElementById('qReset');
  if (reset) reset.addEventListener('click', () => { Q_STATE.flag = null; Q_STATE.dept = null; renderQualityAll(); });

  list.innerHTML = rows.map(r => {
    const chips = qIssues(r).map(i => {
      const cls = i.kind === 'warning' ? ' q-warn' : (Q_FLAGS[i.code]?.high ? ' q-high' : '');
      return `<span class="q-flag${cls}" title="${i.kind === 'warning' ? 'попередження' : 'помилка'}">${Q_FLAGS[i.code]?.short || i.code}</span>`;
    }).join('');
    return `
      <div class="q-case">
        <div class="q-case-main">
          <div class="q-case-line1">
            <span class="q-case-num">№ ${qEsc(r.card_number)}</span>
            <span class="q-case-dx">${qEsc(r.primary_icd || '—')} ${qEsc(r.primary_name || '')}</span>
          </div>
          <div class="q-case-line2">${qEsc(r.department_name || '—')} · ${qEsc(r.doctor_name || 'лікаря не призначено')} · ${qCaseState(r)} · діагнозів: ${r.dx_codes.length} · втручань: ${r.procedures_count}</div>
        </div>
        <div class="q-case-side">
          <div class="q-flags">${chips}</div>
          <a class="q-open-link" href="https://helsi.pro/hospital/cases/${encodeURIComponent(r.helsi_case_id)}" target="_blank" rel="noopener">helsi ↗</a>
        </div>
      </div>`;
  }).join('') || '<div class="census-empty" style="position:static">Немає випадків за цим фільтром</div>';
  list.scrollTop = 0;
  updateFadeMask(list, 'y');
}

function renderQualityAll() {
  renderQualityKpi();
  renderQualityFlagList();
  renderQualityDeptList();
  renderQualityExplain();
  renderQualityCases();
}

function initQuality() {
  fetch('/api/me').then(r => r.json()).then(me => {
    if (!me || !me.role) { window.location.href = '/layout.html'; return; }
    const org = me.org_edrpou || new URLSearchParams(location.search).get('org');
    if (!org) { document.body.insertAdjacentHTML('afterbegin', '<p style="padding:20px">Оберіть лікарню: /quality.html?org=43342788</p>'); return; }
    window.HOSPITAL_ORG_EDRPOU = org;

    fetch(`/api/lpz-case-quality?org=${encodeURIComponent(org)}`)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)))
      .then(data => {
        Q_STATE.rows = data.rows || [];
        Q_STATE.scope = data.scope;
        Q_STATE.today = data.today;
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
