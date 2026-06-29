/**
 * renderNeuroTreemap(selector, data)
 *
 * selector — CSS selector or DOM element for the <svg> element
 *
 * data = {
 *   grand  : number,       // grand total (all groups combined)
 *   groups : [{
 *     label : string,
 *     n     : number,
 *     gc    : string,      // group accent color (header + border)
 *     items : [{ code, name, n, c }]
 *   }]
 * }
 *
 * The SVG element must have a viewBox set, e.g. viewBox="0 0 900 530"
 *
 * Usage:
 *   <svg id="chart" viewBox="0 0 900 530" xmlns="http://www.w3.org/2000/svg"></svg>
 *   <div id="legend" class="legend"></div>
 *   <script src="/js/neuro-treemap.js"></script>
 *   <script>renderNeuroTreemap('#chart', data, { legendEl: '#legend' })</script>
 */
function renderNeuroTreemap(selector, data, opts) {
  const svg = typeof selector === 'string'
    ? document.querySelector(selector)
    : selector;
  if (!svg) return;

  const { grand, groups } = data;
  const legEl = opts && opts.legendEl
    ? (typeof opts.legendEl === 'string' ? document.querySelector(opts.legendEl) : opts.legendEl)
    : null;

  const vb  = svg.getAttribute('viewBox') || '0 0 900 530';
  const [, , W, H] = vb.split(' ').map(Number);
  const PAD = 3, HDR = 30;
  const NS  = 'http://www.w3.org/2000/svg';

  let tt = document.getElementById('_nmtt');
  if (!tt) {
    tt = document.createElement('div');
    tt.id = '_nmtt';
    tt.style.cssText = 'position:fixed;background:rgba(28,28,38,.9);color:#fff;font-size:12.5px;padding:9px 13px;border-radius:9px;pointer-events:none;display:none;max-width:260px;line-height:1.55;z-index:99;font-family:var(--font,ui-sans-serif,system-ui,sans-serif)';
    document.body.appendChild(tt);
  }

  function mk(tag, attrs, par) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    (par || svg).appendChild(el);
    return el;
  }

  function squarify(items, x0, y0, x1, y1) {
    const out = [];
    const sorted = items.slice().sort((a, b) => b.n - a.n);

    function place(arr, x0, y0, x1, y1) {
      if (!arr.length) return;
      const W = x1 - x0, H = y1 - y0;
      if (W <= 0 || H <= 0) return;
      if (arr.length === 1) { out.push({ ...arr[0], x: x0, y: y0, w: W, h: H }); return; }

      const total = arr.reduce((s, d) => s + d.n, 0);
      const area  = W * H;
      const sh    = Math.min(W, H);
      let bestRow = [], bestWorst = Infinity, rowN = 0, endIdx = 0;

      for (let i = 0; i < arr.length; i++) {
        const row = arr.slice(0, i + 1);
        const rN  = row.reduce((s, d) => s + d.n, 0);
        const rA  = (rN / total) * area;
        const rLen = rA / sh;
        let worst = 0;
        for (const d of row) {
          const s  = (d.n / rN) * rA;
          const sd = s / rLen;
          worst = Math.max(worst, rLen / sd, sd / rLen);
        }
        if (i > 0 && worst > bestWorst) break;
        bestWorst = worst; bestRow = row; rowN = rN; endIdx = i + 1;
      }

      const rA   = (rowN / total) * area;
      const rLen = rA / sh;

      if (W >= H) {
        let cy = y0;
        for (const d of bestRow) {
          const dh = (d.n / rowN) * sh;
          out.push({ ...d, x: x0, y: cy, w: rLen, h: dh });
          cy += dh;
        }
        place(arr.slice(endIdx), x0 + rLen, y0, x1, y1);
      } else {
        let cx = x0;
        for (const d of bestRow) {
          const dw = (d.n / rowN) * sh;
          out.push({ ...d, x: cx, y: y0, w: dw, h: rLen });
          cx += dw;
        }
        place(arr.slice(endIdx), x0, y0 + rLen, x1, y1);
      }
    }

    place(sorted, x0, y0, x1, y1);
    return out;
  }

  function showTT(e, html) { tt.innerHTML = html; tt.style.display = 'block'; moveTT(e); }
  function moveTT(e) { tt.style.left = (e.clientX + 14) + 'px'; tt.style.top = (e.clientY - 10) + 'px'; }
  function hideTT() { tt.style.display = 'none'; }
  document.addEventListener('mousemove', e => { if (tt.style.display !== 'none') moveTT(e); });

  let gx = 0;
  for (const g of groups) {
    const gw = (g.n / grand) * W;

    mk('rect', { x: gx, y: 0, width: gw, height: H, fill: g.gc, opacity: '.07' });
    mk('rect', { x: gx, y: 0, width: gw, height: HDR, fill: g.gc, opacity: '.2' });

    const pct = (g.n / grand * 100).toFixed(1);
    const hdrLabel = gw < 120
      ? `${pct}%`
      : `${g.label}  ${g.n.toLocaleString('uk-UA')} (${pct}%)`;
    mk('text', {
      x: (gx + gw / 2).toFixed(1), y: HDR / 2,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': '12.5', 'font-weight': '600',
      'font-family': 'var(--font,ui-sans-serif,system-ui,sans-serif)', fill: g.gc
    }).textContent = hdrLabel;

    const rects = squarify(g.items, gx + PAD, HDR + PAD, gx + gw - PAD, H - PAD);

    for (const r of rects) {
      const rw = r.w - PAD, rh = r.h - PAD;
      if (rw < 1 || rh < 1) continue;

      const rect = mk('rect', {
        x: r.x.toFixed(1), y: r.y.toFixed(1),
        width: rw.toFixed(1), height: rh.toFixed(1),
        rx: 4, fill: r.c
      });
      rect.style.cssText = 'cursor:pointer;transition:opacity .15s';
      rect.addEventListener('mouseenter', e => {
        rect.style.opacity = '.75';
        const p = (r.n / grand * 100).toFixed(1);
        showTT(e, `<b>${r.code}</b><br>${r.name}<br><b>${r.n.toLocaleString('uk-UA')}</b> випадків · ${p}%`);
      });
      rect.addEventListener('mouseleave', () => { rect.style.opacity = '1'; hideTT(); });

      if (rw > 38 && rh > 16) {
        const fs = rw > 100 ? 12 : 10;
        const showCount = rh > 30 && rw > 44;
        const lines = showCount ? [r.code, r.n.toLocaleString('uk-UA')] : [r.code];
        const lineH = fs + 3;
        const ty0 = r.y + rh / 2 - (lines.length - 1) * lineH / 2;
        lines.forEach((line, i) => {
          mk('text', {
            x: (r.x + rw / 2).toFixed(1),
            y: (ty0 + i * lineH).toFixed(1),
            'text-anchor': 'middle', 'dominant-baseline': 'middle',
            'font-size': fs, 'font-weight': i === 0 ? '600' : '400',
            'font-family': 'var(--font,ui-sans-serif,system-ui,sans-serif)',
            fill: 'rgba(255,255,255,.93)', 'pointer-events': 'none'
          }).textContent = line;
        });
      }

      if (legEl) {
        const li = document.createElement('div');
        li.className = 'li';
        li.innerHTML = `<span class="ld" style="background:${r.c}"></span>${r.code} — ${r.n.toLocaleString('uk-UA')}`;
        legEl.appendChild(li);
      }
    }

    mk('rect', {
      x: gx.toFixed(1), y: 0,
      width: gw.toFixed(1), height: H,
      fill: 'none', stroke: g.gc, 'stroke-width': 1.5, rx: 6
    });

    gx += gw;
  }
}
