# SKILL: Робота з базою ЛСМД (Supabase)

> Цей файл — повна інструкція для роботи з базою даних лікарні.
> Дай його Claude на початку розмови щоб не пояснювати все заново.

## Контекст проєкту

Аналітична база Лікарні Швидкої Медичної Допомоги (Чернівці).
- Supabase project: wnyfrckxhwujsjcfxqou (eu-west-1, PostgreSQL 17)
- GitHub: julbly38-a11y/lsmd
- Доступ: Supabase MCP (через Claude) АБО локальний lsmd_db.py

## Структура бази (33 таблиці)

### Клінічні
- lsmd (110 206) — журнал випадків. Ключові колонки: id_case, patient_id, doctor_id, icd_primary, admission_date_d, discharge_date_d, length_of_stay, discharge_status, shift_time (денне/нічне), day_type (будній/вихідний), operation_id
- patients_best (72 293) — пацієнти. patient_id, full_name, city_name, locality_id
- empl (868) — працівники. name_id, full_name, specialization, position, department_id, app_role
- lsmd_doctors (282) — міст lsmd↔empl (doctor_id → empl_name_id)

### Штат
- departments (20) — dept_name, head_empl_id, staff_count, doctors_count (ординатори), likari_count, category_id, block_id
- dept_categories (2): клінічне / не_клінічне
- clinical_blocks (3): хірургічний / терапевтичний / інтенсивна_терапія

### МКХ-10 (ієрархія 3 рівні)
- icd_chapters (22) — глави (категорія, за літерою)
- icd_blocks (220) — блоки (підкатегорія, напр. K80-K87)
- icd_10 (19 824) — діагнози (з крапкою, напр. K86.1). Колонка usage_count
- FK: lsmd.icd_primary → icd_10.icd_code → block_id → chapter_id

### Інше
- operations (7 320) — комбінації ACHI-кодів. code, codes_count, cases_count
- doctor_shifts (68 299) — чергування 09:00→09:00
- doctor_stats — агрегати лікарів (нічні/вихідні/смертність)
- dept_transfers_matrix (143) — переведення між відділеннями
- localities (2 618) — населені пункти + геолокація (lat/lng)

## VIEW (8)
interventions (оперативні втручання), lsmd_transfers, lsmd_deaths_24h, doctor_patient_links, doctor_discharges, doctor_diagnoses, lsmd_shift_type

## Materialized Views (4)
mv_daily_stats, mv_dept_stats, mv_doctor_full, mv_icd_usage
Оновлюються cron-ом щоночі о 02:00.

## RLS — 4 ролі
admin (усе) / head_dept (своє відділення) / doctor (свої пацієнти) / viewer (довідники).
Зв'язок через empl.auth_user_id + empl.app_role.

## Edge Functions (REST API)
- /functions/v1/doctor-stats?id=912
- /functions/v1/case-detail?id=12345
- /functions/v1/admissions-today?date=2026-05-20

## Storage bucket'и
epicrises, reports, xrays (приватні, RLS).

---

## КРИТИЧНІ ПРАВИЛА БЕЗПЕКИ

1. НІКОЛИ TRUNCATE ... CASCADE — одного разу це знищило lsmd + patients_best (110k+72k рядків). CASCADE йде по FK лавиною.
2. Перед DELETE/TRUNCATE — завжди робити бекап (python backup.py).
3. Завжди перевіряти стан перед діями: SELECT count(*) FROM table.
4. Не вигадувати назви таблиць — звіряти з реальною схемою.
5. Маркер "10 днів" — пацієнти зі статусом "Лікується" мають discharge_date = admission + 10 днів (плейсхолдер, не реальна виписка). Не аналізувати їх LOS як реальний.

## Ключові домовленості
- Лікар = position='ординатор' (з візитами) або 'лікар' (без візитів)
- Завідувач окремо від лікарів
- Анестезисти = середній медперсонал (position='Медсестра'), не лікарі
- Втручання = 1 випадок з операцією; процедури = окремі ACHI-коди в ньому
- "Різне" — НЕ відділення, а маркер посади що ще не класифікована

## Запуск скриптів
pip install "psycopg[binary]>=3.2.0" python-dotenv requests
# .env: SUPABASE_DB_URL=postgresql://postgres:[PASS]@db.wnyfrckxhwujsjcfxqou.supabase.co:5432/postgres
python lsmd_db.py        # перевірка з'єднання
python analytics.py      # приклади аналітики
python backup.py         # бекап ключових таблиць
python geocode_localities.py  # геокодування міст
