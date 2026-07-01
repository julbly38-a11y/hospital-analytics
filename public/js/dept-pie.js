/**
 * renderDeptPie(container, rows, opts)
 *
 * Renders an interactive single-ring donut chart (department diagnosis structure).
 * Segment «Інші» is rendered as a gap (invisible arc) by default.
 *
 * container — DOM element or CSS selector
 * rows      — [{ назва, відс, випадків }]  (from periodIcdBlocks API)
 * opts      — optional {
 *   gap          : number,   // gap in px between segments (default 3)
 *   showOther    : boolean,  // render «Інші» as a visible segment (default false)
 *   centerLabel  : string,   // center bottom label (default 'випадків')
 *   lockedBlok   : string,   // segment назва to lock on initial render
 *   onSegmentClick(row|null) // called on click; null = segment unlocked
 *   fmt(v)                   // number formatter (default uk-UA locale)
 * }
 *
 * Returns pieAPI = {
 *   byName    : { [назва]: segmentIndex },
 *   setName(i): highlight segment i,
 *   clearName(): reset to default state,
 *   popOut(i) : nudge segment outward,
 *   popIn(i)  : return segment,
 *   getLocked : () => locked index or null,
 *   unlock()  : clear locked state,
 * }
 *
 * Required CSS on host page:
 *   .dept-pie { pointer-events: none; }
 *   .dept-pie .dp-hit { pointer-events: stroke; }
 *
 * Usage:
 *   <div class="dept-pie" id="deptPie"></div>
 *   <script src="/js/dept-pie.js"></script>
 *   <script>
 *     const api = renderDeptPie('#deptPie', rows, {
 *       lockedBlok: savedName,
 *       onSegmentClick: row => filterList(row),
 *     });
 *   </script>
 */
function renderDeptPie(container, rows, opts) {
  const el = typeof container === 'string'
    ? document.querySelector(container)
    : container;
  if (!el || !rows || !rows.length) return null;

  const {
    gap          = 3,
    showOther    = false,
    centerLabel  = 'випадків',
    lockedBlok   = null,
    onSegmentClick = null,
    fmt          = v => Number(v).toLocaleString('uk-UA'),
  } = opts || {};

  const EMBLEM_RED = '#b27c8b';
  const SAGE_LIGHT = [176, 185, 172], SAGE_DARK = [104, 116, 103];
  const sageShade  = (k, n) => {
    const t = n > 1 ? k / (n - 1) : 0.5;
    const c = SAGE_LIGHT.map((v, j) => Math.round(v + (SAGE_DARK[j] - v) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };

  const top = rows.slice(0, 6);
  const VW = 560, VH = 490, cx = 280, cy = 285;
  const R = 124, SW = 60, C = 2 * Math.PI * R;
  const totalCases = top.reduce((s, r) => s + (Number(r.випадків) || 0), 0);

  const isOtherRow = r => (r.назва || '') === 'Інші';
  const nDrawn = top.filter(r => showOther || !isOtherRow(r)).length;

  let offset = 0, di = 0;
  const midById = {}, greenById = {};
  let defs = '<defs>', arcs = '', hits = '';

  top.forEach((r, i) => {
    const frac   = Math.max(0, Number(r.відс) || 0) / 100;
    const arcLen = frac * C;
    const isOther = isOtherRow(r);
    const skip    = isOther && !showOther;
    const midFrac = (offset + arcLen / 2) / C;
    const dash    = `${Math.max(0, arcLen - gap).toFixed(1)} ${(C - arcLen + gap).toFixed(1)}`;

    if (!skip) {
      midById[i] = midFrac;
      const shade = sageShade(di, nDrawn); greenById[i] = shade; di++;
      arcs += `<g class="dp-segwrap" data-i="${i}" style="transition:transform .18s ease">` +
        `<circle class="dp-seg" data-i="${i}" r="${R}" cx="${cx}" cy="${cy}" fill="none" stroke="${shade}" stroke-width="${SW}" stroke-dasharray="${dash}" stroke-dashoffset="${(-offset).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})" style="pointer-events:none;transition:stroke .22s ease"/>` +
        `</g>`;
      hits += `<circle class="dp-hit" data-i="${i}" r="${R}" cx="${cx}" cy="${cy}" fill="none" stroke="#000" stroke-opacity="0" stroke-width="${SW}" stroke-dasharray="${dash}" stroke-dashoffset="${(-offset).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})" pointer-events="stroke" style="cursor:pointer"/>`;
    }
    offset += arcLen;
  });

  const Rt = 174, tA = 70 * Math.PI / 180;
  const tlx = (cx - Rt * Math.sin(tA)).toFixed(1), tty = (cy - Rt * Math.cos(tA)).toFixed(1);
  const trx = (cx + Rt * Math.sin(tA)).toFixed(1);
  defs += `<path id="dpTitleArc" d="M ${tlx},${tty} A ${Rt},${Rt} 0 0 1 ${trx},${tty}" fill="none"/></defs>`;

  const header = `<text id="dpTitle" font-family="'ITFLight','Palatino',serif" font-size="15.75" fill="#3a3a3a"><textPath id="dpTitlePath" href="#dpTitleArc" xlink:href="#dpTitleArc" startOffset="50%" text-anchor="middle">Структура діагнозів</textPath></text>`;
  const center = `<text id="dpCenterV" x="${cx}" y="${cy - 2}" text-anchor="middle" font-family="'ITFLight','Palatino',serif" font-size="29" fill="#1a1a1a">${fmt(totalCases)}</text>` +
    `<text id="dpCenterL" x="${cx}" y="${cy + 18}" text-anchor="middle" font-family="'ITFLight','Palatino',serif" font-size="11" fill="#978f88">${centerLabel}</text>`;

  el.innerHTML = `<svg width="${VW}" height="${VH}" viewBox="0 0 ${VW} ${VH}">${defs}<g id="dpRing">${arcs}${hits}</g>${header}${center}</svg>`;

  const titleEl   = el.querySelector('#dpTitle');
  const titlePath = el.querySelector('#dpTitlePath');
  const cV = el.querySelector('#dpCenterV');
  const cL = el.querySelector('#dpCenterL');
  const ring = el.querySelector('#dpRing');
  ring.style.transformOrigin = `${cx}px ${cy}px`;
  ring.style.transition = 'transform .55s cubic-bezier(.2,.7,.2,1)';

  const wraps = {}, segCircles = {};
  el.querySelectorAll('.dp-segwrap').forEach(w => { wraps[Number(w.getAttribute('data-i'))] = w; });
  el.querySelectorAll('.dp-seg').forEach(c => { segCircles[Number(c.getAttribute('data-i'))] = c; });
  let locked = null, scrolling = false;
  const beginRotate = () => {
    scrolling = true;
    ring.addEventListener('transitionend', () => { scrolling = false; }, { once: true });
  };

  function paint(activeI) {
    Object.keys(segCircles).forEach(k => {
      segCircles[k].setAttribute('stroke', Number(k) === activeI ? EMBLEM_RED : greenById[k]);
    });
  }
  function setName(i) {
    const r = top[i]; if (!r) return;
    paint(i);
    titlePath.textContent = r.назва || r.код || '—';
    titleEl.setAttribute('fill', EMBLEM_RED);
    cV.textContent = fmt(r.випадків);
    cL.textContent = r.відс + '% частки';
  }
  function clearName() {
    paint(-1);
    titlePath.textContent = 'Структура діагнозів';
    titleEl.setAttribute('fill', '#3a3a3a');
    cV.textContent = fmt(totalCases);
    cL.textContent = centerLabel;
  }
  const POP = 7;
  function popOut(i) {
    const w = wraps[i]; if (!w) return;
    const t = (midById[i] || 0) * 2 * Math.PI;
    w.style.transform = `translate(${(POP * Math.sin(t)).toFixed(1)}px, ${(-POP * Math.cos(t)).toFixed(1)}px)`;
  }
  const popIn       = i => { const w = wraps[i]; if (w) w.style.transform = ''; };
  const rotateTo    = i => { ring.style.transform = `rotate(${(-(midById[i] || 0) * 360).toFixed(1)}deg)`; };
  const rotateReset = () => { ring.style.transform = 'rotate(0deg)'; };

  el.querySelectorAll('.dp-hit').forEach(hit => {
    const i = Number(hit.getAttribute('data-i'));
    hit.addEventListener('mouseenter', () => { if (scrolling) return; setName(i); popOut(i); });
    hit.addEventListener('mouseleave', () => { popIn(i); if (scrolling) return; if (locked !== null) setName(locked); else clearName(); });
    hit.addEventListener('click', () => {
      if (locked === i) {
        locked = null;
        beginRotate(); clearName(); rotateReset();
        if (onSegmentClick) onSegmentClick(null);
      } else {
        locked = i;
        beginRotate(); setName(i); rotateTo(i);
        if (onSegmentClick) onSegmentClick(top[i]);
      }
    });
  });

  // build byName index
  const byName = {};
  top.forEach((r, idx) => { if (!isOtherRow(r)) byName[r.назва] = idx; });

  // restore lock if lockedBlok provided
  if (lockedBlok != null && byName[lockedBlok] !== undefined) {
    locked = byName[lockedBlok];
    setName(locked); rotateTo(locked);
  }

  return {
    byName,
    setName,
    clearName,
    popOut,
    popIn,
    getLocked: () => locked,
    unlock: () => { locked = null; clearName(); rotateReset(); },
  };
}
