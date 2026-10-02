-- raw_to_canon_h24_journal_events.sql
--
-- Health24 (org_edrpou 43343870). lpz_raw_h24_journal_events (403 577
-- записів, 10 знімків з нахлестом на межах періодів) → канон lpz_episodes
-- (поліклінічні візити — за конвенцією проєкту lpz_episodes = поліклінічні,
-- lpz_hospitalizations = стаціонар, memory: project_lpz_episodes_semantics).
--
-- Ключове:
--   1. Дедуп по raw.id: DISTINCT ON — 403 577 рядків з невеликим нахлестом
--      (398 596 унікальних id), беремо один на event id.
--   2. id (PK лікарні-незалежний) — md5('h24|org|je|'||id)::uuid.
--   3. patient_resource_id — та сама детермінована схема, що й у
--      lpz_hospitalizations/lpz_patients (без FK, звірка можлива напряму).
--   4. name/type — з encounter_reason (title/code): "Первинне звернення"/
--      "Primary treatment" тощо — це ТИП візиту, не діагноз (h24 не дає
--      діагноз в журналі подій, лише в самій медкартці).
--   5. event_time формату "HH:MM — HH:MM, DD.MM.YY" (уже Kyiv wall-clock,
--      без зсуву в JSON) -> period_start/period_end через regexp + explicit
--      Europe/Kyiv.
--   6. doc_resource_id — лише після кроку 0 (розширення lpz_empl лікарями
--      з журналу, яких не було серед госпіталізацій).
--   7. Відділення в журналі не деталізоване (лише назва закладу) —
--      department_structure_id тут немає в lpz_episodes і не потрібне.

BEGIN;

-- 0) Розширення lpz_empl лікарями, знайденими лише в журналі подій
INSERT INTO lpz.lpz_empl (org_edrpou, resource_id, last_name, first_name, middle_name)
SELECT DISTINCT
  '43343870',
  md5('h24|43343870|empl|' || employee_id)::uuid,
  split_part(employee_full_name, ' ', 1),
  split_part(employee_full_name, ' ', 2),
  NULLIF(split_part(employee_full_name, ' ', 3), '')
FROM lpz.lpz_raw_h24_journal_events
WHERE org_edrpou = '43343870' AND employee_id IS NOT NULL
ON CONFLICT (org_edrpou, resource_id) DO NOTHING;

-- 1) Дедуп + парсинг часу
CREATE TEMP TABLE stg_h24_je ON COMMIT DROP AS
SELECT DISTINCT ON (id)
  id AS raw_id,
  md5('h24|43343870|je|' || id)::uuid AS episode_id,
  md5('h24|43343870|patient|' || patient_id)::uuid AS patient_resource_id,
  patient_name AS patient_short_name,
  encounter_reason_title AS name,
  encounter_reason_code AS type,
  employee_id,
  employee_full_name,
  CASE WHEN event_time ~ '^\d{2}:\d{2} — \d{2}:\d{2}, \d{2}\.\d{2}\.\d{2}$'
    THEN (regexp_replace(event_time, '^(\d{2}):(\d{2}) — \d{2}:\d{2}, (\d{2})\.(\d{2})\.(\d{2})$', '20\5-\4-\3 \1:\2')::timestamp AT TIME ZONE 'Europe/Kyiv')
  END AS period_start,
  CASE WHEN event_time ~ '^\d{2}:\d{2} — \d{2}:\d{2}, \d{2}\.\d{2}\.\d{2}$'
    THEN (regexp_replace(event_time, '^\d{2}:\d{2} — (\d{2}):(\d{2}), (\d{2})\.(\d{2})\.(\d{2})$', '20\5-\4-\3 \1:\2')::timestamp AT TIME ZONE 'Europe/Kyiv')
  END AS period_end
FROM lpz.lpz_raw_h24_journal_events
WHERE org_edrpou = '43343870' AND id IS NOT NULL
ORDER BY id, loaded_at DESC NULLS LAST;

SELECT count(*) AS staged, count(*) FILTER (WHERE period_start IS NULL) AS no_time FROM stg_h24_je;

-- 2) Upsert у канон (id — PK, конфлікт по ньому)
INSERT INTO lpz.lpz_episodes (
  id, org_edrpou, patient_resource_id, patient_short_name, name, type,
  period_start, period_end, last_encounter_at, doc_resource_id, doc_short_name
)
SELECT
  s.episode_id, '43343870', s.patient_resource_id, s.patient_short_name, s.name, s.type,
  s.period_start, s.period_end, s.period_start,
  e.resource_id, s.employee_full_name
FROM stg_h24_je s
LEFT JOIN lpz.lpz_empl e ON e.org_edrpou = '43343870' AND e.resource_id = md5('h24|43343870|empl|' || s.employee_id)::uuid
ON CONFLICT (id) DO UPDATE SET
  patient_resource_id = EXCLUDED.patient_resource_id,
  patient_short_name = EXCLUDED.patient_short_name,
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  period_start = EXCLUDED.period_start,
  period_end = EXCLUDED.period_end,
  last_encounter_at = EXCLUDED.last_encounter_at,
  doc_resource_id = EXCLUDED.doc_resource_id,
  doc_short_name = EXCLUDED.doc_short_name;

SELECT count(*) AS total_episodes FROM lpz.lpz_episodes WHERE org_edrpou = '43343870';

COMMIT;
