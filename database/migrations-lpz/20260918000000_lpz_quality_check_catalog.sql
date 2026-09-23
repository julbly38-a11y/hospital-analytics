-- Схема lpz живе напряму в Supabase, ці файли — лише історія застосованих
-- міграцій.
--
-- lpz_quality_check_catalog — каталог перевірок коректності епізоду
-- (single_dx, injury_no_type, no_esoz тощо): для кожної — чи реально блокує
-- оплату НСЗУ (перевірено живими викликами package-validation helsi чи
-- явними попередженнями в UI, а не припущенням), скільки епізодів має цю
-- ознаку зараз. Заповнюється вручну за результатами перевірки в чаті —
-- не автоматичний прогін. Один рядок = один тип перевірки на профіль.
create table lpz.lpz_quality_check_catalog (
  id bigserial primary key,
  code text not null,
  label_uk text not null,
  description_uk text,
  profile text not null default 'травматологія',
  blocks_payment text not null check (blocks_payment in ('так', 'ні', 'невідомо')),
  evidence_uk text,
  verification_method text,
  episodes_count int,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (code, profile)
);
alter table lpz.lpz_quality_check_catalog enable row level security;

grant select, insert, update, delete on lpz.lpz_quality_check_catalog to service_role;
grant usage, select on sequence lpz.lpz_quality_check_catalog_id_seq to service_role;
