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
   що й у "Перебуває у відділенні"). Решта чекає перебудови під lpz-схему
   (див. коментар у doctor-cabinet.html). */

// КПІ+графік лікаря — utils.js:renderKpiChartBlock/loadKpiChartBlock
// (спільні з head-cabinet.js). census не фільтрується (getCensusDoctorId не
// передаємо) — /api/lpz-department-census сам підставляє doctor=свій
// resource_id на сервері, лікар завжди бачить лише своїх пацієнтів.
function loadDoctorKpi(org, doctorId, year, month = 'all') {
  loadKpiChartBlock('doctor', org, doctorId, year, month, {
    rowId: 'doctorKpiRow', chartId: 'doctorChart',
    emptyMessage: 'Наразі немає ваших пацієнтів у відділенні',
  });
}

function initDoctorCabinet() {
  fetch('/api/me').then(r => r.json()).then(me => {
    if (!me || !me.role) { window.location.href = '/layout.html'; return; }
    if (me.lpz_role !== 'doctor') { window.location.href = '/entry.html'; return; }
    const org = me.org_edrpou;
    if (!org) return;
    window.HOSPITAL_ORG_EDRPOU = org;

    const root = document.getElementById('slideRoot');
    renderBgLayers(root);
    renderKpiChartBlock(root, 'doctorKpiRow', 'doctorChart', 'doctor');
    renderHeaderBlock(root, HOSPITAL_KPI, HOSPITAL_YEARS_BACK, (year) => {
      if (me.lpz_resource_id) loadDoctorKpi(org, me.lpz_resource_id, year);
    }, true, (year, month) => {
      if (me.lpz_resource_id) loadDoctorKpi(org, me.lpz_resource_id, year, month);
    });
    renderCensusSection(root);
    renderFieldMe(root, me);
    initHospitalName();

    loadCensus(null, { emptyMessage: 'Наразі немає ваших пацієнтів у відділенні' });
  });
}

document.addEventListener('DOMContentLoaded', initDoctorCabinet);
