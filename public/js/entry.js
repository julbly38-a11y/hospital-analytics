/* Перехідна сторінка після авторизації (public/entry.html) — два незалежні
   шари в #slideRoot:
   1. renderGeneralLayer   — логотип, назва, лінії, КПІ-рядок лікарні, роки, "Вийти"
   2. renderClinicalBlock  — зліва два списки клінічних відділень (терапевтичний
      зверху, хірургічний знизу, без підписів блоку)
   Навмисно НЕ використовує page-shell.js (той — лише для неавторизованого
   шару layout.html): тут інший стан — вже після входу,
   форма логіну не потрібна, натомість "Вийти" + чергові лікарі.
   Дані КПІ/відділень — org-scoped, org_edrpou береться з сесії (/api/me). */

// ── КПІ по напрямках (терапевтичний/хірургічний), 6 показників —
// utils.js:kpi6RowHtml/applyKpi6 (спільні з head-cabinet.js/doctor-cabinet.js),
// позиція — layout.css:.field-kpi-1/.field-kpi-2 (та сама, що й на тих
// сторінках). Дані — /api/lpz-kpi-direction. Графік динаміки під кожним
// рядком (.field-chart-1/.field-chart-2, той самий .bar-chart-патерн, що на
// head-cabinet.html/doctor-cabinet.html) — без click-фільтра (немає census
// на entry.html) і зі спільною Y-шкалою між обома напрямками (loadDirectionBlocks),
// щоб масштаби порівнювались візуально. ──
function renderDirectionBlocks(root) {
  (root.querySelector('.lf-right-top') || root).insertAdjacentHTML('beforeend', `
    <div class="kpi-row field-kpi-1 kpi-lvl-direction" id="blockTherap">${kpi6RowHtml()}</div>
    <svg class="bar-chart field-chart-1" id="chartTherap" viewBox="0 0 624 185" width="624" height="185" preserveAspectRatio="none">
      <line class="bar-base" x1="0" x2="624" y1="167" y2="167"></line>
    </svg>
  `);
  (root.querySelector('.lf-right-bottom') || root).insertAdjacentHTML('beforeend', `
    <div class="kpi-row field-kpi-2 kpi-lvl-direction" id="blockSurg">${kpi6RowHtml()}</div>
    <svg class="bar-chart field-chart-2" id="chartSurg" viewBox="0 0 624 185" width="624" height="185" preserveAspectRatio="none">
      <line class="bar-base" x1="0" x2="624" y1="167" y2="167"></line>
    </svg>
  `);
}

function loadDirectionBlocks(org, year, month = 'all') {
  const blockTherap = document.getElementById('blockTherap');
  const blockSurg = document.getElementById('blockSurg');

  ['терапевтичний', 'хірургічний'].forEach(direction => {
    fetch(`/api/lpz-kpi-direction?org=${encodeURIComponent(org)}&year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}&direction=${encodeURIComponent(direction)}`)
      .then(r => r.ok ? r.json() : null)
      .then(info => applyKpi6(direction === 'терапевтичний' ? blockTherap : blockSurg, info))
      .catch(() => {});
  });

  // Спільна шкала Y для обох графіків (як у старому проекті) — рахуємо, коли
  // обидва тренди готові, а не окремо (інакше шкали "стрибають" одна проти
  // одної). Графік — завжди по РОКУ (12 місяців), місяць його не звужує (та
  // сама логіка, що й у loadKpiChartBlock: місяць впливає лише на КПІ-числа).
  Promise.all(['терапевтичний', 'хірургічний'].map(direction =>
    fetch(`/api/lpz-trend-direction?org=${encodeURIComponent(org)}&year=${encodeURIComponent(year)}&direction=${encodeURIComponent(direction)}`)
      .then(r => r.ok ? r.json() : null)
  )).then(([tData, sData]) => {
    const tRows = tData?.rows || [];
    const sRows = sData?.rows || [];
    if (!tRows.length && !sRows.length) return;
    // 15% запасу над найвищим значенням з ОБОХ напрямків — той самий підхід,
    // що й у bar-chart.js для окремого графіка без sharedBounds (нема
    // підписаних рисок осі, тож не потрібне "кругле" округлення до тисяч).
    const allVals = [...tRows, ...sRows].map(r => Number(r.y));
    const niceMax = Math.max(Math.max(...allVals, 1) * 1.15, 1);
    const bounds = { niceMax };
    if (tRows.length) renderBarChart(document.getElementById('chartTherap'), tRows, year, bounds);
    if (sRows.length) renderBarChart(document.getElementById('chartSurg'), sRows, year, bounds);
  }).catch(() => {});
}

// HOSPITAL_KPI/HOSPITAL_YEARS_BACK — utils.js (спільні з head-cabinet.js/
// doctor-cabinet.js, раніше тут була окрема копія ENTRY_KPI/ENTRY_YEARS_BACK
// з тим самим вмістом).

// ── Шар "клінічний блок": два списки зліва (терапевтичний/хірургічний
// напрямок), без підписів блоку. Дані — /api/lpz-departments, org-scoped.
// data-dept — назва (для крос-підсвітки з duty-docs, той самий формат, що
// й раніше), data-dept-id — uuid (для розгортки, openDeptExpand). ──
function renderDeptList(el, depts) {
  el.innerHTML = depts.map(d => `<div class="dept" data-dept="${d.name}" data-dept-id="${d.structure_id}">${d.name}</div>`).join('');
}

// Поточний обраний рік (для розгортки відділення) — той самий activeParam,
// що в старому kabinet.html, тримаємо в модульній змінній, бо onYearChange
// (utils.js:renderHeaderBlock) викликається асинхронно й поза цим файлом.
let activeYear = 'all';

// Інлайн-розгортка під назвою відділення при кліку (будь-яке, не лише своє)
// — завідувач + 4 показники. .work-band/.dept-list* тут — position:absolute
// з фіксованими top у px (не звичайний flow, як у старому kabinet.html),
// тому "смуга Чергові лікарі" (work-band + staff-fields) позиціонується
// ДИНАМІЧНО: якщо верхній список (dept-list) виріс настільки, що його
// нижній край заліз би на смугу — смуга зсувається вниз рівно на величину
// перекриття; а якщо через це смуга сама наїхала б на нижній список
// (dept-list2) — той теж зсувається вниз на ту саму величину, щоб зазор
// між смугою і списком не зникав. Розрахунок — по offsetTop/offsetHeight
// (не залежать від transform:scale на .slide-wrapper), а не по фіксованих
// px-константах, тому працює для будь-якої кількості відділень.
let expandedDeptEl = null;
// offsetInSlide — тепер спільна в utils.js (fitHeightTo теж на ній базується).
function repositionMiddleBand(root) {
  const workBand = root.querySelector('.work-band');
  const topList = root.querySelector('.dept-list');
  const bottomList = root.querySelector('.dept-list2');
  if (!workBand || !topList) return;
  const bandDefaultTop = offsetInSlide(workBand) - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--band-shift') || 0);
  const topListBottom = offsetInSlide(topList) + topList.scrollHeight;
  const bandShift = Math.max(0, topListBottom - bandDefaultTop);
  document.documentElement.style.setProperty('--band-shift', bandShift + 'px');
  if (bottomList) {
    // якщо зсунута смуга тепер налазить на нижній список — тягнемо і його вниз
    const bandBottom = bandDefaultTop + bandShift + workBand.offsetHeight;
    const list2DefaultTop = offsetInSlide(bottomList) - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--list2-shift') || 0);
    const gap = 10;
    const list2Shift = Math.max(0, bandBottom + gap - list2DefaultTop);
    document.documentElement.style.setProperty('--list2-shift', list2Shift + 'px');
  }
}
function closeAllDeptExpands(root) {
  root.querySelectorAll('.dept-expand').forEach(e => e.remove());
  document.documentElement.style.setProperty('--band-shift', '0px');
  document.documentElement.style.setProperty('--list2-shift', '0px');
  if (expandedDeptEl) expandedDeptEl.classList.remove('dept-active');
  expandedDeptEl = null;
}
function openDeptExpand(root, org, el) {
  const deptId = el.dataset.deptId;
  if (!deptId) return;
  closeAllDeptExpands(root);
  const exp = document.createElement('div');
  exp.className = 'dept-expand';
  exp.innerHTML = `
    <div class="de-head"><span class="de-label">Завідувач:</span> <span class="de-chief">…</span></div>
    <div class="de-stats">
      <div class="de-s"><div class="de-v" data-f="cases">…</div><div class="de-l">ВИПАДКІВ</div></div>
      <div class="de-s"><div class="de-v" data-f="patients">…</div><div class="de-l">ПАЦІЄНТІВ</div></div>
      <div class="de-s"><div class="de-v" data-f="doctors">…</div><div class="de-l">ЛІКАРІВ</div></div>
      <div class="de-s"><div class="de-v" data-f="beds">…</div><div class="de-l">ЛІЖОК</div></div>
    </div>`;
  el.insertAdjacentElement('afterend', exp);
  requestAnimationFrame(() => repositionMiddleBand(root));
  el.classList.add('dept-active');
  expandedDeptEl = el;

  fetch(`/api/lpz-department-expand?org=${encodeURIComponent(org)}&department=${encodeURIComponent(deptId)}&year=${encodeURIComponent(activeYear)}`)
    .then(r => r.ok ? r.json() : null)
    .then(info => {
      if (!info || !exp.isConnected) return;
      exp.querySelector('.de-chief').textContent = info.head_name || '—';
      exp.querySelector('[data-f="cases"]').textContent = fmt(info.cases ?? 0);
      exp.querySelector('[data-f="patients"]').textContent = fmt(info.unique_patients ?? 0);
      exp.querySelector('[data-f="doctors"]').textContent = info.doctors ?? '—';
      exp.querySelector('[data-f="beds"]').textContent = info.beds ?? '—';
    })
    .catch(() => {});
}
function wireDeptExpand(root, org) {
  root.querySelectorAll('.dept[data-dept-id]').forEach(el => {
    if (el._expandBound) return;
    el._expandBound = true;
    el.addEventListener('click', () => {
      if (expandedDeptEl === el) { closeAllDeptExpands(root); return; }
      openDeptExpand(root, org, el);
    });
  });
}

// Перехресна підсвітка лікар↔відділення (як у старому кабінеті), але з живим
// пошуком елементів у момент наведення — бо обидва списки (dept-list і
// duty-docs) підвантажуються асинхронно в невідомому порядку, і кешувати
// NodeList на момент виклику (як робить utils.js:initCrossHighlight) тут
// не можна: список ще може бути порожній.
function clearEntryHl(root) {
  root.querySelectorAll('.hl').forEach(e => e.classList.remove('hl'));
}
function wireDeptHover(root) {
  root.querySelectorAll('.dept[data-dept]').forEach(el => {
    if (el._hlBound) return;
    el._hlBound = true;
    el.addEventListener('mouseenter', () => {
      el.classList.add('hl');
      root.querySelectorAll('.duty-docs span[data-home]').forEach(s => {
        if (s.dataset.home === el.dataset.dept) s.classList.add('hl');
      });
    });
    el.addEventListener('mouseleave', () => clearEntryHl(root));
  });
}
function wireDutyHover(root) {
  root.querySelectorAll('.duty-docs span[data-home]').forEach(el => {
    if (el._hlBound) return;
    el._hlBound = true;
    el.addEventListener('mouseenter', () => {
      el.classList.add('hl');
      root.querySelectorAll('.dept[data-dept]').forEach(d => {
        if (d.dataset.dept === el.dataset.home) d.classList.add('hl');
      });
    });
    el.addEventListener('mouseleave', () => clearEntryHl(root));
  });
}

// enableDragScroll/updateFadeMask/fitHeightTo — спільні для будь-якого списку
// на будь-якій сторінці, живуть у utils.js (не дублюємо тут).
// Висота списків — рахується з реальних offsetTop сусідніх елементів (верхній
// обмежений початком смуги "Чергові лікарі", нижній — низом канви), а не
// хардкодиться під конкретні px-значення з layout.css.
function fitDeptListHeights(root) {
  const topList = root.querySelector('.dept-list');
  const bottomList = root.querySelector('.dept-list2');
  const workBand = root.querySelector('.work-band');
  if (!topList || !bottomList || !workBand) return;
  fitHeightTo(topList, offsetInSlide(workBand));
  fitHeightTo(bottomList, offsetInSlide(root) + root.clientHeight);
}

function renderClinicalBlock(root, org, own) {
  (root.querySelector('.lf-left-top') || root).insertAdjacentHTML('beforeend', '<div class="dept-list"></div>');
  (root.querySelector('.lf-left-bottom') || root).insertAdjacentHTML('beforeend', '<div class="dept-list2"></div>');
  // Списки мають динамічну висоту (fitDeptListHeights) і свій вертикальний
  // скрол (замість зсуву смуги "Чергові лікарі") — той самий стиль/поведінка,
  // що й у duty-docs: інерція, приховна смуга прокрутки, fade-маска на живих краях.
  const topList = root.querySelector('.dept-list');
  const bottomList = root.querySelector('.dept-list2');
  fitDeptListHeights(root);
  [topList, bottomList].forEach(list => {
    enableDragScroll(list, 'y');
    list.addEventListener('scroll', () => updateFadeMask(list, 'y'));
  });
  fetch(`/api/lpz-departments?org=${encodeURIComponent(org)}`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data) return;
      renderDeptList(topList, data.therapeutic || []);
      renderDeptList(bottomList, data.surgical || []);
      updateFadeMask(topList, 'y');
      updateFadeMask(bottomList, 'y');
      wireDeptHover(root);
      wireDeptExpand(root, org);
      markOwnDepartment(root, own);
    })
    .catch(() => {});
}

// Власне відділення завідувача/лікаря — постійна підсвітка (клас .own, той
// самий glow, що й .hl при hover — див. utils.js:injectDutyStyles) + клік на
// весь рядок веде у відповідний кабінет (поки порожній, чекає на перебудову
// під lpz-схему). own = { department, href } або null (немає клінічного
// відділення чи роль не head_dept/doctor) — див. buildOwnDeptLink().
function markOwnDepartment(root, own) {
  if (!own) return;
  const el = [...root.querySelectorAll('.dept[data-dept]')].find(d => d.dataset.dept === own.department);
  if (!el) return;
  el.classList.add('own');
  el.addEventListener('click', () => { window.location.href = own.href; });
}

// Джерело — lpz_empl через сесію (me.lpz_role/me.lpz_department з /api/me),
// НЕ стара empl/app_users.role: та мала прогалини (напр. Семенюк не мав
// head_dept, хоча в lpz-каноні тепер коректно head). Без ?dept=/?doc= у href —
// head-cabinet.html/doctor-cabinet.html самі визначать себе з сесії (той
// самий принцип, що й тут: сторінка не бере ідентичність з URL).
function buildOwnDeptLink(me) {
  if (!me.lpz_department) return null;
  if (me.lpz_role === 'head') {
    return { department: me.lpz_department, href: '/head-cabinet.html' };
  }
  if (me.lpz_role === 'doctor') {
    return { department: me.lpz_department, href: '/doctor-cabinet.html' };
  }
  return null;
}

// ── Шар "перший шар": логотип, назва, лінії, КПІ-рядок лікарні, роки,
// смуга "Чергові лікарі" + "Вийти". Спільна частина (логотип/лінії/KPI-рядок/
// фільтр років) — utils.js:renderHeaderBlock(), як і на layout.html; тут
// лишається лише mesh-фон і специфічний для entry.html підвал. ──
function renderGeneralLayer(root, org) {
  renderBgLayers(root);

  renderDirectionBlocks(root);
  renderHeaderBlock(root, HOSPITAL_KPI, HOSPITAL_YEARS_BACK, (year) => {
    activeYear = year;
    loadDirectionBlocks(org, year);
  }, true, (year, month) => {
    activeYear = year;
    loadDirectionBlocks(org, year, month);
  });

  // Смуга "Чергові лікарі" — utils.js:renderDutyBand (спільна з
  // head-cabinet.html/doctor-cabinet.html). Дані — ТЕСТОВИЙ РЕЖИМ (див.
  // коментар у /api/lpz-duty-doctors): реального графіка чергувань ще
  // немає, тимчасово по одному лікарю на відділення. onLoaded — тут-таки
  // чіпляємо крос-підсвітку з dept-list (лише entry.html, бо тільки тут є
  // список відділень поруч).
  // .me-bar (utils.js:renderMeBar) тут навмисно не викликаємо — ПІБ/посада
  // авторизованого показує renderFieldMe() в нижньому правому куті поля
  // розмітки, дублювати той самий профіль ще раз вгорі не потрібно.
  renderDutyBand(root, org, () => wireDutyHover(root));
}

function initEntry() {
  fetch('/api/me').then(r => r.json()).then(me => {
    if (!me || !me.role) { window.location.href = '/layout.html'; return; }
    const org = me.org_edrpou;
    if (!org) return; // TODO: власник/адмін без empl_name_id — вибір лікарні ще не підключено
    window.HOSPITAL_ORG_EDRPOU = org;
    const root = document.getElementById('slideRoot');
    renderGeneralLayer(root, org);
    renderClinicalBlock(root, org, buildOwnDeptLink(me));
    renderFieldMe(root, me);
    applyMeProfile(me);
    initHospitalName();
  });
}

document.addEventListener('DOMContentLoaded', initEntry);
