-- Схема lpz живе напряму в Supabase, ці файли — лише історія застосованих
-- міграцій (зведено три послідовні міграції 2026-09-14 в один файл).
--
-- lpz_case_quality_snapshot — щоденна перевірка випадків на помилки, що
-- впливають на оплату НСЗУ (public/quality.html). Заповнюється
-- scripts/helsi_quality_daily.js через pages/api/local-quality-ingest.js,
-- читається лише сервером (/api/lpz-case-quality) — RLS без політик.
-- flags — помилки, warnings — попередження для відкритих епізодів;
-- fix_deadline — останній день подачі змін до НСЗУ для закритого випадку.

create table lpz.lpz_case_quality_snapshot (
  id bigserial primary key,
  org_edrpou text not null,
  snapshot_at timestamptz not null default now(),
  helsi_case_id uuid not null,
  card_number text,
  is_open boolean not null,
  admission_at timestamptz,
  discharge_at timestamptz,
  los_days numeric(6,1),
  department_name text,
  department_structure_id uuid,
  doctor_name text,
  doctor_resource_id uuid,
  doctor_position text,
  primary_icd text,
  primary_name text,
  dx_codes text[] not null default '{}',
  procedures_count int not null default 0,
  disposition text,
  discharge_ehealth_status text,
  flags text[] not null default '{}',
  warnings text[] not null default '{}',
  checked_at timestamptz,
  first_flagged_at timestamptz,
  resolved_at timestamptz,
  fix_deadline date,
  unique (org_edrpou, helsi_case_id)
);
create index lpz_case_quality_snapshot_org_dept on lpz.lpz_case_quality_snapshot (org_edrpou, department_structure_id);
alter table lpz.lpz_case_quality_snapshot enable row level security;

-- hints — вторинні підказки з даних самого випадку: { код_зауваження: текст }.
alter table lpz.lpz_case_quality_snapshot add column if not exists hints jsonb not null default '{}'::jsonb;
-- Вхідні дані для орієнтовної вартості випадку (lib/quality-pricing.js).
alter table lpz.lpz_case_quality_snapshot
  add column if not exists operations_count int not null default 0,
  add column if not exists admission_priority text;

grant select, insert, update, delete on lpz.lpz_case_quality_snapshot to service_role;
grant usage, select on sequence lpz.lpz_case_quality_snapshot_id_seq to service_role;
