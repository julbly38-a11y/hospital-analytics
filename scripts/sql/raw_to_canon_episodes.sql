-- raw_to_canon_episodes.sql
--
-- Переносить lpz_raw_episodes → канон lpz_episodes. Ідемпотентний upsert по
-- id (справжній helsi uuid, глобальний PK без org_edrpou в ключі).
--
-- Правила (див. project_lpz_raw_json_loader.md):
--   1. Дублікати id в raw (той самий епізод перезаписаний кількома
--      сторінками пагінації) — брати рядок з найсвіжішим last_updated_at.
--   2. doc_resource_id — FK на lpz_empl; якщо лікаря нема в довіднику —
--      NULL (не вигадуємо), не блокуємо вставку решти полів.
--   3. Заміна '43342788' на потрібний ЄДРПОУ при запуску для іншої лікарні.

BEGIN;

CREATE TEMP TABLE stg_ep ON COMMIT DROP AS
SELECT DISTINCT ON (id)
  org_edrpou,
  id::uuid AS id,
  NULLIF(patient_id, '')::uuid AS patient_resource_id,
  patient_short_name,
  name,
  type,
  status,
  NULLIF(period_start, '')::timestamptz AS period_start,
  NULLIF(period_end, '')::timestamptz AS period_end,
  NULLIF(last_enc_at, '')::timestamptz AS last_encounter_at,
  NULLIF(resource_id, '')::uuid AS doc_resource_id,
  resource_short_name AS doc_short_name,
  synchronization_status,
  NULLIF(created_at, '')::timestamptz AS created_at,
  NULLIF(last_updated_at, '')::timestamptz AS last_updated_at
FROM lpz.lpz_raw_episodes
WHERE org_edrpou = '43342788'
ORDER BY id, NULLIF(last_updated_at, '')::timestamptz DESC NULLS LAST;

INSERT INTO lpz.lpz_episodes (
  id, org_edrpou, patient_resource_id, patient_short_name, name, type, status,
  period_start, period_end, last_encounter_at, doc_resource_id, doc_short_name,
  synchronization_status, created_at, last_updated_at
)
SELECT
  s.id, s.org_edrpou, s.patient_resource_id, s.patient_short_name, s.name, s.type, s.status,
  s.period_start, s.period_end, s.last_encounter_at,
  emp.resource_id, s.doc_short_name,
  s.synchronization_status, s.created_at, s.last_updated_at
FROM stg_ep s
LEFT JOIN lpz.lpz_empl emp ON emp.org_edrpou = s.org_edrpou AND emp.resource_id = s.doc_resource_id
ON CONFLICT (id) DO UPDATE SET
  patient_resource_id = EXCLUDED.patient_resource_id,
  patient_short_name = EXCLUDED.patient_short_name,
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  status = EXCLUDED.status,
  period_start = EXCLUDED.period_start,
  period_end = EXCLUDED.period_end,
  last_encounter_at = EXCLUDED.last_encounter_at,
  doc_resource_id = COALESCE(EXCLUDED.doc_resource_id, lpz.lpz_episodes.doc_resource_id),
  doc_short_name = COALESCE(EXCLUDED.doc_short_name, lpz.lpz_episodes.doc_short_name),
  synchronization_status = EXCLUDED.synchronization_status,
  last_updated_at = EXCLUDED.last_updated_at;

SELECT max(period_start) AS new_max_period_start, count(*) AS total_rows_org
FROM lpz.lpz_episodes WHERE org_edrpou = '43342788';

COMMIT;
