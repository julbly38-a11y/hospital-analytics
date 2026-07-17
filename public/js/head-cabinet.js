/* Кабінет завідувача (public/head-cabinet.html) — Етап 2 staged-плану:
   спільний заголовок (лого/назва/КПІ-рядок лікарні/роки — той самий шар,
   що на entry.html, utils.js:renderHeaderBlock) + КПІ-блок і спарклайн
   ОДНОГО відділення — власного, з сесії (/api/me), без ?dept= у URL (той
   самий принцип, що на entry.html: сторінка сама визначає себе). */

const HOSPITAL_KPI = [
  { key: 'hosp', label: 'ГОСПІТАЛІЗАЦІЙ' },
  { key: 'pat',  label: 'ПАЦІЄНТІВ' },
  { key: 'bed',  label: 'ЛІЖКО-ДЕНЬ' },
  { key: 'age',  label: 'СЕРЕДНІЙ ВІК' },
  { key: 'let',  label: 'ЛЕТАЛЬНІСТЬ' },
];
const HOSPITAL_YEARS_BACK = 7;

// КПІ відділення — ті самі 6 показників і той самий data-dk (не data-k!),
// що й у "КПІ по напрямках" на entry.html — utils.js:applyLpzKpi чіпає лише
// .kpi-num[data-k], тож загальнолікарняний рядок і цей блок не конфліктують.
const DEPT_KPI = [
  { key: 'hosp', label: 'ГОСПІТАЛІЗАЦІЙ' },
  { key: 'pat',  label: 'ПАЦІЄНТІВ' },
  { key: 'bed',  label: 'ЛІЖКО-ДЕНЬ' },
  { key: 'age',  label: 'СЕРЕДНІЙ ВІК' },
  { key: 'imp',  label: 'З ПОКРАЩЕННЯМ' },
  { key: 'let',  label: 'ЛЕТАЛЬНІСТЬ' },
];
const DEPT_DECIMAL_KEYS = new Set(['bed', 'age']);
const DEPT_PERCENT_KEYS = new Set(['imp', 'let']);

function deptKpiRowHtml() {
  return DEPT_KPI.map(k => `
    <div class="kpi">
      <div class="kpi-num" data-dk="${k.key}">—</div>
      <div class="kpi-label">${k.label}</div>
    </div>
  `).join('');
}

function applyDeptKpi(info) {
  const rowEl = document.getElementById('deptKpiRow');
  if (!rowEl || !info) return;
  rowEl.querySelectorAll('.kpi-num[data-dk]').forEach(el => {
    const k = el.dataset.dk;
    const v = info[k];
    if (v == null) { el.textContent = '—'; return; }
    if (DEPT_PERCENT_KEYS.has(k)) { el.textContent = Number(v).toFixed(2) + '%'; return; }
    if (DEPT_DECIMAL_KEYS.has(k)) { el.textContent = Number(v).toFixed(1); return; }
    countUp(el, v, 900, 0);
  });
}

function loadDeptBlock(org, deptId, year) {
  fetch(`/api/lpz-kpi-department?org=${encodeURIComponent(org)}&year=${encodeURIComponent(year)}&department=${encodeURIComponent(deptId)}`)
    .then(r => r.ok ? r.json() : null)
    .then(applyDeptKpi)
    .catch(() => {});

  fetch(`/api/lpz-trend-department?org=${encodeURIComponent(org)}&year=${encodeURIComponent(year)}&department=${encodeURIComponent(deptId)}`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const rows = data?.rows || [];
      if (!rows.length) return;
      const step = year === 'all' ? 10000 : 1000;
      const vals = rows.map(r => Number(r.y));
      const niceMin = Math.floor(Math.min(...vals, 0) / step) * step;
      const niceMax = Math.max(Math.ceil(Math.max(...vals, 1) / step) * step, niceMin + step);
      renderSpark(document.querySelector('.spark.dept-trend'), rows, year, { niceMin, niceMax }, null, { dotRadius: 6, dotRadiusHover: 9 });
    })
    .catch(() => {});
}

function renderDeptSection(root, deptName) {
  root.insertAdjacentHTML('beforeend', `
    <div class="dept-title" id="deptTitle">${deptName || ''}</div>
    <div class="kpi-row dept-block" id="deptKpiRow">${deptKpiRowHtml()}</div>
    <svg class="spark dept-trend" viewBox="0 0 1176 130" width="1176" height="130">
      <line class="spark-base" x1="0" x2="1176" y1="80" y2="80"></line>
      <path class="spark-line"></path>
    </svg>
  `);
}

function initHeadCabinet() {
  fetch('/api/me').then(r => r.json()).then(me => {
    if (!me || !me.role) { window.location.href = '/layout.html'; return; }
    if (me.lpz_role !== 'head' || !me.lpz_department_structure_id) { window.location.href = '/entry.html'; return; }
    const org = me.org_edrpou;
    if (!org) return;
    window.HOSPITAL_ORG_EDRPOU = org;

    const root = document.getElementById('slideRoot');
    root.insertAdjacentHTML('beforeend', '<div class="bg"></div><div class="bg2"></div>');
    renderDeptSection(root, me.lpz_department);
    renderHeaderBlock(root, HOSPITAL_KPI, HOSPITAL_YEARS_BACK,
      (year) => loadDeptBlock(org, me.lpz_department_structure_id, year));
    renderMeBar(root);
    applyMeProfile(me);
    renderDutyBand(root, org);

    initHospitalName();
  });
}

document.addEventListener('DOMContentLoaded', initHeadCabinet);
