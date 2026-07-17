/* Перехідна сторінка після авторизації (public/entry.html) — два незалежні
   шари в #slideRoot:
   1. renderGeneralLayer   — логотип, назва, лінії, КПІ-рядок лікарні, роки, "Вийти"
   2. renderClinicalBlock  — зліва два списки клінічних відділень (терапевтичний
      зверху, хірургічний знизу, без підписів блоку)
   Навмисно НЕ використовує page-shell.js/layout-config.js (ті — лише для
   неавторизованого шару layout.html): тут інший стан — вже після входу,
   форма логіну не потрібна, натомість "Вийти" + чергові лікарі.
   Дані КПІ/відділень — org-scoped, org_edrpou береться з сесії (/api/me). */

const ENTRY_KPI = [
  { key: 'hosp', label: 'ГОСПІТАЛІЗАЦІЙ' },
  { key: 'pat',  label: 'ПАЦІЄНТІВ' },
  { key: 'bed',  label: 'ЛІЖКО-ДЕНЬ' },
  { key: 'age',  label: 'СЕРЕДНІЙ ВІК' },
  { key: 'let',  label: 'ЛЕТАЛЬНІСТЬ' },
];
const ENTRY_YEARS_BACK = 7;
const KPI_DECIMAL_KEYS = new Set(['bed', 'age']);
const KPI_PERCENT_KEYS = new Set(['let']);

function fetchEntryKpi(org, year) {
  return fetch(`/api/lpz-kpi?org=${encodeURIComponent(org)}&year=${encodeURIComponent(year)}`)
    .then(r => r.ok ? r.json() : null)
    .catch(() => null);
}

function applyEntryKpi(info) {
  if (!info) return;
  document.querySelectorAll('.kpi-num').forEach(el => {
    const k = el.dataset.k;
    const v = info[k];
    if (v == null) { el.textContent = '—'; return; }
    if (KPI_PERCENT_KEYS.has(k)) { el.textContent = v.toFixed(2) + '%'; return; }
    if (KPI_DECIMAL_KEYS.has(k)) { el.textContent = v.toFixed(1); return; }
    countUp(el, v, 900, 0);
  });
}

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

function renderClinicalBlock(root, org) {
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
    })
    .catch(() => {});
}

// ── Шар "перший шар": логотип, назва, лінії, КПІ-рядок лікарні, роки,
// смуга "Чергові лікарі" + "Вийти". Спільний структурний вигляд —
// з /shared/layout.css. ──
function renderGeneralLayer(root, org) {
  root.insertAdjacentHTML('beforeend', '<div class="bg"></div><div class="bg2"></div>');

  const logo = document.createElement('img');
  logo.className = 'logo';
  logo.alt = 'Логотип';
  root.appendChild(logo);

  root.insertAdjacentHTML('beforeend', `
    <div class="name-block">
      <div class="title"></div>
      <div class="tagline"></div>
    </div>
    <div class="vline"></div>
    <div class="vline2"></div>
    <div class="hline"></div>
    <div class="hline2"></div>
  `);

  const kpiRow = document.createElement('div');
  kpiRow.className = 'kpi-row';
  kpiRow.innerHTML = ENTRY_KPI.map(k => `
    <div class="kpi">
      <div class="kpi-num" data-k="${k.key}">—</div>
      <div class="kpi-label">${k.label}</div>
    </div>
  `).join('');
  root.appendChild(kpiRow);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: ENTRY_YEARS_BACK }, (_, i) => currentYear - i);

  const yearFilter = document.createElement('div');
  yearFilter.className = 'year-filter';
  yearFilter.innerHTML =
    years.map(y => `<div class="ypill">${y}</div>`).join('') +
    `<div class="ypill ypill-all active">ВСІ РОКИ</div>`;
  root.appendChild(yearFilter);

  const yearBadge = document.createElement('div');
  yearBadge.className = 'year-badge';
  yearBadge.innerHTML = `<span class="year-num small">ВСІ РОКИ</span>`;
  root.appendChild(yearBadge);

  yearFilter.querySelectorAll('.ypill').forEach(pill => {
    pill.addEventListener('click', () => {
      yearFilter.querySelectorAll('.ypill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const yearNum = yearBadge.querySelector('.year-num');
      const t = pill.textContent.trim();
      const param = /^\d{4}$/.test(t) ? t : 'all';
      if (param !== 'all') { yearNum.textContent = t; yearNum.classList.remove('small'); }
      else { yearNum.textContent = 'ВСІ РОКИ'; yearNum.classList.add('small'); }
      fetchEntryKpi(org, param).then(applyEntryKpi);
    });
  });

  // Дефолт — рік останньої госпіталізації в даних (як на layout.html),
  // не "всі роки". Див. TODO в page-shell.js: той самий принцип має
  // поширитись на майбутні рівні деталізації (місяць/доба).
  fetchEntryKpi(org, 'all').then(info => {
    const lastYear = info?.max_admission_date ? info.max_admission_date.slice(0, 4) : null;
    const pill = lastYear && [...yearFilter.querySelectorAll('.ypill')].find(p => p.textContent.trim() === lastYear);
    if (pill) {
      yearFilter.querySelectorAll('.ypill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const yearNum = yearBadge.querySelector('.year-num');
      yearNum.textContent = lastYear;
      yearNum.classList.remove('small');
      fetchEntryKpi(org, lastYear).then(applyEntryKpi);
    } else {
      applyEntryKpi(info);
    }
  });

  // Смуга "Чергові лікарі" — як у старому кабінеті: "Вийти" зліва перед
  // написом, чергові лікарі розподілені по ширині. Дані — ТЕСТОВИЙ РЕЖИМ
  // (див. коментар у /api/lpz-duty-doctors): реального графіка чергувань
  // ще немає, тимчасово по одному лікарю на відділення.
  root.insertAdjacentHTML('beforeend', `
    <div class="work-band">
      <span class="me-logout" id="meLogout">Вийти</span>
      <span class="wb-title">Чергові лікарі:</span>
      <div class="duty-docs" id="dutyDocs"></div>
    </div>
  `);
  document.getElementById('meLogout').addEventListener('click', () => {
    fetch('/api/slide-logout', { method: 'POST' }).then(() => { window.location.href = '/layout.html'; });
  });
  const dutyEl0 = document.getElementById('dutyDocs');
  enableDragScroll(dutyEl0, 'x');
  dutyEl0.addEventListener('scroll', () => updateFadeMask(dutyEl0, 'x'));
  fetch(`/api/lpz-duty-doctors?org=${encodeURIComponent(org)}`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const dutyEl = document.getElementById('dutyDocs');
      if (!data || !dutyEl) return;
      dutyEl.innerHTML = data.rows.map(r => `
        <span data-full="${r.doctorFull}" data-position="${r.position}" data-home="${r.department}">${r.doctor}</span>
      `).join('');
      initDutyTooltip(dutyEl);
      wireDutyHover(root);
      updateFadeMask(dutyEl, 'x');
    })
    .catch(() => {});
}

// Спливаюча підказка при наведенні на чергового лікаря: посада + повне ПІБ
// (відділення тепер показується підсвіткою в dept-list, не текстом тут).
function initDutyTooltip(dutyEl) {
  let tip = document.querySelector('.duty-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'duty-tip';
    tip.innerHTML = '<div class="dt-name"></div><div class="dt-role"></div>';
    document.body.appendChild(tip);
  }
  const nameEl = tip.querySelector('.dt-name');
  const roleEl = tip.querySelector('.dt-role');

  dutyEl.querySelectorAll('span[data-full]').forEach(span => {
    if (span._tipBound) return;
    span._tipBound = true;
    span.addEventListener('mouseenter', () => {
      nameEl.textContent = span.dataset.full;
      roleEl.textContent = span.dataset.position || '';
      const rect = span.getBoundingClientRect();
      tip.style.left = (rect.left + rect.width / 2) + 'px';
      tip.style.top = rect.top + 'px';
      tip.classList.add('open');
    });
    span.addEventListener('mouseleave', () => tip.classList.remove('open'));
  });
}

function initEntry() {
  fetch('/api/me').then(r => r.json()).then(me => {
    if (!me || !me.role) { window.location.href = '/layout.html'; return; }
    const org = me.org_edrpou;
    if (!org) return; // TODO: власник/адмін без empl_name_id — вибір лікарні ще не підключено
    window.HOSPITAL_ORG_EDRPOU = org;
    const root = document.getElementById('slideRoot');
    renderGeneralLayer(root, org);
    renderClinicalBlock(root, org);
    initHospitalName();
  });
}

document.addEventListener('DOMContentLoaded', initEntry);
