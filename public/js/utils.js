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
    .dept.hl, .duty-docs span.hl {
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

document.addEventListener('DOMContentLoaded', () => {
  initStaffFields();
  initHospitalName();
});

// Ініціалізує фільтр років (.year-filter .ypill + .year-num).
// Повертає { getParam } — функцію що дає поточно обраний параметр ('all' або '2025' тощо).
// onchange(param) — викликається при кліку на пігулку.
function initYearFilter(onchange) {
  const pills   = [...document.querySelectorAll('.year-filter .ypill')];
  const yearNum = document.querySelector('.year-num');
  if (!pills.length || !yearNum) return { getParam: () => 'all' };

  let activeParam = 'all';

  function setActive(pill) {
    pills.forEach(x => x.classList.remove('active'));
    pill.classList.add('active');
    const t = pill.textContent.trim();
    if (/^\d{4}$/.test(t)) {
      yearNum.textContent = t; yearNum.classList.remove('small'); activeParam = t;
    } else {
      yearNum.textContent = 'ВСІ РОКИ'; yearNum.classList.add('small'); activeParam = 'all';
    }
  }

  const defaultYear = String(new Date().getFullYear() - 1);
  const defaultPill = pills.find(p => p.textContent.trim() === defaultYear)
    || pills.find(p => p.textContent.trim().toUpperCase().includes('ВСІ'))
    || pills[pills.length - 1];
  setActive(defaultPill);

  pills.forEach(p => p.addEventListener('click', () => {
    setActive(p);
    if (onchange) onchange(activeParam);
  }));

  return { getParam: () => activeParam };
}

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

// Максимальна висота елемента від його реального offsetTop до заданої
// нижньої межі (px у тій самій системі координат, зазвичай offsetTop іншого
// елемента чи root.clientHeight) — сторінка сама вирішує, що є межею,
// ця функція лише рахує різницю, без жодних захардкоджених px.
function fitHeightTo(el, bottomPx, gap = 12) {
  if (!el) return;
  el.style.maxHeight = Math.max(bottomPx - el.offsetTop - gap, 0) + 'px';
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
