/**
 * renderBarChart(svg, rows, period, sharedBounds, onBarClick, opts)
 *
 * Renders a 12-month bar chart (histogram) onto an existing SVG element.
 * The SVG must already contain:
 *   <line class="bar-base"/>
 *
 * svg          — SVG DOM element (must have viewBox set)
 * rows         — [{ x: month|year, y: value }]
 * sharedBounds — optional { niceMax } for aligned multi-chart scales (baseline is always 0)
 * opts         — optional {
 *   fmt(value) : number formatter (default uk-UA locale)
 * }
 *
 * Usage:
 *   <svg viewBox="0 0 624 130"><line class="bar-base"/></svg>
 *   <script src="/js/bar-chart.js"></script>
 *   <script>renderBarChart(svgEl, rows, null, null, r => console.log(r))</script>
 */
function renderBarChart(svg, rows, period, sharedBounds, onBarClick, opts) {
  if (!svg || !rows || !rows.length) return;

  const { fmt = v => Number(v).toLocaleString('uk-UA') } = opts || {};

  const NS   = 'http://www.w3.org/2000/svg';
  const mkNS = t => document.createElementNS(NS, t);

  const vb     = svg.viewBox.baseVal;
  const w = vb.width, h = vb.height;
  const padX = 16, padTop = 18, padBot = 18;
  const values = rows.map(r => Number(r.y));
  const max    = Math.max(...values, 0);
  const n      = values.length;
  const yearly = Number(rows[0].x) >= 1000;
  // Стеля шкали — на відміну від лінійного графіка, тут нема підписаних
  // рисок осі Y (лише число над кожним стовпцем), тому "круглість" числа
  // ролі не грає — важливо лише не марнувати висоту. 15% запасу над
  // найвищим значенням (для підпису значення над стовпцем), а не округлення
  // до наступної тисячі/десятитисячі — те грубе округлення (напр. 1075→2000)
  // з'їдало майже половину висоти графіка даремно.
  const niceMax = sharedBounds ? sharedBounds.niceMax : Math.max(max * 1.15, 1);
  const drawH  = h - padTop - padBot;
  const zeroY  = h - padBot;
  const slot   = (w - 2 * padX) / n;
  const barW   = slot * 0.859375; /* 0.55 × 1.25 × 1.25 — товщина стовпця +25%, ще +25% */
  const xCenter = i => padX + slot * i + slot / 2;
  const barHeight = v => (v / niceMax) * drawH;

  const base = svg.querySelector('.bar-base');
  if (base) {
    base.setAttribute('x1', '0'); base.setAttribute('x2', String(w));
    base.setAttribute('y1', zeroY.toFixed(1)); base.setAttribute('y2', zeroY.toFixed(1));
  }

  svg.querySelectorAll('.bar-col, .bar-labels').forEach(e => e.remove());

  rows.forEach((r, i) => {
    const cx = xCenter(i);
    const hgt = barHeight(values[i]);
    const barY = zeroY - hgt;

    const valTx = mkNS('text');
    valTx.setAttribute('class', 'bar-labels bar-val');
    valTx.setAttribute('x', cx.toFixed(1));
    valTx.setAttribute('y', (barY - 7).toFixed(1));
    valTx.textContent = fmt(values[i]);
    svg.appendChild(valTx);

    const xLabel = yearly ? String(r.x) : String(Number(r.x)).padStart(2, '0');
    const xTx = mkNS('text');
    xTx.setAttribute('class', 'bar-labels bar-xlabel');
    xTx.setAttribute('x', cx.toFixed(1));
    xTx.setAttribute('y', (zeroY + 11).toFixed(1));
    xTx.textContent = xLabel;
    svg.appendChild(xTx);

    const bar = mkNS('rect');
    bar.setAttribute('class', 'bar-col');
    bar.setAttribute('x', (cx - barW / 2).toFixed(1));
    bar.setAttribute('y', barY.toFixed(1));
    bar.setAttribute('width', barW.toFixed(1));
    bar.setAttribute('height', hgt.toFixed(1));
    bar.setAttribute('rx', '3');

    bar.addEventListener('mouseenter', () => {
      bar.classList.add('active');
      valTx.classList.add('active');
      xTx.classList.add('active');
    });
    bar.addEventListener('mouseleave', () => {
      bar.classList.remove('active');
      valTx.classList.remove('active');
      xTx.classList.remove('active');
    });
    if (onBarClick) {
      bar.style.cursor = 'pointer';
      bar.addEventListener('click', () => onBarClick(r));
    }
    svg.appendChild(bar);
  });
}
