-- Етап: RLS політики (4 ролі)

-- Ролі: admin / head_dept / doctor / viewer
-- empl.auth_user_id → зв'язок з auth.users
-- empl.app_role → роль

-- Helper-функції: current_app_role(), is_admin(), current_doctor_id(), current_dept_id()

-- Політики:
--  Довідники (МКХ, відділення) — читання всім authenticated
--  lsmd — admin усе, head_dept своє відділення, doctor свої випадки
--  patients_best — лікар тільки своїх пацієнтів

-- ВАЖЛИВО: обгортати функції в (SELECT ...) для продуктивності (InitPlan caching)
-- Проміжні таблиці (lsmd_doctors) потребують політики читання
