# Схема lpz — довідник таблиць

> Supabase project `ubjnztanehqlsrqphdqy` (назва в Supabase — "nobodyjul").
> Заміна старої схеми `lsmd`, описаної в [DATABASE.md](./DATABASE.md).
>
> **Виправлення попередньої версії цього файлу**: тут раніше стверджувалось,
> що окремого проєкту `wnyfrckxhwujsjcfxqou` не існує, і що `lsmd` живе лише
> в схемі `public` проєкту `ubjnztanehqlsrqphdqy`. Це було помилкою — я
> зробив висновок "проєкту не існує" з факту "ця сесія його не бачить у
> списку доступних", а це не одне й те саме. `wnyfrckxhwujsjcfxqou`
> **реально існує** (пряме звернення до нього повертає "permission denied",
> а не "not found" — тобто ця сесія просто не авторизована в ньому). За
> `README_HANDOFF_2026-07-18-2.md` це і є справжній, повний LSMD-проєкт
> (113 381 рядок, відділення заповнені на 100%, статус виписки — на 97%);
> копія `lsmd` в `public`-схемі `ubjnztanehqlsrqphdqy` (яку я досліджував і
> описував нижче) — **неповна/застаріла копія** (за тим самим хендоффом —
> 10 497 госпіталізацій без відділень). Тобто структура таблиць/RPC у lpz,
> описана нижче, актуальна, але якщо потрібні саме точні числа зі старої
> lsmd-бази — джерело правди `wnyfrckxhwujsjcfxqou`, не `ubjnztanehqlsrqphdqy.public`.
>
> Замість зіставлення відділень/лікарів по назві (ризик синонімів), `lpz`
> матчить по `structureId`/`resourceId` з helsi.pro.
>
> 39 таблиць, org_edrpou-мультитенантні — дві лікарні:
> - `02005875` — Хотинська багатопрофільна лікарня
> - `43342788` — ЛШМД (Чернівецька лікарня швидкої медичної допомоги)
>
> Джерело фактів: жива схема Supabase (колонки/FK/RLS/RPC) + код репозиторію
> (`scripts/import_hospitalizations_to_lpz.py`, `scripts/load_json_raw.py`,
> `database/migrations-lpz/*.sql`, `pages/api/lpz-*.js`) +
> `README_HANDOFF_2026-07-*.md`.

## Потік даних, покроково

1. **Екстракція** — окремий скрипт (`helsi_extract*.js`) витягує JSON-дампи з
   helsi.pro: госпіталізації (відкриті/закриті), епізоди, персонал
   (`raw_bundle.json`) — за кожну лікарню окремо.
2. **Сире завантаження в `lpz_raw_*`** — `scripts/load_json_raw.py` перетворює
   кожне листове поле JSON в окрему `text`-колонку, нічого не спрощуючи. Назва
   таблиці визначається з імені файлу без року в кінці — `hospitalizations_
   closed_2024.json` і `_2026.json` обидва йдуть у `lpz_raw_hospitalizations_
   closed`. Повторний запуск з тим самим файлом — `DELETE` по `(org_edrpou,
   source_file)`, потім `INSERT`: заміна, не дублювання. Персонал іде окремим
   спеціалізованим `scripts/load_resources_raw.py`, бо разом з ресурсами в
   дампі йдуть спільні довідники спеціальностей.
3. **Нормалізація в канонічні таблиці** — `scripts/import_hospitalizations_to_
   lpz.py` перетворює кожну картку госпіталізації, звіряє відділення з
   `lpz_departments` по `structure_id` (з фолбеком на легасі-мапінг), і робить
   `INSERT ... ON CONFLICT (org_edrpou, id_case) DO UPDATE` в
   `lpz_hospitalizations`. Пацієнтів `upsert`-ять в `lpz_patients` ДО цього
   кроку — інакше ламається FK.
4. **Відомий розрив: лікар госпіталізації** — поле `doc_resource_id` у
   `/api/cards` (джерелі госпіталізацій) завжди порожнє. Зв'язок лікар↔випадок
   відновлюють через `lpz_episodes` (join по пацієнту й даті), окремим
   інструментом.
5. **SQL-функції рахують KPI на боці Postgres** — 17 функцій у схемі `lpz`
   агрегують `lpz_hospitalizations` + `lpz_episodes` напряму в базі, щоб
   уникнути обрізання PostgREST на 1000 рядків при агрегації в JS.
6. **API-шар віддає результат у UI** — 12 файлів `pages/api/lpz-*.js`
   викликають ці RPC й повертають дані компонентам дашборду.

Окрема гілка: 6 таблиць `lpz_analytics_*` / `lpz_doctor_stats` /
`lpz_icd_usage` / `lpz_dept_stats_snapshot` — **не частина цього пайплайну**.
Це одноразово перенесені дані зі старого проєкту LSMD (детальніше в розділі
«Аналітика (legacy)»).

## Безпека — RLS

Row Level Security увімкнено на всіх 39 таблицях. На 7 таблицях (усі — з групи
«Клінічні дані» / «Аналітика legacy» нижче) RLS був вимкнений при створенні
(Supabase-адвайзер позначав це critical — таблиці були повністю відкриті для
`anon`/`authenticated`) і увімкнений пізніше тим самим патерном, що вже стояв
на решті lpz-таблиць:

```sql
ALTER TABLE lpz.<table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON lpz.<table>
  FOR ALL USING (current_user_org_edrpou() IS NULL OR org_edrpou = current_user_org_edrpou());
```

`current_user_org_edrpou()` (`public`, `SECURITY DEFINER`) читає
`org_edrpou` з `public.empl`/`public.app_users` для поточного `auth.uid()` і
повертає `NULL`, якщо користувач не залогінений/не прив'язаний — політика
трактує `NULL` як «дозволити», тому anon-читання дашборду не ламається;
серверний `service_role`-ключ RLS обходить завжди. Довідникові таблиці без
`org_edrpou` мають інший, простіший патерн — `lpz_read_all` (`SELECT` для
`anon`+`authenticated`, `USING (true)`).

Виправлені таблиці: `lpz_icd_usage`, `lpz_doctor_stats`,
`lpz_analytics_doctor_dept`, `lpz_analytics_dept_summary`,
`lpz_analytics_block_summary`, `lpz_dept_stats_snapshot`,
`lpz_hospitalization_doctors`.

---

## 1. Довідники (13 таблиць)

Статичні класифікатори з helsi.pro. Самі рідко читаються напряму — підтягуються
через FK, коли потрібна назва замість коду.

### lpz_helsi_specialities (218 рядків)
- **Задача:** довідник медичних спеціальностей з helsi.pro.
- **Ключові поля:** `speciality_id` PK, `name`.
- **Зв'язки:** ціль FK з `lpz_empl_specialities`, `lpz_calendar_snapshot_specialities`.
- **Використовується:** прямих читань у коді не знайдено — лише як FK-ціль.

### lpz_helsi_positions (441 рядок)
- **Задача:** довідник посад; є ієрархія (`parent` → інша посада) й прапорець «групова» посада.
- **Ключові поля:** `position_id` PK, `name`, `parent`, `is_group`.
- **Зв'язки:** самопосилання `parent → position_id`; ціль FK з `lpz_empl.position_id`, `lpz_empl.professional_group`, `lpz_calendar_snapshot.position_id`.
- **Використовується:** прямих читань у коді не знайдено.

### lpz_department_types (32 рядки)
- **Задача:** типи відділень — код, назва, `direction` (напрямок: терапевтичний/хірургічний тощо), `block` (корпус).
- **Ключові поля:** `code` PK, `name`, `direction`, `block`.
- **Зв'язки:** ціль FK з `lpz_departments.type_code`, `lpz_department_mappings.type_code`, `lpz_empl.department_type_code`.
- **Як працює:** саме через `direction` RPC-функції `lpz_kpi_by_direction`/`lpz_trend_by_direction` групують відділення універсально, без хардкоду назв.

### lpz_roles (7 рядків)
- **Задача:** ролі персоналу (`doctor`, `head` — завідувач, тощо).
- **Ключові поля:** `code` PK, `name`.
- **Зв'язки:** ціль FK з `lpz_empl.role`.
- **Як працює:** значення `role='head'` у `lpz_empl` проставлялись вручну доповненням канону — «канон майже не мав позначених завідувачів».
- **Використовується:** `lpz_department_staff` фільтрує `role='doctor'`.

### lpz_dict_encounter_status (6 рядків)
- **Задача:** довідник статусів звернення/епізоду.
- **Ключові поля:** `code` PK, `name`.
- **Використовується:** прямих читань у коді не знайдено.

### lpz_dict_discharge_disposition (9 рядків)
- **Задача:** статуси виписки — критичний для летальності/поліпшення.
- **Ключові поля:** `id` PK, `name`: 1=Помер, 2/3/5=З поліпшенням-групою, 4=Без змін, 6=З погіршенням, 9=Переведений.
- **Зв'язки:** немає формальної FK, але `lpz_hospitalizations.discharge_disposition_id` посилається на ці id за змістом.
- **Як працює:** при міграції зі старого LSMD статус виписки змапили саме через цей словник (109 462 записи, 96.6% покриття).
- **Використовується:** `lpz_kpi_summary` бере `id=1` як летальність; `lpz_kpi_by_department/direction/doctor` беруть `id IN (2,3,5)` як «поліпшення».

### lpz_dict_admit_source (8 рядків)
- **Задача:** джерела госпіталізації (звідки надійшов пацієнт).
- **Ключові поля:** `id` PK, `name`.
- **Зв'язки:** концептуально відповідає `lpz_hospitalizations.admit_source_id`.
- **Використовується:** прямих читань у коді не знайдено.

### lpz_dict_re_admission (3 рядки)
- **Задача:** типи повторної госпіталізації.
- **Ключові поля:** `id` PK, `name`.
- **Використовується:** UI census позначає повторні госпіталізації класом `.census-repeat`.

### lpz_dict_event_reason (126 рядків)
- **Задача:** причини подій календаря, ієрархічний довідник.
- **Ключові поля:** `reason_id` PK, `name`, `parent`, `level`.
- **Використовується:** прямих читань у коді не знайдено.

### lpz_icd_diagnoses (1123 рядки)
- **Задача:** довідник кодів МКХ-10 — код і назва діагнозу.
- **Ключові поля:** `code` PK, `name`.
- **Використовується:** прямих читань у коді не знайдено.

### lpz_dict_icd_blocks (79 рядків)
- **Задача:** діапазони кодів МКХ, згруповані у «блоки» (напр. «хвороби органів травлення»).
- **Ключові поля:** `priority` PK (порядок перевірки діапазону), `code_from`, `code_to`, `block_name`.
- **Як працює:** перенесено «як є» зі старого `pages/api/stats.js:ICD_BLOCK_CASE`. Код перевіряють по діапазонах у порядку `priority`, перше влучання — блок; ~11% кейсів не влучають в жоден діапазон і йдуть в «Інші».
- **Використовується:** не читається жодним з 12 lpz-api файлів — використовувалась старим stats-кодом.

### lpz_dict_speciality_search_tags (454 рядки)
- **Задача:** довідник тегів пошуку по спеціальностях — спільний, побайтово однаковий для всіх лікарів однієї спеціальності.
- **Ключові поля:** PK `(speciality_id, search_tags_speciality_id)`, `name`.
- **Як працює:** наповнюється `scripts/load_resources_raw.py` апсертом (`Prefer: resolution=merge-duplicates`) з `raw_bundle.json`.

### lpz_dict_speciality_services (507 рядків)
- **Задача:** довідник послуг/опису послуг по спеціальностях.
- **Ключові поля:** PK `(speciality_id, service_description_id)`, `name`, `description`, `is_active`, `is_program`.
- **Як працює:** той самий механізм і те саме джерело, що й `lpz_dict_speciality_search_tags`.

---

## 2. Організації, персонал, пацієнти (6 таблиць)

`org_edrpou` з `lpz_organizations` — ключ мультитенантності, наскрізний майже для всіх інших таблиць.

### lpz_organizations (2 рядки)
- **Задача:** самі лікарні-орендарі системи.
- **Ключові поля:** `edrpou` PK, `name`, `display_name`, `tagline`, `logo_url`, `address`, `phones`.
- **Зв'язки:** ціль FK майже з усіх таблиць lpz через `org_edrpou`.
- **Як працює:** міграція `20260713132201_organizations_display_name.sql` додала `display_name`/`tagline` для брендування дашборду під конкретну лікарню.
- **Використовується:** `org_edrpou` з цієї таблиці — параметр практично кожного RPC/API-запиту.

### lpz_departments (52 рядки)
- **Задача:** відділення обох лікарень — назва, тип, напрямок, блок, ліжка.
- **Ключові поля:** PK `(org_edrpou, structure_id)`, `name`, `type_code`, `direction`, `block`, `beds`.
- **Зв'язки:** `org_edrpou → lpz_organizations`, `type_code → lpz_department_types`.
- **Як працює:** `structure_id` — той самий ідентифікатор, за яким скрипт імпорту звіряє відділення госпіталізації (надійніше за назву).
- **Використовується:** `/api/lpz-departments` (фільтр `direction IS NOT NULL`), `/api/lpz-duty-doctors`; RPC `lpz_department_staff/flow/expand/last_date`.

### lpz_department_mappings (52 рядки)
- **Задача:** судячи зі структури — зіставлення «сирої» назви відділення (`helsi_name`) з правильним `type_code`.
- **Ключові поля:** PK `(org_edrpou, structure_id)`, `helsi_name`, `type_code`, `resolved`, `note`.
- **Як працює:** прапорець `resolved` + поле `note` вказують на ручний/напівавтоматичний процес розбору нових назв відділень при імпорті.
- **Використовується:** прямих читань у продуктовому коді не знайдено — схоже на адмінський/разовий інструмент.

### lpz_empl (1093 рядки)
- **Задача:** персонал лікарень — ПІБ, посада, спеціальність, відділення, роль.
- **Ключові поля:** PK `(org_edrpou, resource_id)`, `last_name/first_name/middle_name`, `position_id`, `department_structure_id`, `role`, `email`.
- **Зв'язки:** `department_type_code → lpz_department_types`, `(org_edrpou, department_structure_id) → lpz_departments`, `position_id/professional_group → lpz_helsi_positions`, `role → lpz_roles`.
- **Як працює:** ключова таблиця авторизації кабінету лікаря — відділення користувача визначається ВИКЛЮЧНО пошуком по `email` у цій таблиці, не з сесії напряму.
- **Використовується:** `/api/lpz-department-census.js`, `/api/lpz-duty-doctors.js`; RPC `lpz_department_staff` (фільтр `role='doctor'`).

### lpz_empl_specialities (1064 рядки)
- **Задача:** зв'язка many-to-many — які спеціальності має кожен співробітник.
- **Ключові поля:** PK `(org_edrpou, resource_id, speciality_id)`.
- **Зв'язки:** `(org_edrpou, resource_id) → lpz_empl`, `speciality_id → lpz_helsi_specialities`.

### lpz_patients (77 070 рядків)
- **Задача:** пацієнти — ПІБ, стать, вік/дата народження, адреса, декларація сімейного лікаря, ідентифікатори.
- **Ключові поля:** PK `(org_edrpou, patient_id)`, `full_name`, `gender`, `age`, `address`, `unzr`.
- **Зв'язки:** `org_edrpou → lpz_organizations`; є ЦІЛЛЮ FK з `lpz_hospitalizations(org_edrpou, patient_id)`.
- **Як працює:** через FK-обмеження пацієнт має існувати тут ДО того, як з'явиться його госпіталізація — при міграції зі старого LSMD довелось довантажити 546 пацієнтів, яких бракувало саме через цю причину.
- **Використовується:** напряму через API не читається — лише як передумова цілісності для `lpz_hospitalizations`.

---

## 3. Клінічні дані (5 таблиць)

Факт-таблиці госпіталізацій і супутніх клінічних подій — те, з чого рахується вся аналітика дашборду.

### lpz_hospitalizations (121 052 рядки)
- **Задача:** головна факт-таблиця: один рядок = одна госпіталізація. Джерело всіх KPI/трендів дашборду.
- **Ключові поля:** PK `(org_edrpou, id_case)` — `id_case = helsi_no`; `patient_id`, `department_structure_id`, `doc_resource_id`, `admission_date/time`, `discharge_date/time`, `icd_primary`, `discharge_disposition_id`, `severity`.
- **Зв'язки:** `(org_edrpou, department_structure_id) → lpz_departments`, `(org_edrpou, doc_resource_id) → lpz_empl`, `(org_edrpou, patient_id) → lpz_patients`.
- **Як працює:** `import_hospitalizations_to_lpz.py` читає JSON-картки з helsi, звіряє відділення по `structure_id`, робить `UPSERT` по `(org_edrpou, id_case)`. `doc_resource_id` завжди порожній з цього джерела — відомий, задокументований розрив. Канон іноді відставав від сирих даних на ~7 днів (закривалось окремою ручною SQL-трансформацією raw→canon).
- **Використовується:** усі RPC — `lpz_kpi_summary/by_department/by_direction/by_doctor`, `lpz_trend_by_*`, `lpz_department_census/flow/expand/last_date` — тобто всі 12 API-файлів lpz-* непрямо.

### lpz_episodes (57 087 рядків)
- **Задача:** епізоди (звернення пацієнта до лікаря) з окремого helsi episode API — єдиний спосіб дізнатись, який лікар вів пацієнта, оскільки в госпіталізаціях це поле порожнє.
- **Ключові поля:** PK `id`, `patient_resource_id`, `doc_resource_id`, `period_start/end`, `status`, `type`.
- **Зв'язки:** `(org_edrpou, doc_resource_id) → lpz_empl`.
- **Як працює:** RPC-функції джойнять `lpz_episodes.patient_resource_id = lpz_hospitalizations.patient_id` ТА `doc_resource_id = потрібний лікар`, з перевіркою що `period_start` потрапляє в діапазон дат госпіталізації.
- **Використовується:** `lpz_kpi_by_doctor`, `lpz_trend_by_doctor`, `lpz_department_last_date`, `lpz_department_census` → `lpz-kpi-doctor.js`, `lpz-trend-doctor.js`, `lpz-department-census.js`.

### lpz_hospitalization_diagnoses (9667 рядків)
- **Задача:** окремий облік діагнозів на випадок (роль: основний/супутній тощо), розрахований на множинні діагнози на одну госпіталізацію.
- **Ключові поля:** PK `(org_edrpou, id_case, role, icd10am_code)`, `icd10am_code`, `icd10_code`, `clinical_status`.
- **Зв'язки:** `(org_edrpou, id_case) → lpz_hospitalizations`.
- **Як працює:** **наповнена не повністю** — при raw→canon трансформації сюди дані не писались, оновлювалось лише поле `icd_primary` прямо в `lpz_hospitalizations`. Групувати варто по `icd10am_code` (100% покриття), не по `icd10_code` (60%, решта NULL/плейсхолдер).
- **Використовується:** прямих читань у 12 API-файлах не знайдено — застосунок поки покладається на `icd_primary`.

### lpz_admission_rejections (1 рядок)
- **Задача:** судячи зі структури — облік відмов у (попередній) госпіталізації: причина, статус, пріоритет, відповідальний лікар.
- **Ключові поля:** PK `id`, `reject_reason_code/name`, `status_code/name`, `priority_code/name`, `patient_*`, `admitting_doc_resource_id`.
- **Зв'язки:** `(org_edrpou, admitting_doc_resource_id) → lpz_empl`, `(org_edrpou, responsible_doc_resource_id) → lpz_empl`.
- **Як працює:** практично порожня (1 рядок).

### lpz_hospitalization_doctors (4138 рядків)
- **Задача:** пацієнт + дати + лікар + відділення — за структурою схожа на спробу напряму зв'язати лікаря з госпіталізацією.
- **Ключові поля:** `patient_name`, `admission_date/discharge_date`, `doctor_id/doctor_name`, `inpatient_department_name`, `source`, `raw_id`.
- **Зв'язки:** формальних FK не знайдено — таблиця ізольована.
- **Як працює:** жодних згадок у коді, міграціях чи handoff-документах не знайдено взагалі. Найімовірніше — залишок одноразового імпорту/експерименту, зроблений до того, як обрали підхід через `lpz_episodes`.
- **Використовується:** використання в репозиторії не знайдено; RLS був вимкнений — виправлено (див. розділ «Безпека»).

---

## 4. Розклад і календар (5 таблиць)

Розклад лікарів і записи на прийом з helsi.pro. Жодна з цих 5 таблиць наразі не читається жодним перевіреним API чи RPC — дані завантажені про запас, ще не підключені до продуктової частини дашборду.

### lpz_calendar_snapshot (139 рядків)
- **Задача:** знімок розкладу лікаря на конкретну дату — доступність, часовий слот, кабінет.
- **Ключові поля:** PK `(org_edrpou, resource_id, snapshot_date)`, `available`, `time_slot`, `cabinet_address`.
- **Зв'язки:** `position_id → lpz_helsi_positions`.
- **Як працює:** періодичний зліпок стану розкладу на конкретну дату (не історія в реальному часі).

### lpz_calendar_snapshot_specialities (138 рядків)
- **Задача:** які спеціальності діють для конкретного знімка розкладу.
- **Ключові поля:** PK `(org_edrpou, resource_id, snapshot_date, speciality_id)`.
- **Зв'язки:** `(org_edrpou, resource_id, snapshot_date) → lpz_calendar_snapshot`, `speciality_id → lpz_helsi_specialities`.

### lpz_schedule_periods (620 рядків)
- **Задача:** регулярний робочий графік лікаря — шаблон, на відміну від разового знімка.
- **Ключові поля:** PK `(org_edrpou, schedule_period_id)`, `day_of_week`, `parity`, `time_start/end`, `cabinet`, `valid_from/to`.
- **Як працює:** `parity` — судячи з назви, чергування через тиждень; `valid_from/to` — діапазон дії конкретного варіанту графіка.

### lpz_calendar_events (1077 рядків)
- **Задача:** події календаря — записи на прийом: ресурс, пацієнт, період, статус, чи пацієнт з'явився.
- **Ключові поля:** PK `(org_edrpou, event_id)`, `resource_id`, `patient_resource_id`, `date_begin/end`, `event_state`, `is_not_appeared`.

### lpz_resource_na (31 рядок)
- **Задача:** періоди недоступності лікаря (na = not available) — відпустки, лікарняні тощо.
- **Ключові поля:** PK `(org_edrpou, na_id)`, `resource_id`, `type_na_id`, `date_start_na/date_stop_na`.

---

## 5. Сирі дані (4 таблиці)

Проміжний, «страховий» шар: кожне поле JSON з helsi.pro — окрема text-колонка, нічого не відкидається й не типізується. Ніколи не читаються продуктовим кодом напряму.

### lpz_raw_hospitalizations_closed (8777 рядків)
- **Задача:** сирий, «розплющений» дамп ЗАКРИТИХ (виписаних) госпіталізацій — ~230 text-колонок, що дзеркалять структуру JSON `/api/cards`.
- **Як працює:** `load_json_raw.py`: назва таблиці = ім'я файлу без року в кінці. Перед вставкою — `DELETE` по `(org_edrpou, source_file)`, потім `INSERT` пачками по 200: повторний запуск ЗАМІНЮЄ дані, не дублює.
- **Використовується:** не читається жодним API — лише джерело для трансформації в `lpz_hospitalizations`.

### lpz_raw_hospitalizations_open (2523 рядки)
- **Задача:** те саме, що `lpz_raw_hospitalizations_closed`, але для ВІДКРИТИХ (ще не виписаних) госпіталізацій.

### lpz_raw_resources (1093 рядки)
- **Задача:** сирий дамп медперсоналу з `raw_bundle.json`.
- **Ключові поля:** PK `(org_edrpou, resource_id)`, `first_name/last_name`, `position_id`, `division_structure_id`, `speciality_id`, `ehealth_sync_status`.
- **Як працює:** завантажується СПЕЦІАЛІЗОВАНИМ `scripts/load_resources_raw.py` (не generic-завантажувачем) — бо разом з даними ресурсу в дампі йдуть спільні довідники по спеціальності.

### lpz_raw_episodes (56 243 рядки)
- **Задача:** сирий дамп епізодів.
- **Як працює:** той самий generic-механізм `load_json_raw.py`. Коли канонічна `lpz_episodes` відставала на 7 днів, саме цю таблицю використали для прямої SQL-трансформації в канон (+967 рядків ЛШМД, +1960 Хотин).

---

## 6. Аналітика (legacy) (6 таблиць)

**Не частина пайплайну raw→canon вище.** Одноразово скопійовані дані/матеріалізовані вʼюхи зі старого проєкту LSMD, з `org_edrpou` доданим заднім числом (хоча реальне джерело — лише ЛШМД).

### lpz_icd_usage (19 824 рядки)
- **Задача:** статистика використання кодів МКХ — кейси, смерті, середній ліжко-день по коду діагнозу.
- **Ключові поля:** PK `(org_edrpou, icd_code)`, `cases`, `deaths`, `avg_los`, `chapter_name`.
- **Як працює:** джерело — стара матеріалізована вʼюха `mv_icd_usage`.

### lpz_doctor_stats (264 рядки)
- **Задача:** готова статистика по лікарю — денні/нічні/вихідні випадки, унікальні пацієнти, смерті, поліпшення, середні вік/ліжко-день.
- **Ключові поля:** PK `(org_edrpou, doc_name)`, `total_cases`, `deaths`, `improved`, `avg_los`.
- **Як працює:** джерело — стара `doctor_stats` + `mv_doctor_full`.

### lpz_analytics_doctor_dept (2662 рядки)
- **Задача:** статистика на перетині лікар × відділення × рік.
- **Ключові поля:** PK `(org_edrpou, doc_name, department_name, period_year)`, `total_cases`, `death_rate_pct`, `avg_bed_days`.
- **Як працює:** джерело — стара `analytics_doctor_dept` + `empl`/`departments`.

### lpz_analytics_dept_summary (91 рядок)
- **Задача:** найдетальніша річна статистика по відділенню — летальність, хірургічна активність, ургентність, повторні госпіталізації за 30/90 днів, вік/стать тощо.
- **Ключові поля:** PK `(org_edrpou, department_name, period_year)`, ~28 метрик-колонок.
- **Як працює:** джерело — стара `analytics_dept_summary` + `departments`.

### lpz_analytics_block_summary (14 рядків)
- **Задача:** те саме, що `lpz_analytics_dept_summary`, але на рівні «блоку» (групи відділень).
- **Ключові поля:** PK `(org_edrpou, block, period_year)`.
- **Як працює:** джерело — стара `analytics_block_summary` + `clinical_blocks`.

### lpz_dept_stats_snapshot (20 рядків)
- **Задача:** компактний знімок по відділенню — кейси, смерті, нічні поступлення, операції, штат.
- **Ключові поля:** PK `(org_edrpou, department_name)`, `staff_count`, `doctors_count`.
- **Як працює:** джерело — стара `mv_dept_stats`.

Жодна з цих 6 таблиць не читається прямо жодним із 12 API-файлів `lpz-*.js` на момент дослідження.

---

## SQL-функції (RPC) — 17

Уся аналітика дашборду рахується цими функціями напряму в Postgres. Кожна —
`LANGUAGE sql, SECURITY DEFINER, SET search_path TO 'lpz','public'`. Тригерів
у схемі `lpz` немає.

| Функція | Аргументи | Повертає |
|---|---|---|
| `lpz_kpi_summary` | `p_org, p_year='all' [, p_month='all']` | hosp, pat, bed, age, let, max_admission_date |
| `lpz_kpi_by_department` | `p_org, p_year='all', p_department=null [, p_month='all']` | hosp, pat, bed, age, imp, let |
| `lpz_kpi_by_direction` | `p_org, p_year='all', p_direction=null [, p_month='all']` | hosp, pat, bed, age, imp, let |
| `lpz_kpi_by_doctor` | `p_org, p_year='all', p_doctor=null [, p_month='all']` | hosp, pat, bed, age, imp, let |
| `lpz_trend_by_department` | `p_org, p_year='all', p_department=null, p_month='all'` | x, y, y_urgent, y_planned |
| `lpz_trend_by_direction` | `p_org, p_year='all', p_direction=null` | x, y, y_urgent, y_planned |
| `lpz_trend_by_doctor` | `p_org, p_year='all', p_doctor=null` | x, y, y_urgent, y_planned |
| `lpz_department_census` | `p_org, p_department, p_doctor=null, p_date=today` | таблиця кейсів: id_case, ПІБ, вік, діагноз, дні тощо |
| `lpz_department_expand` | `p_org, p_department, p_year='all'` | cases, unique_patients, doctors, beds, head_name |
| `lpz_department_flow` | `p_org, p_department, p_date=today` | admitted, discharged |
| `lpz_department_last_date` | `p_org, p_department, p_doctor=null` | date |
| `lpz_department_staff` | `p_org, p_department` | resource_id, full_name, position_name |
| `lpz_is_urgent_icd` | `p_icd` | boolean — чи код МКХ вважається ургентним |

4 з них (`lpz_kpi_summary`, `*_by_department`, `*_by_direction`, `*_by_doctor`)
мають по 2 перевантаження — з `p_month` і без. Міграція
`20260721181100_add_month_param_to_lpz_kpi_functions.sql` додала другий
варіант, бо Postgres не дозволяє вставити новий параметр усередину списку
існуючих через `CREATE OR REPLACE` — довелось додати його в кінець як окреме
перевантаження.

```sql
CREATE OR REPLACE FUNCTION lpz.lpz_department_flow(p_org text, p_department uuid, p_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(admitted bigint, discharged bigint)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'lpz', 'public'
AS $function$
  select
    count(*) filter (where h.admission_date = p_date) as admitted,
    count(*) filter (where h.discharge_date = p_date) as discharged
  from lpz.lpz_hospitalizations h
  where h.org_edrpou = p_org and h.department_structure_id = p_department;
$function$;

CREATE OR REPLACE FUNCTION lpz.lpz_is_urgent_icd(p_icd text)
 RETURNS boolean
 LANGUAGE sql IMMUTABLE
AS $function$
  SELECT p_icd IS NOT NULL AND (
    left(p_icd,1) IN ('S','T')
    OR left(p_icd,3) BETWEEN 'I20' AND 'I25'  -- ішемічна хвороба серця
    OR left(p_icd,3) BETWEEN 'I60' AND 'I64'  -- інсульт
    OR left(p_icd,3) BETWEEN 'K35' AND 'K38'  -- гострий апендицит тощо
    OR left(p_icd,3) = 'J18'                  -- пневмонія
    OR left(p_icd,3) BETWEEN 'O70' AND 'O75'  -- ускладнення пологів
    OR left(p_icd,3) = 'G94');
$function$;
```

---

## View, перенесені зі старої схеми `public` (lsmd)

Стара схема `public` (та сама база, `ubjnztanehqlsrqphdqy`) має 47 view.
Більшість дублює те, що вже рахують 17 RPC-функцій `lpz` (KPI/тренди/пікові
години тощо) — їх переносити не було сенсу. Ще частина спирається на таблиці,
яких у `lpz` немає (`operations`, `dept_transfers_matrix`, `doctor_shifts`,
геокодовані `localities`) — їх перенести неможливо без нових таблиць, це поза
рамками цієї задачі.

Нижче — 13 view (+ 1 допоміжна функція), яких **не було в жодному вигляді в
`lpz`** і які повністю будуються на вже наявних таблицях `lpz_hospitalizations`
/ `lpz_icd_diagnoses` / `lpz_dict_icd_blocks` / функції `lpz_is_urgent_icd`.
Усі — `org_edrpou`-scoped (на відміну від старих, однолікарняних версій), з
`security_invoker = true` (view виконується з правами того, хто її викликає,
а не власника — щоб RLS базових таблиць застосовувався коректно).

### lpz_icd_block_name(p_icd text) — функція
Допоміжна: код МКХ → назва блоку з `lpz_dict_icd_blocks` (перший діапазон, що
підійшов, за `priority`; якщо жоден — `'Інші'`). До цього `lpz_dict_icd_blocks`
існувала в схемі, але жодного коду її не читало.

### lpz_readmissions
Повторні госпіталізації пацієнта — вікно `LEAD()` по `admission_date` в межах
`(org_edrpou, patient_id)`: наступна госпіталізація, дні до неї, чи вклався в
30/90 днів, чи той самий діагноз. Раніше в `lpz` цього не було ЗОВСІМ (лише
статичні підсумки `readmissions_30d`/`90d` у замороженому знімку
`lpz_analytics_dept_summary`) — найцінніше з перенесеного.

### lpz_readmission_metrics
Зведення `lpz_readmissions` по лікарні: % повторних за 30/90 днів, скільки з
них — той самий діагноз.

### lpz_night_vs_day_admissions
Ніч (22:00–06:00) vs день по `admission_time`: кейси, унікальні пацієнти,
середній ліжко-день, ургентні (`admission_type='Екстренна' OR lpz_is_urgent_icd`),
летальність.

### lpz_night_admissions_detail
Те саме, у розрізі кожної години доби (0–23).

### lpz_night_admissions_by_department
Ніч vs день у розрізі відділення (`department_name`).

### lpz_weekend_vs_weekday
Вихідні vs робочі дні по `admission_date` (`EXTRACT(dow ...)`).

### lpz_patient_demographics
Стать × вікова група (0-17/18-29/30-44/45-59/60-74/75+), з летальністю в
кожній комірці.

### lpz_top_diagnoses
Топ-20 кодів МКХ **на кожну лікарню окремо** (`row_number() OVER (PARTITION BY
org_edrpou ...)`) — кейси, унікальні пацієнти, летальність, назва діагнозу з
`lpz_icd_diagnoses`. Живий еквівалент замороженого знімку `lpz_icd_usage`.

### lpz_diagnosis_stats
Те саме, але по КОЖНОМУ коду МКХ (не тільки топ-20), + прапорець `urgent`
через `lpz_is_urgent_icd`.

### lpz_urgency_stats
Ургентні vs планові по відділеннях: кейси, летальність, середній ліжко-день
у кожній групі. Стара версія рахувала ще й хірургічні показники — у `lpz`
немає таблиці операцій, тому ці колонки не перенесені.

### lpz_icu_mortality
Летальність у відділеннях реанімації/анестезіології/інтенсивної терапії —
текстовий фільтр `department_name ILIKE '%анестез%' OR '%реанімац%' OR
'%інтенсив%'` (розширено проти старої версії, яка перевіряла лише
`%анестез%`, — щоб покривати обидві лікарні з різними назвами відділень).

### lpz_morbidity_by_department
Захворюваність по відділеннях × категорія хвороби (через нову функцію
`lpz_icd_block_name`).

### lpz_dept_disease_clean
Те саме, з часткою (`%`) від загальної кількості кейсів відділення.

### Свідомо не перенесено
- **doctor_diagnoses / doctor_discharges / doctor_patient_links /
  doctors_profile_view** — у старій схемі спирались на чисту прив'язку
  `lsmd_doctors(doctor_id → empl)`. У `lpz` `doc_resource_id` на госпіталізації
  завжди порожній; лікаря відновлюють лише через `lpz_episodes` (join по
  пацієнту й діапазону дат) — той самий підхід, що вже реалізований у RPC
  `lpz_kpi_by_doctor`/`lpz_trend_by_doctor`. Робити ще одну view з тим самим
  крихким join без чіткого запиту від продукту — зайва вартість; ці відповіді
  вже доступні через наявні RPC.
- **interventions, lsmd_transfers, lsmd_deaths_24h, lsmd_shift_type,
  lsmd_shifts** — залежать від таблиць `operations`/`dept_transfers_matrix`/
  `doctor_shifts`, яких у `lpz` немає.
- **v_dept_icd_by_year** — залежить від `analytics_dept_icd_profile`, якої
  серед перенесених у `lpz` legacy-таблиць немає.
- **v_dashboard_unified** — будується виключно на замороженому знімку
  (`lpz_analytics_block_summary`/`lpz_analytics_dept_summary`, лише ЛШМД) —
  додавання дало б хибне враження "живих" даних там, де їх нема.
- **v_region_stats** — залежить від геокодованих `localities` (lat/lng),
  яких у `lpz_patients` немає.
- **v_import_history** — службова таблиця імпорту, не аналітика.
- Решта ~25 view (`v_hospital_summary`, `v_case_metrics`, `v_peak_by_*`,
  `v_department_metrics/stats`, `v_monthly_admissions` тощо) — дублюють те,
  що вже рахують RPC-функції `lpz_kpi_*`/`lpz_trend_*`/`lpz_department_*`.

## Джерела

`scripts/import_hospitalizations_to_lpz.py`, `scripts/load_json_raw.py`,
`scripts/load_resources_raw.py`, `database/migrations-lpz/*.sql`,
`pages/api/lpz-*.js` (12 файлів),
`README_HANDOFF_2026-07-{13,17,17-2,17-3,18,18-2,19,19-2}.md`,
`docs/HELSI_WEB_IMPORT.md`, жива схема Supabase project `ubjnztanehqlsrqphdqy`.
