# Handoff — 2026-07-13: shell-шар (layout.html) підключений до реальних KPI

Робота велась у **окремому worktree** `~/hospital-analytics-qwerty`, гілка `qwerty-project-connection-e6mjy9`, репо [[hospital-analytics]]. Основне робоче дерево `~/hospital-analytics` (гілка `main`) не чіпалось.

## Як запустити

```bash
cd ~/hospital-analytics-qwerty
npm install   # якщо ще не робили
npm run dev -- -p 3001
```

Відкрити: **http://localhost:3001/layout.html**

Конфіг прев'ю-сервера — `~/.claude/launch.json`, запис `"qwerty-dev"` (порт 3001, окремо від основного `next-dev` на 3000).

**Важливо:** `.env.local` і `public/data/*.json` (довідники) — гітігноровані, `git worktree add` їх не копіює. Уже скопійовано вручну з `~/hospital-analytics`. Якщо worktree перестворюється заново — скопіювати ще раз.

## Правило: shell-шар лише на layout.html

`page-shell.js` / `layout-config.js` / `utils.js` / `staff-login.js` підключені **тільки** до `public/layout.html` (колишня `khotyn_slide.html`, перейменована). Інші 3 сторінки — `doctor-cabinet.html`, `head-cabinet.html`, `kabinet.html` — навмисно лишаються порожньою базою (коміт `f6891d3`), shell до них **не** підключати без явного дозволу користувача.

## Що зроблено в цій сесії

1. **Перейменування:** `public/khotyn_slide.html` → `public/layout.html` (git mv), оновлені всі посилання: `next.config.js` (redirect з `/`), `middleware.js` (публічні шляхи), `pages/admin-hospitals.js`, `pages/api/slide-login.js`, `pages/api/hospital-info.js`.

2. **Анімації відтворені з оригіналу** (main repo `khotyn_slide.html`) у `public/shared/layout.css`:
   - `wbtitlepulse` — пульс "Для працівників:", зупиняється по кліку (`.no-pulse`, логіка в `utils.js:initStaffFields`)
   - `logopulse` + `fadein` — легкий пульс логотипу + плавна поява при завантаженні

3. **Dev-перемикач лікарень** — прямо в `layout.html` (`#devOrgSwitch`, `position:fixed`, лівий верхній кут). Список поки захардкоджений (2 лікарні), без логіну (сторінка публічна за задумом). Постійний адмін-інструмент `/admin-hospitals` теж є в коді, але вимагає логіну власника.

4. **Дві лікарні в `lpz.lpz_organizations`:**
   - Хотинська багатопрофільна лікарня — `edrpou = '02005875'`
   - ЛШМД (Чернівецька лікарня швидкої медичної допомоги) — `edrpou = '43342788'`, `display_name` скорочено до `"ЛІКАРНЯ ШВИДКОЇ МЕД.ДОПОМОГИ"` (3 слова → 3 рядки, бо `initHospitalName()` розбиває назву по пробілах на рядки, а `.name-block` розрахований на 3 рядки)

5. **KPI-блок — гнучкий, не хардкод на 5 пунктів.** Масив `window.LAYOUT_CONFIG.kpi` у `layout-config.js`, рендер через `config.kpi.map()` у `page-shell.js`, CSS (`.kpi-row{display:flex}`) сам розподіляє простір — перевірено з 6 пунктами, працює.

6. **Реальні дані KPI підключені:**
   - Нова SQL-функція `lpz.lpz_kpi_summary(p_org text, p_year text)` (RPC, рахує на боці Postgres — уникає обрізання PostgREST на 1000 рядків при агрегації в JS)
   - Новий ендпоінт `pages/api/lpz-kpi.js` (публічний, org-scoped, без ПІБ, як і `/api/hospital-info`)
   - `page-shell.js`: `fetchShellKpi()` / `applyShellKpi()` / `loadShellKpi()` — підвантажують і форматують (цілі через `countUp`+роздільник тисяч, `bed`/`age` — 1 знак після коми, `let` — відсоток 2 знаки)
   - Клік по пігулці року → перезапит з тим роком

7. **Дефолтний рік при завантаженні = рік ОСТАННЬОЇ госпіталізації** в даних (не "ВСІ РОКИ"). RPC повертає `max_admission_date`, JS бере з нього рік і одразу вмикає відповідну пігулку.

8. **TODO залишено в коді** (`page-shell.js`, біля логіки дефолтного року): коли з'являться фільтри по місяцях/тижнях/добах — принцип "дефолт = останній наявний період" треба поширити на кожен новий рівень деталізації, не лише рік. `max_admission_date` вже містить повну дату, зараз береться лише `.slice(0,4)`.

## Стан даних (для довідки, org-scoped, `lpz.lpz_hospitalizations`)

| Лікарня | edrpou | hosp | pat | bed (сер.) | age (сер.) | let (%) |
|---|---|---|---|---|---|---|
| Хотинська, всі роки | 02005875 | 7 203 | 5 431 | 8.2 | 46.0 | 0.00% |
| ЛШМД, всі роки | 43342788 | 3 211 | 3 038 | 10.4 | 47.9 | 0.78% |

Обидві лікарні мають дані з останньою госпіталізацією у **2026** році.

## Не зроблено / не закомічено

- Жодні зміни **не закомічені й не запушені** (за правилом — комітити тільки за явним проханням).
- Дані KPI (числа) для решти 3 сторінок (doctor-cabinet, head-cabinet, kabinet) — не підключені, вони й далі порожня база.
- Список лікарень у dev-перемикачі — захардкоджений, додавання нової лікарні = дописати `<option>` в `layout.html`.

## Змінені/нові файли (git status)

```
 M middleware.js
 M next.config.js
 M pages/admin-hospitals.js
 M pages/api/hospital-info.js
 M pages/api/slide-login.js
 M public/js/page-shell.js
 M public/js/utils.js
RM public/khotyn_slide.html -> public/layout.html
 M public/shared/layout.css
?? pages/api/lpz-kpi.js
```
