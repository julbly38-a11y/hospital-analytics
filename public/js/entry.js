/* Перехідна сторінка після авторизації (public/entry.html) — два незалежні
   шари в #slideRoot:
   1. renderGeneralLayer   — логотип, назва, лінії, КПІ-рядок лікарні, роки, "Вийти"
   2. renderClinicalBlock  — зліва два списки клінічних відділень (терапевтичний
      зверху, хірургічний знизу, без підписів блоку)
   Навмисно НЕ використовує page-shell.js/layout-config.js (ті — лише для
   неавторизованого шару layout.html): тут інший стан — вже після входу,
   форма логіну не потрібна, натомість "Вийти" + чергові лікарі.
   Дані КПІ/відділень — org-scoped, org_edrpou береться з сесії (/api/me). */

// ── КПІ по напрямках (терапевтичний/хірургічний) + графіки динаміки —
// перенесено зі старого проекту (kabinet.html block-row/block-row2/
// chart-therap/chart-surg), позиції ті самі, дані — нові lpz-ендпоінти
// (/api/lpz-kpi-direction, /api/lpz-trend-direction). data-dk (не data-k!),
// бо data-k уже зайнятий загальнолікарняним КПІ-рядком (utils.js:applyLpzKpi
// шукає .kpi-num глобально по всій сторінці) — інший атрибут, щоб не
// перезаписувати один одного. ──
const DIRECTION_KPI = [
  { key: 'hosp', label: 'ГОСПІТАЛІЗАЦІЙ' },
  { key: 'pat',  label: 'ПАЦІЄНТІВ' },
  { key: 'bed',  label: 'ЛІЖКО-ДЕНЬ' },
  { key: 'age',  label: 'СЕРЕДНІЙ ВІК' },
  { key: 'imp',  label: 'З ПОКРАЩЕННЯМ' },
  { key: 'let',  label: 'ЛЕТАЛЬНІСТЬ' },
];
const DIRECTION_DECIMAL_KEYS = new Set(['bed', 'age']);
const DIRECTION_PERCENT_KEYS = new Set(['imp', 'let']);

function directionKpiRowHtml() {
  return DIRECTION_KPI.map(k => `
    <div class="kpi">
      <div class="kpi-num" data-dk="${k.key}">—</div>
      <div class="kpi-label">${k.label}</div>
    </div>
  `).join('');
}

function renderDirectionBlocks(root) {
  root.insertAdjacentHTML('beforeend', `
    <div class="direction-label for-therap">Терапевтичний напрямок</div>
    <div class="kpi-row block-row" id="blockTherap">${directionKpiRowHtml()}</div>
    <svg class="spark chart-therap" viewBox="0 0 1176 130" width="1176" height="130">
      <line class="spark-base" x1="0" x2="1176" y1="80" y2="80"></line>
      <path class="spark-line"></path>
    </svg>
    <div class="direction-label for-surg">Хірургічний напрямок</div>
    <div class="kpi-row block-row block-row2" id="blockSurg">${directionKpiRowHtml()}</div>
    <svg class="spark chart-surg" viewBox="0 0 1176 140" width="1176" height="140">
      <line class="spark-base" x1="0" x2="1176" y1="90" y2="90"></line>
      <path class="spark-line"></path>
    </svg>
  `);
}

function applyDirectionKpi(rowEl, info) {
  if (!rowEl || !info) return;
  rowEl.querySelectorAll('.kpi-num[data-dk]').forEach(el => {
    const k = el.dataset.dk;
    const v = info[k];
    if (v == null) { el.textContent = '—'; return; }
    if (DIRECTION_PERCENT_KEYS.has(k)) { el.textContent = Number(v).toFixed(2) + '%'; return; }
    if (DIRECTION_DECIMAL_KEYS.has(k)) { el.textContent = Number(v).toFixed(1); return; }
    countUp(el, v, 900, 0);
  });
}

function loadDirectionBlocks(org, year) {
  const blockTherap = document.getElementById('blockTherap');
  const blockSurg = document.getElementById('blockSurg');

  ['терапевтичний', 'хірургічний'].forEach(direction => {
    fetch(`/api/lpz-kpi-direction?org=${encodeURIComponent(org)}&year=${encodeURIComponent(year)}&direction=${encodeURIComponent(direction)}`)
      .then(r => r.ok ? r.json() : null)
      .then(info => applyDirectionKpi(direction === 'терапевтичний' ? blockTherap : blockSurg, info))
      .catch(() => {});
  });

  // Спільна шкала Y для обох графіків (як у старому проекті) — рахуємо, коли
  // обидва тренди готові, а не окремо (інакше шкали "стрибають" одна проти одної).
  Promise.all(['терапевтичний', 'хірургічний'].map(direction =>
    fetch(`/api/lpz-trend-direction?org=${encodeURIComponent(org)}&year=${encodeURIComponent(year)}&direction=${encodeURIComponent(direction)}`)
      .then(r => r.ok ? r.json() : null)
  )).then(([tData, sData]) => {
    const tRows = tData?.rows || [];
    const sRows = sData?.rows || [];
    if (!tRows.length && !sRows.length) return;
    const step = year === 'all' ? 10000 : 1000;
    const allVals = [...tRows, ...sRows].map(r => Number(r.y));
    const niceMin = Math.floor(Math.min(...allVals, 0) / step) * step;
    const niceMax = Math.max(Math.ceil(Math.max(...allVals, 1) / step) * step, niceMin + step);
    const bounds = { niceMin, niceMax };
    if (tRows.length) renderSpark(document.querySelector('.chart-therap'), tRows, year, bounds, null, { dotRadius: 6, dotRadiusHover: 9 });
    if (sRows.length) renderSpark(document.querySelector('.chart-surg'), sRows, year, bounds, null, { dotRadius: 6, dotRadiusHover: 9 });
  }).catch(() => {});
}

const ENTRY_KPI = [
  { key: 'hosp', label: 'ГОСПІТАЛІЗАЦІЙ' },
  { key: 'pat',  label: 'ПАЦІЄНТІВ' },
  { key: 'bed',  label: 'ЛІЖКО-ДЕНЬ' },
  { key: 'age',  label: 'СЕРЕДНІЙ ВІК' },
  { key: 'let',  label: 'ЛЕТАЛЬНІСТЬ' },
];
const ENTRY_YEARS_BACK = 7;

// ── Шар "клінічний блок": два списки зліва (терапевтичний/хірургічний
// напрямок), без підписів блоку. Дані — /api/lpz-departments, org-scoped. ──
function renderDeptList(el, names) {
  el.innerHTML = names.map(n => `<div class="dept" data-dept="${n}">${n}</div>`).join('');
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
  fitHeightTo(topList, workBand.offsetTop);
  fitHeightTo(bottomList, root.clientHeight);
}

function renderClinicalBlock(root, org, own) {
  root.insertAdjacentHTML('beforeend', `
    <div class="dept-list"></div>
    <div class="dept-list2"></div>
  `);
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
  root.insertAdjacentHTML('beforeend', '<div class="bg"></div><div class="bg2"></div>');

  renderDirectionBlocks(root);
  renderHeaderBlock(root, ENTRY_KPI, ENTRY_YEARS_BACK, (year) => loadDirectionBlocks(org, year));

  // Смуга "Чергові лікарі" — utils.js:renderDutyBand (спільна з
  // head-cabinet.html/doctor-cabinet.html). Дані — ТЕСТОВИЙ РЕЖИМ (див.
  // коментар у /api/lpz-duty-doctors): реального графіка чергувань ще
  // немає, тимчасово по одному лікарю на відділення. onLoaded — тут-таки
  // чіпляємо крос-підсвітку з dept-list (лише entry.html, бо тільки тут є
  // список відділень поруч).
  renderMeBar(root);
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
    applyMeProfile(me);
    initHospitalName();
  });
}

document.addEventListener('DOMContentLoaded', initEntry);
