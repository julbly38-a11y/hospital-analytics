-- ============================================================
-- LSMD Database Schema (snapshot)
-- Supabase project: wnyfrckxhwujsjcfxqou (PostgreSQL 17)
-- 33 таблиці, згенеровано з information_schema
-- ============================================================

-- ===== ДОВІДНИКИ МКХ-10 =====

CREATE TABLE icd_chapters (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  roman text NOT NULL,
  letters text NOT NULL,
  name text NOT NULL UNIQUE,
  block_range text NOT NULL UNIQUE
);

CREATE TABLE icd_blocks (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  chapter_letter text NOT NULL,
  chapter_name text NOT NULL,
  block_range text NOT NULL,
  block_start text NOT NULL,
  block_end text NOT NULL,
  block_name text NOT NULL,
  chapter_id bigint REFERENCES icd_chapters(id)
);

CREATE TABLE icd_10 (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  code_level1 text NOT NULL,        -- глава (літера)
  category_level1 text,             -- назва глави
  code_level2 text,                 -- 3-значний код
  diagnosis_level2 text,
  code_level3 text,                 -- код з крапкою
  diagnosis_level3 text,
  icd_code text UNIQUE,             -- COALESCE(level3, level2)
  usage_count integer,
  used_in_lsmd boolean,
  block_id bigint REFERENCES icd_blocks(id)
);

-- 17 малих блок-довідників (FK до icd_blocks.block_range)
-- parasit, neoplastics, blood, endo, lor, krovoobig, resp,
-- gastro, skin, osteo, uro, pregnan, perinatal, teratos,
-- deviation, traum, accidental

-- ===== ШТАТНА СТРУКТУРА =====

CREATE TABLE dept_categories (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name text NOT NULL UNIQUE         -- клінічне / не_клінічне
);

CREATE TABLE clinical_blocks (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name text NOT NULL UNIQUE         -- хірургічний / терапевтичний / інтенсивна_терапія
);

CREATE TABLE empl (
  name_id bigint PRIMARY KEY,
  emp_name text, eh_empr_taxid text, eh_empr_status text,
  employee_ehealth_id bigint, employee_email text,
  gender_id text, emp_birthday text,
  specialization text, eh_empr_doc_type text, eh_empr_doc_numb text,
  emp_phone bigint, full_name text,
  department text, position text, emp_status text,
  department_id bigint REFERENCES departments(id),
  block_id bigint REFERENCES clinical_blocks(id),
  category_id bigint REFERENCES dept_categories(id),
  auth_user_id uuid,                -- зв'язок з auth.users
  app_role text DEFAULT 'doctor'    -- admin/head_dept/doctor/viewer
);

CREATE TABLE departments (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  dept_name text NOT NULL,
  head_empl_id bigint REFERENCES empl(name_id),
  staff_count integer,
  doctors_count integer,            -- ординаторів
  likari_count integer,             -- лікарів (без візитів)
  category_id bigint REFERENCES dept_categories(id),
  block_id bigint REFERENCES clinical_blocks(id)
);

CREATE TABLE app_users (
  auth_user_id uuid PRIMARY KEY,
  role text NOT NULL DEFAULT 'viewer',
  empl_name_id bigint REFERENCES empl(name_id),
  created_at timestamptz DEFAULT now()
);

-- ===== ПАЦІЄНТИ + ГЕОЛОКАЦІЯ =====

CREATE TABLE localities (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  city_name text NOT NULL,
  district text, region text,
  patients_count integer DEFAULT 0,
  latitude numeric(9,6), longitude numeric(9,6),
  geocoded_at timestamptz,
  UNIQUE (city_name, district, region)
);

CREATE TABLE patients_best (
  patient_id bigint PRIMARY KEY,
  registry_data text, time text,
  full_name text, patient_name text, patient_prename text, parental text,
  age bigint, phone_num text, locality text, patient_nationality text,
  gender text, district text, region text, birthday text, category text,
  address text, city_name text, week text,
  num bigint, month bigint, year bigint,
  short_name text,
  locality_id bigint REFERENCES localities(id)
);

-- ===== КЛІНІЧНІ ДАНІ =====

CREATE TABLE operations (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  code text NOT NULL UNIQUE,        -- комбінація ACHI-кодів
  codes_count integer NOT NULL,     -- к-сть процедур
  cases_count integer NOT NULL DEFAULT 0
);

CREATE TABLE lsmd_doctors (
  doctor_id bigint PRIMARY KEY,
  doc_name text NOT NULL,
  empl_name_id bigint REFERENCES empl(name_id)
);

CREATE TABLE lsmd (
  id_case bigint PRIMARY KEY,
  admission_type text, patient_name text, gender text, phone_number text,
  admission_date text, age text, birth_date text, discharge_date text,
  admission_department text, current_department text, discharge_department text,
  icd_admission text,
  icd_primary text REFERENCES icd_10(icd_code),
  doc_name text, discharge_status text, address text,
  operation text, referral text, referral_status text, last_ehealth_sync text,
  doctor_id bigint REFERENCES lsmd_doctors(doctor_id),
  patient_id bigint REFERENCES patients_best(patient_id),
  admission_time text,
  -- типізовані колонки
  admission_date_d date, admission_ts timestamp,
  discharge_date_d date, discharge_ts timestamp,
  birth_date_d date, length_of_stay integer,
  operation_id bigint REFERENCES operations(id),
  shift_time text,                  -- денне / нічне
  day_type text                     -- будній / вихідний
);

-- ===== АГРЕГАТИ / ЧЕРГУВАННЯ =====

CREATE TABLE doctor_shifts (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  empl_name_id bigint NOT NULL REFERENCES empl(name_id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  cases_count integer NOT NULL DEFAULT 0,
  first_admission timestamp, last_admission timestamp,
  UNIQUE (empl_name_id, shift_date)
);

CREATE TABLE doctor_stats (
  doctor_id bigint PRIMARY KEY REFERENCES empl(name_id) ON DELETE CASCADE,
  total_cases integer NOT NULL DEFAULT 0,
  day_cases integer NOT NULL DEFAULT 0,
  night_cases integer NOT NULL DEFAULT 0,
  weekend_cases integer NOT NULL DEFAULT 0,
  night_weekend integer NOT NULL DEFAULT 0,
  unique_patients integer NOT NULL DEFAULT 0,
  deaths integer NOT NULL DEFAULT 0,
  improved integer NOT NULL DEFAULT 0,
  avg_los numeric(6,1),
  first_case date, last_case date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE dept_transfers_matrix (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  dept_in_id bigint NOT NULL REFERENCES departments(id),
  dept_out_id bigint NOT NULL REFERENCES departments(id),
  cases integer NOT NULL,
  avg_los numeric(6,1),
  UNIQUE (dept_in_id, dept_out_id)
);

-- ============================================================
-- VIEW (8): interventions, lsmd_transfers, lsmd_deaths_24h,
--   doctor_patient_links, doctor_discharges, doctor_diagnoses,
--   lsmd_shift_type, icd_hierarchy
-- MVIEW (4): mv_daily_stats, mv_dept_stats, mv_doctor_full, mv_icd_usage
-- Див. database/views/ та migrations/06,07
-- ============================================================
