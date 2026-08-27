-- Схема lpz живе напряму в Supabase (див. db-export/lpz-project/), ці файли —
-- лише історія застосованих міграцій, не джерело правди для CI.
--
-- Додає p_month (default 'all') до 4 КПІ-функцій — підключення пігулок
-- місяців (utils.js:renderHeaderBlock) до реальних даних: клік на місяць
-- звужує КПІ-числа (не графік — той і так місячний) до конкретного місяця
-- обраного року. Новий параметр — останнім у списку (Postgres CREATE OR
-- REPLACE FUNCTION не дозволяє вставити параметр всередину списку існуючих).

CREATE OR REPLACE FUNCTION lpz.lpz_kpi_summary(p_org text, p_year text DEFAULT 'all'::text, p_month text DEFAULT 'all'::text)
 RETURNS TABLE(hosp bigint, pat bigint, bed numeric, age numeric, let numeric, max_admission_date date)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'lpz', 'public'
AS $function$
  select
    count(*) as hosp,
    count(distinct patient_id) as pat,
    round(avg(discharge_date - admission_date) filter (where discharge_date is not null), 1) as bed,
    round(avg(age) filter (where age is not null), 1) as age,
    round(100.0 * count(*) filter (where discharge_disposition_id = 1) / nullif(count(*), 0), 2) as "let",
    (select max(admission_date) from lpz.lpz_hospitalizations where org_edrpou = p_org) as max_admission_date
  from lpz.lpz_hospitalizations
  where org_edrpou = p_org
    and (
      p_year = 'all'
      or (p_year ~ '^\d{4}$' and extract(year from admission_date) = p_year::int)
    )
    and (
      p_month = 'all'
      or (p_month ~ '^\d{1,2}$' and extract(month from admission_date) = p_month::int)
    );
$function$;

CREATE OR REPLACE FUNCTION lpz.lpz_kpi_by_department(p_org text, p_year text DEFAULT 'all'::text, p_department uuid DEFAULT NULL::uuid, p_month text DEFAULT 'all'::text)
 RETURNS TABLE(hosp bigint, pat bigint, bed numeric, age numeric, imp numeric, let numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'lpz', 'public'
AS $function$
  select
    count(*) as hosp,
    count(distinct h.patient_id) as pat,
    round(avg(h.discharge_date - h.admission_date) filter (where h.discharge_date is not null), 1) as bed,
    round(avg(h.age) filter (where h.discharge_date is not null), 1) as age,
    round(100.0 * count(*) filter (where h.discharge_disposition_id in (2,3,5))
          / nullif(count(*) filter (where h.discharge_date is not null), 0), 2) as imp,
    round(100.0 * count(*) filter (where h.discharge_disposition_id = 1)
          / nullif(count(*) filter (where h.discharge_date is not null), 0), 2) as "let"
  from lpz.lpz_hospitalizations h
  where h.org_edrpou = p_org
    and (p_department is null or h.department_structure_id = p_department)
    and (
      p_year = 'all'
      or (p_year ~ '^\d{4}$' and extract(year from h.admission_date) = p_year::int)
    )
    and (
      p_month = 'all'
      or (p_month ~ '^\d{1,2}$' and extract(month from h.admission_date) = p_month::int)
    );
$function$;

CREATE OR REPLACE FUNCTION lpz.lpz_kpi_by_direction(p_org text, p_year text DEFAULT 'all'::text, p_direction text DEFAULT NULL::text, p_month text DEFAULT 'all'::text)
 RETURNS TABLE(hosp bigint, pat bigint, bed numeric, age numeric, imp numeric, let numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'lpz', 'public'
AS $function$
  select
    count(*) as hosp,
    count(distinct h.patient_id) as pat,
    round(avg(h.discharge_date - h.admission_date) filter (where h.discharge_date is not null), 1) as bed,
    round(avg(h.age) filter (where h.discharge_date is not null), 1) as age,
    round(100.0 * count(*) filter (where h.discharge_disposition_id in (2,3,5))
          / nullif(count(*) filter (where h.discharge_date is not null), 0), 2) as imp,
    round(100.0 * count(*) filter (where h.discharge_disposition_id = 1)
          / nullif(count(*) filter (where h.discharge_date is not null), 0), 2) as "let"
  from lpz.lpz_hospitalizations h
  join lpz.lpz_departments d
    on d.org_edrpou = h.org_edrpou and d.structure_id = h.department_structure_id
  where h.org_edrpou = p_org
    and (p_direction is null or d.direction = p_direction)
    and (
      p_year = 'all'
      or (p_year ~ '^\d{4}$' and extract(year from h.admission_date) = p_year::int)
    )
    and (
      p_month = 'all'
      or (p_month ~ '^\d{1,2}$' and extract(month from h.admission_date) = p_month::int)
    );
$function$;

CREATE OR REPLACE FUNCTION lpz.lpz_kpi_by_doctor(p_org text, p_year text DEFAULT 'all'::text, p_doctor uuid DEFAULT NULL::uuid, p_month text DEFAULT 'all'::text)
 RETURNS TABLE(hosp bigint, pat bigint, bed numeric, age numeric, imp numeric, let numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'lpz', 'public'
AS $function$
  select
    count(*) as hosp,
    count(distinct h.patient_id) as pat,
    round(avg(h.discharge_date - h.admission_date) filter (where h.discharge_date is not null), 1) as bed,
    round(avg(h.age) filter (where h.discharge_date is not null), 1) as age,
    round(100.0 * count(*) filter (where h.discharge_disposition_id in (2,3,5))
          / nullif(count(*) filter (where h.discharge_date is not null), 0), 2) as imp,
    round(100.0 * count(*) filter (where h.discharge_disposition_id = 1)
          / nullif(count(*) filter (where h.discharge_date is not null), 0), 2) as "let"
  from lpz.lpz_hospitalizations h
  where h.org_edrpou = p_org
    and exists (
      select 1 from lpz.lpz_episodes e
      where e.patient_resource_id = h.patient_id
        and e.org_edrpou = h.org_edrpou
        and e.doc_resource_id = p_doctor
        and e.period_start::date >= h.admission_date
        and e.period_start::date <= coalesce(h.discharge_date, current_date)
    )
    and (
      p_year = 'all'
      or (p_year ~ '^\d{4}$' and extract(year from h.admission_date) = p_year::int)
    )
    and (
      p_month = 'all'
      or (p_month ~ '^\d{1,2}$' and extract(month from h.admission_date) = p_month::int)
    );
$function$;
