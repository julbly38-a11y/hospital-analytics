/* Рендерить структурний "перший шар" (логотип, лінії, KPI-блок, роки)
   з LAYOUT_CONFIG у контейнер .slide. Дані самих KPI (числа) і вибір
   активного року — окрема задача (наступний шар, дані з lpz). */

function renderShell(root, config) {
  config = config || window.LAYOUT_CONFIG;
  if (!root || !config) return;

  // src заповнює initHospitalName() з /api/hospital-info (логотип — per-лікарня)
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
  kpiRow.innerHTML = config.kpi.map(k => `
    <div class="kpi">
      <div class="kpi-num" data-k="${k.key}">—</div>
      <div class="kpi-label">${k.label}</div>
    </div>
  `).join('');
  root.appendChild(kpiRow);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: config.yearsBack }, (_, i) => currentYear - i);

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
      if (/^\d{4}$/.test(t)) { yearNum.textContent = t; yearNum.classList.remove('small'); }
      else { yearNum.textContent = 'ВСІ РОКИ'; yearNum.classList.add('small'); }
    });
  });

  // Смуга "Для працівників": форма логіну (стан "залогінено" з черговими
  // лікарями замість форми — наступний шар, тут лише неавторизований стан).
  root.insertAdjacentHTML('beforeend', `
    <div class="work-band">
      <span class="wb-title">Для працівників:</span>
      <span class="wb-login">LOGIN:</span>
      <span class="wb-pass">PASSWORDS:</span>
    </div>
    <div class="staff-fields">
      <input class="f-login" type="text" placeholder="введіть логін" autocomplete="off">
      <input class="f-pass" type="password" placeholder="введіть пароль" autocomplete="off">
      <span class="f-btn">Увійти</span>
      <span class="f-forgot">Забув пароль?</span>
      <span class="f-error"></span>
    </div>
  `);
}
