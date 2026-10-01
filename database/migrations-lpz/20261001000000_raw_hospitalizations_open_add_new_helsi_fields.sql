-- 2026-10-01: helsi додала нові поля у відкриті картки (/api/cards) — завантажувач
-- load_json_raw.py відмовляється писати, поки в lpz_raw_hospitalizations_open нема цих колонок.
-- Додаємо порожні text-колонки (IF NOT EXISTS: безпечно повторювати; наявні дані не змінюються).
ALTER TABLE lpz.lpz_raw_hospitalizations_open
  ADD COLUMN IF NOT EXISTS patient_data_age_from_fast_emk text,
  ADD COLUMN IF NOT EXISTS patient_data_is_working text,
  ADD COLUMN IF NOT EXISTS patient_data_personal_data_creator text,
  ADD COLUMN IF NOT EXISTS patient_data_personal_data_creator_attributes_department text,
  ADD COLUMN IF NOT EXISTS patient_data_personal_data_creator_attributes_division text,
  ADD COLUMN IF NOT EXISTS patient_data_personal_data_creator_attributes_organization text,
  ADD COLUMN IF NOT EXISTS patient_data_personal_data_creator_attributes_position text,
  ADD COLUMN IF NOT EXISTS patient_data_personal_data_creator_attributes_subdivision text,
  ADD COLUMN IF NOT EXISTS patient_data_personal_data_dt text,
  ADD COLUMN IF NOT EXISTS patient_data_secondary_patient_ids_3 text;
