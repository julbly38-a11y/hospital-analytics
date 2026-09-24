# Handoff — 2026-07-18: raw JSON → lpz_raw_* (обидві лікарні), фікс dept-expand, поля розмітки

Продовження сесії з README_HANDOFF_2026-07-17-3.md. Ця сесія — робота ПІСЛЯ того файлу, **нічого не закомічено й не запушено**. За тим самим принципом, що й попередній хендофф, цей файл НЕ завантажується в Google Drive автоматично (лише якщо попросиш).

## Як запустити

```
cd ~/hospital-analytics-qwerty
npm run dev   # порт 3000
```

## Що зроблено

### 1. Universal raw JSON → lpz_raw_* — ГОТОВО, дані залиті для ОБОХ лікарень

Нові скрипти в `scripts/`:
- **`flatten_json.py`** — universal-розгортач будь-якого helsi JSON у пласку структуру. Рекурсивно до найглибших значень, масиви по індексу. `safe_column_name()` — SQL-безпечні імена колонок (≤63 символи, acronym-aware camelCase→snake_case, захист від зарезервованих слів). `build_column_map()` — глобальна дедуплікація колізій (при спільних довгих префіксах truncate сам по собі колізив, тепер хеш-суфікс лише для тих, що реально зіткнулись).
- **`load_json_raw.py`** — generic: 1 файл → 1 таблиця `lpz_raw_<тип>`. Функція `load_generic()`, є CLI (`--org-edrpou`, `--dry-run`, `--limit`).
- **`load_resources_raw.py`** — СПЕЦІАЛІЗОВАНИЙ для `raw_bundle.json` (resources = медперсонал). НЕ generic, бо `specialityWithServiceDescription[].searchTagsSpeciality`/`.serviceDescription` — це спільний довідник по спеціальності (побайтово однаковий у різних лікарів), не дані конкретного лікаря. 3 таблиці: `lpz_raw_resources` (компактно) + `lpz_dict_speciality_search_tags` + `lpz_dict_speciality_services` (upsert, `Prefer: resolution=merge-duplicates`).
- **`load_all_raw.py`** — диспетчер, сам визначає обробник по імені файлу.
- **`helsi_extract*.js`** (6 файлів) — консольні екстрактори з helsi.pro, перенесені сюди з `~/Documents/LSMD/scripts/` (разом з `helsi_normalize.py`, `import_hospitalizations_to_lpz.py`, `helsi_extract_bookmarklet.html`).

**Залиті дані (2026-07-17/18 знятки, обидві лікарні):**

| Таблиця | ЛШМД (43342788) | Хотин (02005875) |
|---|---|---|
| `lpz_raw_hospitalizations_closed` | 2993 | 5833 |
| `lpz_raw_hospitalizations_open` | 814 | 1709 |
| `lpz_raw_episodes` | 6233 | 50010 |
| `lpz_raw_resources` | 740 | 353 |
| `lpz_dict_speciality_search_tags` | 454 (спільна) | |
| `lpz_dict_speciality_services` | 507 (спільна) | |

**Знайдені й виправлені баги:**
1. PostgREST bulk-insert вимагає ОДНАКОВИЙ набір ключів у кожному об'єкті батчу (`PGRST102`). Різні госпіталізації мають різні набори заповнених полів → `load_generic()` тепер доповнює кожен рядок повним `dict.fromkeys(sql_columns)` перед заповненням.
2. Довідникові таблиці (search_tags/services) не мали upsert — при повторному запуску (Хотин після ЛШМД) конфлікт унікального ключа. Виправлено `post_batches(..., upsert=True)`.
3. RLS була вимкнена на двох нових довідникових таблицях (Supabase-адвайзер попередив) — увімкнено з тим самим патерном `lpz_read_all` (SELECT anon+authenticated), що й на решті довідників.
4. Схема дрейфує між лікарнями — Хотин мав +24 нових колонки для closed і +60 для open (icd10/icpc2 некод-Am поля, `paper_referral_*`, кілька діагнозів одразу). `--dry-run` показує точний `ALTER TABLE`.

**`ec_severity_merge.json` — підтверджено НЕ потребує окремої таблиці**, уже домерджено напряму в канон (`import_hospitalizations_to_lpz.py`, див. попередній хендофф).

Повні деталі й код прикладів — пам'ять `project_lpz_raw_json_loader.md`.

### 2. Фікс dept-expand на entry.html (картка розгортання відділення)

**Проблема:** JS (`openDeptExpand`/`closeAllDeptExpands`/`wireDeptExpand`, з попередньої сесії) був готовий, але CSS для `.dept-expand`/`.de-*` не було зовсім — картка рендерилась голим текстом і наїжджала на смугу "Чергові лікарі".

**Зроблено:**
- Додано CSS для `.dept-expand`/`.de-head`/`.de-label`/`.de-chief`/`.de-stats`/`.de-s`/`.de-v`/`.de-l` у `layout.css` — під колірні змінні сайту, не скопійовані сліпо зі старого `kabinet.html`.
- **Замінено push-механізм** зі старого (два жорсткі класи `expand-pushed`/`expand-pushed-up`, магічні константи `push - 52px`/`push - 32px`, які працювали лише для flow-верстки старого проекту) на **динамічний розрахунок реального перекриття** — нова функція `repositionMiddleBand()` в `entry.js`: вимірює справжню нижню межу списку відділень (`offsetTop`/`scrollHeight`, не залежить від `transform:scale` на `.slide-wrapper`) і зсуває смугу "Чергові лікарі" рівно настільки, щоб не перекрити; якщо через це смуга сама наїжджає на нижній список — той теж зсувається на ту саму відстань (каскадний зсув, зберігає зазор).
- CSS: `body.expand-pushed*` класи замінено на CSS-змінні `--band-shift`/`--list2-shift`.

**Перевірено** синтетичним DOM-тестом усередині `.slide-wrapper` (щоб врахувати той самий scale, що на реальній сторінці) — картка, смуга, нижній список без жодного накладання. **Реальні дані (логін) не перевірені** — сесія в Browser pane неавторизована, потрібна перевірка користувачем.

### 3. Поля розмітки (`.layout-field`) — 4 орієнтовні зони

На прохання користувача — 4 розмиті (radial-gradient, без чіткої рамки) плями-орієнтири для майбутнього контенту, утворені вертикальною лінією (`.vline`, x=585), горизонтальною (`.hline`, y=211) і смугою "Чергові лікарі" (`.work-band`, y=521-571): ліва/права × над смугою/під смугою.

Розмір — GAP=20px з усіх боків від відповідних ліній (не від чужих координат dept-list, як у першій версії):
- над смугою: y `231` (hline+20) до `501` (band_top-20), висота 270
- під смугою: y `591` (band_bottom+20) до `1060` (1080-20), висота 469
- ліва: x `20` до `565` (vline-20), ширина 545
- права: x `605` (vline+20) до `1900` (1920-20), ширина 1295

`pointer-events:none`, `z-index:0` — ніколи не заважає реальному контенту. Функція `renderLayoutFields(root)` в `entry.js`, викликається в `renderGeneralLayer` перед `renderDirectionBlocks`.

## Не зроблено / відкриті задачі

- **`renderDirectionBlocks` (КПІ по напрямках + графіки, права частина, x=690-1866) не показується на реальній сторінці**, хоча код виглядає коректним (структура рендериться безумовно, `loadDirectionBlocks` викликається асинхронно через `onYearChange` в `renderHeaderBlock`). Причина не знайдена — потрібен доступ до консолі браузера в реальній залогіненій сесії користувача (Elements/Console на entry.html). Користувач свідомо відклав ("забути, спочатку додати поля-заглушки").
- **`calendar.json`** — ще не має raw-таблиці; events-масив дає 3040 sparse-колонок при generic-підході, потрібен аналогічний до resources розбір в окремі таблиці.
- **Фікс dept-expand не перевірено на реальних даних** (лише синтетичний тест) — попросити користувача клікнути кілька відділень (особливо кінець верхнього/початок нижнього списку).
- **6 плейсхолдер-завідувачів Хотина** — не стосується цього треку, див. `project_department_heads_gap.md`.
- **git commit/push** — нічого з цієї сесії не закомічено.

## Файли, змінені в цій сесії (не закомічені)

Нові: `scripts/flatten_json.py`, `scripts/load_json_raw.py`, `scripts/load_resources_raw.py`, `scripts/load_all_raw.py` + 6 перенесених `helsi_extract*.js` + 3 перенесені файли (`helsi_normalize.py`, `import_hospitalizations_to_lpz.py`, `helsi_extract_bookmarklet.html`).

Змінені: `public/shared/layout.css` (dept-expand, dynamic push, layout-field), `public/js/entry.js` (repositionMiddleBand, renderLayoutFields).

Пов'язана пам'ять: `project_lpz_raw_json_loader.md`, `project_entry_html_dev.md`.
