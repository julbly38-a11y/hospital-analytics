# Handoff — 2026-07-19 (сесія 2): система полів розмітки, ієрархія КПІ, пігулки місяців

Продовження `README_HANDOFF_2026-07-19.md` (та сесія була про базу даних — закриття 7-денного лагу, `helsi_record_id`, синхронізація `lpz_empl`). Ця сесія — виключно **фронтенд** (`entry.html`/`head-cabinet.html`/`doctor-cabinet.html`), **нічого не закомічено й не запушено**.

## Як запустити

```
cd ~/hospital-analytics-qwerty
npm run dev   # порт 3000 (або 3001 через .claude/launch.json qwerty-dev)
```

## Головне: система "полів розмітки" з єдиним відступом

Канва 1920×1080 має 4 постійні зони (`.lf-left-top`/`.lf-left-bottom`/`.lf-right-top`/`.lf-right-bottom`, координати — `BASE_LAYOUT_FIELDS` в `utils.js`). Раніше контент (КПІ/графік/census/ПІБ/списки відділень) був окремими sibling-елементами з координатами, які треба було вручну підганяти під кожне поле — звідси й повторювані баги (census-list налазив на field-me, зміна одного числа не синхронізувалась з іншим).

**Тепер:**
- `:root { --field-pad: 22px; }` (`layout.css`) — єдиний відступ від краю поля для БУДЬ-ЯКОГО об'єкта всередині. Міняти — лише тут.
- Контент — **справжні DOM-нащадки** конкретного поля (`root.querySelector('.lf-right-top')` тощо), не sibling'и кореня канви.
- **ВАЖЛИВО (з'ясовано боляче):** `padding` на `position:absolute`-батьку НЕ обмежує абсолютно позиційованих дітей (їхній containing block — padding-box, зовнішня межа padding). Тому кожен об'єкт явно читає `var(--field-pad)` у власних `top/left/right`, а не покладається на успадкування.
- `filter: blur(24px)` **тимчасово прибрано** з `.layout-field` (він розмив би вкладені діти) — м'який фон треба повернути іншим способом (напр. `::before` без дітей). Ще не зроблено.
- `fitHeightTo()` перероблено — тепер рахує через нову `offsetInSlide()` (сумує зсув по всьому ланцюжку `offsetParent`, не лише найближчого), бо елементи в різних полях мають різних `offsetParent`. Перенесено з `entry.js` (де раніше жила локально) в спільний `utils.js`.

**Повна документація з прикладами коду:** [`docs/LAYOUT_FIELDS.md`](docs/LAYOUT_FIELDS.md) — читати перед будь-якою новою версткою на цих трьох сторінках.

Мігровано на цю систему: `renderKpiChartBlock`/`renderCensusSection`/`renderFieldMe` (`utils.js`), `renderDirectionBlocks`/`renderClinicalBlock`/`fitDeptListHeights` (`entry.js`), `renderStaffAndCensus` (`head-cabinet.js`). **Виняток:** `.docs-list` ("Ординаторська" на head-cabinet.html) навмисно лишається одним суцільним списком до `.work-band`, ігноруючи межу `lf-left-top`/`lf-left-bottom` — так було задумано раніше, не "виправляти" на два списки без прямого запиту.

## Ієрархія шрифтів і відступів КПІ

Реальна ієрархія: **напрямок (entry.html) → відділення (head-cabinet.html) → лікар (doctor-cabinet.html)**, кожен рівень −5% від попереднього (і шрифт, і відступ від краю поля):

| Рівень | Клас | Шрифт числа/підпису | Відступ від краю поля |
|---|---|---|---|
| Загальнолікарняний | — (голий `.kpi-row`) | 32.5px / 16.2px | — |
| Напрямок | `.kpi-lvl-direction` | 30.875px / 15.39px | 22px (база) |
| Відділення | `.kpi-lvl-department` | 29.33px / 14.62px | 20.9px |
| Лікар | `.kpi-lvl-doctor` | 27.86px / 13.89px | 19.855px |

`renderKpiChartBlock(root, rowId, chartId, level)` отримав новий параметр `level` (`'department'`/`'doctor'`) — стає класом `.kpi-lvl-${level}`. `renderDirectionBlocks` (entry.js) хардкодить `.kpi-lvl-direction` для обох блоків (Терапевтичний/Хірургічний — паралельні гілки одного рівня). Деталі й формули — теж у `docs/LAYOUT_FIELDS.md`.

## Пігулки місяців

Під роками (`.year-filter`), з'являються при **наведенні** на будь-яку пігулку року (крім "ВСІ РОКИ" — місяць без року не має сенсу), ховаються з затримкою ~200мс при виході курсора або одразу по кліку на місяць. Повні назви (СІЧЕНЬ...ГРУДЕНЬ), той самий клас `.ypill` що роки (не менший/скорочений варіант). Клік на місяць одночасно активує сам рік (бейдж/КПІ/`onYearChange`) і ховає рядок місяців.

**Лише на авторизованих сторінках** — `renderHeaderBlock()` отримав параметр `authorized` (5-й) і `onMonthChange` (6-й, опційний колбек `(year, month)`, поки жодна сторінка не використовує — дані по місяцях ще не підключені, це підготовлений хук). `entry.js`/`head-cabinet.js`/`doctor-cabinet.js` передають `authorized=true`; `page-shell.js` (неавторизована `layout.html`) не передає — пігулки місяців **відсутні в DOM узагалі**, не просто приховані CSS.

## Побічний баг, знайдений і виправлений по дорозі

Базовий клас `.kpi-row` мав власний хардкоджений `width:980px` (для загальнолікарняного рядка, 5 колонок) — коли `.field-kpi-1`/`.field-kpi-2` (6 колонок) успадкували цей самий клас, `width` "просвічував" крізь нову позицію (`left:var(--field-pad); right:var(--field-pad)`) і стискав рядок. CSS-специфіка: коли `left`+`right`+`width` всі задані — `width` перемагає, `right` ігнорується. Виправлено явним `width:auto; height:auto` в `.field-kpi-1, .field-kpi-2`.

## Файли, змінені цією сесією (додатково до session 1, не закомічені)

**Нові:** `docs/LAYOUT_FIELDS.md`.

**Змінені:** `public/shared/layout.css` (--field-pad, .layout-field без blur, .field-kpi-1/2 + kpi-lvl-* ієрархія, .census-*/.field-me/.dept-list/.docs-list на var(--field-pad), .month-filter/.ypill-month), `public/js/utils.js` (offsetInSlide перенесено сюди, fitHeightTo переписано, renderKpiChartBlock/renderCensusSection/renderFieldMe вставляють у конкретне поле, renderHeaderBlock + authorized/onMonthChange + пігулки місяців, MONTH_PILL_NAMES), `public/js/entry.js` (dept-list/dept-list2 у поля, offsetInSlide прибрано локально, renderHeaderBlock(...,true)), `public/js/head-cabinet.js` (docs-list у lf-left-top, renderKpiChartBlock/renderHeaderBlock з новими параметрами), `public/js/doctor-cabinet.js` (те саме), `public/shared/head-cabinet.css` (docs-title/docs-list на var(--field-pad)).

**git:** нічого не закомічено й не запушено.

Пов'язано: `docs/LAYOUT_FIELDS.md` (детальний технічний довідник), `README_HANDOFF_2026-07-19.md` (session 1, база даних).
