/* Кабінет завідувача (public/head-cabinet.html) — Етап 2 staged-плану:
   спільний заголовок (лого/назва/КПІ-рядок лікарні/роки — той самий шар,
   що на entry.html, utils.js:renderHeaderBlock) + КПІ ОДНОГО відділення —
   власного, з сесії (/api/me), без ?dept= у URL (той самий принцип, що на
   entry.html: сторінка сама визначає себе). */

// КПІ+графік відділення — utils.js:renderKpiChartBlock/loadKpiChartBlock
// (спільні з doctor-cabinet.js), позиція — layout.css:.field-kpi-1/
// .field-chart-1. getCensusDoctorId — читає activeDoctorId В МОМЕНТ КЛІКА на
// графік (не зараз), бо клік на лікаря в "Ординаторській" міняє його пізніше.
function loadDeptBlock(org, deptId, year, month = 'all') {
  loadKpiChartBlock('department', org, deptId, year, month, {
    rowId: 'deptKpiRow', chartId: 'deptChart',
    getCensusDoctorId: () => activeDoctorId,
    onRowClick: onCensusRowClick,
  });
}

// Клік на пацієнта в "Перебуває у відділенні" (utils.js:loadCensus,
// opts.onRowClick) — той самий ефект, що клік на самому сегменті донату:
// підсвітити (замок) і повернути вгору (rotateTo) сегмент його блоку МКХ.
// No-op, якщо блок не входить у топ-5 (немає видимого сегмента).
function onCensusRowClick(row) {
  if (deptPieApi && row && row.blok) deptPieApi.selectByName(row.blok);
}

// ── Ординаторська (лікарі відділення) + "перебуває у відділенні" ──
// Ординаторська — завжди повний список, дані надійні (lpz_empl). Список
// пацієнтів — базово (без лікаря) теж надійний (department_structure_id
// самої госпіталізації); клік на лікаря додає фільтр через lpz_episodes,
// покриття якого на живих (не виписаних) випадках слабке (15-30%) — тому
// для частини лікарів список після кліку буде просто порожній, це очікувано
// (пояснено в .census-empty), а не помилка.
let activeDoctorId = null;
// Перехресне підсвічування "Ординаторська" ↔ донат "Структура діагнозів" —
// deptPieApi (highlightIndices/clearHighlight, dept-pie.js) і doctorIcdBlocks
// ({ doctorId: Set(назва блоку) }, з /api/lpz-department-icd-blocks-by-doctor)
// заповнюються асинхронно й незалежно одне від одного (loadDeptPie/
// loadIcdByDoctor); hover-обробники (loadStaff) читають їх У МОМЕНТ НАВЕДЕННЯ,
// не на момент підключення — тому порядок завантаження не важливий.
let deptPieApi = null;
let doctorIcdBlocks = {};

function renderStaffAndCensus(root) {
  (root.querySelector('.lf-left-top') || root).insertAdjacentHTML('beforeend', `
    <div class="docs-title">Ординаторська</div>
    <div class="docs-list" id="docsList"></div>
  `);
  // showReset:false — "Перебуває у відділенні" праворуч тепер НЕ реагує на
  // клік на лікаря (той розгортається інлайн у самій Ординаторській), тож
  // "✕ скинути лікаря" в її заголовку більше нема чого скидати.
  renderCensusSection(root);
  // lf-left-bottom — донат "Структура діагнозів" (dept-pie.js), завжди
  // видимий, ніщо його більше не ховає.
  (root.querySelector('.lf-left-bottom') || root).insertAdjacentHTML('beforeend', `
    <div class="dept-pie" id="deptPie"></div>
  `);
  const docsList = root.querySelector('#docsList');
  const workBand = root.querySelector('.work-band');
  // docsList — єдиний суцільний список аж до смуги "Чергові лікарі" (не два
  // окремі, як на entry.html) — offsetInSlide(workBand) працює коректно
  // навіть коли docsList вкладений у поле, а workBand — ні (різні
  // offsetParent). Інлайн-розгортка пацієнтів лікаря (openDoctorExpand)
  // росте ВСЕРЕДИНІ цього самого скролу — docsList не переставленому вгору/
  // вниз, як entry.js:repositionMiddleBand, а просто прокручується.
  fitHeightTo(docsList, workBand ? offsetInSlide(workBand) : 500);
  enableDragScroll(docsList, 'y');
  docsList.addEventListener('scroll', () => updateFadeMask(docsList, 'y'));
}

function loadDeptPie(org, deptId) {
  fetch(`/api/lpz-department-icd-blocks?org=${encodeURIComponent(org)}&department=${encodeURIComponent(deptId)}`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const pieEl = document.getElementById('deptPie');
      if (!data || !pieEl) return;
      deptPieApi = renderDeptPie(pieEl, data.rows.map(r => ({ назва: r.name, випадків: r.cases, відс: r.pct })), {
        centerLabel: 'перебуває',
        // Наведення на сегмент → підсвітити лікарів, у чиїх пацієнтів
        // трапляється цей блок МКХ (зворотний напрямок до hover на лікаря
        // в loadStaff нижче).
        onSegmentHover: row => {
          document.querySelectorAll('.doc-item.hl').forEach(el => el.classList.remove('hl'));
          if (!row) return;
          document.querySelectorAll('.doc-item[data-doctor]').forEach(el => {
            const blocks = doctorIcdBlocks[el.dataset.doctor];
            if (blocks && blocks.has(row.назва)) el.classList.add('hl');
          });
        },
      });
    })
    .catch(() => {});
}

function loadIcdByDoctor(org, deptId) {
  fetch(`/api/lpz-department-icd-blocks-by-doctor?org=${encodeURIComponent(org)}&department=${encodeURIComponent(deptId)}`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data) return;
      const map = {};
      data.rows.forEach(r => {
        if (!r.doc_resource_id) return;
        (map[r.doc_resource_id] || (map[r.doc_resource_id] = new Set())).add(r.blok);
      });
      doctorIcdBlocks = map;
    })
    .catch(() => {});
}

function fmtDDMMYYYY(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

// ── Інлайн-розгортка пацієнтів лікаря — той самий патерн, що
// entry.js:openDeptExpand (клік на відділення там), тут клік на лікаря в
// "Ординаторській": картка вставляється ПІСЛЯ клікнутого .doc-item, просто
// росте всередині docsList (скролиться разом зі списком — на відміну від
// entry.html, тут немає окремого work-band push, бо список і так має
// внутрішній скрол). Список пацієнтів — "перебуває саме на цю дату"
// (lastCensusDate, utils.js), той самий /api/lpz-department-census. ──
let expandedDoctorEl = null;

function closeAllDoctorExpands() {
  document.querySelectorAll('.doc-expand').forEach(e => e.remove());
  if (expandedDoctorEl) expandedDoctorEl.classList.remove('doc-active');
  expandedDoctorEl = null;
}

function openDoctorExpand(el) {
  const doctorId = el.dataset.doctor;
  closeAllDoctorExpands();
  const exp = document.createElement('div');
  exp.className = 'doc-expand';
  exp.innerHTML = `<div class="census-empty">Завантаження…</div>`;
  el.insertAdjacentElement('afterend', exp);
  el.classList.add('doc-active');
  expandedDoctorEl = el;

  const params = new URLSearchParams({ doctor: doctorId });
  if (lastCensusDate) params.set('date', lastCensusDate);
  fetch(`/api/lpz-department-census?${params}`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data || !exp.isConnected) return;
      exp.innerHTML = data.rows.length
        ? data.rows.map(r => `
          <div class="census-row">
            <div class="census-info">
              <span class="census-name">${r.pib || '—'}</span>
              <span class="census-meta">${fmtDDMMYYYY(r.admission_date)} · ${r.age ?? '—'} р. · ${r.gender || '—'} · ${fmtDDMMYYYY(r.birth_date)}</span>
            </div>
            <div class="doc-census-diag">${r.icd_code ? r.icd_code + ' ' : ''}${r.diagnosis || '—'}</div>
          </div>`).join('')
        : `<div class="census-empty">Немає пацієнтів цього лікаря на цю дату</div>`;
      updateFadeMask(document.getElementById('docsList'), 'y');
    })
    .catch(() => { if (exp.isConnected) exp.innerHTML = `<div class="census-empty">Помилка завантаження</div>`; });
}

function selectDoctor(doctorId) {
  activeDoctorId = (activeDoctorId === doctorId) ? null : doctorId;
  if (!activeDoctorId) { closeAllDoctorExpands(); return; }
  const el = document.querySelector(`.doc-item[data-doctor="${activeDoctorId}"]`);
  if (el) openDoctorExpand(el);
}

function loadStaff(org, deptId) {
  fetch(`/api/lpz-department-staff?org=${encodeURIComponent(org)}&department=${encodeURIComponent(deptId)}`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const docsList = document.getElementById('docsList');
      if (!data || !docsList) return;
      docsList.innerHTML = data.rows.map(d => `
        <div class="doc-item" data-doctor="${d.resource_id}">
          ${d.full_name}
          <span class="doc-position">${d.position_name || ''}</span>
        </div>
      `).join('') || '<div class="census-empty">Лікарів не знайдено</div>';
      // Клік на лікаря → інлайн-розгортка пацієнтів прямо під ним
      // (selectDoctor/openDoctorExpand). Праворуч "Перебуває у відділенні"
      // лишається по всьому відділенню, цим кліком не займане.
      docsList.querySelectorAll('.doc-item[data-doctor]').forEach(el => {
        el.addEventListener('click', () => selectDoctor(el.dataset.doctor));
        // Наведення на лікаря → підсвітити його сегменти в донаті (лише ті,
        // що взагалі видимі — топ-5, byName не містить "Інші").
        el.addEventListener('mouseenter', () => {
          if (!deptPieApi) return;
          const blocks = doctorIcdBlocks[el.dataset.doctor];
          if (!blocks) return;
          const indices = [...blocks].map(b => deptPieApi.byName[b]).filter(i => i !== undefined);
          deptPieApi.highlightIndices(indices);
        });
        el.addEventListener('mouseleave', () => { if (deptPieApi) deptPieApi.clearHighlight(); });
      });
      updateFadeMask(docsList, 'y');
    })
    .catch(() => {});
}

function initHeadCabinet() {
  fetch('/api/me').then(r => r.json()).then(me => {
    if (!me || !me.role) { window.location.href = '/layout.html'; return; }
    if (me.lpz_role !== 'head' || !me.lpz_department_structure_id) { window.location.href = '/entry.html'; return; }
    const org = me.org_edrpou;
    if (!org) return;
    window.HOSPITAL_ORG_EDRPOU = org;

    const root = document.getElementById('slideRoot');
    renderBgLayers(root);
    renderKpiChartBlock(root, 'deptKpiRow', 'deptChart', 'department');
    renderHeaderBlock(root, HOSPITAL_KPI, HOSPITAL_YEARS_BACK,
      (year) => loadDeptBlock(org, me.lpz_department_structure_id, year),
      true,
      (year, month) => loadDeptBlock(org, me.lpz_department_structure_id, year, month));
    renderFieldMe(root, me);
    renderDutyBand(root, org);
    renderStaffAndCensus(root);
    loadStaff(org, me.lpz_department_structure_id);
    loadCensus(null, { onRowClick: onCensusRowClick });
    loadDeptPie(org, me.lpz_department_structure_id);
    loadIcdByDoctor(org, me.lpz_department_structure_id);

    initHospitalName();
  });
}

document.addEventListener('DOMContentLoaded', initHeadCabinet);
