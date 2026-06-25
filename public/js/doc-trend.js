/**
 * renderDocTrend(svg, rows, field, cats, labels, opts)
 *
 * Renders a stacked bar chart (top-3 diagnoses per time period) onto an SVG element.
 *
 * svg    — SVG DOM element (must have viewBox set)
 * rows   — [{ блок, <field>, випадків }]  (from doctorTrend API)
 * field  — grouping field name: 'місяць' or 'рік'
 * cats   — array of x-axis category values (e.g. [1,2,3,...,12] for months)
 * labels — array of x-axis labels matching cats (e.g. ['01','02',...,'12'])
 * opts   — optional {
 *   colors  : [c1, c2, c3],   // bar colors (default: emblem-red / sage / blue)
 *   maxBars : number,          // max diagnoses shown (default 3)
 *   fmt(v)  : number formatter (default uk-UA locale)
 * }
 *
 * Usage:
 *   <svg id="trendSvg" viewBox="0 0 360 140"></svg>
 *   <script src="/js/doc-trend.js"></script>
 *   <script>renderDocTrend(svgEl, rows, 'місяць', cats, labels)</script>
 */
function renderDocTrend(svg, rows, field, cats, labels, opts) {
  if (!svg) return;

  const {
    colors  = ['#b27c8b', '#6d8c6a', '#6d93d8'],
    maxBars = 3,
    fmt     = v => Number(v).toLocaleString('uk-UA'),
  } = opts || {};

  const escA  = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const trunc = s => s.length > 30 ? s.slice(0, 29) + '…' : s;

  const vb = svg.viewBox.baseVal, W = vb.width, H = vb.height;
  const padL = 22, padR = 16, padTop = 22, padBot = 16;
  const plotW = W - padL - padR, plotH = H - padTop - padBot, baseY = H - padBot;
  const slot  = plotW / cats.length;
  const barW  = Math.min(slot * 0.62, 30);
  const xC    = i => padL + slot * (i + 0.5);

  let g = `<line x1="${padL}" x2="${W - padR}" y1="${baseY}" y2="${baseY}" stroke="rgba(0,0,0,0.12)" stroke-width="1"/>`;

  cats.forEach((c, i) => {
    g += `<text x="${xC(i).toFixed(1)}" y="${(baseY + 12).toFixed(1)}" text-anchor="middle" font-size="9" fill="#978f88" font-family="'ITFLight','Palatino',serif">${labels[i]}</text>`;
  });

  const totals = {};
  (rows || []).forEach(r => { totals[r.блок] = (totals[r.блок] || 0) + Number(r.випадків || 0); });
  const blocks = Object.keys(totals).sort((a, b) => totals[b] - totals[a]).slice(0, maxBars);
  const series = {};
  blocks.forEach(b => series[b] = {});
  (rows || []).forEach(r => { if (series[r.блок]) series[r.блок][Number(r[field])] = Number(r.випадків || 0); });

  let maxSum = 1;
  cats.forEach(c => {
    let s = 0;
    blocks.forEach(b => s += series[b][c] || 0);
    if (s > maxSum) maxSum = s;
  });
  const hFor = v => (v / maxSum) * plotH;

  cats.forEach((c, i) => {
    const x = xC(i) - barW / 2;
    let yTop = baseY, sum = 0;
    blocks.forEach((b, bi) => {
      const v = series[b][c] || 0; if (v <= 0) return;
      const h = hFor(v), y = yTop - h;
      g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${colors[bi % colors.length]}"><title>${escA(b)}: ${v}</title></rect>`;
      yTop = y; sum += v;
    });
    if (sum > 0) {
      g += `<text x="${xC(i).toFixed(1)}" y="${(yTop - 3).toFixed(1)}" text-anchor="middle" font-size="9" fill="#5a5550" font-family="'ITFLight','Palatino',serif">${fmt(sum)}</text>`;
    }
  });

  // legend
  const segW = plotW / maxBars;
  blocks.forEach((b, bi) => {
    const lx = padL + bi * segW;
    g += `<rect x="${lx.toFixed(1)}" y="4.5" width="8" height="8" rx="1.5" fill="${colors[bi % colors.length]}"/>`;
    g += `<text x="${(lx + 12).toFixed(1)}" y="11" font-size="9.5" fill="#5a5550" font-family="'ITFLight','Palatino',serif">${escA(trunc(b))}</text>`;
  });

  svg.innerHTML = g;
}
