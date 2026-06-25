/**
 * renderSpark(svg, rows, sharedBounds, opts)
 *
 * Renders a smooth spark/trend line onto an existing SVG element.
 * The SVG must already contain:
 *   <path class="spark-line"/>
 *   <line class="spark-base"/>
 *
 * svg          — SVG DOM element (must have viewBox set)
 * rows         — [{ x: month|year, y: value }]
 * sharedBounds — optional { niceMin, niceMax } for aligned multi-chart scales
 * opts         — optional {
 *   onDotClick(row) : callback when a dot is clicked
 *   fmt(value)      : number formatter (default uk-UA locale)
 *   dotRadius       : normal dot radius (default 4)
 *   dotRadiusHover  : hover radius (default 6)
 * }
 *
 * Usage:
 *   <svg viewBox="0 0 260 90"><path class="spark-line"/><line class="spark-base"/></svg>
 *   <script src="/js/spark-chart.js"></script>
 *   <script>renderSpark(svgEl, rows, null, { onDotClick: r => console.log(r) })</script>
 */
function renderSpark(svg, rows, period, sharedBounds, onDotClick, opts) {
  if (!svg || !rows || !rows.length) return;

  const {
    fmt          = v => Number(v).toLocaleString('uk-UA'),
    dotRadius    = 4,
    dotRadiusHover = 6,
  } = opts || {};

  const NS   = 'http://www.w3.org/2000/svg';
  const mkNS = t => document.createElementNS(NS, t);

  function smoothPath(pts) {
    if (pts.length < 2) return pts.length ? `M${pts[0].x},${pts[0].y}` : '';
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  }

  const vb     = svg.viewBox.baseVal;
  const w = vb.width, h = vb.height;
  const padX = 16, padTop = 18, padBot = 18;
  const values = rows.map(r => Number(r.y));
  const min    = Math.min(...values), max = Math.max(...values);
  const n      = values.length;
  const yearly = Number(rows[0].x) >= 1000;
  const step   = yearly ? 10000 : 1000;
  const niceMin = sharedBounds ? sharedBounds.niceMin : Math.floor(min / step) * step;
  const niceMax = sharedBounds ? sharedBounds.niceMax : Math.max(Math.ceil(max / step) * step, niceMin + step);
  const span   = niceMax - niceMin;
  const drawH  = h - padTop - padBot;
  const zeroY  = h - padBot;
  const xFor   = i => n === 1 ? w / 2 : padX + i * (w - 2 * padX) / (n - 1);
  const yFor   = v => zeroY - ((v - niceMin) / span) * drawH;
  const pts    = values.map((v, i) => ({ x: xFor(i), y: yFor(v) }));

  const line = svg.querySelector('.spark-line');
  if (line) line.setAttribute('d', smoothPath(pts));

  const base = svg.querySelector('.spark-base');
  if (base) {
    base.setAttribute('x1', '0'); base.setAttribute('x2', String(w));
    base.setAttribute('y1', zeroY.toFixed(1)); base.setAttribute('y2', zeroY.toFixed(1));
  }

  svg.querySelectorAll('.spark-dot, .spark-labels').forEach(e => e.remove());

  rows.forEach((r, i) => {
    const cx = pts[i].x, cy = pts[i].y;

    const valTx = mkNS('text');
    valTx.setAttribute('class', 'spark-labels spark-val');
    valTx.setAttribute('x', cx.toFixed(1));
    valTx.setAttribute('y', (cy - 7).toFixed(1));
    valTx.textContent = fmt(values[i]);
    svg.appendChild(valTx);

    const xLabel = yearly ? String(r.x) : String(Number(r.x)).padStart(2, '0');
    const xTx = mkNS('text');
    xTx.setAttribute('class', 'spark-labels spark-xlabel');
    xTx.setAttribute('x', cx.toFixed(1));
    xTx.setAttribute('y', (zeroY + 11).toFixed(1));
    xTx.textContent = xLabel;
    svg.appendChild(xTx);

    const dot = mkNS('circle');
    dot.setAttribute('class', 'spark-dot');
    dot.setAttribute('cx', cx.toFixed(1));
    dot.setAttribute('cy', cy.toFixed(1));
    dot.setAttribute('r', String(dotRadius));

    dot.addEventListener('mouseenter', () => {
      dot.setAttribute('r', String(dotRadiusHover));
      valTx.classList.add('active');
      xTx.classList.add('active');
    });
    dot.addEventListener('mouseleave', () => {
      dot.setAttribute('r', String(dotRadius));
      valTx.classList.remove('active');
      xTx.classList.remove('active');
    });
    if (onDotClick) {
      dot.style.cursor = 'pointer';
      dot.addEventListener('click', () => onDotClick(r));
    }
    svg.appendChild(dot);
  });
}
