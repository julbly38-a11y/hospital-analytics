/* Кабінет завідувача (public/head-cabinet.html) — Етап 2 staged-плану:
   спільний заголовок (лого/назва/КПІ-рядок лікарні/роки — той самий шар,
   що на entry.html, utils.js:renderHeaderBlock) + КПІ ОДНОГО відділення —
   власного, з сесії (/api/me), без ?dept= у URL (той самий принцип, що на
   entry.html: сторінка сама визначає себе). */

// Компактна висота гістограми відділення (замість дефолтних 185px) —
// вона тепер стоїть ПІД хвилею в тому самому тісному полі lf-right-top
// (270px, там ще й КПІ-рядок): 185+хвиля туди не влазять, переповнюють
// смугу "Чергові лікарі" знизу. doctor-cabinet.html далі використовує
// дефолтні 185 (хвилі там нема, повний бюджет поля вільний).
const DEPT_CHART_HEIGHT = 80;

// КПІ+графік відділення — utils.js:renderKpiChartBlock/loadKpiChartBlock
// (спільні з doctor-cabinet.js), позиція — layout.css:.field-kpi-1/
// .field-chart-1. getCensusDoctorId — читає activeDoctorId В МОМЕНТ КЛІКА на
// графік (не зараз), бо клік на лікаря в "Ординаторській" міняє його пізніше.
function loadDeptBlock(org, deptId, year, month = 'all') {
  activeYear = year;
  activeMonth = month;
  // Кожна зміна року/місяця (пігулки) — це нова точка відліку: раніше
  // обрана "точна дата" (якщо була) до неї вже не стосується, тож ховаємо
  // "Перебуває у відділенні" знову (в обратному напрямку до появи по кліку
  // на денну гістограму нижче) — без ручного "✕ скинути дату".
  const titleEl = document.querySelector('.census-title');
  const listEl = document.getElementById('censusList');
  if (titleEl) titleEl.style.display = 'none';
  if (listEl) { listEl.style.display = 'none'; listEl.innerHTML = ''; }
  // lastCensusDate (utils.js) теж скидаємо — без неї selectDoctor нижче
  // більше не відкриває розгортку пацієнтів лікаря (нема на яку дату).
  lastCensusDate = null;
  closeAllDoctorExpands();
  activeDoctorId = null;
  loadKpiChartBlock('department', org, deptId, year, month, {
    rowId: 'deptKpiRow', chartId: 'deptChart',
    getCensusDoctorId: () => activeDoctorId,
    onRowClick: onCensusRowClick,
    // "Перебуває у відділенні" — порожнє поле, поки не обрано точний день
    // (клік на денну гістограму); клік на стовпець року/місяця (синтетична
    // дата — 31 грудня/останній день місяця) її не показує.
    hideCensusUntilDaily: true,
    chartHeight: DEPT_CHART_HEIGHT,
  });
  loadDeptWave(org, deptId, year, month);
}

// ── Хвилястий графік ургентні/планові (wave-chart.js, той самий стек, що
// entry.html:.chart-row-1/.chart-row-2) — тут лише ОДНЕ відділення замість
// двох напрямків, тому DEPT_WAVE_STATE без dict-обгортки. Поточний рік/
// місяць (activeYear/activeMonth) — для перехресного посилання клік-на-
// підпис-хвилі (wave-chart.js:wireWaveDateLabels), той самий принцип, що
// entry.js. ──
let activeYear = 'all';
let activeMonth = 'all';
const DEPT_WAVE_STATE = { activeKpi: 'hosp', rows: [] };

// wireDeptWave() — викликається ОДИН РАЗ (initHeadCabinet), одразу після
// renderKpiChartBlock: той вставляє #deptChart прямим нащадком .lf-right-top
// (без обгортки), тут дообгортаємо його в .chart-row-dept (head-cabinet.css)
// і додаємо side-stack ПЕРЕД ним (хвиля зверху, гістограма під нею) — той
// самий DOM-патерн, що entry.js будує одразу в своєму innerHTML (тут
// доводиться дообгорнути постфактум, бо #deptChart — спільна розмітка з
// doctor-cabinet.html, яка хвилі не має).
function wireDeptWave() {
  const chartEl = document.getElementById('deptChart');
  if (!chartEl || chartEl.closest('.chart-row-dept')) return;
  const wrap = document.createElement('div');
  wrap.className = 'chart-row-dept';
  chartEl.parentNode.insertBefore(wrap, chartEl);
  wrap.insertAdjacentHTML('beforeend', '<div class="side-stack" id="sideStackDept"></div>');
  wrap.appendChild(chartEl); // після side-stack у DOM — гістограма нижче хвилі
  renderWaveCard(document.getElementById('sideStackDept'), 'Dept');
  wireWaveKpiClicks(document.getElementById('deptKpiRow'), DEPT_WAVE_STATE.activeKpi, dk => {
    DEPT_WAVE_STATE.activeKpi = dk;
    updateDeptWaveChart();
  });
}

function updateDeptWaveChart() {
  updateWaveCard({
    svg: document.getElementById('waveDept'),
    xlabelsEl: document.getElementById('waveXlabelsDept'),
    barUrgentEl: document.getElementById('waveBarUrgentDept'),
    barPlannedEl: document.getElementById('waveBarPlannedDept'),
    tipUrgentEl: document.getElementById('waveTipUrgentDept'),
    tipPlannedEl: document.getElementById('waveTipPlannedDept'),
    rows: DEPT_WAVE_STATE.rows,
    activeKpi: DEPT_WAVE_STATE.activeKpi,
    activeYear, activeMonth,
    onDayClick: onWaveDayClick,
  });
}

// onWaveDayClick(day) — клік на підпис дня під хвилею (найдрібніший рівень,
// wave-chart.js:wireWaveDateLabels) — той самий ефект, що клік на стовпець
// денної гістограми (utils.js:loadKpiChartBlock:onPoint): показує
// "Перебуває у відділенні" станом на цю дату.
function onWaveDayClick(day) {
  const titleEl = document.querySelector('.census-title');
  const listEl = document.getElementById('censusList');
  if (titleEl) titleEl.style.display = '';
  if (listEl) listEl.style.display = '';
  loadCensus(activeDoctorId, {
    date: censusDateFromChartPoint(activeYear, day, activeMonth),
    onRowClick: onCensusRowClick,
    hideCensusUntilDaily: true,
  });
  const monthBadge = document.querySelector('.year-badge-month');
  if (monthBadge) monthBadge.textContent = `${day} ${MONTH_PILL_NAMES[Number(activeMonth) - 1]}`;
}

function loadDeptWave(org, deptId, year, month) {
  fetch(`/api/lpz-trend-department-kpi?org=${encodeURIComponent(org)}&year=${encodeURIComponent(year)}&department=${encodeURIComponent(deptId)}&month=${encodeURIComponent(month)}`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      DEPT_WAVE_STATE.rows = data?.rows || [];
      updateDeptWaveChart();
    })
    .catch(() => {});
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

function renderStaffAndCensus(root, deptName) {
  (root.querySelector('.lf-left-top') || root).insertAdjacentHTML('beforeend', `
    <div class="docs-title">${deptName ? deptName + ' · ' : ''}Ординаторська</div>
    <div class="docs-list" id="docsList"></div>
  `);
  // showReset:false — "Перебуває у відділенні" праворуч тепер НЕ реагує на
  // клік на лікаря (той розгортається інлайн у самій Ординаторській), тож
  // "✕ скинути лікаря" в її заголовку більше нема чого скидати.
  renderCensusSection(root);
  // Порожнє (display:none), поки не обрано точний день на денній гістограмі
  // (loadKpiChartBlock:hideCensusUntilDaily, utils.js) — жодного дефолтного
  // "останній наявний день" на старті сторінки.
  root.querySelector('.census-title').style.display = 'none';
  document.getElementById('censusList').style.display = 'none';
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
  // Скидаємо замок/обертання донату (клік на пацієнта в "Перебуває у
  // відділенні" міг лишити його на чужому сегменті) — ця розгортка не
  // стосується жодного конкретного сегмента, стара підсвітка тут зайва.
  if (deptPieApi) deptPieApi.unlock();
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
      const docsList = document.getElementById('docsList');
      updateFadeMask(docsList, 'y');
      // Список скролиться так, щоб розгортка опинилась посередині видимої
      // частини (не зверху/знизу поза кадром) — та сама функція, що вже
      // центрує лікаря в ординаторській при кліку на пацієнта (utils.js).
      // Після завантаження контенту (не одразу на "Завантаження…") — інакше
      // висота для розрахунку центру ще неточна.
      inertialScrollToCenter(docsList, exp);
    })
    .catch(() => { if (exp.isConnected) exp.innerHTML = `<div class="census-empty">Помилка завантаження</div>`; });
}

function selectDoctor(doctorId) {
  // Без обраної точної дати (lastCensusDate, utils.js — те саме, що ховає
  // "Перебуває у відділенні") нема на яку дату показувати "перебувають
  // пацієнти лікаря" — клік на лікаря нічого не робить.
  if (!lastCensusDate) return;
  activeDoctorId = (activeDoctorId === doctorId) ? null : doctorId;
  if (!activeDoctorId) { closeAllDoctorExpands(); return; }
  const el = document.querySelector(`.doc-item[data-doctor="${activeDoctorId}"]`);
  if (el) openDoctorExpand(el);
}

function loadStaff(org, deptId, isOwner, deptName) {
  fetch(`/api/lpz-department-staff?org=${encodeURIComponent(org)}&department=${encodeURIComponent(deptId)}`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const docsList = document.getElementById('docsList');
      if (!data || !docsList) return;
      docsList.innerHTML = data.rows.map(d => `
        <div class="doc-item" data-doctor="${d.resource_id}" data-doctor-name="${d.full_name}">
          ${d.full_name}
          <span class="doc-position">Ординатор</span>
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
      if (isOwner) wireAdminDoctorNav(docsList, org, deptId, deptName);
      updateFadeMask(docsList, 'y');
    })
    .catch(() => {});
}

// Власник сайту (is_owner) — клік на лікаря в "Ординаторській" веде у його
// doctor-cabinet.html (org/doctor/doctorName у URL), той самий принцип, що
// entry.js:wireAdminDeptNav для відділень. Реєструється ПІСЛЯ selectDoctor
// вище (той для адміна зазвичай no-op, бо lastCensusDate ще не обрана) —
// навігація виграє. doctor-cabinet.js:initDoctorCabinet приймає ці
// параметри лише коли сесія підтверджує me.is_owner === true.
function wireAdminDoctorNav(docsList, org, deptId, deptName) {
  docsList.querySelectorAll('.doc-item[data-doctor]').forEach(el => {
    el.addEventListener('click', () => {
      const params = new URLSearchParams({ org, dept: deptId, deptName: deptName || '', doctor: el.dataset.doctor, doctorName: el.dataset.doctorName || '' });
      window.location.href = '/doctor-cabinet.html?' + params.toString();
    });
  });
}

function initHeadCabinet() {
  fetch('/api/me').then(r => r.json()).then(me => {
    if (!me || !me.role) { window.location.href = '/layout.html'; return; }

    // Власник сайту (is_owner) — вхід у БУДЬ-ЯКЕ відділення з entry.js:
    // wireAdminDeptNav передає org/dept/deptName у URL. Довіряємо цим
    // параметрам ЛИШЕ коли сесія підтверджує me.is_owner === true (це
    // серверне поле з /api/me, клієнт його підмінити не може) — для
    // звичайного завідувача/лікаря is_owner завжди false, і сторінка й
    // далі бере ідентичність тільки з сесії, як і раніше.
    const params = new URLSearchParams(location.search)
    const adminOverride = me.is_owner && params.get('org') && params.get('dept')
    if (!adminOverride && (me.lpz_role !== 'head' || !me.lpz_department_structure_id)) { window.location.href = '/entry.html'; return; }

    const org = adminOverride ? params.get('org') : me.org_edrpou;
    const deptId = adminOverride ? params.get('dept') : me.lpz_department_structure_id;
    const deptName = adminOverride ? (params.get('deptName') || '') : me.lpz_department;
    if (!org || !deptId) return;
    window.HOSPITAL_ORG_EDRPOU = org;
    window.HOSPITAL_DEPARTMENT_ID = deptId;

    const root = document.getElementById('slideRoot');
    renderBgLayers(root);
    renderKpiChartBlock(root, 'deptKpiRow', 'deptChart', 'department', DEPT_CHART_HEIGHT);
    wireDeptWave();
    renderHeaderBlock(root, HOSPITAL_KPI, HOSPITAL_YEARS_BACK,
      (year) => loadDeptBlock(org, deptId, year),
      true,
      (year, month) => loadDeptBlock(org, deptId, year, month));
    renderFieldMe(root, me);
    renderDutyBand(root, org);
    renderStaffAndCensus(root, deptName);
    loadStaff(org, deptId, me.is_owner, deptName);
    // loadCensus(null) на старті НЕ викликаємо — "Перебуває у відділенні"
    // з'являється лише по кліку на точний день (hideCensusUntilDaily вище).
    loadDeptPie(org, deptId);
    loadIcdByDoctor(org, deptId);

    initHospitalName();
  });
}

document.addEventListener('DOMContentLoaded', initHeadCabinet);
