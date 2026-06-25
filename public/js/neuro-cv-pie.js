/**
 * renderNeuroCvPie(selector, data)
 *
 * selector — CSS selector or DOM element
 *
 * data = {
 *   outerRows : [{ назва, випадків, g }],  // g: 'i' ischemic | 'h' hemorrhagic
 *   innerRows : [{ назва, випадків, c }],  // c: stroke color hex
 *   total     : number,                     // optional; computed from outerRows if omitted
 *   centerLabel: string,                    // optional; default 'випадків'
 * }
 *
 * Usage:
 *   <div class="dept-pie" id="myPie"></div>
 *   <script src="/js/neuro-cv-pie.js"></script>
 *   <script>renderNeuroCvPie('#myPie', data)</script>
 *
 * Required CSS on host page:
 *   .dept-pie { pointer-events: none; }
 *   .dept-pie .dp-hit       { pointer-events: stroke; }
 *   .dept-pie .dp-inner-hit { pointer-events: stroke; }
 */
function renderNeuroCvPie(selector, data) {
  const container = typeof selector === 'string'
    ? document.querySelector(selector)
    : selector;
  if (!container) return;

  const {
    outerRows,
    innerRows,
    centerLabel = 'випадків',
  } = data;

  const TOTAL = data.total || outerRows.reduce((s, r) => s + r.випадків, 0);
  const EMBLEM_RED = '#b27c8b';
  const SAGE_LIGHT = [176, 185, 172], SAGE_DARK = [104, 116, 103];
  const RED_DARK   = [178, 124, 139], RED_LIGHT  = [220, 190, 200];

  const sageShade = (k, n) => {
    const t = n > 1 ? k / (n - 1) : 0.5;
    const c = SAGE_LIGHT.map((v, j) => Math.round(v + (SAGE_DARK[j] - v) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  const redShade = (k, n) => {
    const t = n > 1 ? k / (n - 1) : 0;
    const c = RED_DARK.map((v, j) => Math.round(v + (RED_LIGHT[j] - v) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  const fmt    = v => Number(v).toLocaleString('uk-UA');
  const pctStr = v => (v / TOTAL * 100).toFixed(1) + '% частки';

  const nI = outerRows.filter(r => r.g === 'i').length;
  const nH = outerRows.filter(r => r.g === 'h').length;
  let iIdx = 0, hIdx = 0;
  outerRows.forEach(r => {
    r._color = r.g === 'i' ? sageShade(iIdx++, nI) : redShade(hIdx++, nH);
  });

  const VW = 560, VH = 490, cx = 280, cy = 285;
  const R = 124, SW = 60, C = 2 * Math.PI * R;
  let offset = 0;
  const midById = {}, colorById = {};
  let defs = '<defs>', arcs = '', hits = '';

  outerRows.forEach((r, i) => {
    const arcLen  = (r.випадків / TOTAL) * C;
    const midFrac = (offset + arcLen / 2) / C;
    const dash    = `${arcLen.toFixed(1)} ${(C - arcLen).toFixed(1)}`;
    midById[i]  = midFrac;
    colorById[i] = r._color;
    arcs += `<g class="dp-segwrap" data-i="${i}" style="transition:transform .18s ease">` +
      `<circle class="dp-seg" data-i="${i}" r="${R}" cx="${cx}" cy="${cy}" fill="none" stroke="${r._color}" stroke-width="${SW}" stroke-dasharray="${dash}" stroke-dashoffset="${(-offset).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})" style="pointer-events:none;transition:stroke .22s ease"/>` +
      `</g>`;
    hits += `<circle class="dp-hit" data-i="${i}" r="${R}" cx="${cx}" cy="${cy}" fill="none" stroke="#000" stroke-opacity="0" stroke-width="${SW}" stroke-dasharray="${dash}" stroke-dashoffset="${(-offset).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})" pointer-events="stroke" style="cursor:pointer"/>`;
    offset += arcLen;
  });

  const R2 = 56, SW2 = 38, C2 = 2 * Math.PI * R2;
  let innerArcs = '', innerHits = '', innerOffset = 0;
  const innerColor = {};
  innerRows.forEach((r, i) => {
    const arcLen = (r.випадків / TOTAL) * C2;
    const dash   = `${arcLen.toFixed(1)} ${(C2 - arcLen).toFixed(1)}`;
    innerColor[i] = r.c;
    innerArcs += `<circle class="dp-inner-seg" data-ii="${i}" r="${R2}" cx="${cx}" cy="${cy}" fill="none" stroke="${r.c}" stroke-width="${SW2}" stroke-dasharray="${dash}" stroke-dashoffset="${(-innerOffset).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})" style="pointer-events:none;transition:stroke .22s ease"/>`;
    innerHits += `<circle class="dp-inner-hit" data-ii="${i}" r="${R2}" cx="${cx}" cy="${cy}" fill="none" stroke="#000" stroke-opacity="0" stroke-width="${SW2}" stroke-dasharray="${dash}" stroke-dashoffset="${(-innerOffset).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})" pointer-events="stroke" style="cursor:pointer"/>`;
    innerOffset += arcLen;
  });

  const Rt = 174, tA = 70 * Math.PI / 180;
  const tlx = (cx - Rt * Math.sin(tA)).toFixed(1), tty = (cy - Rt * Math.cos(tA)).toFixed(1);
  const trx = (cx + Rt * Math.sin(tA)).toFixed(1);
  defs += `<path id="dpTitleArc" d="M ${tlx},${tty} A ${Rt},${Rt} 0 0 1 ${trx},${tty}" fill="none"/></defs>`;

  const header = `<text id="dpTitle" font-family="'ITFLight','Palatino',serif" font-size="15.75" fill="#3a3a3a"><textPath id="dpTitlePath" href="#dpTitleArc" xlink:href="#dpTitleArc" startOffset="50%" text-anchor="middle">Структура діагнозів</textPath></text>`;
  const center = `<text id="dpCenterV" x="${cx}" y="${cy - 2}" text-anchor="middle" font-family="'ITFLight','Palatino',serif" font-size="29" fill="#1a1a1a">${fmt(TOTAL)}</text>` +
    `<text id="dpCenterL" x="${cx}" y="${cy + 18}" text-anchor="middle" font-family="'ITFLight','Palatino',serif" font-size="11" fill="#978f88">${centerLabel}</text>`;

  container.innerHTML = `<svg width="${VW}" height="${VH}" viewBox="0 0 ${VW} ${VH}">${defs}<g id="dpRing">${arcs}${hits}</g><g id="dpInnerRing">${innerArcs}${innerHits}</g>${header}${center}</svg>`;

  const titleEl   = container.querySelector('#dpTitle');
  const titlePath = container.querySelector('#dpTitlePath');
  const cV = container.querySelector('#dpCenterV');
  const cL = container.querySelector('#dpCenterL');
  const ring = container.querySelector('#dpRing');
  ring.style.transformOrigin = `${cx}px ${cy}px`;
  ring.style.transition = 'transform .55s cubic-bezier(.2,.7,.2,1)';

  const wraps = {}, segCircles = {};
  container.querySelectorAll('.dp-segwrap').forEach(w => { wraps[Number(w.getAttribute('data-i'))] = w; });
  container.querySelectorAll('.dp-seg').forEach(c => { segCircles[Number(c.getAttribute('data-i'))] = c; });
  let locked = null;

  function paint(activeI) {
    Object.keys(segCircles).forEach(k => {
      segCircles[k].setAttribute('stroke', Number(k) === activeI ? EMBLEM_RED : colorById[k]);
    });
  }
  function setName(i) {
    const r = outerRows[i];
    paint(i);
    titlePath.textContent = r.назва;
    titleEl.setAttribute('fill', EMBLEM_RED);
    cV.textContent = fmt(r.випадків);
    cL.textContent = pctStr(r.випадків);
  }
  function clearName() {
    paint(-1);
    titlePath.textContent = 'Структура діагнозів';
    titleEl.setAttribute('fill', '#3a3a3a');
    cV.textContent = fmt(TOTAL);
    cL.textContent = centerLabel;
  }
  const POP = 7;
  function popOut(i) {
    const w = wraps[i]; if (!w) return;
    const t = (midById[i] || 0) * 2 * Math.PI;
    w.style.transform = `translate(${(POP * Math.sin(t)).toFixed(1)}px,${(-POP * Math.cos(t)).toFixed(1)}px)`;
  }
  const popIn       = i => { const w = wraps[i]; if (w) w.style.transform = ''; };
  const rotateTo    = i => { ring.style.transform = `rotate(${(-(midById[i] || 0) * 360).toFixed(1)}deg)`; };
  const rotateReset = () => { ring.style.transform = 'rotate(0deg)'; };

  container.querySelectorAll('.dp-hit').forEach(hit => {
    const i = Number(hit.getAttribute('data-i'));
    hit.addEventListener('mouseenter', () => { setName(i); popOut(i); });
    hit.addEventListener('mouseleave', () => { popIn(i); if (locked !== null) setName(locked); else clearName(); });
    hit.addEventListener('click', () => {
      if (locked === i) { locked = null; clearName(); rotateReset(); }
      else { locked = i; setName(i); rotateTo(i); }
    });
  });

  const innerSegs = {};
  container.querySelectorAll('.dp-inner-seg').forEach(c => { innerSegs[Number(c.getAttribute('data-ii'))] = c; });

  function paintInner(activeII) {
    Object.keys(innerSegs).forEach(k => {
      innerSegs[k].setAttribute('stroke', Number(k) === activeII ? '#d4a0ac' : innerColor[k]);
    });
  }

  container.querySelectorAll('.dp-inner-hit').forEach(hit => {
    const ii = Number(hit.getAttribute('data-ii'));
    const r = innerRows[ii];
    hit.addEventListener('mouseenter', () => {
      paintInner(ii);
      titlePath.textContent = r.назва;
      titleEl.setAttribute('fill', r.c);
      cV.textContent = fmt(r.випадків);
      cL.textContent = pctStr(r.випадків);
    });
    hit.addEventListener('mouseleave', () => {
      paintInner(-1);
      if (locked !== null) setName(locked); else clearName();
    });
  });
}
