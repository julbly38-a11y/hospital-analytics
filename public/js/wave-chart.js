/* Хвилястий графік ургентні/планові (2 гладкі area-лінії) — спільний для
   entry.html (напрямок) і head-cabinet.html (відділення), той самий стек
   праворуч від bar-chart (layout.css:.side-stack/.wave-*). Показує 6 КПІ-
   показників (hosp/pat/bed/age/imp/let, kpi6RowHtml), кожен розбитий на
   ургентні (МКХ-класифікація lpz.lpz_is_urgent_icd)/планові — сторінка
   викликає ці функції зі своїм станом (свій org/direction чи department),
   тут лише рендер + перехресні кліки, без жодних page-специфічних даних. */

// renderWaveCard(stack, suffix) — вставляє порожню картку хвилі в stack
// (side-stack елемент), suffix — унікальний DOM-id ("Therap"/"Surg"/"Dept"),
// щоб кілька карток (entry.html — дві) могли співіснувати на сторінці.
// Стовпчик міні-гістограми по наведенню (.wave-hover-bar-*) і числа
// (.wave-tip-*) — звичайний HTML (не SVG), позиціюються в % під самим
// підписом дати (wireWaveDateLabels), а не всередині координатної системи
// SVG (там preserveAspectRatio="none" тягне 600×99 під реальні, набагато
// ширші пропорції контейнера — будь-який <text>/елемент виглядав би
// спотвореним по X).
function renderWaveCard(stack, suffix) {
  if (!stack) return;
  stack.innerHTML = `
    <div class="wave-card">
      <div class="wave-chart-wrap">
        <svg class="wave-chart" id="wave${suffix}" viewBox="0 0 600 99" preserveAspectRatio="none">
          <defs>
            <linearGradient id="waveGradUrgent${suffix}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--c-accent-red)" stop-opacity="0.30"/>
              <stop offset="100%" stop-color="var(--c-accent-red)" stop-opacity="0"/>
            </linearGradient>
            <linearGradient id="waveGradPlanned${suffix}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--c-accent-blue)" stop-opacity="0.30"/>
              <stop offset="100%" stop-color="var(--c-accent-blue)" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path class="wave-area-urgent" fill="url(#waveGradUrgent${suffix})"></path>
          <path class="wave-area-planned" fill="url(#waveGradPlanned${suffix})"></path>
          <path class="wave-line-urgent" fill="none"></path>
          <path class="wave-line-planned" fill="none"></path>
        </svg>
        <div class="wave-hover-bar wave-hover-bar-urgent" id="waveBarUrgent${suffix}"></div>
        <div class="wave-hover-bar wave-hover-bar-planned" id="waveBarPlanned${suffix}"></div>
        <div class="wave-tip wave-tip-urgent" id="waveTipUrgent${suffix}"></div>
        <div class="wave-tip wave-tip-planned" id="waveTipPlanned${suffix}"></div>
      </div>
      <div class="wave-xlabels" id="waveXlabels${suffix}"></div>
    </div>
  `;
}

// renderWaveLines(svg, urgentVals, plannedVals) — дві гладкі (Catmull-Rom)
// лінії + заливки під ними, КОЖНА за власним діапазоном значень — ургентні
// й планові рахуються в різних порядках величини (планових завжди в рази
// більше), спільна шкала притискала б ургентну лінію до плаского низу.
// Лише сама крива — підписи/наведення/стовпчик тепер окремо
// (wireWaveDateLabels), поза координатною системою SVG.
function renderWaveLines(svg, urgentVals, plannedVals) {
  if (!svg || !urgentVals.length || !plannedVals.length) return;
  const vb = svg.viewBox.baseVal, w = vb.width, h = vb.height;
  const padX = 6, padTop = 10, padBot = 10;
  const drawH = h - padTop - padBot;
  const n = urgentVals.length;
  const xFor = i => n === 1 ? w / 2 : padX + i * (w - 2 * padX) / (n - 1);

  function smoothPath(p) {
    if (p.length < 2) return p.length ? `M${p[0].x},${p[0].y}` : '';
    let d = `M${p[0].x},${p[0].y}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p[i + 1];
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  }

  function draw(vals, lineClass, areaClass) {
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = Math.max(max - min, 1);
    const yFor = v => padTop + drawH - ((v - min) / span) * drawH;
    const pts = vals.map((v, i) => ({ x: xFor(i), y: yFor(v) }));
    const linePath = smoothPath(pts);
    const line = svg.querySelector('.' + lineClass);
    if (line) line.setAttribute('d', linePath);
    const area = svg.querySelector('.' + areaClass);
    if (area) area.setAttribute('d', `${linePath} L${pts[pts.length - 1].x},${h} L${pts[0].x},${h} Z`);
  }

  draw(urgentVals, 'wave-line-urgent', 'wave-area-urgent');
  draw(plannedVals, 'wave-line-planned', 'wave-area-planned');
}

// Максимальна висота стовпчика по наведенню (px) — навмисно ВИЩА за сам
// .wave-chart (59px), щоб стовпчик "виростав" помітно над хвилею, а не
// губився поряд із нею.
const WAVE_MAX_BAR_H = 92;

// wireWaveDateLabels({...}) — вішає на кожен підпис дати (span під хвилею)
// і наведення, і клік:
//   • НАВЕДЕННЯ — стовпчик міні-гістограми РІВНО під цим підписом, що
//     "виростає" вгору: знизу ургентна частина (червона), зверху на ній —
//     планова (синя), той самий принцип, що .bar-col-urgent поверх .bar-col
//     у bar-chart.js, лише тут одна колонка замість накладання на стовпчик.
//     Висота обох сегментів — відносно найбільшої суми (ургентні+планові)
//     серед усіх дат періоду, тому стовпчики порівнюються між собою як на
//     звичайній гістограмі. Числа — над відповідним сегментом.
//   • КЛІК — на рівнях "рік"/"місяць" перемикає (drill-down, той самий
//     патерн, що utils.js:loadKpiChartBlock: симуляція кліку на справжню
//     пігулку року/місяця); на найдрібнішому рівні "день" дробити нема
//     куди — викликає onDayClick(day), якщо сторінка його передала (head-
//     cabinet.js: показує "Перебуває у відділенні" на цю дату; entry.html
//     його не передає — клік на день там просто нічого не робить).
function wireWaveDateLabels({ xlabelsEl, urgentVals, plannedVals, barUrgentEl, barPlannedEl, tipUrgentEl, tipPlannedEl, yearly, activeYear, activeMonth, onDayClick }) {
  if (!xlabelsEl) return;
  const n = urgentVals.length;
  const maxTotal = Math.max(...urgentVals.map((v, i) => v + plannedVals[i]), 1);

  const hide = () => {
    [barUrgentEl, barPlannedEl, tipUrgentEl, tipPlannedEl].forEach(el => { if (el) el.style.opacity = '0'; });
  };
  hide();

  xlabelsEl.querySelectorAll('span').forEach((span, i) => {
    span.classList.add('wave-xlabel-clickable');
    const leftPct = ((i + 0.5) / n * 100).toFixed(2) + '%';

    span.addEventListener('mouseenter', () => {
      const hu = urgentVals[i] / maxTotal * WAVE_MAX_BAR_H;
      const hp = plannedVals[i] / maxTotal * WAVE_MAX_BAR_H;
      if (barUrgentEl) {
        barUrgentEl.style.left = leftPct;
        barUrgentEl.style.height = hu.toFixed(1) + 'px';
        barUrgentEl.style.opacity = '0.55';
      }
      if (barPlannedEl) {
        barPlannedEl.style.left = leftPct;
        barPlannedEl.style.bottom = hu.toFixed(1) + 'px';
        barPlannedEl.style.height = hp.toFixed(1) + 'px';
        barPlannedEl.style.opacity = '0.55';
      }
      if (tipUrgentEl) {
        tipUrgentEl.style.left = leftPct;
        tipUrgentEl.style.bottom = (hu / 2).toFixed(1) + 'px';
        tipUrgentEl.textContent = String(urgentVals[i]);
        tipUrgentEl.style.opacity = '1';
      }
      if (tipPlannedEl) {
        tipPlannedEl.style.left = leftPct;
        tipPlannedEl.style.bottom = (hu + hp / 2).toFixed(1) + 'px';
        tipPlannedEl.textContent = String(plannedVals[i]);
        tipPlannedEl.style.opacity = '1';
      }
    });
    span.addEventListener('mouseleave', hide);

    span.addEventListener('click', () => {
      if (yearly) {
        const yearPill = [...document.querySelectorAll('.year-filter .ypill:not(.ypill-all)')]
          .find(p => p.textContent.trim() === span.textContent.trim());
        if (yearPill) yearPill.click();
        return;
      }
      if (activeMonth === 'all') {
        const monthNum = Number(span.textContent);
        const monthPill = document.querySelector(`.ypill-month[data-month="${monthNum}"]`);
        const monthFilterEl = document.querySelector('.month-filter');
        if (monthPill && monthFilterEl) {
          monthFilterEl.dataset.targetYear = activeYear;
          monthPill.click();
        }
        return;
      }
      if (onDayClick) onDayClick(Number(span.textContent));
    });
  });
}

// updateWaveCard({svg, xlabelsEl, barUrgentEl, barPlannedEl, tipUrgentEl,
// tipPlannedEl, rows, activeKpi, activeYear, activeMonth, onDayClick}) — з
// рядків тренду (усі 6 показників × ургентні/планові) дістає значення
// обраного показника, малює обидві лінії й підписи знизу + вішає на них
// наведення/клік. Викликається сторінкою (entry.js/head-cabinet.js) після
// кожного фетчу /api/lpz-trend-*-kpi і після кожного кліку на КПІ-плитку
// (з уже закешованих rows, без повторного запиту).
function updateWaveCard({ svg, xlabelsEl, barUrgentEl, barPlannedEl, tipUrgentEl, tipPlannedEl, rows, activeKpi, activeYear, activeMonth, onDayClick }) {
  if (!svg) return;
  if (!rows || !rows.length) {
    // Порожній результат (напр. немає госпіталізацій за обраний рік) —
    // очистити лінії/підписи, інакше лишається хвиля з ПОПЕРЕДНЬОГО вибору
    // року/місяця (стара, вже нерелевантна картинка) — той самий принцип,
    // що utils.js:loadKpiChartBlock робить для звичайної гістограми.
    svg.querySelectorAll('.wave-line-urgent, .wave-line-planned, .wave-area-urgent, .wave-area-planned')
      .forEach(el => el.removeAttribute('d'));
    if (xlabelsEl) xlabelsEl.innerHTML = '';
    [barUrgentEl, barPlannedEl, tipUrgentEl, tipPlannedEl].forEach(el => { if (el) el.style.opacity = '0'; });
    return;
  }
  const urgentVals = rows.map(r => Number(r[activeKpi + '_urgent']) || 0);
  const plannedVals = rows.map(r => Number(r[activeKpi + '_planned']) || 0);
  // Підпис знизу — номер періоду (bar-chart.js:xLabel — той самий формат:
  // "голе" число для років, з нулем спереду для місяців/днів).
  const yearly = Number(rows[0].x) >= 1000;
  const xLabels = rows.map(r => yearly ? String(r.x) : String(Number(r.x)).padStart(2, '0'));
  renderWaveLines(svg, urgentVals, plannedVals);
  if (xlabelsEl) {
    xlabelsEl.innerHTML = xLabels.map(l => `<span>${l}</span>`).join('');
    wireWaveDateLabels({ xlabelsEl, urgentVals, plannedVals, barUrgentEl, barPlannedEl, tipUrgentEl, tipPlannedEl, yearly, activeYear, activeMonth, onDayClick });
  }
}

// wireWaveKpiClicks(blockEl, onSelect) — клік на будь-яку з 6 КПІ-плиток
// блоку викликає onSelect(dk) (data-dk з КПІ_6: hosp/pat/bed/age/imp/let) і
// підсвічує обрану плитку (.active). initialKpi — яка плитка активна одразу
// (звичайно 'hosp', перша). Додає .wave-kpi-row (layout.css) — курсор і
// підсвітка активної плитки лише для блоків із підключеною хвилею.
function wireWaveKpiClicks(blockEl, initialKpi, onSelect) {
  if (!blockEl) return;
  blockEl.classList.add('wave-kpi-row');
  const tiles = [...blockEl.querySelectorAll('.kpi')];
  tiles.forEach(tile => {
    const dk = tile.querySelector('.kpi-num')?.dataset.dk;
    if (!dk) return;
    tile.classList.toggle('active', dk === initialKpi);
    tile.addEventListener('click', () => {
      tiles.forEach(t => t.classList.toggle('active', t === tile));
      onSelect(dk);
    });
  });
}
