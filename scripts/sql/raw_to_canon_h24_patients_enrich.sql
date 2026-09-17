-- raw_to_canon_h24_patients_enrich.sql
--
-- Health24 (org_edrpou 43343870), НЕ helsi. Джерело — lpz_raw_h24_patients
-- (повний реєстр пацієнтів закладу, 72 871 — значно більше за тих, хто був
-- у стаціонарі). Два кроки:
--   1) INSERT відсутніх пацієнтів (ті, кого не було серед госпіталізацій —
--      амбулаторні/поліклінічні, ще не імпортовані окремо).
--   2) UPDATE COALESCE — донабір контактних/адресних полів лише туди, де
--      порожньо (не затираємо наявне).
--
-- У h24 немає структурованої адреси (oblast/raion/settlement/street
-- окремо) — address один вільний текстовий рядок, лишаємо як є, не парсимо
-- на компоненти (не вигадуємо те, чого нема в джерелі). declaration завжди
-- NULL у цьому знімку — не заповнюємо.
--
-- Дублікат в raw (72871 рядків, 72870 унікальних id, одна пара з offset-
-- пагінації) — DISTINCT ON (id) прибирає.

BEGIN;

CREATE TEMP TABLE stg_h24_patients ON COMMIT DROP AS
SELECT DISTINCT ON (id)
  '43343870'::text AS org_edrpou,
  md5('h24|43343870|patient|' || id)::uuid AS patient_id,
  trim(concat_ws(' ', last_name, first_name, second_name)) AS full_name,
  NULLIF(last_name, '') AS last_name,
  NULLIF(first_name, '') AS first_name,
  NULLIF(second_name, '') AS second_name,
  CASE gender WHEN 'male' THEN 'Ч' WHEN 'female' THEN 'Ж' ELSE NULL END AS gender,
  NULLIF(birth_date, '')::date AS birthday_date,
  NULLIF(age, '')::int AS age,
  NULLIF(address, '') AS address,
  NULLIF(phone, '') AS phone,
  NULLIF(email, '') AS email,
  NULLIF(tax_id, '') AS tax_id
FROM lpz.lpz_raw_h24_patients
WHERE id IS NOT NULL
ORDER BY id, loaded_at DESC NULLS LAST;

SELECT count(*) AS staged FROM stg_h24_patients;

-- 1) Пацієнти, яких ще нема в каноні (амбулаторні, не в стаціонарі)
INSERT INTO lpz.lpz_patients (org_edrpou, patient_id, full_name, last_name, first_name, middle_name, gender, birthday, age, address, phone, email, tax_id)
SELECT org_edrpou, patient_id, full_name, last_name, first_name, second_name, gender, birthday_date::text, age, address, phone, email, tax_id
FROM stg_h24_patients
ON CONFLICT (org_edrpou, patient_id) DO NOTHING;

-- 2) Донабір полів у вже наявних (зі стаціонару) — лише порожні
UPDATE lpz.lpz_patients p SET
  address = COALESCE(p.address, s.address),
  phone = COALESCE(p.phone, s.phone),
  email = COALESCE(p.email, s.email),
  tax_id = COALESCE(p.tax_id, s.tax_id),
  age = COALESCE(p.age, s.age)
FROM stg_h24_patients s
WHERE p.org_edrpou = s.org_edrpou AND p.patient_id = s.patient_id;

SELECT
  count(*) AS total,
  count(*) FILTER (WHERE address IS NOT NULL) AS with_address,
  count(*) FILTER (WHERE phone IS NOT NULL) AS with_phone,
  count(*) FILTER (WHERE tax_id IS NOT NULL) AS with_tax_id
FROM lpz.lpz_patients WHERE org_edrpou = '43343870';

COMMIT;
