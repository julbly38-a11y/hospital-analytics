# Handoff 2026-09-24 — автоматизація helsi-циклу, чистка проєкту, безпека, автодеплой

Проєкт: `hospital-analytics-qwerty` (гілка `qwerty-project-connection-e6mjy9`, Supabase `nobodyjul` = `ubjnztanehqlsrqphdqy`, прод `https://nobodyjul.vercel.app`). Старий проєкт `hospital-analytics` / `nobodybly.org` (база LSMD) — окремий, **не чіпати**.

## 1. Щоденний цикл helsi → lpz (ЛШМД, org `43342788`)

| Коли | Команда | Що робить |
|---|---|---|
| Ранок | `python3 scripts/helsi_sync.py` | helsi → сирі JSON → `lpz_raw_*` → канон (`lpz_hospitalizations`, `lpz_episodes`, `lpz_patients`, результат лікування) → перевірки |
| Вечір | `python3 scripts/helsi_evening.py` | helsi → знімок якості `lpz_case_quality_snapshot` + журнал змін лікарів `hints.__track` → звіт активності |

Обидва: `--dry-run` (нічого не пишуть у БД), `--transport auto|applescript|cdp|manual|claude`. Вечірній додатково `--closed-since YYYY-MM-DD` (закриті епізоди з цієї дати; за замовч. — 1-ше число попереднього місяця) і `--concurrency N`.

Умови: активна сесія helsi під ЛШМД (логін робить користувач, скрипти пароль не вводять); для вечірнього — запущений `npm run dev` (порт 3000; ingest-ендпоінт `local-quality-ingest` працює лише в dev). Журнали: `~/Documents/LSMD/logs/`. Код виходу 0 = усе ок, 2 = є застереження.

### Транспорти (як скрипт керує браузером)
- **cdp** (за замовчуванням, якщо AppleScript вимкнено): скрипт сам запускає ОКРЕМИЙ Chrome з профілем `~/Library/Application Support/helsi-sync-chrome` (порт налагодження 9333) і керує ним напряму. Вхід у helsi робиться один раз у його вікні, далі — одна команда без консолі. Дані забираються з вкладки через CDP (WebSocket на stdlib), а не запитами зі сторінки на localhost. Основний Chrome не чіпається.
- **applescript**: керує основним Chrome; потребує Chrome → Перегляд → Для розробників → «Дозволити JavaScript від подій Apple».
- **manual**: JS у буфер обміну, вставити в консоль helsi.pro.
- **claude**: Claude відкриває вкладку у своїй сесії Chrome.
- `auto` = applescript (якщо дозволено) → cdp → manual.

Перед відкриттям скрипт перевіряє: чи вже працює окремий Chrome, чи є вкладка helsi, чи активна сесія (якщо так — нічого не перезавантажує). Якщо сесія не активна (401) — перезавантажує сторінку helsi й виводить вікно входу вперед. При обриві сесії посеред вечірнього прогону (cdp/applescript) — відновлює сам, уже зібрані епізоди не перезапитує.

### Захист у скриптах
- працюють лише з БД qwerty (`ubjnztanehqlsrqphdqy`) і лише з org `43342788`;
- ранковий: нові файли валідуються (кількість ≥ 90% від попереднього знімку) і лише потім замінюють старі; попередні копіюються в `~/Documents/LSMD/raw/lsmd/_prev_<дата>` (лишається 3 останні);
- SQL-кроки виконуються у транзакції: спершу пробно (ROLLBACK), потім COMMIT;
- у вечірньому епізоди без відділення в самому helsi (`None`) — інформаційне повідомлення, а не збій.

### Файли
`scripts/helsi_sync.py`, `scripts/helsi_sync_extract.js`, `scripts/helsi_evening.py`, `scripts/helsi_quality_daily.js` (`ingestUrl: null` — не слати зі сторінки), `scripts/sql/raw_to_canon_*.sql`. Skills (локально, `.claude/`, у git не потрапляють): `helsi-sync-lshmd`, `helsi-evening-activity`.

## 2. Дані ЛШМД: що прибрано з канону (з копіями в `lpz_archive`)

- **Квітень–травень 2026** (артефакт запуску «Стаціонару»: картки висіли відкритими ~90 діб): 2645 госпіталізацій + 615 діагнозів, 625 контролів якості, 752 епізодні факти, 445 звʼязків із лікарями. Копії: `lpz_archive.*_lshmd_2026_04_05`. **У `raw_to_canon_hospitalizations.sql` додано виключення** (`WHERE NOT (org=43342788 AND start_ у квітні–травні 2026 за Kyiv)`), тож перепрогін їх не повертає. Хотин і Онкоцентр не чіпались.
- **Незакриті записи зі старої бази** (legacy: `helsi_record_id IS NULL`, `id_case >= 900000000`, без дати виписки) — 26 шт. + 8 закритих дублікатів з helsi-двійником (той самий пацієнт і дата). Копії: `lpz_archive.hospitalizations_manual_2026_09_24`, `lpz_archive.hospitalization_diagnoses_manual_2026_09_24`. Справжні helsi-записи цих пацієнтів лишились. Незакритих legacy у каноні — 0. Ще 65 закритих legacy-записів (з червня–липня) без helsi-двійника — єдині копії, не чіпали.
- Схема `lpz_archive` закрита (RLS, без доступу `anon`/`authenticated`).
- Повернути запис: `INSERT INTO lpz.lpz_hospitalizations SELECT * FROM lpz_archive.<таблиця> WHERE id_case IN (...);` (перевірити колізії ключів).

## 3. Чистка коду (у git; копії — поза репо)

Старий React-дашборд і все, що на нього трималось, перенесено в `~/Documents/hospital-analytics-archive-2026-09-24/` (зі збереженням шляхів, є `MANIFEST.txt`): сторінки `cabinet, admit, org, dept, analytics, glow, import, charts, doctors, index, index.dashboard, title-test`, API `admit, cabinet, ask, icu, hier-stats, import-*`, `lib/{query-router,sql-guard,dept-icons,import-*}`, `components/*`, старі стилі/ассети, залежності `@anthropic-ai/sdk`, `recharts`, `xlsx`. **Лишилось** (потрібне новим кабінетам): `/api/stats`, `/api/stats-batch` (їх викликає `public/js/utils.js`), `admin-status/hospitals/episode-facts`, `admin-users`, `helsi-import-*`, `login`, `auth/reset-password`, `components/shared.js`. `pages/README.md` застарів (описує архівні сторінки). Handoff-файли перенесені в `docs/handoff/`.

## 4. Безпека

Зроблено: Next 14.2.0 → 14.2.35 (закрито обхід авторизації middleware; збірку й `next start` перевірено); `/title-test` прибрано; `/api/helsi-import-status` лише для admin; dev-перемикач лікарень у `layout.html` показується лише на localhost; `xlsx` (вразливість без фіксу) видалено.

Відкрито:
- **Спільний початковий пароль тестових акаунтів персоналу ЛШМД** (763 акаунти) записаний у попередніх handoff-файлах і в коментарі `pages/api/me.js` — змінити паролі й прибрати з документів.
- `npm audit`: 3 вразливості (1 critical, 2 high) — 14.2.35 остання в гілці 14, решта фіксів лише в Next 15.5.24+/16. Більшість неприкладна (Vercel, Pages Router, `next/image` не використовується). Ідея: `images.unoptimized: true` в `next.config.js`.
- Supabase (профілактика, витоку зараз немає): 6 матвʼюх з ПІБ (`*_mv`) доступні `anon`, але не наповнені; 6 `SECURITY DEFINER`-вʼюх; вимкнений leaked-password protection. Нічний cron `refresh_all_mviews()` **падає щоночі** («CONCURRENTLY … not populated», з 22.09).
- Швидкодія: зайвий `getUser()` у middleware на кожен запит; жодного `Cache-Control` в API; `utils.js` 88 КБ без `defer`.

## 5. Деплой

У Vercel-проєкті `nobodyjul` (Settings → Environments → Production → Branch Tracking) **гілка продакшну = `qwerty-project-connection-e6mjy9`**. Кожен пуш у цю гілку автоматично викладається в продакшн (`nobodyjul.vercel.app`); інші гілки → прев'ю. Ланцюжок: коміт → пуш → прод. Пуш без нового коміту не відправляє нічого; для перевірки — `git commit --allow-empty`. Відкат: `vercel rollback` або попередній деплой у дашборді (напр. `nobodyjul-amf8qv865`, до 24.09).

**Не зливати нашу гілку в `main`:** `main` — старий проєкт (`nobodybly.org`, база LSMD), окремий проєкт у Vercel; злиття зламає старий сайт.

## 6. Відомі граблі

- Не запускати ранковий і вечірній скрипти одночасно й не запускати два вечірніх паралельно — вони використовують одне вікно Chrome (стан `window.__qd` скидається).
- Після оновлення Next перезапускати `npm run dev`.
- Для вечірнього скрипта dev-сервер обовʼязковий; ранковий його не потребує.
- Якщо окремий Chrome скрипта відкритий без порту налагодження — скрипт зупиниться з підказкою закрити його повністю (`⌘Q`).
- Вузьке вивантаження для щоденного вечірнього: `--closed-since <дата 3–7 днів тому>`; повний прогін — раз на тиждень.

## 7. Наступні кроки

Ранок 25.09: `python3 scripts/helsi_sync.py --dry-run`, потім без `--dry-run` (ранковий скрипт у режимі cdp ще не запускався в реальності, лише вечірній). Далі за пріоритетом: пароль акаунтів → `images.unoptimized` → швидкодія (middleware, Cache-Control, defer) → профілактика Supabase → полагодити нічний cron.
