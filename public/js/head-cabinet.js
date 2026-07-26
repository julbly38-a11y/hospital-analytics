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
  });
}

// ── Ординаторська (лікарі відділення) + "перебуває у відділенні" ──
// Ординаторська — завжди повний список, дані надійні (lpz_empl). Список
// пацієнтів — базово (без лікаря) теж надійний (department_structure_id
// самої госпіталізації); клік на лікаря додає фільтр через lpz_episodes,
// покриття якого на живих (не виписаних) випадках слабке (15-30%) — тому
// для частини лікарів список після кліку буде просто порожній, це очікувано
// (пояснено в .census-empty), а не помилка.
let activeDoctorId = null;

function renderStaffAndCensus(root) {
  (root.querySelector('.lf-left-top') || root).insertAdjacentHTML('beforeend', `
    <div class="docs-title">Ординаторська</div>
    <div class="docs-list" id="docsList"></div>
  `);
  renderCensusSection(root, { showReset: true });
  const docsList = root.querySelector('#docsList');
  const workBand = root.querySelector('.work-band');
  // docsList навмисно ігнорує межу lf-left-top/lf-left-bottom (єдиний
  // суцільний список аж до смуги "Чергові лікарі", а не два окремі, як на
  // entry.html) — offsetInSlide(workBand) працює коректно навіть коли
  // docsList вкладений у поле, а workBand — ні (різні offsetParent).
  fitHeightTo(docsList, workBand ? offsetInSlide(workBand) : 500);
  enableDragScroll(docsList, 'y');
  docsList.addEventListener('scroll', () => updateFadeMask(docsList, 'y'));
  document.getElementById('censusReset').addEventListener('click', () => selectDoctor(null));
}

function selectDoctor(doctorId) {
  activeDoctorId = (activeDoctorId === doctorId) ? null : doctorId;
  document.querySelectorAll('.doc-item').forEach(el => {
    el.classList.toggle('doc-active', el.dataset.doctor === activeDoctorId);
  });
  document.getElementById('censusReset').style.display = activeDoctorId ? '' : 'none';
  loadCensus(activeDoctorId);
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
      // Клік на лікаря → фільтр списку пацієнтів (selectDoctor) тимчасово
      // вимкнено за проханням користувача (2026-07-25) — .doc-item лишається
      // лише ціллю зворотної підсвітки з census-row (utils.js), сам по собі
      // не клікабельний.
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
    loadCensus(null);

    initHospitalName();
  });
}

document.addEventListener('DOMContentLoaded', initHeadCabinet);
