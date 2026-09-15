# Поля розмітки (`.layout-field`) — як міняти й куди додавати новий об'єкт

Стосується `entry.html`, `head-cabinet.html`, `doctor-cabinet.html` (будь-яка сторінка з `#slideRoot`, що підключає `public/js/utils.js`).

## Що це

Канва 1920×1080 має 4 постійні зони — "поля розмітки":

| Клас | top | left | width | height |
|---|---|---|---|---|
| `.lf-left-top` | 231 | 20 | 545 | 270 |
| `.lf-left-bottom` | 591 | 20 | 545 | 469 |
| `.lf-right-top` | 231 | 605 | 1295 | 270 |
| `.lf-right-bottom` | 591 | 605 | 1295 | 469 |

Координати задані **в одному місці**: `BASE_LAYOUT_FIELDS` у `public/js/utils.js`. Поля рендеряться автоматично на `DOMContentLoaded` (`renderLayoutFields`) — сторінці нічого викликати самій, досить мати `#slideRoot`.

## Єдиний відступ — `--field-pad`

```css
:root { --field-pad: 22px; }   /* public/shared/layout.css */
```

Хочеш змінити відступ для **всіх** об'єктів одразу (на всіх 3 сторінках, в усіх 4 полях) — міняєш **одне** число тут.

**Важливо:** `padding` на самому `.layout-field` (`position:absolute`) НЕ обмежує абсолютно позиційованих дітей — їхній containing block це padding-box (зовнішня межа padding), а не внутрішня. Тому кожен об'єкт всередині поля **явно** читає `var(--field-pad)` у власних `top/left/right/bottom`, а не покладається на успадкування. Це не "магія" — просто одна змінна, на яку всі посилаються однаково.

## Як додати новий об'єкт у поле

1. **JS** — вставляй не в `root`, а в конкретне поле:
   ```js
   const field = root.querySelector('.lf-left-bottom'); // або будь-яке з 4
   field.insertAdjacentHTML('beforeend', `<div class="my-widget">...</div>`);
   ```
2. **CSS** — позиціонуй відносно поля через `--field-pad`, не хардкодь px:
   ```css
   .my-widget {
     position: absolute;
     top: var(--field-pad); left: var(--field-pad); right: var(--field-pad);
     width: auto; height: auto; /* якщо клас успадковує чужі width/height — скасуй їх явно! */
   }
   ```
   Друга точка всередині того самого поля (напр. графік під КПІ-рядком) — просто додай зсув: `top: calc(var(--field-pad) + 95px)`.

3. **Динамічна висота до якоїсь межі** (списки, що мають рости до сусіднього елемента) — `fitHeightTo(el, offsetInSlide(boundaryEl), gap)`, НЕ `boundaryEl.offsetTop` напряму. `offsetInSlide()` (в `utils.js`) сумує зсув по всьому ланцюжку `offsetParent`, тому працює коректно, навіть якщо `el` і `boundaryEl` вкладені в різні батьківські елементи (напр. `el` усередині `.layout-field`, а `boundaryEl` — ні, як `.work-band`).

## Приклади в коді (готові патерни)

- `renderKpiChartBlock`/`loadKpiChartBlock`, `renderCensusSection`/`loadCensus`, `renderFieldMe` — усі в `utils.js`, усі вставляють у конкретне поле.
- `renderDirectionBlocks`, `renderClinicalBlock`, `fitDeptListHeights` — `entry.js`.
- `renderStaffAndCensus` — `head-cabinet.js`.

## Ієрархія шрифтів КПІ

Реальна ієрархія — **напрямок → відділення → лікар** (+ загальнолікарняний рівень над нею). Кожен рівень — на **5% менший шрифт** за попередній (і число, і підпис):

| Рівень | Сторінка | Клас на `.kpi-row` | `.kpi-num` | `.kpi-label` |
|---|---|---|---|---|
| 1 — загальнолікарняний | усі (верх сторінки, поза полями) | — (голий `.kpi-row`) | 32.5px | 16.2px |
| 2 — напрямок | `entry.html` (`field-kpi-1`/`field-kpi-2`) | `.kpi-lvl-direction` | 30.875px | 15.39px |
| 3 — відділення | `head-cabinet.html` (`field-kpi-1`) | `.kpi-lvl-department` | 29.33px | 14.62px |
| 4 — лікар | `doctor-cabinet.html` (`field-kpi-1`) | `.kpi-lvl-doctor` | 27.86px | 13.89px |

Усі рівні використовують ту саму розмітку (`.kpi`/`.kpi-num`/`.kpi-label`, генерує `kpi6RowHtml()` в `utils.js`) на тому самому CSS-класі `.field-kpi-1`/`.field-kpi-2` незалежно від сторінки — тому розрізнити рівні можна лише додатковим класом `.kpi-lvl-*`, який явно передає викликач:
- `renderKpiChartBlock(root, rowId, chartId, level)` (`utils.js`) — `level` = `'department'` (з `head-cabinet.js`) або `'doctor'` (з `doctor-cabinet.js`), стає `.kpi-lvl-${level}`.
- `renderDirectionBlocks(root)` (`entry.js`) — обидва блоки (Терапевтичний/Хірургічний) хардкодять `.kpi-lvl-direction`, бо це один і той самий рівень ієрархії, просто дві паралельні гілки.

Якщо з'явиться рівень 5 (деталізація нижче лікаря) — рахувати від рівня 4 тим самим множником ×0.95 (27.86×0.95≈26.47px), не від рівня 1.

**Той самий принцип — і для відступу КПІ-рядка від краю поля** (не лише шрифту): рівень "напрямок" на базовому `var(--field-pad)`=22px, далі кожен рівень ×0.95 — "відділення" 20.9px, "лікар" 19.855px. Це стосується ЛИШЕ самого `.field-kpi-1`/`.field-kpi-2` (`top`/`left`/`right`) — усе інше в тому самому полі (графік, census, field-me) і далі на базових 22px, навмисно не залежить від КПІ-ієрархії.

```css
.kpi-lvl-department { top: 20.9px; left: 20.9px; right: 20.9px; }  /* 22 × 0.95 */
.kpi-lvl-doctor { top: 19.855px; left: 19.855px; right: 19.855px; } /* 20.9 × 0.95 */
```

## Відомі винятки

- **`.docs-list` ("Ординаторська" на head-cabinet.html) навмисно ігнорує межу `lf-left-top`/`lf-left-bottom`** — це один суцільний список аж до `.work-band`, а не два окремі списки по полях (на відміну від `entry.html`, де `dept-list`/`dept-list2` таки розбиті по двох полях). Не "виправляти" це на два списки без прямого запиту користувача.
- **М'який розмитий фон (`filter: blur(24px)`) тимчасово прибрано** з `.layout-field` (2026-07-19) — він розмивав би й вкладені діти. Повернути іншим способом (напр. `::before`-псевдоелемент з тим самим `background`+`blur`, розташований під контентом, без дітей) — ще не зроблено.
- Коли поле ділять **два динамічні об'єкти** (напр. `.census-list` і `.field-me` в `lf-right-bottom`) — `--field-pad` дає лише зовнішній відступ, а взаємне "не налазь одне на одне" все одно рахується вручну через `fitHeightTo`. Це нормально, не баг системи.
