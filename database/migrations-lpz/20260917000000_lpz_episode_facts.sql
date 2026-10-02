-- Схема lpz живе напряму в Supabase, ці файли — лише історія застосованих
-- міграцій.
--
-- lpz_episode_facts — сирі факти епізоду з helsi (діагнози, втручання,
-- статуси ЕСОЗ, реальний вердикт package-validation), а не готові висновки.
-- На відміну від lpz_case_quality_snapshot (готові flags/warnings), тут
-- зберігаємо факти, щоб перевіряти й уточнювати правила SQL-ем по вже
-- зібраних даних, без повторного походу в helsi.
-- Заповнюється вручну/скриптом через сесію helsi в Chrome (як і щоденний
-- прогін quality-контролю), читається лише сервером — RLS без політик.

create table lpz.lpz_episode_facts (
  id bigserial primary key,
  org_edrpou text not null,
  helsi_case_id uuid not null,
  discharge_encounter_id uuid,
  card_number text,
  status text,

  admission_at timestamptz not null,
  discharge_at timestamptz, -- null для відкритих епізодів

  department_id uuid,
  department_name text,
  doctor_id uuid,
  doctor_position text,

  admit_source text,
  priority text,
  re_admission text,
  injury_type int,

  primary_icd text,
  secondary_icd text[] not null default '{}',
  complication_icd text[] not null default '{}',
  external_cause_icd text[] not null default '{}',

  intervention_codes text[] not null default '{}',
  operation_codes text[] not null default '{}',

  discharge_disposition text,
  discharge_status text,
  discharge_ehealth_status text,
  discharge_signed_by_position text,
  working_capacity int,

  package_number int,
  package_name text,
  dsg_code text,
  dsg_name text,
  validation_success boolean,
  validation_messages jsonb,
  dsg_coefficient numeric(6,3),
  price int,
  adjustment_coefficient numeric(4,2),
  adjustment_price int,

  collected_at timestamptz not null default now(),
  unique (org_edrpou, helsi_case_id)
);
create index lpz_episode_facts_org_dept on lpz.lpz_episode_facts (org_edrpou, department_id);
alter table lpz.lpz_episode_facts enable row level security;

grant select, insert, update, delete on lpz.lpz_episode_facts to service_role;
grant usage, select on sequence lpz.lpz_episode_facts_id_seq to service_role;

-- Стан епізоду в ЕСОЗ — окреме джерело, /api/cards (модуль "Розміщення
-- пацієнта"/reception), не encounter_cases. card_status/esoz_episode_status
-- підтверджено на реальних даних 2026-09-17: закрита картка з ручною
-- випискою (не "Виписаний(Автоматично)") може НЕ мати esoz_episode_status
-- взагалі — тоді епізод в ЕСОЗ не завершено і, за попередженням helsi,
-- випадок не буде оплачено, навіть якщо card_status уже "Complete".
alter table lpz.lpz_episode_facts
  add column if not exists card_status text,
  add column if not exists esoz_episode_status text,
  add column if not exists discharge_event_id uuid,
  add column if not exists resolution_name text;
