/**
 * renderDocTrend(svg, rows, field, cats, labels, opts)
 *
 * Renders a single smooth (Catmull-Rom) wavy line — загальна кількість
 * випадків (пацієнтів) лікаря по місяцях обраного року. Мітки (крапки)
 * збільшуються при наведенні (як spark-chart.js) і клікабельні.
 *
 * svg    — SVG DOM element (must have viewBox set)
 * rows   — [{ <field>, випадків }]  (from docMonthlyCases API)
 * field  — grouping field name: 'місяць' or 'рік'
 * cats   — array of x-axis category values (e.g. [1,2,3,...,12] for months)
 * labels — array of x-axis labels matching cats (e.g. ['Січ',...,'Гру'])
 * opts   — optional {
 *   color          : line/legend/dot color (default emblem red),
 *   label          : legend text (default 'Кількість випадків'),
 *   fmt(v)         : number formatter (default uk-UA locale)
 *   dotRadius      : normal dot radius (default 3.2)
 *   dotRadiusHover : hover radius (default 5.5)
 *   onDotClick(cat): callback — cat = значення категорії (напр. номер місяця)
 * }
 *
 * Usage:
 *   <svg id="trendSvg" viewBox="0 0 1176 110"></svg>
 *   <script src="/js/doc-trend.js"></script>
 *   <script>renderDocTrend(svgEl, rows, 'місяць', cats, labels, { onDotClick: m => ... })</script>
 */
function renderDocTrend(svg, rows, field, cats, labels, opts) {
  if (!svg) return;

  const {
    color          = '#b27c8b',
    label          = 'Кількість випадків',
    fmt            = v => Number(v).toLocaleString('uk-UA'),
    dotRadius      = 4.5,
    dotRadiusHover = 7,
    onDotClick     = null,
  } = opts || {};

  const NS   = 'http://www.w3.org/2000/svg';
  const mkNS = t => document.createElementNS(NS, t);

  const vb = svg.viewBox.baseVal, W = vb.width, H = vb.height;
  const padL = 22, padR = 16, padTop = 22, padBot = 16;
  const plotW = W - padL - padR, plotH = H - padTop - padBot, baseY = H - padBot;
  const slot  = plotW / cats.length;
  const xC    = i => padL + slot * (i + 0.5);

  const byCat = {};
  (rows || []).forEach(r => { byCat[Number(r[field])] = Number(r.випадків || 0); });

  const maxV = Math.max(1, ...cats.map(c => byCat[c] || 0));
  const yFor = v => baseY - (v / maxV) * plotH;

  // Catmull-Rom → кубічні Безьє: плавна («хвиляста») крива крізь усі точки
  function smoothPath(pts) {
    if (!pts.length) return '';
    if (pts.length === 1) return `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} `;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += `C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} `;
    }
    return d;
  }

  const pts = cats.map((c, i) => ({ x: xC(i), y: yFor(byCat[c] || 0) }));

  svg.innerHTML = '';

  const baseline = mkNS('line');
  baseline.setAttribute('x1', String(padL)); baseline.setAttribute('x2', String(W - padR));
  baseline.setAttribute('y1', baseY.toFixed(1)); baseline.setAttribute('y2', baseY.toFixed(1));
  baseline.setAttribute('stroke', 'rgba(0,0,0,0.12)'); baseline.setAttribute('stroke-width', '1');
  svg.appendChild(baseline);

  cats.forEach((c, i) => {
    const xTx = mkNS('text');
    xTx.setAttribute('x', xC(i).toFixed(1));
    xTx.setAttribute('y', (baseY + 12).toFixed(1));
    xTx.setAttribute('text-anchor', 'middle');
    xTx.setAttribute('font-size', '9');
    xTx.setAttribute('fill', '#978f88');
    xTx.setAttribute('font-family', "'ITFLight','Palatino',serif");
    xTx.textContent = labels[i];
    svg.appendChild(xTx);
  });

  const path = mkNS('path');
  path.setAttribute('d', smoothPath(pts));
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);

  cats.forEach((c, i) => {
    const v = byCat[c] || 0;
    const { x: cx, y: cy } = pts[i];

    const valTx = mkNS('text');
    valTx.setAttribute('x', cx.toFixed(1));
    valTx.setAttribute('y', (cy - 7).toFixed(1));
    valTx.setAttribute('text-anchor', 'middle');
    valTx.setAttribute('font-size', '9');
    valTx.setAttribute('fill', color);
    valTx.setAttribute('font-family', "'ITFLight','Palatino',serif");
    valTx.textContent = fmt(v);
    svg.appendChild(valTx);

    const dot = mkNS('circle');
    dot.setAttribute('cx', cx.toFixed(1));
    dot.setAttribute('cy', cy.toFixed(1));
    dot.setAttribute('r', String(dotRadius));
    dot.setAttribute('fill', color);
    dot.style.transition = 'r .15s ease';

    dot.addEventListener('mouseenter', () => {
      dot.setAttribute('r', String(dotRadiusHover));
    });
    dot.addEventListener('mouseleave', () => {
      dot.setAttribute('r', String(dotRadius));
    });
    if (onDotClick) {
      dot.style.cursor = 'pointer';
      dot.addEventListener('click', () => onDotClick(c));
    }
    svg.appendChild(dot);
  });

  // легенда
  const legendDot = mkNS('rect');
  legendDot.setAttribute('x', String(padL)); legendDot.setAttribute('y', '4.5');
  legendDot.setAttribute('width', '8'); legendDot.setAttribute('height', '8');
  legendDot.setAttribute('rx', '1.5'); legendDot.setAttribute('fill', color);
  svg.appendChild(legendDot);

  const legendTx = mkNS('text');
  legendTx.setAttribute('x', (padL + 12).toFixed(1)); legendTx.setAttribute('y', '11');
  legendTx.setAttribute('font-size', '9.5'); legendTx.setAttribute('fill', '#5a5550');
  legendTx.setAttribute('font-family', "'ITFLight','Palatino',serif");
  legendTx.textContent = label;
  svg.appendChild(legendTx);
}
