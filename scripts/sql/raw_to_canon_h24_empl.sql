-- raw_to_canon_h24_empl.sql
--
-- Health24 (org_edrpou 43343870). Заводить відділення й лікарів, знайдених
-- у lpz_raw_h24_hospitalizations (department_*/employee_* поля), у
-- lpz_departments/lpz_empl, і донабиває department_structure_id/doc_resource_id
-- у вже завантажені lpz_hospitalizations (FK, раніше лишались NULL).
--
-- Обмеження джерела: у госпіталізаціях є лише employee.id/name/last_name —
-- немає посади/спеціальності/статі лікаря (position_id, role, sex тощо) —
-- свідомо лишаємо NULL, не вигадуємо. Ім'я/по-батькові парситься як 2-й/3-й
-- токен full_name мінус прізвище (стандартний порядок "Прізвище Ім'я
-- По-батькові") — може помилитись на складених іменах, прийнятно для
-- першого проходу.
--
-- Лікар прив'язаний лише до того відділення, де траплявся найчастіше
-- (department_structure_id у lpz_empl) — довідково, не для FK-логіки нижче.

BEGIN;

-- 1) Відділення
CREATE TEMP TABLE stg_h24_dept ON COMMIT DROP AS
SELECT DISTINCT
  department_id,
  md5('h24|43343870|dept|' || department_id)::uuid AS structure_id,
  department_name
FROM lpz.lpz_raw_h24_hospitalizations
WHERE org_edrpou = '43343870' AND department_id IS NOT NULL;

INSERT INTO lpz.lpz_departments (org_edrpou, structure_id, name)
SELECT '43343870', structure_id, department_name FROM stg_h24_dept
ON CONFLICT (org_edrpou, structure_id) DO NOTHING;

-- 2) Лікарі (лікуючі, з госпіталізацій) + найчастіше відділення
CREATE TEMP TABLE stg_h24_empl ON COMMIT DROP AS
WITH by_dept AS (
  SELECT
    employee_id, department_id,
    count(*) AS n,
    row_number() OVER (PARTITION BY employee_id ORDER BY count(*) DESC) AS rn
  FROM lpz.lpz_raw_h24_hospitalizations
  WHERE org_edrpou = '43343870' AND employee_id IS NOT NULL
  GROUP BY employee_id, department_id
),
main_dept AS (
  SELECT employee_id, department_id FROM by_dept WHERE rn = 1
),
names AS (
  SELECT DISTINCT ON (employee_id)
    employee_id, employee_name, employee_last_name
  FROM lpz.lpz_raw_h24_hospitalizations
  WHERE org_edrpou = '43343870' AND employee_id IS NOT NULL
  ORDER BY employee_id
)
SELECT
  n.employee_id,
  md5('h24|43343870|empl|' || n.employee_id)::uuid AS resource_id,
  n.employee_last_name AS last_name,
  split_part(n.employee_name, ' ', 2) AS first_name,
  NULLIF(split_part(n.employee_name, ' ', 3), '') AS middle_name,
  d.structure_id AS department_structure_id
FROM names n
LEFT JOIN main_dept md ON md.employee_id = n.employee_id
LEFT JOIN stg_h24_dept d ON d.department_id = md.department_id;

SELECT count(*) AS depts_staged FROM stg_h24_dept;
SELECT count(*) AS empl_staged FROM stg_h24_empl;

INSERT INTO lpz.lpz_empl (org_edrpou, resource_id, last_name, first_name, middle_name, department_structure_id)
SELECT '43343870', resource_id, last_name, first_name, middle_name, department_structure_id
FROM stg_h24_empl
ON CONFLICT (org_edrpou, resource_id) DO NOTHING;

-- 3) Донабір department_structure_id/doc_resource_id у вже завантажені госпіталізації
UPDATE lpz.lpz_hospitalizations h SET
  department_structure_id = d.structure_id,
  doc_resource_id = e.resource_id
FROM lpz.lpz_raw_h24_hospitalizations r
LEFT JOIN stg_h24_dept d ON d.department_id = r.department_id
LEFT JOIN stg_h24_empl e ON e.employee_id = r.employee_id
WHERE h.org_edrpou = '43343870'
  AND r.org_edrpou = '43343870'
  AND h.id_case = r.id::bigint
  AND (h.department_structure_id IS NULL OR h.doc_resource_id IS NULL);

SELECT
  count(*) AS total,
  count(*) FILTER (WHERE department_structure_id IS NOT NULL) AS with_dept,
  count(*) FILTER (WHERE doc_resource_id IS NOT NULL) AS with_doc
FROM lpz.lpz_hospitalizations WHERE org_edrpou = '43343870';

COMMIT;
