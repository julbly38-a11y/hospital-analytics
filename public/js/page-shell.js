/* Рендерить структурний "перший шар" (логотип, лінії, KPI-блок, роки)
   з LAYOUT_CONFIG у контейнер .slide. Дані KPI — з /api/lpz-kpi (org-scoped,
   lpz.lpz_hospitalizations), перезавантажуються при виборі року. */

// bed/age — середні, з десятковою частиною; let — відсоток. Решта (hosp, pat,
// і будь-які майбутні лічильники) — цілі числа, countUp + роздільник тисяч.
const KPI_DECIMAL_KEYS = new Set(['bed', 'age']);
const KPI_PERCENT_KEYS = new Set(['let']);

function fetchShellKpi(year) {
  const org = window.HOSPITAL_ORG_EDRPOU;
  if (!org) return Promise.resolve(null);
  return fetch(`/api/lpz-kpi?org=${encodeURIComponent(org)}&year=${encodeURIComponent(year)}`)
    .then(r => r.ok ? r.json() : null)
    .catch(() => null);
}

function applyShellKpi(info) {
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

function loadShellKpi(year) {
  fetchShellKpi(year).then(applyShellKpi);
}

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
      if (/^\d{4}$/.test(t)) { yearNum.textContent = t; yearNum.classList.remove('small'); loadShellKpi(t); }
      else { yearNum.textContent = 'ВСІ РОКИ'; yearNum.classList.add('small'); loadShellKpi('all'); }
    });
  });

  // За замовчуванням — не "всі роки", а рік ОСТАННЬОЇ госпіталізації в даних
  // (найактуальніший період), якщо для нього є пігулка в видимому діапазоні років.
  //
  // TODO (наступний шар, коли зʼявляться фільтри по місяцях/тижнях/добах):
  // той самий принцип "дефолт = останній наявний період" має працювати на
  // КОЖНОМУ рівні деталізації, що буде додано — не лише рік. Тобто коли є
  // вибір місяця в межах року, за замовчуванням підставляти місяць останньої
  // госпіталізації (а не 01 чи "весь рік"); якщо дійде до діб — так само
  // останню добу з даними. max_admission_date з RPC вже містить повну дату
  // (рік-місяць-день), просто зараз береться лише .slice(0,4) — решту частини
  // дати вже можна брати звідти ж, коли зʼявиться відповідний UI-рівень.
  fetchShellKpi('all').then(info => {
    const lastYear = info?.max_admission_date ? info.max_admission_date.slice(0, 4) : null;
    const pill = lastYear && [...yearFilter.querySelectorAll('.ypill')].find(p => p.textContent.trim() === lastYear);
    if (pill) {
      yearFilter.querySelectorAll('.ypill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const yearNum = yearBadge.querySelector('.year-num');
      yearNum.textContent = lastYear;
      yearNum.classList.remove('small');
      loadShellKpi(lastYear);
    } else {
      applyShellKpi(info);
    }
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
