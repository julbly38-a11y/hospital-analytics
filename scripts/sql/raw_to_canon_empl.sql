-- raw_to_canon_empl.sql
--
-- Синхронізує lpz_empl з lpz_raw_resources: оновлює відділення/посаду/контакти
-- для вже наявних співробітників, додає нових. НЕ чіпає role для вже наявних
-- (той шар курировано вручну — project_department_heads_gap), для нових
-- визначає role простим патерном по назві посади (завідувач/головн->head,
-- заступник->deputy, сестра->nurse, інакше->doctor) — так само, як і решта
-- системи вже визначає ролі з посад.

BEGIN;

-- 1) Оновлення вже наявних (відділення/посада могли змінитись)
UPDATE lpz.lpz_empl e SET
  position_id = r.position_id,
  position_name = r.position_name,
  qualification = COALESCE(r.qualification_name, e.qualification),
  speciality_names = COALESCE(r.speciality_name, e.speciality_names),
  department_structure_id = COALESCE(r.division_structure_id, e.department_structure_id),
  phone = COALESCE(NULLIF(r.phone, ''), e.phone),
  email = COALESCE(NULLIF(r.email, ''), e.email)
FROM lpz.lpz_raw_resources r
WHERE e.org_edrpou = '43342788'
  AND r.org_edrpou = '43342788'
  AND e.resource_id = r.resource_id;

-- 2) Нові співробітники з raw, яких ще нема в каноні
INSERT INTO lpz.lpz_empl (
  org_edrpou, resource_id, last_name, first_name, middle_name,
  birth_date, sex, phone, email, position_id, position_name,
  speciality_names, qualification, department_structure_id, role, resource_type
)
SELECT
  r.org_edrpou, r.resource_id, r.last_name, r.first_name, r.middle_name,
  NULLIF(r.birth_date, '')::date,
  r.sex,
  NULLIF(r.phone, ''), NULLIF(r.email, ''),
  r.position_id, r.position_name,
  r.speciality_name, r.qualification_name,
  r.division_structure_id,
  CASE
    WHEN r.position_name ILIKE '%завідувач%' OR r.position_name ILIKE '%головн%' THEN 'head'
    WHEN r.position_name ILIKE '%заступник%' THEN 'deputy'
    WHEN r.position_name ILIKE '%сестра%' THEN 'nurse'
    ELSE 'doctor'
  END,
  r.resource_type
FROM lpz.lpz_raw_resources r
LEFT JOIN lpz.lpz_empl e ON e.org_edrpou = r.org_edrpou AND e.resource_id = r.resource_id
WHERE r.org_edrpou = '43342788' AND e.resource_id IS NULL;

SELECT count(*) AS total_empl FROM lpz.lpz_empl WHERE org_edrpou = '43342788';

COMMIT;
