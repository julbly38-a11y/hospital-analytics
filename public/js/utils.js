/**
 * Shared utilities used across all cabinet pages.
 *
 * fmt(n)                          — format integer with space thousands separator
 * countUp(el, target, dur, delay) — animated count-up with easeOutCubic
 * stat(key, param)                — POST /api/stats and return rows[]
 * inertialScrollToCenter(c, el)   — smooth-scroll container so el is centred
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
