/* Кабінет лікаря (public/doctor-cabinet.html) — той самий шар, що на
   head-cabinet.html: спільний заголовок (лого/назва/КПІ-рядок лікарні/роки —
   utils.js:renderHeaderBlock) + КПІ лікаря на 6 показників (kpi6RowHtml/
   applyKpi6, .field-kpi-1) + графік динаміки (.field-chart-1, клік на точку
   → "Перебуває у відділенні" станом на цю дату) + табличка ПІБ/посада
   (renderFieldMe) + "Перебуває у відділенні" (renderCensusSection/loadCensus)
   — тут БЕЗ кнопки скидання лікаря (showReset:false), бо
   /api/lpz-department-census сам примусово підставляє doctor=свій
   resource_id на сервері — лікар завжди бачить лише своїх пацієнтів, без
   клієнтського фільтра. Дані КПІ/графіка — /api/lpz-kpi-doctor,
   /api/lpz-trend-doctor (звʼязок лікар↔випадок через lpz_episodes, бо
   lpz_hospitalizations.doc_resource_id порожній; те саме обмеження покриття,
   що й у "Перебуває у відділенні") + хвилястий графік ургентні/планові
   (wave-chart.js, /api/lpz-trend-doctor-kpi — той самий звʼязок через
   lpz_episodes, без daily-деталізації). Решта чекає перебудови під
   lpz-схему (див. коментар у doctor-cabinet.html). */

// Компактна висота гістограми лікаря (замість дефолтних 185px) — той самий
// бюджет поля lf-right-top (270px), що на head-cabinet.html
// (head-cabinet.js:DEPT_CHART_HEIGHT): тепер над гістограмою стоїть хвиля,
// разом 185+хвиля туди не влазять.
const DOCTOR_CHART_HEIGHT = 80;

// КПІ+графік лікаря — utils.js:renderKpiChartBlock/loadKpiChartBlock
// (спільні з head-cabinet.js). census не фільтрується (getCensusDoctorId не
// передаємо) — /api/lpz-department-census сам підставляє doctor=свій
// resource_id на сервері, лікар завжди бачить лише своїх пацієнтів.
let activeYear = 'all';
let activeMonth = 'all';

// ── Фінансовий режим (клік на емблему, utils.js:isFinanceMode) — той самий
// принцип, що head-cabinet.js: КПІ-ряд, хвиля й гістограма — контроль
// записів лікаря за період; праве нижнє поле — його епізоди з зауваженнями й
// підказками (quality-notes.js). Лікар бачить кількість, власник сайту — ще й
// суми (сервер вирішує сам). ──
let FIN_MODE = null;   // null або { org, doctorId }
let finCases = null;   // відповідь /api/lpz-case-quality (усі епізоди лікаря)
let finDay = null;

function refreshFinanceCases() {
  renderFinanceCases({ data: finCases, year: activeYear, month: activeMonth, day: finDay });
}

function selectFinanceDay(day) {
  finDay = day;
  const monthBadge = document.querySelector('.year-badge-month');
  if (monthBadge) monthBadge.textContent = `${day} ${MONTH_PILL_NAMES[Number(activeMonth) - 1]}`;
  const seq = FINANCE_REQUEST_SEQ.doctorChart;
  fetchFinance({ org: FIN_MODE.org, doctor: FIN_MODE.doctorId, year: activeYear, month: activeMonth, day })
    .then(data => { if (seq === FINANCE_REQUEST_SEQ.doctorChart && finDay === day) applyFinanceKpi(document.getElementById('doctorKpiRow'), 'dk', data); });
  refreshFinanceCases();
}

function loadDoctorFinance(year, month) {
  activeYear = year;
  activeMonth = month;
  finDay = null;
  loadFinanceChartBlock({ org: FIN_MODE.org, doctor: FIN_MODE.doctorId }, year, month, {
    rowId: 'doctorKpiRow', chartId: 'doctorChart', chartHeight: DOCTOR_CHART_HEIGHT,
    onWaveRows: rows => { DOCTOR_WAVE_STATE.rows = rows; updateDoctorWaveChart(); },
    onDay: selectFinanceDay,
  });
  refreshFinanceCases();
}

function loadDoctorKpi(org, doctorId, year, month = 'all') {
  if (FIN_MODE) { loadDoctorFinance(year, month); return; }
  activeYear = year;
  activeMonth = month;
  loadKpiChartBlock('doctor', org, doctorId, year, month, {
    rowId: 'doctorKpiRow', chartId: 'doctorChart',
    emptyMessage: 'Наразі немає ваших пацієнтів у відділенні',
    chartHeight: DOCTOR_CHART_HEIGHT,
  });
  loadDoctorWave(org, doctorId, year);
}

// ── Хвилястий графік ургентні/планові (wave-chart.js, той самий стек, що
// entry.html/head-cabinet.html) — тут лише ОДИН лікар, тому DOCTOR_WAVE_STATE
// без dict-обгортки (той самий принцип, що head-cabinet.js:DEPT_WAVE_STATE).
// onDayClick не передаємо — kind='doctor' у loadKpiChartBlock (utils.js)
// ніколи не перемикає графік на щоденну деталізацію (лишається річним),
// тож дробити на дні нема куди (той самий випадок, що entry.js). ──
const DOCTOR_WAVE_STATE = { activeKpi: 'hosp', rows: [] };

// wireDoctorWave() — викликається ОДИН РАЗ (initDoctorCabinet), одразу після
// renderKpiChartBlock: той вставляє #doctorChart прямим нащадком
// .lf-right-top, тут дообгортаємо його в .chart-row-dept (head-cabinet.css,
// та сама розмітка — вже підключена через <link>) і додаємо side-stack
// ПЕРЕД ним (хвиля зверху, гістограма під нею).
function wireDoctorWave() {
  const chartEl = document.getElementById('doctorChart');
  if (!chartEl || chartEl.closest('.chart-row-dept')) return;
  const wrap = document.createElement('div');
  wrap.className = 'chart-row-dept';
  chartEl.parentNode.insertBefore(wrap, chartEl);
  wrap.insertAdjacentHTML('beforeend', '<div class="side-stack" id="sideStackDoctor"></div>');
  wrap.appendChild(chartEl);
  renderWaveCard(document.getElementById('sideStackDoctor'), 'Doctor');
  wireWaveKpiClicks(document.getElementById('doctorKpiRow'), DOCTOR_WAVE_STATE.activeKpi, dk => {
    DOCTOR_WAVE_STATE.activeKpi = dk;
    updateDoctorWaveChart();
  });
}

function updateDoctorWaveChart() {
  updateWaveCard({
    svg: document.getElementById('waveDoctor'),
    xlabelsEl: document.getElementById('waveXlabelsDoctor'),
    barUrgentEl: document.getElementById('waveBarUrgentDoctor'),
    barPlannedEl: document.getElementById('waveBarPlannedDoctor'),
    tipUrgentEl: document.getElementById('waveTipUrgentDoctor'),
    tipPlannedEl: document.getElementById('waveTipPlannedDoctor'),
    rows: DOCTOR_WAVE_STATE.rows,
    activeKpi: DOCTOR_WAVE_STATE.activeKpi,
    activeYear, activeMonth,
    // Лише у фінансовому режимі: там гістограма й хвиля дробляться до днів.
    ...(FIN_MODE ? { onDayClick: selectFinanceDay, sharedScale: true } : {}),
  });
}

function loadDoctorWave(org, doctorId, year) {
  fetch(`/api/lpz-trend-doctor-kpi?org=${encodeURIComponent(org)}&year=${encodeURIComponent(year)}&doctor=${encodeURIComponent(doctorId)}`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      DOCTOR_WAVE_STATE.rows = data?.rows || [];
      updateDoctorWaveChart();
    })
    .catch(() => {});
}

// Ординаторська — та сама назва відділення + список колег, що на
// head-cabinet.html (utils.js:renderStaffAndCensus/head-cabinet.js:loadStaff),
// лише без click-to-expand інлайн-розгортки пацієнтів колеги (тут для цього
// нема сенсу — власний "Перебуває у відділенні" вже завжди видимий,
// deptPieApi/donut тут теж нема, підсвічувати нічого).
function renderColleagueList(root, deptName) {
  (root.querySelector('.lf-left-top') || root).insertAdjacentHTML('beforeend', `
    <div class="docs-title">${deptName ? qEsc(deptName) + ' · ' : ''}Ординаторська</div>
    <div class="docs-list" id="docsList"></div>
  `);
}

// Власник сайту (is_owner) — клік на колегу веде у ЇЇ/ЙОГО кабінет, той
// самий принцип, що head-cabinet.js:wireAdminDoctorNav. Для звичайного
// лікаря список лише інформаційний (без навігації) — навіть якби клікнув,
// без is_owner сторінка все одно взяла б ідентичність із власної сесії.
function loadColleagues(root, org, deptId, ownDoctorId, isOwner, deptName) {
  fetch(`/api/lpz-department-staff?org=${encodeURIComponent(org)}&department=${encodeURIComponent(deptId)}`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const docsList = document.getElementById('docsList');
      if (!data || !docsList) return;
      docsList.innerHTML = data.rows.map(d => `
        <div class="doc-item${d.resource_id === ownDoctorId ? ' own' : ''}" data-doctor="${qEsc(d.resource_id)}" data-doctor-name="${qEsc(d.full_name)}">
          ${qEsc(d.full_name)}
          <span class="doc-position">Ординатор</span>
        </div>
      `).join('') || '<div class="census-empty">Лікарів не знайдено</div>';
      const workBand = root.querySelector('.work-band');
      fitHeightTo(docsList, workBand ? offsetInSlide(workBand) : 500);
      enableDragScroll(docsList, 'y');
      docsList.addEventListener('scroll', () => updateFadeMask(docsList, 'y'));
      updateFadeMask(docsList, 'y');
      // Лікар, чий це кабінет, — одразу прокрутити до нього (посередині
      // списку), щоб виділення було видно. Без анімації й у логічних px
      // (offsetInSlide), бо слайд масштабується transform'ом.
      const ownEl = docsList.querySelector('.doc-item.own');
      if (ownEl) {
        docsList.scrollTop = offsetInSlide(ownEl) - offsetInSlide(docsList) - docsList.clientHeight / 2 + ownEl.offsetHeight / 2;
        updateFadeMask(docsList, 'y');
      }
      if (isOwner) {
        docsList.querySelectorAll('.doc-item[data-doctor]').forEach(el => {
          if (el.dataset.doctor === ownDoctorId) return;
          el.addEventListener('click', () => {
            const params = new URLSearchParams({ org, dept: deptId, deptName: deptName || '', doctor: el.dataset.doctor, doctorName: el.dataset.doctorName || '' });
            if (FIN_MODE) { params.set('fin', '1'); if (finBasis() === 'nszu') params.set('basis', 'nszu'); }
            window.location.href = '/doctor-cabinet.html?' + params.toString();
          });
        });
      }
    })
    .catch(() => {});
}

// Лікарня відома лише після /api/me — кольори лікарні застосує initHospitalName
// нижче (utils.js:HOSPITAL_THEME_PENDING).
window.HOSPITAL_THEME_PENDING = true;

// ── Нагадування лікарю по його відкритих пацієнтах — вкладка «Нагадування · N»
// в полі «Перебуває у відділенні» (те саме поле й розмір, список підміняється).
// Правило й дані — /api/lpz-case-quality?reminders=1 (lib/quality-access.js:
// buildReminder): від 3-ї доби перебування, поки в записі є що дооформити;
// історія проблем і «запис не змінювався» — з hints.__track (щоденний прогін). ──
let remindMode = false;

function reminderItemHtml(r) {
  const rem = r.reminder;
  const patient = r.patient_name ? qEsc(r.patient_name) : `картка № ${qEsc(r.card_number || '—')}`;
  const norm = rem.norm ? ` · норма ≈ ${rem.norm.median} діб` : '';
  const lines = rem.items.filter(i => Q_FLAGS[i.code]).map(i => {
    const f = Q_FLAGS[i.code];
    const hint = (r.hints && r.hints[i.code]) || f.check;
    const since = i.since_days != null ? ` · триває ${i.since_days} дн.` : '';
    return `
      <div class="remind-line ${i.soft ? 'remind-soft' : i.error ? 'remind-err' : 'remind-warn'}">
        <b>${qEsc(f.title)}</b><span class="remind-since">${since}</span>
        <a class="q-fix-link" href="${qHelsiUrl(r, i.code)}" target="${Q_HELSI_WINDOW}">виправити в helsi ↗</a>
        <div class="remind-hint">${qEsc(hint)}</div>
      </div>`;
  }).join('');
  const foot = [
    rem.unchanged_days != null ? `запис не змінювався ${rem.unchanged_days} дн.` : null,
    rem.escalate ? 'передано завідувачу' : null,
  ].filter(Boolean).join(' · ');
  return `
    <div class="remind-item${rem.escalate ? ' remind-escalated' : ''}${rem.important ? '' : ' remind-item-soft'}">
      <div class="remind-head"><span class="remind-patient">${patient}</span><span class="remind-day">доба ${rem.day}${norm}</span></div>
      <div class="remind-dx">${qEsc(r.primary_icd || '—')} ${qEsc(r.primary_name || '')}</div>
      ${lines}
      ${foot ? `<div class="remind-foot">${foot}</div>` : ''}
    </div>`;
}

function applyRemindMode() {
  const census = document.getElementById('censusList');
  const remind = document.getElementById('remindList');
  const pill = document.getElementById('censusRemind');
  if (!census || !remind || !pill) return;
  census.style.display = remindMode ? 'none' : '';
  remind.style.display = remindMode ? '' : 'none';
  pill.classList.toggle('active', remindMode);
  const fieldMe = document.querySelector('.field-me');
  if (remindMode && fieldMe) fitHeightTo(remind, offsetInSlide(fieldMe), 20);
  updateFadeMask(remindMode ? remind : census, 'y');
}

function loadReminders(org, doctorId) {
  const title = document.querySelector('.census-title');
  const census = document.getElementById('censusList');
  if (!title || !census) return;
  const q = new URLSearchParams({ org, doctor: doctorId, reminders: '1', names: '1' });
  fetch(`/api/lpz-case-quality?${q}`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const rows = ((data && data.rows) || []).filter(r => r.reminder)
        .sort((a, b) => (b.reminder.important - a.reminder.important) || (b.reminder.escalate - a.reminder.escalate) || (b.reminder.day - a.reminder.day));
      // У лічильнику — лише епізоди з важливими пунктами; «м'які» (оплату не
      // блокують) — нижче, окремим підзаголовком.
      const important = rows.filter(r => r.reminder.important);
      const soft = rows.filter(r => !r.reminder.important);
      if (!document.getElementById('censusRemind')) {
        title.insertAdjacentHTML('beforeend', `<span class="census-remind" id="censusRemind"></span>`);
        census.insertAdjacentHTML('afterend', `<div class="census-list remind-list" id="remindList" style="display:none"></div>`);
        const remind = document.getElementById('remindList');
        enableDragScroll(remind, 'y');
        remind.addEventListener('scroll', () => updateFadeMask(remind, 'y'));
        // Вкладка вмикається кліком на неї; будь-який власний елемент заголовка
        // (Перебуває у відділенні, поступило/виписано, скинути дату) — назад до списку.
        title.addEventListener('click', e => {
          if (e.target.closest('#censusRemind')) remindMode = !remindMode;
          else if (e.target.closest('#censusActive, .census-flow-item, .census-reset-date')) remindMode = false;
          else return;
          applyRemindMode();
        });
      }
      document.getElementById('censusRemind').textContent = `Нагадування · ${important.length}`;
      document.getElementById('remindList').innerHTML =
        (important.map(reminderItemHtml).join('')
          || '<div class="census-empty" style="position:static">Важливих нагадувань немає</div>')
        + (soft.length ? `<div class="remind-soft-title">Менш важливе — оплату не блокує · ${soft.length}</div>${soft.map(reminderItemHtml).join('')}` : '');
      applyRemindMode();
    })
    .catch(() => {});
}

function initDoctorCabinet() {
  fetch('/api/me').then(r => r.json()).then(me => {
    if (!me || !me.role) { window.location.href = '/layout.html?next=' + encodeURIComponent(location.pathname + location.search); return; }

    // Власник сайту (is_owner) — вхід у кабінет БУДЬ-ЯКОГО лікаря з
    // head-cabinet.js:wireAdminDoctorNav передає org/doctor/doctorName у
    // URL. Той самий принцип, що й у head-cabinet.js:initHeadCabinet —
    // довіряємо цим параметрам ЛИШЕ коли сесія підтверджує
    // me.is_owner === true; для звичайного лікаря is_owner завжди false,
    // і сторінка й далі бере ідентичність тільки з сесії.
    // "Перебуває у відділенні" нижче (loadCensus, utils.js) для адміна теж
    // тепер працює — читає window.HOSPITAL_ORG_EDRPOU/HOSPITAL_DEPARTMENT_ID
    // (виставлені нижче) і шле їх на /api/lpz-department-census, а сервер
    // довіряє їм лише коли сесія підтверджує is_owner (той самий виняток,
    // що й у head-cabinet.html/lpz-department-icd-blocks).
    const params = new URLSearchParams(location.search)
    const adminOverride = me.is_owner && params.get('org') && params.get('doctor')
    if (!adminOverride && me.lpz_role !== 'doctor') { window.location.href = '/entry.html'; return; }

    const org = adminOverride ? params.get('org') : me.org_edrpou;
    const doctorId = adminOverride ? params.get('doctor') : me.lpz_resource_id;
    const deptId = adminOverride ? params.get('dept') : me.lpz_department_structure_id;
    const deptName = adminOverride ? (params.get('deptName') || '') : me.lpz_department;
    if (!org || !doctorId) return;
    window.HOSPITAL_ORG_EDRPOU = org;
    window.HOSPITAL_DEPARTMENT_ID = deptId;

    // Фінансовий режим тут — лікарю (свої епізоди) і власнику сайту.
    const finAllowed = !!me.is_owner || me.lpz_role === 'doctor';
    if (finAllowed && isFinanceMode()) {
      FIN_MODE = { org, doctorId };
      DOCTOR_WAVE_STATE.activeKpi = financeKpiConfig(!!me.is_owner, true)[0].key;
      fetch(`/api/lpz-case-quality?${new URLSearchParams({ org, doctor: doctorId, names: '1' })}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { finCases = data || { rows: [] }; refreshFinanceCases(); })
        .catch(() => {});
    }

    const root = document.getElementById('slideRoot');
    renderBgLayers(root);
    renderKpiChartBlock(root, 'doctorKpiRow', 'doctorChart', 'doctor', DOCTOR_CHART_HEIGHT,
      FIN_MODE ? financeKpiConfig(!!me.is_owner, true) : undefined);
    wireDoctorWave();
    renderHeaderBlock(root, FIN_MODE ? financeKpiConfig(!!me.is_owner) : HOSPITAL_KPI, HOSPITAL_YEARS_BACK, (year) => {
      loadDoctorKpi(org, doctorId, year);
    }, true, (year, month) => {
      loadDoctorKpi(org, doctorId, year, month);
    }, FIN_MODE ? { loadKpi: (year, month) => loadFinanceHeaderKpi({ org, year, month, level: 'hospital' }) } : {});
    wireFinanceEmblem(root, finAllowed);
    if (FIN_MODE) renderFinanceCasesSection(root);
    else renderCensusSection(root);
    renderFieldMe(root, me);
    renderDutyBand(root, org);
    if (deptId) {
      renderColleagueList(root, deptName);
      loadColleagues(root, org, deptId, doctorId, me.is_owner, deptName);
    }
    initHospitalName();

    if (!FIN_MODE) {
      loadCensus(adminOverride ? doctorId : null, { emptyMessage: 'Наразі немає ваших пацієнтів у відділенні' });
      loadReminders(org, doctorId);
    }
  });
}

document.addEventListener('DOMContentLoaded', initDoctorCabinet);
