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
 *   animate    : true → перехід (напр. місячна→денна гістограма при кліку
 *                на місяць) анімується у 2 групи:
 *                - ІСНУЮЧІ стовпці (ті, що вже намальовані з попереднього
 *                  виклику) переставляються плавно на нову x/y/width/height
 *                  (реюз DOM-елементів, не пересворюються з нуля) — вони
 *                  просто "рухаються" на нове місце.
 *                - НОВІ стовпці (яких раніше не було — денна деталізація
 *                  завжди ширша за місячну) виїжджають один за одним ЗА
 *                  останнім існуючим (а не з лівого краю всього поля).
 *                Підписи (bar-val/bar-xlabel) нових стовпців не рухаються
 *                (щоб не спотворювались) — з'являються (opacity) після
 *                приїзду свого стовпця; підписи існуючих просто їдуть разом
 *                зі своїм стовпцем.
 * }
 *
 * Usage:
 *   <svg viewBox="0 0 624 130"><line class="bar-base"/></svg>
 *   <script src="/js/bar-chart.js"></script>
 *   <script>renderBarChart(svgEl, rows, null, null, r => console.log(r))</script>
 */
function renderBarChart(svg, rows, period, sharedBounds, onBarClick, opts) {
  if (!svg || !rows || !rows.length) return;

  const { fmt = v => Number(v).toLocaleString('uk-UA'), animate = false } = opts || {};

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

  // Активний (клікнутий) стовпець — на відміну від .active (лише при
  // наведенні, зникає), .selected лишається аж до кліку на інший стовпець:
  // чорна мітка того дня/місяця, дані якого зараз показані в "перебуває у
  // відділенні" нижче.
  let selectedEls = null;

  const base = svg.querySelector('.bar-base');
  if (base) {
    base.setAttribute('x1', '0'); base.setAttribute('x2', String(w));
    base.setAttribute('y1', zeroY.toFixed(1)); base.setAttribute('y2', zeroY.toFixed(1));
  }

  // Реюзуємо стовпці з попереднього рендеру (замість "видалити все й
  // намалювати з нуля") — щоб перші reuseN могли плавно ПЕРЕСТАВИТИСЬ на
  // нову позицію/розмір, а не зникнути й знову виїхати з лівого краю.
  // Зіставлення чисто за порядком у DOM (індексом), без семантики (значення
  // місячних і денних стовпців — різні дані) — це декоративний морф, не
  // прив'язка "місяць N → день N". allOld* — завжди повний список СТАРИХ
  // елементів (незалежно від animate!), інакше при поверненні з денної на
  // місячну (animate=false) стара 31-денна розмітка ніколи б не прибралась —
  // саме цей баг і був: "дні залишаються".
  const allOldBars    = Array.from(svg.querySelectorAll('.bar-col'));
  const allOldVals    = Array.from(svg.querySelectorAll('.bar-val'));
  const allOldXlabels = Array.from(svg.querySelectorAll('.bar-xlabel'));
  // Ургентний оверлей (.bar-col-urgent) — завжди перемальовується начисто,
  // без реюзу/анімації (на відміну від .bar-col вище): це другорядний
  // візуальний шар (2 кольори ургентна/планова), не варто ускладнювати й так
  // тендітну reuse/animate-логіку основного стовпця заради нього. При
  // переході місяць→день він просто "стрибне" на нову позицію одразу, а не
  // проїде плавно — прийнятний компроміс.
  svg.querySelectorAll('.bar-col-urgent').forEach(e => e.remove());
  const oldBars    = animate ? allOldBars : [];
  const oldVals    = animate ? allOldVals : [];
  const oldXlabels = animate ? allOldXlabels : [];
  const reuseN = Math.min(oldBars.length, n);

  if (animate) {
    // Зайві старі стовпці понад reuseN (нових даних менше, ніж було) —
    // просто прибираємо, без анімації виходу.
    for (let i = reuseN; i < oldBars.length; i++) oldBars[i].remove();
    for (let i = reuseN; i < oldVals.length; i++) oldVals[i].remove();
    for (let i = reuseN; i < oldXlabels.length; i++) oldXlabels[i].remove();
  } else {
    // Неанімований рендер (звичайна річна/місячна гістограма) — завжди
    // начисто, без реюзу/переходу: прибираємо АБСОЛЮТНО все старе.
    allOldBars.forEach(e => e.remove());
    allOldVals.forEach(e => e.remove());
    allOldXlabels.forEach(e => e.remove());
  }

  const BAR_MS = 400;
  const newCount = n - reuseN;
  const stagger = animate ? Math.min(15, BAR_MS / Math.max(newCount, 1)) : 0;
  const toReposition = []; // існуючі — просто рухаються на нову геометрію
  const toEnter = [];      // нові — виїжджають услід за останнім існуючим

  rows.forEach((r, i) => {
    const cx = xCenter(i);
    const hgt = barHeight(values[i]);
    const barY = zeroY - hgt;
    const finalBarX = (cx - barW / 2).toFixed(1);
    const xLabel = yearly ? String(r.x) : String(Number(r.x)).padStart(2, '0');
    const isReused = animate && i < reuseN;

    let bar, valTx, xTx;
    if (isReused) {
      bar = oldBars[i]; valTx = oldVals[i]; xTx = oldXlabels[i];
      valTx.textContent = fmt(values[i]);
      xTx.textContent = xLabel;
    } else {
      valTx = mkNS('text');
      valTx.setAttribute('class', 'bar-labels bar-val');
      valTx.textContent = fmt(values[i]);
      svg.appendChild(valTx);

      xTx = mkNS('text');
      xTx.setAttribute('class', 'bar-labels bar-xlabel');
      xTx.textContent = xLabel;
      svg.appendChild(xTx);

      bar = mkNS('rect');
      bar.setAttribute('class', 'bar-col');
      bar.setAttribute('rx', '3');
      svg.appendChild(bar);

      // Підписи (цифри) НЕ рухаються — одразу стоять на кінцевій позиції cx
      // (лише opacity 0→1 після приїзду, нижче). Рухається лише сам стовпець
      // (rect) — стартує ЗА останнім існуючим (його МАЙБУТНЬОЮ, вже новою
      // позицією), а не з лівого краю всього поля. Якщо існуючих нема
      // взагалі (перший рендер) — з лівого краю, як і раніше.
      valTx.setAttribute('x', cx.toFixed(1));
      valTx.setAttribute('y', (barY - 7).toFixed(1));
      xTx.setAttribute('x', cx.toFixed(1));
      xTx.setAttribute('y', (zeroY + 11).toFixed(1));
      const enterX = reuseN > 0 ? xCenter(reuseN - 1) : padX;
      bar.setAttribute('x', (enterX - barW / 2).toFixed(1));
      // y/width/height нового стовпця — одразу кінцеві (лише x "виїжджає"),
      // на відміну від реюзнутого — той рухає ВСЮ геометрію разом (нижче).
      bar.setAttribute('y', barY.toFixed(1));
      bar.setAttribute('width', barW.toFixed(1));
      bar.setAttribute('height', hgt.toFixed(1));
    }

    // Клік/наведення — на ВСІХ трьох елементах (стовпець, число зверху,
    // дата знизу), не лише на самому прямокутнику: цифри — зручніша й
    // більша ціль для кліку, ніж вузький стовпець при малому значенні.
    const hitTargets = [bar, valTx, xTx];
    hitTargets.forEach(el => {
      el.onmouseenter = () => hitTargets.forEach(t => t.classList.add('active'));
      el.onmouseleave = () => hitTargets.forEach(t => t.classList.remove('active'));
      if (onBarClick) {
        el.style.cursor = 'pointer';
        el.onclick = () => {
          if (selectedEls) selectedEls.forEach(t => t.classList.remove('selected'));
          selectedEls = hitTargets;
          hitTargets.forEach(t => t.classList.add('selected'));
          onBarClick(r);
        };
      }
    });

    if (!animate) {
      bar.setAttribute('x', finalBarX);
      valTx.setAttribute('x', cx.toFixed(1));
      xTx.setAttribute('x', cx.toFixed(1));
      return;
    }

    if (isReused) {
      [bar, valTx, xTx].forEach(el => {
        el.style.transition = `x ${BAR_MS}ms ease, y ${BAR_MS}ms ease`;
        el.style.transitionDelay = '0ms';
      });
      bar.style.transition += `, width ${BAR_MS}ms ease, height ${BAR_MS}ms ease`;
      toReposition.push({
        bar, valTx, xTx, barX: finalBarX, x: cx.toFixed(1),
        barY: barY.toFixed(1), width: barW.toFixed(1), height: hgt.toFixed(1),
        valY: (barY - 7).toFixed(1),
      });
    } else {
      const idx = i - reuseN;
      const barDelay = `${(idx * stagger).toFixed(0)}ms`;
      bar.style.transition = `x ${BAR_MS}ms cubic-bezier(.22,.9,.34,1)`;
      bar.style.transitionDelay = barDelay;

      const labelDelay = `${(idx * stagger + BAR_MS).toFixed(0)}ms`;
      [valTx, xTx].forEach(el => {
        el.style.opacity = '0';
        el.style.transition = 'opacity .25s ease';
        el.style.transitionDelay = labelDelay;
      });
      toEnter.push({ bar, valTx, xTx, barX: finalBarX });
    }

    // Ургентний оверлей — нижня частина стовпця, висота пропорційна долі
    // y_urgent від загального y (лікарняно-специфічна МКХ-класифікація,
    // порахована на бекенді). Рядки без y_urgent (старі виклики/інші
    // endpoint'и, що ще не повертають розбивку) просто не малюють оверлей —
    // стовпець лишається суцільним sage, як і раніше.
    if (r.y_urgent != null && Number(r.y) > 0) {
      const urgentH = hgt * (Number(r.y_urgent) / Number(r.y));
      const urgentBar = mkNS('rect');
      urgentBar.setAttribute('class', 'bar-col-urgent');
      urgentBar.setAttribute('rx', '3');
      urgentBar.setAttribute('x', finalBarX);
      urgentBar.setAttribute('y', (zeroY - urgentH).toFixed(1));
      urgentBar.setAttribute('width', barW.toFixed(1));
      urgentBar.setAttribute('height', urgentH.toFixed(1));
      svg.appendChild(urgentBar);
    }
  });

  if (toReposition.length || toEnter.length) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      toReposition.forEach(({ bar, valTx, xTx, barX, x, barY, width, height, valY }) => {
        bar.setAttribute('x', barX);
        bar.setAttribute('y', barY);
        bar.setAttribute('width', width);
        bar.setAttribute('height', height);
        valTx.setAttribute('x', x);
        valTx.setAttribute('y', valY);
        xTx.setAttribute('x', x);
      });
      toEnter.forEach(({ bar, valTx, xTx, barX }) => {
        bar.setAttribute('x', barX);
        valTx.style.opacity = '1';
        xTx.style.opacity = '1';
      });
    }));
  }
}
