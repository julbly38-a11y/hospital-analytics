/**
 * Shared utilities used across all cabinet pages.
 *
 * fmt(n)                          — format integer with space thousands separator
 * countUp(el, target, dur, delay) — animated count-up with easeOutCubic
 * stat(key, param)                — POST /api/stats and return rows[]
 * inertialScrollToCenter(c, el)   — smooth-scroll container so el is centred
 * updateFadeMask(el, axis)        — fade edges of a scrollable list ('x'/'y'), reacts to scroll position
 * enableDragScroll(el, axis)      — drag-to-scroll with inertia (momentum on release)
 * fitHeightTo(el, bottomPx, gap)  — sets el's max-height from its real offsetTop to a given boundary
 * renderMeBar(root)               — insert .me-bar markup (logged-in user profile chip)
 * applyMeProfile(me)              — fill .me-bar with data from /api/me
 * renderDutyBand(root, org, cb)   — insert .work-band (duty doctors + "Вийти"), cb(dutyEl) after load
 * initDutyTooltip(dutyEl)         — hover tooltip (position + full name) for duty-docs spans
 * renderLayoutFields(root, fields) — insert .layout-field markup placeholders (auto-run on any #slideRoot page)
 * renderBgLayers(root)            — insert .bg/.bg2 background divs (entry/head-cabinet/doctor-cabinet)
 * HOSPITAL_KPI, HOSPITAL_YEARS_BACK — shared kpiConfig/yearsBack for renderHeaderBlock() on all 3 cabinet pages
 * renderKpiChartBlock(root, rowId, chartId) — insert .field-kpi-1 6-показникового ряду + .field-chart-1 svg
 * loadKpiChartBlock(kind, org, entityId, year, month, opts) — fetch КПІ+тренд для kind='department'|'doctor', click-графіка → census
 */

function fmt(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function countUp(el, target, dur, delay) {
  el.textContent = '0';
  setTimeout(() => {
    const start = performance.now();
    function tick(now) {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, delay);
  setTimeout(() => { el.textContent = fmt(target); }, delay + dur + 120);
}

// Простий кеш з TTL (мілісекунди). TTL=0 → не кешувати.
const _statCache = new Map();

async function stat(key, param, ttl = 0) {
  const cacheKey = `${key}|${param ?? ''}`;
  if (ttl > 0) {
    const hit = _statCache.get(cacheKey);
    if (hit && Date.now() < hit.exp) return hit.data;
  }
  const body = (param !== undefined) ? { key, param } : { key };
  const r = await fetch('/api/stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('stats ' + r.status);
  const d = await r.json();
  const rows = d.rows || [];
  if (ttl > 0) _statCache.set(cacheKey, { data: rows, exp: Date.now() + ttl });
  return rows;
}

// Пакетний запит: 1 HTTP roundtrip замість N.
// queries = [{ key, param? }, ...]  ttl = мілісекунди кешу (0 = без кешу)
// Повертає масив rows[] у тому самому порядку.
async function statBatch(queries, ttl = 0) {
  const cacheKey = ttl > 0 ? 'batch|' + queries.map(q => `${q.key}|${q.param ?? ''}`).join(',') : null;
  if (cacheKey) {
    const hit = _statCache.get(cacheKey);
    if (hit && Date.now() < hit.exp) return hit.data;
  }
  const r = await fetch('/api/stats-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ queries }),
  });
  if (!r.ok) throw new Error('stats-batch ' + r.status);
  const d = await r.json();
  const results = d.results || queries.map(() => []);
  if (cacheKey) _statCache.set(cacheKey, { data: results, exp: Date.now() + ttl });
  return results;
}

// ── Спільний "перший шар" (логотип, лінії, KPI-рядок, фільтр років) —
// однакова розмітка й логіка для БУДЬ-ЯКОЇ сторінки, підключеної до цього
// файлу (зараз: layout.html через page-shell.js, entry.html через entry.js;
// раніше кожна тримала свою копію). org береться з window.HOSPITAL_ORG_EDRPOU
// (сторінка виставляє його сама, до виклику), як і initHospitalName(). ──

// bed/age — середні, з десятковою частиною; let — відсоток. Решта (hosp, pat,
// і будь-які майбутні лічильники) — цілі числа, countUp + роздільник тисяч.
const KPI_DECIMAL_KEYS = new Set(['bed', 'age']);
const KPI_PERCENT_KEYS = new Set(['let']);

function fetchLpzKpi(org, year, month = 'all') {
  if (!org) return Promise.resolve(null);
  return fetch(`/api/lpz-kpi?org=${encodeURIComponent(org)}&year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`)
    .then(r => r.ok ? r.json() : null)
    .catch(() => null);
}

function applyLpzKpi(info) {
  if (!info) return;
  // [data-k] — обов'язково, інакше зачіпає й .kpi-num блоків напрямку на
  // entry.html (ті мають data-dk, не data-k, саме щоб уникнути цієї колізії) —
  // без фільтра info[undefined] даю "—" і затирає вже застосовані значення.
  document.querySelectorAll('.kpi-num[data-k]').forEach(el => {
    const k = el.dataset.k;
    const v = info[k];
    if (v == null) { el.textContent = '—'; return; }
    if (KPI_PERCENT_KEYS.has(k)) { el.textContent = Number(v).toFixed(2) + '%'; return; }
    if (KPI_DECIMAL_KEYS.has(k)) { el.textContent = Number(v).toFixed(1); return; }
    countUp(el, v, 900, 0);
  });
}

// kpiConfig: [{ key, label }, ...] — які показники й підписи; yearsBack:
// скільки років показувати в фільтрі (рахуючи поточний). onYearChange(param) —
// опційно, викликається з тим самим param щоразу, коли міняється активний рік
// (клік на пігулку або дефолт при завантаженні) — щоб сторінка могла
// синхронно перезавантажити СВОЇ додаткові блоки (той самий рік, без
// дублювання логіки визначення дефолтного року). authorized=true — додає
// пігулки місяців під роками, повнорозмірні (той самий .ypill стиль) і з
// повними назвами — з'являються при НАВЕДЕННІ на будь-яку пігулку року (не
// на клік), ховаються при виході курсора з обох рядків АБО одразу по кліку
// на місяць (клік на місяць одночасно активує сам рік, під яким навели, і
// ховає рядок місяців). НЕ просто приховані CSS на неавторизованих сторінках
// (page-shell.js/layout.html не передає authorized) — їх узагалі нема в DOM,
// якщо не авторизовано. onMonthChange(year, month) — опційно, як onYearChange.
function renderHeaderBlock(root, kpiConfig, yearsBack, onYearChange, authorized = false, onMonthChange) {
  const org = window.HOSPITAL_ORG_EDRPOU;

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
  kpiRow.innerHTML = kpiConfig.map(k => `
    <div class="kpi">
      <div class="kpi-num" data-k="${k.key}">—</div>
      <div class="kpi-label">${k.label}</div>
    </div>
  `).join('');
  root.appendChild(kpiRow);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: yearsBack }, (_, i) => currentYear - i);

  const yearFilter = document.createElement('div');
  yearFilter.className = 'year-filter';
  yearFilter.innerHTML =
    years.map(y => `<div class="ypill">${y}</div>`).join('') +
    `<div class="ypill ypill-all active">ВСІ РОКИ</div>`;
  root.appendChild(yearFilter);

  let monthFilter = null;
  if (authorized) {
    monthFilter = document.createElement('div');
    monthFilter.className = 'month-filter';
    monthFilter.innerHTML = MONTH_PILL_NAMES.map((m, i) => `<div class="ypill ypill-month" data-month="${i + 1}">${m}</div>`).join('');
    root.appendChild(monthFilter);
  }

  const yearBadge = document.createElement('div');
  yearBadge.className = 'year-badge';
  yearBadge.innerHTML = `<span class="year-num small">ВСІ РОКИ</span><span class="year-badge-month"></span>`;
  root.appendChild(yearBadge);

  // Активує рік (пігулка, бейдж, fetch, onYearChange) — спільна логіка для
  // кліку на пігулку року І для кліку на пігулку місяця (той теж активує
  // свій рік, а не лише повідомляє onMonthChange). month — опційно звужує
  // fetchLpzKpi (шапка 5 показників лікарні) до конкретного місяця обраного
  // року; silent=true (клік на місяць) — не викликає onYearChange повторно,
  // бо для цього кліку вже є окремий onMonthChange нижче (інакше пішло б
  // 2 запити одночасно: спершу весь рік, потім місяць, і результат міг би
  // прийти в неправильному порядку — гонитва запитів). Повна назва місяця
  // (MONTH_PILL_NAMES) виводиться під числом року в .year-badge-month, поки
  // місяць обраний — порожній рядок повертає бейдж до звичайного "лише рік".
  function selectYear(pill, month = 'all', silent = false) {
    yearFilter.querySelectorAll('.ypill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    const yearNum = yearBadge.querySelector('.year-num');
    const monthBadge = yearBadge.querySelector('.year-badge-month');
    const t = pill.textContent.trim();
    const yearParam = /^\d{4}$/.test(t) ? t : 'all';
    if (yearParam !== 'all') { yearNum.textContent = t; yearNum.classList.remove('small'); }
    else { yearNum.textContent = 'ВСІ РОКИ'; yearNum.classList.add('small'); }
    monthBadge.textContent = (month !== 'all') ? MONTH_PILL_NAMES[Number(month) - 1] : '';
    fetchLpzKpi(org, yearParam, month).then(applyLpzKpi);
    if (!silent && onYearChange) onYearChange(yearParam);
  }

  yearFilter.querySelectorAll('.ypill').forEach(pill => pill.addEventListener('click', () => {
    selectYear(pill);
    // Клік на "голий" рік — скидає раніше обраний місяць (той належав іншому
    // стану "рік+місяць", тепер знову дивимось на весь рік).
    if (monthFilter) monthFilter.querySelectorAll('.ypill-month').forEach(p => p.classList.remove('active'));
  }));

  // Пігулки місяців — з'являються на НАВЕДЕННЯ (не клік) на будь-яку пігулку
  // року (крім "ВСІ РОКИ" — місяць без конкретного року не має сенсу),
  // ховаються з невеликою затримкою (щоб встигнути довести курсор від
  // пігулки року вниз до рядка місяців, не втративши hover), або одразу по
  // кліку на сам місяць.
  if (monthFilter) {
    let hideTimer = null;
    let activeMonthYear = null; // рік, для якого зараз реально обрано місяць
    const showMonths = (yearText) => {
      clearTimeout(hideTimer);
      monthFilter.dataset.targetYear = yearText;
      // Наведення на ІНШИЙ рік, ніж той, для якого активний місяць, — активний
      // стан пігулки місяця стосувався іншого року, тут його показувати нема
      // сенсу (кожен рік має свій незалежний вибір місяця, не персистентний).
      if (yearText !== activeMonthYear) {
        monthFilter.querySelectorAll('.ypill-month').forEach(p => p.classList.remove('active'));
      }
      monthFilter.classList.add('visible');
    };
    const scheduleHide = () => {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => monthFilter.classList.remove('visible'), 200);
    };
    yearFilter.querySelectorAll('.ypill:not(.ypill-all)').forEach(pill => {
      pill.addEventListener('mouseenter', () => showMonths(pill.textContent.trim()));
    });
    yearFilter.addEventListener('mouseleave', scheduleHide);
    monthFilter.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    monthFilter.addEventListener('mouseleave', scheduleHide);

    monthFilter.querySelectorAll('.ypill-month').forEach(pill => {
      pill.addEventListener('click', () => {
        monthFilter.querySelectorAll('.ypill-month').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const year = monthFilter.dataset.targetYear;
        activeMonthYear = year;
        const yearPill = year && [...yearFilter.querySelectorAll('.ypill')].find(p => p.textContent.trim() === year);
        if (yearPill) selectYear(yearPill, Number(pill.dataset.month), true);
        if (onMonthChange && year) onMonthChange(year, Number(pill.dataset.month));
        clearTimeout(hideTimer);
        monthFilter.classList.remove('visible');
      });
    });
  }

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
  fetchLpzKpi(org, 'all').then(info => {
    const lastYear = info?.max_admission_date ? info.max_admission_date.slice(0, 4) : null;
    const pill = lastYear && [...yearFilter.querySelectorAll('.ypill')].find(p => p.textContent.trim() === lastYear);
    if (pill) selectYear(pill);
    else { applyLpzKpi(info); if (onYearChange) onYearChange('all'); }
  });
}

// Смуга "Чергові лікарі" + "Вийти" (.work-band) — спільна для всіх сторінок
// після логіну (entry.html, head-cabinet.html, doctor-cabinet.html). Логаут
// живе тут-таки (не окремою кнопкою) — той самий .work-band .me-logout
// { left:134px } з layout.css. onLoaded(dutyEl) — опційний колбек після
// підвантаження рядків (entry.html чіпляє туди крос-підсвітку з dept-list;
// кабінетам без списку відділень він не потрібен).
function renderDutyBand(root, org, onLoaded) {
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
      updateFadeMask(dutyEl, 'x');
      if (onLoaded) onLoaded(dutyEl);
    })
    .catch(() => {});
}

// Спливаюча підказка при наведенні на чергового лікаря: посада + повне ПІБ.
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

// Профіль залогінованого працівника (.me-bar) — спільний для entry.html і
// кабінетів (head-cabinet.html/doctor-cabinet.html). renderMeBar() вставляє
// розмітку (id'и порожні), applyMeProfile(me) заповнює її даними з /api/me
// (ПІБ одним рядком шрифтом прізвища, "посада · відділення" дрібним).
function renderMeBar(root) {
  root.insertAdjacentHTML('beforeend', `
    <div class="me-bar">
      <div class="me-name">
        <div class="me-surname" id="meSurname"></div>
        <div class="me-firstname" id="meFirstname"></div>
      </div>
      <div class="me-info">
        <span class="me-greet" id="meGreet"></span>
      </div>
    </div>
  `);
}

function applyMeProfile(me) {
  const surEl = document.getElementById('meSurname');
  if (surEl) surEl.textContent = me.full_name || me.emp_name || me.email || '';
  const greetEl = document.getElementById('meGreet');
  if (greetEl) greetEl.textContent = [me.position, me.department].filter(Boolean).join(' · ');
}

// Дні тижня / місяці (родовий відмінок) — спільні для живого годинника
// (.field-me-clock) і префікса дати в census-when, перенесено зі старого
// doctor-cabinet.html (tickClock/monthGen/clockWeekdays).
const WEEKDAY_NAMES = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота'];
const MONTH_GEN_NAMES = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
// Повні назви місяців (пігулки .month-filter, renderHeaderBlock) — окремо
// від MONTH_GEN_NAMES (той — родовий відмінок для годинника/дати, тут —
// називний, ПОВНІ назви без скорочень, як напис "ВСІ РОКИ" на .ypill-all).
const MONTH_PILL_NAMES = ['СІЧЕНЬ', 'ЛЮТИЙ', 'БЕРЕЗЕНЬ', 'КВІТЕНЬ', 'ТРАВЕНЬ', 'ЧЕРВЕНЬ', 'ЛИПЕНЬ', 'СЕРПЕНЬ', 'ВЕРЕСЕНЬ', 'ЖОВТЕНЬ', 'ЛИСТОПАД', 'ГРУДЕНЬ'];

// Міні-табличка ПІБ + посада авторизованого — нижній правий кут поля
// розмітки lf-right-bottom (layout.css:.field-me). Ті самі поля /api/me, що
// й .me-bar/applyMeProfile вище, але окремий компактний елемент — сторінка
// сама вирішує, який з двох показувати (entry.js/head-cabinet.js). Живий
// годинник (.field-me-clock) над ПІБ — перенесено зі старого .me-clock/
// tickClock (день тижня, дата словами, час, оновлюється щосекунди).
function renderFieldMe(root, me) {
  const parent = root.querySelector('.lf-right-bottom') || root;
  parent.insertAdjacentHTML('beforeend', `
    <div class="field-me">
      <div class="field-me-clock" id="fieldMeClock"></div>
      <div class="field-me-name"></div>
      <div class="field-me-role"></div>
    </div>
  `);
  const field = parent.querySelector('.field-me');
  field.querySelector('.field-me-name').textContent = me.full_name || me.emp_name || me.email || '';
  field.querySelector('.field-me-role').textContent = [me.position, me.department].filter(Boolean).join(' · ');

  const clockEl = field.querySelector('#fieldMeClock');
  const tick = () => {
    const n = new Date();
    const pad = v => String(v).padStart(2, '0');
    clockEl.textContent = `${WEEKDAY_NAMES[n.getDay()]}, ${n.getDate()} ${MONTH_GEN_NAMES[n.getMonth()]} ${n.getFullYear()} · ${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
  };
  tick();
  setInterval(tick, 1000);
}

// КПІ-ряд на 6 показників — спільний для entry.html (напрямки), head-
// cabinet.html (відділення) і doctor-cabinet.html (лікар): та сама позиція
// (layout.css:.field-kpi-1/.field-kpi-2), той самий формат чисел, різні лише
// дані (передає сторінка через свій ендпоінт/id рядка). data-dk (не data-k!)
// — бо data-k уже зайнятий загальнолікарняним КПІ-рядком (applyLpzKpi нижче
// шукає .kpi-num глобально по всій сторінці).
const KPI_6 = [
  { key: 'hosp', label: 'ГОСПІТАЛІЗАЦІЙ' },
  { key: 'pat',  label: 'ПАЦІЄНТІВ' },
  { key: 'bed',  label: 'ЛІЖКО-ДЕНЬ' },
  { key: 'age',  label: 'СЕРЕДНІЙ ВІК' },
  { key: 'imp',  label: 'З ПОКРАЩЕННЯМ' },
  { key: 'let',  label: 'ЛЕТАЛЬНІСТЬ' },
];
const KPI_6_DECIMAL_KEYS = new Set(['bed', 'age']);
const KPI_6_PERCENT_KEYS = new Set(['imp', 'let']);

function kpi6RowHtml() {
  return KPI_6.map(k => `
    <div class="kpi">
      <div class="kpi-num" data-dk="${k.key}">—</div>
      <div class="kpi-label">${k.label}</div>
    </div>
  `).join('');
}

function applyKpi6(rowEl, info) {
  if (!rowEl || !info) return;
  rowEl.querySelectorAll('.kpi-num[data-dk]').forEach(el => {
    const k = el.dataset.dk;
    const v = info[k];
    if (v == null) { el.textContent = '—'; return; }
    if (KPI_6_PERCENT_KEYS.has(k)) { el.textContent = Number(v).toFixed(2) + '%'; return; }
    if (KPI_6_DECIMAL_KEYS.has(k)) { el.textContent = Number(v).toFixed(1); return; }
    countUp(el, v, 900, 0);
  });
}

// Фон .bg/.bg2 — спільний для entry.html/head-cabinet.html/doctor-cabinet.html.
function renderBgLayers(root) {
  root.insertAdjacentHTML('beforeend', '<div class="bg"></div><div class="bg2"></div>');
}

// Загальнолікарняний КПІ-рядок (шапка сторінки, renderHeaderBlock) — та сама
// пʼятірка показників і той самий "7 років назад" на entry.html/head-
// cabinet.html/doctor-cabinet.html, раніше копіювалась в кожен файл окремо
// (ENTRY_KPI/HOSPITAL_KPI).
const HOSPITAL_KPI = [
  { key: 'hosp', label: 'ГОСПІТАЛІЗАЦІЙ' },
  { key: 'pat',  label: 'ПАЦІЄНТІВ' },
  { key: 'bed',  label: 'ЛІЖКО-ДЕНЬ' },
  { key: 'age',  label: 'СЕРЕДНІЙ ВІК' },
  { key: 'let',  label: 'ЛЕТАЛЬНІСТЬ' },
];
const HOSPITAL_YEARS_BACK = 7;

// Блок "КПІ-ряд (6 показників) + графік динаміки" — той самий патерн на
// head-cabinet.html (по відділенню) і doctor-cabinet.html (по лікарю):
// .field-kpi-1 (kpi6RowHtml) + .field-chart-1 (12-місячна гістограма). level —
// 'department'|'doctor', додає .kpi-lvl-<level> для ієрархії шрифтів
// (layout.css: напрямок→відділення→лікар, кожен -5% від попереднього).
function renderKpiChartBlock(root, rowId, chartId, level) {
  const field = root.querySelector('.lf-right-top');
  (field || root).insertAdjacentHTML('beforeend', `
    <div class="kpi-row field-kpi-1 kpi-lvl-${level}" id="${rowId}">${kpi6RowHtml()}</div>
    <svg class="bar-chart field-chart-1" id="${chartId}" viewBox="0 0 624 185" width="624" height="185" preserveAspectRatio="none">
      <line class="bar-base" x1="0" x2="624" y1="167" y2="167"></line>
    </svg>
  `);
}

// Дані для renderKpiChartBlock: fetch КПІ (/api/lpz-kpi-<kind>) → applyKpi6,
// fetch тренду (/api/lpz-trend-<kind>) → renderBarChart; клік на стовпець —
// census "станом на цю дату" (censusDateFromChartPoint). kind='department'|
// 'doctor' — визначає одразу і назву обох ендпоінтів, і назву query-
// параметра сутності (вони завжди збігаються: department=.../doctor=...).
// month='all'|1-12 — звужує КПІ-ряд (6 показників) до конкретного місяця
// обраного року; для kind='department' (head-cabinet.html) з конкретним
// роком+місяцем графік динаміки ТЕЖ перемикається — з річної/місячної
// гістограми на денну гістограму госпіталізацій того місяця (12→28-31
// стовпців), з анімацією "виїзду" зліва направо (renderBarChart:{animate:
// true}). Для doctor-cabinet.html (kind='doctor') перемикання нема — графік
// лишається річним.
// getCensusDoctorId — опційний колбек (не значення!), бо на head-cabinet.html
// його треба читати В МОМЕНТ КЛІКА (activeDoctorId міняється кліком на
// лікаря в "Ординаторській" вже ПІСЛЯ рендеру графіка); на doctor-cabinet.html
// не передається — census і так лише свій (сервер підставляє doctor сам).
function loadKpiChartBlock(kind, org, entityId, year, month, { rowId, chartId, emptyMessage, getCensusDoctorId } = {}) {
  fetch(`/api/lpz-kpi-${kind}?org=${encodeURIComponent(org)}&year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}&${kind}=${encodeURIComponent(entityId)}`)
    .then(r => r.ok ? r.json() : null)
    .then(info => applyKpi6(document.getElementById(rowId), info))
    .catch(() => {});

  const daily = kind === 'department' && year !== 'all' && month && month !== 'all';
  const trendUrl = `/api/lpz-trend-${kind}?org=${encodeURIComponent(org)}&year=${encodeURIComponent(year)}&${kind}=${encodeURIComponent(entityId)}`
    + (daily ? `&month=${encodeURIComponent(month)}` : '');

  fetch(trendUrl)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const rows = data?.rows || [];
      const chartEl = document.getElementById(chartId);
      if (!rows.length || !chartEl) return;
      const onPoint = (r) => {
        // Перехресне посилання: клік на стовпець МІСЯЦЯ (річна гістограма,
        // ще не daily) на head-cabinet.html має робити те саме, що клік на
        // пігулку місяця під роками (renderHeaderBlock) — перемикати на денну
        // діаграму того місяця, а не одразу вантажити census за весь місяць.
        // Реалізовано через симуляцію кліку на саму пігулку (а не дублювання
        // її логіки тут) — так одним рухом оновлюються й активний стан
        // пігулки, і .year-badge-month, і викликається onMonthChange
        // (loadDeptBlock), який і перемкне графік. monthFilter.dataset.
        // targetYear зазвичай виставляє hover на пігулку року (showMonths) —
        // тут його явно ставимо в year (той, що вже показаний), бо кліку на
        // сам графік такого hover не було.
        if (!daily && kind === 'department' && year !== 'all') {
          const monthPill = document.querySelector(`.ypill-month[data-month="${r.x}"]`);
          const monthFilterEl = document.querySelector('.month-filter');
          if (monthPill && monthFilterEl) {
            monthFilterEl.dataset.targetYear = year;
            monthPill.click();
            return;
          }
        }
        loadCensus(getCensusDoctorId ? getCensusDoctorId() : null, {
          date: censusDateFromChartPoint(year, r.x, daily ? month : null),
          ...(emptyMessage ? { emptyMessage } : {}),
        });
        // Клік на стовпець денної гістограми — дописати обраний день до
        // назви місяця в .year-badge-month (той самий бейдж, що вже показує
        // "ЛИПЕНЬ" при виборі місяця, renderHeaderBlock:selectYear) — щоб
        // було видно, на яку саме дату зараз показано census нижче. Вибір
        // нового місяця/року скидає це через власний monthBadge.textContent
        // у selectYear, тому окремого скидання тут не треба.
        if (daily) {
          const monthBadge = document.querySelector('.year-badge-month');
          if (monthBadge) monthBadge.textContent = `${Number(r.x)} ${MONTH_PILL_NAMES[Number(month) - 1]}`;
        }
      };
      chartEl.classList.toggle('chart-daily', daily);
      // viewBox має відповідати РЕАЛЬНІЙ (design-space) ширині поля (після
      // .chart-daily: width:100%) — інакше preserveAspectRatio="none"
      // масштабує X сильніше за Y (ширина зросла, висота ні), і текст
      // (цифри) виглядає розтягнутим по горизонталі. НЕ getBoundingClientRect
      // — сторінка сама масштабується як ціле (.slide-wrapper transform:
      // scale, "авто-масштаб 1920×1080"), тож getBoundingClientRect повертає
      // ФІЗИЧНІ (після-transform) пікселі, які гуляють залежно від розміру
      // вікна браузера — тут потрібна логічна (design-space) ширина поля,
      // вона стала: lf-right-top/lf-right-bottom = 1295 (BASE_LAYOUT_FIELDS)
      // мінус відступи з обох боків (--field-pad=22px, layout.css).
      const FIELD_PAD = 22;
      const realWidth = daily
        ? BASE_LAYOUT_FIELDS.find(f => f.className === 'lf-right-top').width - 2 * FIELD_PAD
        : 624;
      chartEl.setAttribute('viewBox', `0 0 ${realWidth} 185`);
      // animate:true завжди (не лише daily) — перемикання років/місяців теж
      // має плавно змінювати висоту стовпців, не лише перехід на дні.
      // renderBarChart сам розрізняє: однакова кількість стовпців (рік↔рік)
      // → усі "реюзаться" й просто змінюють висоту; більше стовпців (місяць
      // →дні) → надлишок "виїжджає" за останнім.
      renderBarChart(chartEl, rows, year, null, onPoint, { animate: true });
    })
    .catch(() => {});
}

// "Перебуває у відділенні" — спільний список для head-cabinet.html (усе
// відділення, з можливістю клік-фільтра по лікарю — showReset:true) і
// doctor-cabinet.html (лише свої пацієнти, /api/lpz-department-census сам
// підставляє doctor=resource_id на сервері — тут просто loadCensus(null)).
// Дизайн — смужка перебування (сегмент = 1 доба, максимум 60) + день тижня і
// дата перед заголовком (census-when, WEEKDAY_NAMES вище), перенесено зі
// старого doctor-cabinet.html (.admissions-box/.ab-stay/.ab-bar, dateLabel).

function renderCensusSection(root, { showReset = false } = {}) {
  const parent = root.querySelector('.lf-right-bottom') || root;
  parent.insertAdjacentHTML('beforeend', `
    <div class="census-title">
      <span class="census-when" id="censusWhen"></span>
      <span class="census-active" id="censusActive">Перебуває у відділенні</span>
      <span class="census-count" id="censusCount"></span>
      <span class="census-flow" id="censusFlow"></span>
      ${showReset ? '<span class="census-reset" id="censusReset" style="display:none">✕ скинути лікаря</span>' : ''}
    </div>
    <div class="census-list" id="censusList"></div>
  `);
  const censusList = parent.querySelector('#censusList');
  // Динамічну висоту (fitHeightTo) НЕ рахуємо тут — .field-me ще може бути
  // не відрендерений на цей момент (doctor-cabinet.js кличе renderCensusSection
  // ДО renderFieldMe). Рахується в loadCensus() нижче, де обидва точно є.
  // CSS max-height (layout.css) — лише fallback на перший рендер до фетчу.
  enableDragScroll(censusList, 'y');
  censusList.addEventListener('scroll', () => updateFadeMask(censusList, 'y'));
}

function loadCensus(doctorId, options = {}) {
  const { date, flowMode = null } = options;
  const emptyMessage = options.emptyMessage || (doctorId
    ? 'Немає даних про пацієнтів цього лікаря (покриття lpz_episodes на живих випадках неповне)'
    : 'Наразі нікого немає');
  const params = new URLSearchParams();
  if (doctorId) params.set('doctor', doctorId);
  if (date) params.set('date', date);
  const qs = params.toString();
  const url = `/api/lpz-department-census${qs ? '?' + qs : ''}`;
  fetch(url)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const censusList = document.getElementById('censusList');
      if (!data || !censusList) return;

      // Межа знизу — реальна позиція .field-me (ПІБ авторизованого, правий
      // нижній кут), не фіксоване число: довжина ПІБ і зміст живого годинника
      // (.field-me-clock) різні на кожній сторінці/у кожного користувача, тож
      // лише реальний offsetTop гарантує, що список ніколи не налізе на неї.
      const fieldMe = document.querySelector('.field-me');
      if (fieldMe) fitHeightTo(censusList, offsetInSlide(fieldMe), 20);

      // "Перебуває" — завжди повна кількість (data.rows.length), НЕ залежить
      // від flowMode-фільтра нижче. Той самий принцип, що в старому
      // .admissions-box: stayingCount рахується один раз, до фільтра потоку.
      const countEl = document.getElementById('censusCount');
      if (countEl) countEl.textContent = `· ${data.rows.length}`;
      const whenEl = document.getElementById('censusWhen');
      if (whenEl) {
        // data.date — дата, яку РЕАЛЬНО використав сервер (явно передана або,
        // якщо не передавали, дата останнього наявного запису — не "сьогодні",
        // бо на реальне сьогодні даних може й не бути). "✕ ..." — лише коли
        // caller сам явно обрав дату (клік на графік), щоб повернутись до
        // дефолту (знову останній наявний запис, а не жорстко "сьогодні").
        const d = data.date ? new Date(data.date + 'T00:00:00') : new Date();
        const dayName = WEEKDAY_NAMES[d.getDay()];
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const label = `${dayName} ${dd}.${mm}.${d.getFullYear()}`;
        whenEl.innerHTML = date ? `${label} · <span class="census-reset-date">✕ скинути дату</span>` : label;
        if (date) whenEl.querySelector('.census-reset-date').addEventListener('click', () => loadCensus(doctorId, { emptyMessage }));
      }

      // "Перебуває у відділенні" — клік скидає flowMode (повний список),
      // як старий .ab-reset. Активний вигляд (синій/жирний/світіння) — лише
      // коли flowMode вимкнено (те саме, що .ab-reset.active за замовчуванням).
      const activeEl = document.getElementById('censusActive');
      if (activeEl) {
        activeEl.classList.toggle('active', !flowMode);
        activeEl.onclick = () => loadCensus(doctorId, { date, emptyMessage, flowMode: null });
      }

      // "поступило: N" / "виписано: N" — клікабельні фільтри списку (як
      // старий .ab-flow): клік перемикає flowMode (повторний клік — вимикає
      // назад у null). Самі числа завжди від повного flow за цю дату,
      // незалежно від того, який фільтр зараз активний.
      const flowEl = document.getElementById('censusFlow');
      if (flowEl) {
        const aCls = flowMode === 'admitted' ? ' active' : '';
        const dCls = flowMode === 'discharged' ? ' active' : '';
        flowEl.innerHTML = `· <span class="census-flow-item${aCls}" data-flow="admitted">поступило: ${data.admitted ?? 0}</span> · <span class="census-flow-item${dCls}" data-flow="discharged">виписано: ${data.discharged ?? 0}</span>`;
        flowEl.querySelectorAll('.census-flow-item').forEach(el => {
          el.onclick = () => {
            const mode = el.getAttribute('data-flow');
            loadCensus(doctorId, { date, emptyMessage, flowMode: flowMode === mode ? null : mode });
          };
        });
      }

      if (!data.rows.length) {
        censusList.innerHTML = `<div class="census-empty">${emptyMessage}</div>`;
        return;
      }
      // flowMode фільтрує ТІЛЬКИ список нижче (не рахунки вище) — поступив/
      // виписаний саме в обрану дату (data.date). lpz_department_census уже
      // повертає рядки з admission_date<=date<=discharge_date(або null), тож
      // "виписано сьогодні" теж є серед data.rows (discharge_date=data.date).
      let rows = data.rows;
      if (flowMode === 'admitted') rows = rows.filter(r => r.admission_date === data.date);
      else if (flowMode === 'discharged') rows = rows.filter(r => r.discharge_date === data.date);

      if (!rows.length) {
        censusList.innerHTML = `<div class="census-empty">пацієнти відсутні</div>`;
        return;
      }
      censusList.innerHTML = rows.map(r => {
        const diagStr = r.icd_code ? `${r.icd_code} ${r.diagnosis || '—'}` : (r.diagnosis || '—');
        const hospCountStr = r.hosp_count > 1 ? ` · <span class="census-hosp-count">${r.hosp_count}</span>` : '';
        const repeatStr = (r.re_admission && r.re_admission !== 'Ні')
          ? ` · <span class="census-repeat">${r.re_admission.toLowerCase()}</span>` : '';
        // days тепер рахує RPC (lpz_department_census): якщо пацієнт уже
        // виписаний — ПОВНА відома тривалість перебування (виписка−
        // поступлення, весь термін, а не обрізаний на вказаній даті); якщо
        // ще перебуває — по вказану дату включно. Тож смужка показує весь
        // ліжко-день пацієнта, а не тільки "скільки минуло на цей момент".
        const days = Math.max(0, Number(r.days) || 0);
        const segCount = Math.min(days, 60);
        const admDate = r.admission_date ? new Date(r.admission_date + 'T00:00:00') : null;
        const admStr = admDate
          ? `${String(admDate.getDate()).padStart(2, '0')}.${String(admDate.getMonth() + 1).padStart(2, '0')}.${admDate.getFullYear()}`
          : '—';
        // Індекс сегмента, що відповідає обраній даті (census-when угорі) —
        // точно як старий doctor-cabinet.html/head-cabinet.html (.ab-bar
        // i.today): рахується ЗАВЖДИ від дати поступлення до обраної дати,
        // без винятку для тих, хто ще перебуває (там теж падає на останній
        // сегмент — так і задумано в оригіналі, це не помилка).
        const selDate = data.date ? new Date(data.date + 'T00:00:00') : null;
        let todayIdx = (admDate && selDate) ? Math.round((selDate - admDate) / 86400000) : segCount - 1;
        if (todayIdx >= segCount) todayIdx = segCount - 1;
        if (todayIdx < 0) todayIdx = 0;
        const segs = Array.from({ length: segCount }, (_, i) =>
          i === todayIdx ? '<i class="census-today"></i>' : '<i></i>').join('');
        return `
        <div class="census-row" data-doctor="${r.doc_resource_id || ''}">
          <div class="census-info">
            <span class="census-name">${r.pib || '—'}</span>
            <span class="census-meta">${r.age ?? '—'} р. · ${r.gender || '—'} · поступив ${admStr} · ${diagStr}${hospCountStr}${repeatStr}</span>
          </div>
          <div class="census-stay" title="${days} діб">
            <span class="census-bar">${segs}</span>
            <span class="census-days">${days}</span>
          </div>
        </div>`;
      }).join('');
      updateFadeMask(censusList, 'y');
      // Клік на пацієнта → підсвітити його лікаря в ординаторській (той
      // самий патерн, що старий head-cabinet.html: .ab-row[data-doc] →
      // click → зняти hl/doc-active з усіх → знайти відповідний .doc-item
      // → hl + inertialScrollToCenter). Тут data-doctor = resource_id (у
      // старому був data-doc = ім'я лікаря текстом) — бо ординаторська в
      // цьому проєкті й так уже ключується по resource_id (loadStaff).
      // Покриття часткове (слабкий джойн через lpz_episodes) — не для
      // кожного пацієнта знайдеться лікар, це очікувано, не баг.
      censusList.querySelectorAll('.census-row[data-doctor]').forEach(row => {
        const doc = row.getAttribute('data-doctor');
        if (!doc) return;
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
          document.querySelectorAll('.doc-item.hl, .doc-item.doc-active').forEach(d => {
            d.classList.remove('hl'); d.classList.remove('doc-active');
          });
          document.querySelectorAll('.doc-item').forEach(d => {
            if (d.getAttribute('data-doctor') === doc) {
              d.classList.add('hl');
              const dl = d.closest('.docs-list');
              if (dl) inertialScrollToCenter(dl, d);
            }
          });
        });
      });
    })
    .catch(() => {});
}

// Дата для census за точкою графіка динаміки (utils.js:loadChart-style
// onDotClick у head-cabinet.js/doctor-cabinet.js) — рік='all' → x це рік
// (31 грудня); рік+місяць='all' → x це місяць (1-12) обраного року (останній
// день місяця); рік+конкретний місяць (хвильовий денний графік) → x це день
// того місяця. Не пізніше сьогодні (майбутнього не буває).
function censusDateFromChartPoint(year, x, month) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const target = (year === 'all')
    ? new Date(Number(x), 11, 31)
    : (month && month !== 'all')
      ? new Date(Number(year), Number(month) - 1, Number(x))
      : new Date(Number(year), Number(x), 0); // day 0 наступного місяця = останній день x-го
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  const targetStr = `${y}-${m}-${d}`;
  return targetStr > todayStr ? todayStr : targetStr;
}

function initStaffFields() {
  const title  = document.querySelector('.wb-title');
  const fields = document.querySelector('.staff-fields');
  if (!title || !fields) return;
  title.addEventListener('click', (e) => {
    e.stopPropagation();
    title.classList.add('no-pulse');
    fields.classList.toggle('open');
    void fields.offsetHeight;
    fields.style.transform = 'translateZ(0)';
    requestAnimationFrame(() => { fields.style.transform = 'translateZ(0)'; });
  });
}
// Назва/слоган лікарні раніше були тут захардкоджені на "Хотинська" — і
// показувались так на всіх 4 сторінках незалежно від того, чия це лікарня.
// Тепер тягнемо з lpz_organizations по org_edrpou, який кожна сторінка
// задає сама через window.HOSPITAL_ORG_EDRPOU перед підключенням utils.js.

// ── Підсвітка чергових лікарів ↔ відділень ──
(function injectDutyStyles() {
  const s = document.createElement('style');
  s.textContent = `
    .duty-docs span {
      font-family: 'ITFLight','Palatino',serif;
      font-weight: 300;
      font-size: 21px;
      color: #4a4a4a;
      white-space: nowrap;
      letter-spacing: 0.3px;
      -webkit-text-stroke: 0.4px #4a4a4a;
      cursor: pointer;
      transition: color .2s ease, text-shadow .2s ease;
    }
    .dept, .duty-docs span { cursor: pointer; transition: text-shadow .2s ease; }
    .dept.hl, .dept.own, .duty-docs span.hl {
      text-shadow: 0 0 6px rgba(178,124,139,.55), 0 0 16px rgba(178,124,139,.45), 0 0 30px rgba(178,124,139,.30); }
  `;
  document.head.appendChild(s);
})();

function clearHl() { document.querySelectorAll('.hl').forEach(e => e.classList.remove('hl')); }

function initCrossHighlight() {
  const depts = [...document.querySelectorAll('.dept[data-dept]')];

  // duty-docs span — підвантажуються асинхронно, тому спостерігаємо за контейнером
  const dutyEl = document.getElementById('dutyDocs');
  if (dutyEl) {
    new MutationObserver(() => {
      dutyEl.querySelectorAll('span[data-home]').forEach(span => {
        if (span._hlBound) return;
        span._hlBound = true;
        span.addEventListener('mouseenter', () => {
          span.classList.add('hl');
          const home = span.getAttribute('data-home');
          depts.forEach(d => { if (d.getAttribute('data-dept') === home) d.classList.add('hl'); });
        });
        span.addEventListener('mouseleave', clearHl);
      });
    }).observe(dutyEl, { childList: true, subtree: true });
  }

  depts.forEach(d => {
    d.addEventListener('mouseenter', () => {
      d.classList.add('hl');
      const dept = d.getAttribute('data-dept');
      document.querySelectorAll('.duty-docs span[data-home]').forEach(x => {
        if (x.getAttribute('data-home') === dept) x.classList.add('hl');
      });
    });
    d.addEventListener('mouseleave', clearHl);
  });
}

document.addEventListener('DOMContentLoaded', initCrossHighlight);

// Кольорова схема per-лікарня (lib/hospital-themes.js, отримана через
// /api/hospital-info) — накладає CSS-змінні на :root. theme=null (немає
// власної схеми) — нічого не робить, лишається дефолт Хотина з theme.css.
function applyHospitalTheme(theme) {
  if (!theme) return;
  const root = document.documentElement.style;
  Object.entries(theme).forEach(([k, v]) => root.setProperty(k, v));
}

function initHospitalName() {
  const title   = document.querySelector('.name-block .title');
  const tagline = document.querySelector('.name-block .tagline');
  const logo    = document.querySelector('.logo');
  const org = window.HOSPITAL_ORG_EDRPOU;
  if (!org || (!title && !tagline && !logo)) return;
  fetch(`/api/hospital-info?org=${encodeURIComponent(org)}`)
    .then(r => r.ok ? r.json() : null)
    .then(info => {
      if (!info) return;
      if (title)   title.innerHTML  = (info.display_name || '').split(' ').join('<br>');
      if (tagline) tagline.textContent = info.tagline || '';
      if (logo && info.logo_url) logo.src = info.logo_url;
      applyHospitalTheme(info.theme);
    })
    .catch(() => {});
}

// Поля розмітки (.layout-field) — постійні орієнтовні зони канви 1920x1080,
// утворені vline (ліва/права) і work-band (над смугою/під смугою). Єдине
// джерело координат — тут; сторінка нічого не викликає сама, досить мати
// #slideRoot (canvas), і поля з'являються автоматично при DOMContentLoaded.
// Щоб додати ще менші поля розмітки поверх/усередині базових — викликати
// renderLayoutFields(root, [...BASE_LAYOUT_FIELDS, {top, left, width, height, label}])
// або передати свій список окремо.
const BASE_LAYOUT_FIELDS = [
  { className: 'lf-left-top',     top: 231, left: 20,  width: 545,  height: 270 },
  { className: 'lf-left-bottom',  top: 591, left: 20,  width: 545,  height: 469 },
  { className: 'lf-right-top',    top: 231, left: 605, width: 1295, height: 270 },
  { className: 'lf-right-bottom', top: 591, left: 605, width: 1295, height: 469 },
];

function renderLayoutFields(root, fields = BASE_LAYOUT_FIELDS) {
  root.insertAdjacentHTML('beforeend', fields.map(f => `
    <div class="layout-field ${f.className || ''}" style="top:${f.top}px; left:${f.left}px; width:${f.width}px; height:${f.height}px;"></div>
  `).join(''));
}

document.addEventListener('DOMContentLoaded', () => {
  initStaffFields();
  initHospitalName();
  const slideRoot = document.getElementById('slideRoot');
  if (slideRoot) renderLayoutFields(slideRoot);
});

// ── Прокручувані списки: спільна поведінка для БУДЬ-ЯКОГО списку на будь-якій
// сторінці (горизонтального чи вертикального) — інерційне перетягування
// мишею + fade-маска, що реагує на реальну позицію скролу. Нічого тут не
// хардкодиться під конкретну сторінку/список — розміри рахує сама сторінка
// (fitHeightTo) з реальних offsetTop елементів, а не ці утиліти. ──

const SCROLL_FADE_SIZE = 32; // px, ширина розмиття країв

// Fade-маска на краях реагує на позицію скролу: біля самого початку/кінця
// зникає з того боку, щоб не затуляти перший/останній пункт, коли
// прокручувати далі вже нікуди.
function updateFadeMask(el, axis) {
  if (!el) return;
  const pos = axis === 'x' ? el.scrollLeft : el.scrollTop;
  const extent = axis === 'x' ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
  const atStart = pos <= 2;
  const atEnd = pos >= extent - 2;
  const dir = axis === 'x' ? '90deg' : '180deg';
  let mask;
  if (atStart && atEnd) mask = 'none';
  else if (atStart) mask = `linear-gradient(${dir}, var(--c-black) 0, var(--c-black) calc(100% - ${SCROLL_FADE_SIZE}px), transparent 100%)`;
  else if (atEnd) mask = `linear-gradient(${dir}, transparent 0, var(--c-black) ${SCROLL_FADE_SIZE}px, var(--c-black) 100%)`;
  else mask = `linear-gradient(${dir}, transparent 0, var(--c-black) ${SCROLL_FADE_SIZE}px, var(--c-black) calc(100% - ${SCROLL_FADE_SIZE}px), transparent 100%)`;
  el.style.webkitMaskImage = mask;
  el.style.maskImage = mask;
}

// Прокрутка перетягуванням мишею (затиснути ліву кнопку й тягнути) — з
// інерційним гальмуванням після відпускання за швидкістю руху перед ним
// (як типовий touch/трекпад скрол), а не миттєва зупинка.
function enableDragScroll(el, axis) {
  if (!el) return;
  axis = axis || 'x';
  const isX = axis === 'x';
  let dragging = false, startPos = 0, startScroll = 0;
  let lastPos = 0, lastT = 0, velocity = 0;
  let momentumId = null;

  const pointerPos = (e) => isX ? e.pageX : e.pageY;
  const getScroll = () => isX ? el.scrollLeft : el.scrollTop;
  const setScroll = (v) => { if (isX) el.scrollLeft = v; else el.scrollTop = v; };

  const stopMomentum = () => { if (momentumId) { cancelAnimationFrame(momentumId); momentumId = null; } };

  function runMomentum() {
    let v = velocity;
    const friction = 0.94;
    function step() {
      if (Math.abs(v) < 0.5) { momentumId = null; return; }
      setScroll(getScroll() - v);
      v *= friction;
      momentumId = requestAnimationFrame(step);
    }
    momentumId = requestAnimationFrame(step);
  }

  el.style.cursor = 'grab';
  el.addEventListener('mousedown', (e) => {
    stopMomentum();
    dragging = true;
    el.style.cursor = 'grabbing';
    startPos = lastPos = pointerPos(e);
    startScroll = getScroll();
    lastT = performance.now();
    velocity = 0;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    setScroll(startScroll - (pointerPos(e) - startPos));
    const now = performance.now();
    const dt = now - lastT;
    if (dt > 8) {
      velocity = (pointerPos(e) - lastPos) / dt * 16; // px за кадр (~16мс)
      lastPos = pointerPos(e);
      lastT = now;
    }
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    el.style.cursor = 'grab';
    if (Math.abs(velocity) > 1) runMomentum();
  });
}

// Позиція елемента "в канві" — сума offsetTop по всьому ланцюжку
// offsetParent (не лише прямого predка). Потрібно, бо елементи тепер можуть
// бути вкладені в .layout-field (свій offsetParent) і водночас звірятись з
// елементами поза полем (work-band, #slideRoot) — голий el.offsetTop тоді
// зчитує лише зсув відносно НАЙБЛИЖЧОГО предка, не спільної системи
// координат. Перенесено з entry.js (was: offsetInSlide, локальна там).
function offsetInSlide(node) {
  let top = 0;
  while (node) { top += node.offsetTop || 0; node = node.offsetParent; }
  return top;
}

// Максимальна висота елемента від його реальної позиції (offsetInSlide, не
// голий offsetTop — див. коментар вище) до заданої нижньої межі (px у тій
// самій системі координат — теж через offsetInSlide(boundaryEl), не
// .offsetTop напряму) — сторінка сама вирішує, що є межею, ця функція лише
// рахує різницю, без жодних захардкоджених px.
function fitHeightTo(el, bottomPx, gap = 12) {
  if (!el) return;
  el.style.maxHeight = Math.max(bottomPx - offsetInSlide(el) - gap, 0) + 'px';
}

function inertialScrollToCenter(container, el, dur = 600) {
  const cRect = container.getBoundingClientRect();
  const eRect = el.getBoundingClientRect();
  const target = container.scrollTop + (eRect.top - cRect.top) - (container.clientHeight / 2) + (el.offsetHeight / 2);
  const start = container.scrollTop;
  const dist = target - start;
  if (Math.abs(dist) < 1) return;
  let t0 = null;
  function step(t) {
    if (t0 === null) t0 = t;
    const p = Math.min((t - t0) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    container.scrollTop = start + dist * eased;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
