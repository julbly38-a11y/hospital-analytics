/**
 * renderDoubleDonut(selector, data)
 *
 * selector — CSS selector or DOM element to render into
 *
 * data = {
 *   grand  : number,            // total hospitalizations
 *   tTot   : number,            // therapeutic total
 *   sTot   : number,            // surgical total
 *   tLabel : string,            // inner ring label (default 'Терапевт.')
 *   sLabel : string,            // inner ring label (default 'Хірург.')
 *   therapeutic : [             // 5 therapeutic departments
 *     { name: string, s: string, n: number, c: string }
 *   ],
 *   surgical : [                // 7 surgical departments
 *     { name: string, s: string, n: number, c: string }
 *   ]
 * }
 *
 * Usage:
 *   <div id="my-chart"></div>
 *   <script src="/js/double-donut.js"></script>
 *   <script>renderDoubleDonut('#my-chart', data)</script>
 */
function renderDoubleDonut(selector, data) {
  const container = typeof selector === 'string'
    ? document.querySelector(selector)
    : selector;
  if (!container) return;

  const {
    grand, tTot, sTot,
    tLabel = 'Терапевт.\nнапрямок',
    sLabel = 'Хірург.\nнапрямок',
    centerSub = 'госпіталізацій',
    therapeutic: T, surgical: S
  } = data;

  const CX = 450, CY = 450, NS = 'http://www.w3.org/2000/svg';
  const R1i = 158, R1o = 242, R2i = 258, R2o = 374, SG = 0.022;
  const T_CLR = '#6FA8A0', S_CLR = '#B09090';

  const pt  = (r, a) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  const fmt = v => v.toLocaleString('uk-UA');

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-80 0 1060 900');
  svg.setAttribute('width', '100%');
  svg.setAttribute('role', 'img');
  svg.style.cssText = 'display:block;max-width:700px;margin:0 auto';

  function mkEl(tag, attrs, par = svg) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    par.appendChild(e);
    return e;
  }

  function arcD(ri, ro, a1, a2) {
    const sa = a1 + SG / 2, ea = a2 - SG / 2, lg = (ea - sa > Math.PI) ? 1 : 0;
    const p = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;
    return `M${p(pt(ro, sa))}A${ro},${ro},0,${lg},1,${p(pt(ro, ea))}` +
           `L${p(pt(ri, ea))}A${ri},${ri},0,${lg},0,${p(pt(ri, sa))}Z`;
  }

  // Center info elements — created early, appended last
  const cg   = document.createElementNS(NS, 'g');
  const cVal = document.createElementNS(NS, 'text');
  const cSub = document.createElementNS(NS, 'text');
  Object.entries({
    x: CX, y: CY - 14, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
    'font-size': '30', 'font-weight': '500', 'font-family': 'var(--font-sans,sans-serif)',
    fill: 'var(--color-text-primary,#1a1a1a)'
  }).forEach(([k, v]) => cVal.setAttribute(k, v));
  cg.appendChild(cVal);
  Object.entries({
    x: CX, y: CY + 18, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
    'font-size': '12.5', 'font-family': 'var(--font-sans,sans-serif)',
    fill: 'var(--color-text-secondary,#666)'
  }).forEach(([k, v]) => cSub.setAttribute(k, v));
  cg.appendChild(cSub);

  const reset = () => { cVal.textContent = fmt(grand); cSub.textContent = centerSub; };
  reset();

  function addSeg(ri, ro, a1, a2, fill, name, n) {
    const pct = (n / grand * 100).toFixed(1);
    const p = mkEl('path', { d: arcD(ri, ro, a1, a2), fill });
    p.style.cssText = 'cursor:pointer;transition:opacity .16s';
    p.addEventListener('mouseenter', () => { p.style.opacity = '.75'; cVal.textContent = fmt(n); cSub.textContent = name + ' · ' + pct + '%'; });
    p.addEventListener('mouseleave', () => { p.style.opacity = '1'; reset(); });
  }

  function outerLabel(s, midA, color) {
    const norm = ((midA % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const anchor = norm < 0.22 || norm > 6.06 ? 'middle'
      : norm < Math.PI - 0.22 ? 'start'
      : norm > Math.PI + 0.22 ? 'end' : 'middle';
    const [lx, ly] = pt(R2o + 5, midA);
    mkEl('circle', { cx: lx.toFixed(1), cy: ly.toFixed(1), r: '2.6', fill: color, opacity: '0.6' });
    const [tx, ty] = pt(R2o + 24, midA);
    const dx = anchor === 'start' ? 4 : anchor === 'end' ? -4 : 0;
    mkEl('text', {
      x: (tx + dx).toFixed(1), y: ty.toFixed(1),
      'text-anchor': anchor, 'dominant-baseline': 'middle',
      'font-size': '12.5', 'font-weight': '500',
      'font-family': 'var(--font-sans,sans-serif)', fill: color
    }).textContent = s;
  }

  function innerLabel(lines, midA) {
    const [x, y] = pt((R1i + R1o) / 2, midA);
    lines.forEach((line, i) => {
      mkEl('text', {
        x: x.toFixed(1), y: (y + (i - (lines.length - 1) / 2) * 15.5).toFixed(1),
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-size': '12.5', 'font-weight': '500',
        'font-family': 'var(--font-sans,sans-serif)', fill: 'rgba(255,255,255,.92)'
      }).textContent = line;
    });
  }

  const START  = -Math.PI / 2;
  const tSpan  = 2 * Math.PI * (tTot / grand);
  const sSpan  = 2 * Math.PI * (sTot / grand);

  // Inner ring
  addSeg(R1i, R1o, START, START + tSpan, T_CLR, tLabel.replace('\n', ' '), tTot);
  addSeg(R1i, R1o, START + tSpan, START + tSpan + sSpan, S_CLR, sLabel.replace('\n', ' '), sTot);
  innerLabel(tLabel.split('\n'), START + tSpan / 2);
  innerLabel(sLabel.split('\n'), START + tSpan + sSpan / 2);

  // Outer ring
  let a = START;
  T.forEach(d => {
    const sp = tSpan * (d.n / tTot);
    addSeg(R2i, R2o, a, a + sp, d.c, d.name, d.n);
    if (d.s) outerLabel(d.s, a + sp / 2, d.c);
    a += sp;
  });
  S.forEach(d => {
    const sp = sSpan * (d.n / sTot);
    addSeg(R2i, R2o, a, a + sp, d.c, d.name, d.n);
    if (d.s) outerLabel(d.s, a + sp / 2, d.c);
    a += sp;
  });

  svg.appendChild(cg);
  container.appendChild(svg);
}
