-- raw_to_canon_patients_enrich.sql
--
-- Донабирає lpz_patients усіма контактними/адресними полями, які реально є
-- в lpz_raw_hospitalizations_closed/open (patient_data_*), звірено проти
-- вже наявних (доhelsi) записів пацієнтів, щоб нові мали ту саму повноту
-- полів, що й старі (телефон/email/адреса/ІПН/декларація/раойн/тип
-- населеного пункту тощо) — прямо за вказівкою користувача 2026-09-08.
--
-- Правило: заповнюємо лише порожні поля (COALESCE на старе значення) —
-- не затираємо вже наявні (можливо вручну виправлені) дані.
--
-- Формат адресних полів у старих (доhelsi) записах:
--   oblast="Чернівецька", raion="Кіцманський", settlement_type="село",
--   settlement_name="Глиниця", street="Головна, 30" (вулиця+будинок разом).
-- У raw це збирається так: region -> raion (НЕ oblast — "КЕЛЬМЕНЕЦЬКИЙ" явно
-- район, не область), oblast/settlement_type парсяться з address_text
-- ("Чернівецька обл. ..." / "село ..."/"місто ..."), street = street+house.

BEGIN;

CREATE TEMP TABLE stg_patient_data ON COMMIT DROP AS
WITH src AS (
  SELECT
    org_edrpou, patient_id, extracted_at,
    patient_data_phone, patient_data_primary_email, patient_data_tax_id, patient_data_unzr,
    patient_data_country, patient_data_city_of_birth, patient_data_resident, patient_data_is_preferential,
    patient_data_foreigner_first_name, patient_data_foreigner_last_name,
    patient_data_addresses_0_address_text, patient_data_addresses_0_street, patient_data_addresses_0_house,
    patient_data_addresses_0_city, patient_data_addresses_0_region,
    patient_data_declaration_status_id, patient_data_declaration_begin_date,
    patient_data_declaration_end_date, patient_data_declaration_division_id
  FROM lpz.lpz_raw_hospitalizations_closed WHERE org_edrpou = '43342788'
  UNION ALL
  SELECT
    org_edrpou, patient_id, extracted_at,
    patient_data_phone, patient_data_primary_email, patient_data_tax_id, patient_data_unzr,
    patient_data_country, patient_data_city_of_birth, patient_data_resident, patient_data_is_preferential,
    patient_data_foreigner_first_name, patient_data_foreigner_last_name,
    patient_data_addresses_0_address_text, patient_data_addresses_0_street, patient_data_addresses_0_house,
    patient_data_addresses_0_city, patient_data_addresses_0_region,
    patient_data_declaration_status_id, patient_data_declaration_begin_date,
    patient_data_declaration_end_date, patient_data_declaration_division_id
  FROM lpz.lpz_raw_hospitalizations_open WHERE org_edrpou = '43342788'
)
SELECT DISTINCT ON (patient_id)
  org_edrpou,
  patient_id::uuid AS patient_id,
  NULLIF(patient_data_phone, '') AS phone,
  NULLIF(patient_data_primary_email, '') AS email,
  NULLIF(patient_data_tax_id, '') AS tax_id,
  NULLIF(patient_data_unzr, '') AS unzr,
  NULLIF(patient_data_country, '') AS country_of_birth,
  NULLIF(patient_data_city_of_birth, '') AS city_of_birth,
  CASE lower(patient_data_resident) WHEN 'true' THEN true WHEN 'false' THEN false ELSE NULL END AS resident,
  CASE lower(patient_data_is_preferential) WHEN 'true' THEN true WHEN 'false' THEN false ELSE NULL END AS is_preferential,
  NULLIF(patient_data_foreigner_first_name, '') AS foreigner_first_name,
  NULLIF(patient_data_foreigner_last_name, '') AS foreigner_last_name,
  NULLIF(patient_data_addresses_0_address_text, '') AS address,
  NULLIF(trim(concat_ws(', ', NULLIF(patient_data_addresses_0_street, ''), NULLIF(patient_data_addresses_0_house, ''))), '') AS street,
  NULLIF(patient_data_addresses_0_city, '') AS settlement_name,
  NULLIF(patient_data_addresses_0_region, '') AS raion,
  (regexp_match(patient_data_addresses_0_address_text, '([А-ЯІЇЄҐ][А-Яа-яіїєґ]+)\s+обл\.'))[1] AS oblast,
  (regexp_match(patient_data_addresses_0_address_text, '^(місто|село|смт|селище)', 'i'))[1] AS settlement_type,
  NULLIF(patient_data_declaration_status_id, '') AS declaration_status,
  NULLIF(patient_data_declaration_begin_date, '')::date AS declaration_begin_date,
  NULLIF(patient_data_declaration_end_date, '')::date AS declaration_end_date,
  NULLIF(patient_data_declaration_division_id, '') AS family_doctor_division_id
FROM src
WHERE patient_id IS NOT NULL
ORDER BY patient_id, extracted_at DESC NULLS LAST;

SELECT count(*) AS staged FROM stg_patient_data;

UPDATE lpz.lpz_patients p SET
  phone = COALESCE(p.phone, s.phone),
  email = COALESCE(p.email, s.email),
  tax_id = COALESCE(p.tax_id, s.tax_id),
  unzr = COALESCE(p.unzr, s.unzr),
  country_of_birth = COALESCE(p.country_of_birth, s.country_of_birth),
  city_of_birth = COALESCE(p.city_of_birth, s.city_of_birth),
  resident = COALESCE(p.resident, s.resident),
  is_preferential = COALESCE(p.is_preferential, s.is_preferential),
  foreigner_first_name = COALESCE(p.foreigner_first_name, s.foreigner_first_name),
  foreigner_last_name = COALESCE(p.foreigner_last_name, s.foreigner_last_name),
  address = COALESCE(p.address, s.address),
  street = COALESCE(p.street, s.street),
  settlement_name = COALESCE(p.settlement_name, s.settlement_name),
  settlement_type = COALESCE(p.settlement_type, s.settlement_type),
  raion = COALESCE(p.raion, s.raion),
  oblast = COALESCE(p.oblast, s.oblast),
  declaration_status = COALESCE(p.declaration_status, s.declaration_status),
  declaration_begin_date = COALESCE(p.declaration_begin_date, s.declaration_begin_date),
  declaration_end_date = COALESCE(p.declaration_end_date, s.declaration_end_date),
  family_doctor_division_id = COALESCE(p.family_doctor_division_id, s.family_doctor_division_id)
FROM stg_patient_data s
WHERE p.org_edrpou = s.org_edrpou AND p.patient_id = s.patient_id;

SELECT
  count(*) AS total,
  count(*) FILTER (WHERE phone IS NOT NULL) AS with_phone,
  count(*) FILTER (WHERE address IS NOT NULL) AS with_address,
  count(*) FILTER (WHERE tax_id IS NOT NULL) AS with_tax_id,
  count(*) FILTER (WHERE oblast IS NOT NULL) AS with_oblast,
  count(*) FILTER (WHERE raion IS NOT NULL) AS with_raion
FROM lpz.lpz_patients WHERE org_edrpou = '43342788';

COMMIT;
