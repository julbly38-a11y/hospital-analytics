# Hospital Analytics — кабінет (пастельний дашборд) · handoff

Стан на **2026-06-16**. Self-README для продовження в новій сесії.

## Загальне
- **Репо:** julbly38-a11y/hospital-analytics, гілка `design-medychna`. Локально `/Users/julienblyndu/hospital-analytics`.
- **Стек:** Next.js (pages router) + Supabase. Прод nobodybly.org / Vercel.
- **Supabase ref:** `wnyfrckxhwujsjcfxqou` (MCP `execute_sql` — обходить RLS).
- **Dev:** `npm run dev`. **Порт плаває (3000/3001)** — Next бере вільний. Перед роботою перевіряти:
  `for p in 3000 3001; do printf "%s: " $p; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:$p/cabinet.html; done`
  (`307` = живий і захищений, `000` = не слухає). Лінки користувачу давати на актуальний порт.

## Дві статичні сторінки (public/, авто-масштаб стейдж 1920×1080, `transform: scale`)
1. **`public/khotyn_slide.html`** — слайд/вхід. Клік на `.wb-title` («Для працівників») розкриває поля
   email/пароль → кнопка `.f-btn` → `POST /api/slide-login` → редірект `REDIRECT_TO = '/cabinet.html'`.
2. **`public/cabinet.html`** — кабінет після входу.

## Авторизація (ЗРОБЛЕНО і перевірено)
- `middleware.js`: matcher включає `/cabinet.html`; публічні шляхи — `/`, `/login`, `/auth`, `/api`,
  `/_next`, `/title-test`, `/khotyn_slide.html`. Неавторизований запит на `/cabinet.html` → **307** на
  `/khotyn_slide.html` (для решти захищених — на `/login`).
- `pages/api/slide-login.js` — `signInWithPassword`, виставляє sb-cookie (через @supabase/ssr).
- `pages/api/slide-logout.js` — `signOut` + чистить cookie (НОВИЙ у цій сесії).
- `pages/api/me.js` — повертає `{ role, email, full_name, emp_name, position, specialization, department }`
  для будь-якої ролі (admin/head_dept/doctor/viewer). Для acc без зв'язку з empl поля null.
- **Важливо про тест:** preview-інструмент (Claude Preview) керує ОКРЕМИМ браузером, не Safari користувача.
  Cookie сесії живе ~400 днів — якщо «пускає по лінку», це активна сесія в Safari, не баг. Логаут — кнопка
  «Вийти» в кабінеті або приватне вікно.

## Облікові записи (email/пароль, не OAuth)
- `julbly38@gmail.com` — **admin**, БЕЗ зв'язку з empl (full_name=null).
- `julbly@icloud.com` — **doctor**, Блинду Юліан Вадимович, Центр невідкладної неврології.
- Тестовий лікар: `vilihorska.kateryna.lsmd@med.cv.ua` / `Lsmd2024` (doctor, Терапевтичне №1).
- ~206 лікарських акаунтів, дефолт-пароль `Lsmd2024`.

## Кабінет: блок профілю (ЗРОБЛЕНО)
Смуга `.me-bar` (absolute, left:690 top:64, 630×41) — між шапкою лікарні і пігулками років, над KPI-рядком:
- ліворуч: `.me-surname` (ПРІЗВИЩЕ, 19px uppercase) + `.me-firstname` (ім'я по батькові, 11px uppercase);
- праворуч: `.me-greet` («посада · відділення», 12px mauve) + `.me-logout` («Вийти»).
- JS: `fetch('/api/me')` у `DOMContentLoaded`; `full_name` ділиться на прізвище (1-е слово) / решту.

## Кабінет: графіки-спарклайни (ЗРОБЛЕНО, функція `renderSpark`)
- 2 SVG: `.chart-therap` (top 352), `.chart-surg` (top 712). Дані: `therapeuticTrend`/`surgicalTrend`.
- Шкала: крок **1000** (місяці) / **10000** (роки) — `niceMin/niceMax` округлені. **Спільні межі для обох
  блоків** (рахуються з об'єднаних даних у `Promise.all`, передаються як `sharedBounds`) — щоб візуально
  було видно реальну різницю масштабу терап. vs хір.
- Над кожною точкою — підпис кількості (`.spark-val`), під базовою лінією — місяць `01..12` або рік
  (`.spark-xlabel`). На hover точка більшає + підписи `.active` (тултіпів НЕМАЄ — прибрані).
- Точки `.spark-dot` r=6 (hover 9), колір mauve #b27c8b.

## Кабінет: шторка відділення (ЗРОБЛЕНО, але користувач казав «не так» — НЕ ДОРОБЛЕНО)
- `.dept-drawer` (position:fixed, виїжджає знизу) — hover на `.dept[data-dept]` показує KPI відділення,
  ординаторську, топ МКХ-10. Дані: `deptProfileYear`, `deptHead`, `deptDocs2`, `deptIcdPieYear`
  (param = `"<точна назва БД>|<рік|all>"`). Назви БД — в атрибуті `data-db` кожного `.dept`.
- Захист від гонки запитів через `ddReqId`.
- **СТАТУС:** користувач сказав «ти не так зробив», але уточнення не дав (перейшли на авторизацію).
  Перепитати, що саме не так (тригер hover vs клік / позиція / стиль), перш ніж чіпати.

## Точні назви відділень у БД (lsmd.admission_department) — для data-db
Терапевтичне відділення №1, Гематологічне відділення, Терапевтичне відділення №2,
Гастроентерологічне відділення, Центр невідкладної неврології, Опікове відділення,
Травматологічне відділення для дітей, Травматологічне відділення для дорослих,
Нейрохірургічне відділення, Урологічне відділення, Хірургічне відділення №1,
Хірургічне відділення №2, Відділення анестезіології з ліжками інтенсивної терапії.
(У розмітці кабінету «Травматологія дитяча/доросла» — короткі підписи, але data-db = повні назви з БД.)

## API ключі (pages/api/stats.js)
PUBLIC_KEYS (без логіну): ovKpiYear, doctorCount(Year), therapeuticKpiYear, surgicalKpiYear,
deptProfile(Year), deptHead, therapeutic/surgicalMonthly, hospitalMonthly, allYears,
therapeutic/surgicalTrend. Дані тягне `supaFetch` через RPC `execute_sql_safe` (p_role:'admin').

## ▶ НАСТУПНА ЗАДАЧА (запит користувача, ще НЕ ЗРОБЛЕНО)
**Показники в кабінеті завідувача мають рахуватись саме на ЙОГО відділення.**
Тобто коли логіниться `head_dept` — верхній KPI-рядок (і, можливо, блок-рядки) показують дані його
відділення (`d.department` з /api/me), а не зведені по всій лікарні. Для viewer/doctor — лишити загальні.
Будівельні блоки вже є: `/api/me` дає `role` + `department`; ключ `deptProfileYear` дає KPI відділення
(param `"<dept>|<рік>"`). Логіка: у `loadMain` перевіряти роль і за потреби джерело KPI міняти на
deptProfileYear. Уточнити в користувача: чи міняти ВСІ блоки, чи лише шапку.

## Нюанси БД
- `empl.age` — text, є сміття («1 831»): `AVG(age::numeric) FILTER (WHERE age ~ '^[0-9]+$')`.
- `execute_sql_safe` — лише SELECT.
- `app_users`: auth_user_id → role + empl_name_id. Ролі: admin, head_dept, doctor, viewer.
- Госпіталізацій=110 207, Пацієнтів(distinct, госпіталізовані)=67 856.
