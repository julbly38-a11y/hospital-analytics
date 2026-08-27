-- Виправлення 2026-08-28: звʼязок лікар↔госпіталізація через lpz_episodes
-- (поліклінічні епізоди — концептуально хибний proxy, див. память
-- project_lpz_episodes_semantics) замінено на той самий 2-рівневий fallback,
-- що вже стояв у lpz_department_census: спершу h.doc_resource_id (завжди
-- порожній зараз, але на майбутнє), потім lpz_hospitalization_doctors
-- (100% збіг doctor_id з lpz_empl.resource_id, лише 2026 рік), і лише як
-- останній fallback — lpz_episodes (для років, які hospitalization_doctors
-- не покриває, краще неточний сигнал, ніж нічого).
--
-- EXISTS-патерн (не coalesce/LIMIT 1, як у census) — безпечний навіть при
-- рідкісних колізіях (patient_name+admission_date з різними doctor_id):
-- перевіряє лише "чи є СЕРЕД кандидатів потрібний лікар", не обирає
-- єдиного "правильного".

create or replace function lpz.lpz_kpi_by_doctor(p_org text, p_year text default 'all'::text, p_doctor uuid default null::uuid)
returns table(hosp bigint, pat bigint, bed numeric, age numeric, imp numeric, let numeric)
language sql
security definer
set search_path to 'lpz', 'public'
as $function$
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
    and (
      h.doc_resource_id = p_doctor
      or exists (
        select 1 from lpz.lpz_hospitalization_doctors hd
        where hd.org_edrpou = h.org_edrpou
          and hd.patient_name = h.patient_name
          and hd.admission_date = h.admission_date
          and hd.doctor_id = p_doctor
      )
      or exists (
        select 1 from lpz.lpz_episodes e
        where e.patient_resource_id = h.patient_id
          and e.org_edrpou = h.org_edrpou
          and e.doc_resource_id = p_doctor
          and e.period_start::date >= h.admission_date
          and e.period_start::date <= coalesce(h.discharge_date, current_date)
      )
    )
    and (
      p_year = 'all'
      or (p_year ~ '^\d{4}$' and extract(year from h.admission_date) = p_year::int)
    );
$function$;

create or replace function lpz.lpz_kpi_by_doctor(p_org text, p_year text default 'all'::text, p_doctor uuid default null::uuid, p_month text default 'all'::text)
returns table(hosp bigint, pat bigint, bed numeric, age numeric, imp numeric, let numeric)
language sql
security definer
set search_path to 'lpz', 'public'
as $function$
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
    and (
      h.doc_resource_id = p_doctor
      or exists (
        select 1 from lpz.lpz_hospitalization_doctors hd
        where hd.org_edrpou = h.org_edrpou
          and hd.patient_name = h.patient_name
          and hd.admission_date = h.admission_date
          and hd.doctor_id = p_doctor
      )
      or exists (
        select 1 from lpz.lpz_episodes e
        where e.patient_resource_id = h.patient_id
          and e.org_edrpou = h.org_edrpou
          and e.doc_resource_id = p_doctor
          and e.period_start::date >= h.admission_date
          and e.period_start::date <= coalesce(h.discharge_date, current_date)
      )
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

create or replace function lpz.lpz_trend_by_doctor(p_org text, p_year text default 'all'::text, p_doctor uuid default null::uuid)
returns table(x integer, y bigint, y_urgent bigint, y_planned bigint)
language sql
security definer
set search_path to 'lpz', 'public'
as $function$
  select
    case when p_year = 'all' then extract(year from h.admission_date)::int
         else extract(month from h.admission_date)::int end as x,
    count(*) as y,
    count(*) filter (where lpz.lpz_is_urgent_icd(h.icd_primary)) as y_urgent,
    count(*) filter (where not lpz.lpz_is_urgent_icd(h.icd_primary)) as y_planned
  from lpz.lpz_hospitalizations h
  where h.org_edrpou = p_org
    and h.admission_date is not null
    and (
      h.doc_resource_id = p_doctor
      or exists (
        select 1 from lpz.lpz_hospitalization_doctors hd
        where hd.org_edrpou = h.org_edrpou
          and hd.patient_name = h.patient_name
          and hd.admission_date = h.admission_date
          and hd.doctor_id = p_doctor
      )
      or exists (
        select 1 from lpz.lpz_episodes e
        where e.patient_resource_id = h.patient_id
          and e.org_edrpou = h.org_edrpou
          and e.doc_resource_id = p_doctor
          and e.period_start::date >= h.admission_date
          and e.period_start::date <= coalesce(h.discharge_date, current_date)
      )
    )
    and (
      p_year = 'all'
      or (p_year ~ '^\d{4}$' and extract(year from h.admission_date) = p_year::int)
    )
  group by x
  order by x;
$function$;

create or replace function lpz.lpz_trend_by_doctor_kpi(p_org text, p_year text default 'all'::text, p_doctor uuid default null::uuid)
returns table(
  x integer,
  hosp_urgent bigint, hosp_planned bigint,
  pat_urgent bigint, pat_planned bigint,
  bed_urgent numeric, bed_planned numeric,
  age_urgent numeric, age_planned numeric,
  imp_urgent numeric, imp_planned numeric,
  let_urgent numeric, let_planned numeric
)
language sql
security definer
set search_path to 'lpz', 'public'
as $function$
  select
    case when p_year = 'all' then extract(year from h.admission_date)::int
         else extract(month from h.admission_date)::int end as x,
    count(*) filter (where lpz.lpz_is_urgent_icd(h.icd_primary)) as hosp_urgent,
    count(*) filter (where not lpz.lpz_is_urgent_icd(h.icd_primary)) as hosp_planned,
    count(distinct h.patient_id) filter (where lpz.lpz_is_urgent_icd(h.icd_primary)) as pat_urgent,
    count(distinct h.patient_id) filter (where not lpz.lpz_is_urgent_icd(h.icd_primary)) as pat_planned,
    round(avg(h.discharge_date - h.admission_date) filter (where h.discharge_date is not null and lpz.lpz_is_urgent_icd(h.icd_primary)), 1) as bed_urgent,
    round(avg(h.discharge_date - h.admission_date) filter (where h.discharge_date is not null and not lpz.lpz_is_urgent_icd(h.icd_primary)), 1) as bed_planned,
    round(avg(h.age) filter (where h.discharge_date is not null and lpz.lpz_is_urgent_icd(h.icd_primary)), 1) as age_urgent,
    round(avg(h.age) filter (where h.discharge_date is not null and not lpz.lpz_is_urgent_icd(h.icd_primary)), 1) as age_planned,
    round(100.0 * count(*) filter (where h.discharge_disposition_id in (2,3,5) and lpz.lpz_is_urgent_icd(h.icd_primary))
          / nullif(count(*) filter (where h.discharge_date is not null and lpz.lpz_is_urgent_icd(h.icd_primary)), 0), 2) as imp_urgent,
    round(100.0 * count(*) filter (where h.discharge_disposition_id in (2,3,5) and not lpz.lpz_is_urgent_icd(h.icd_primary))
          / nullif(count(*) filter (where h.discharge_date is not null and not lpz.lpz_is_urgent_icd(h.icd_primary)), 0), 2) as imp_planned,
    round(100.0 * count(*) filter (where h.discharge_disposition_id = 1 and lpz.lpz_is_urgent_icd(h.icd_primary))
          / nullif(count(*) filter (where h.discharge_date is not null and lpz.lpz_is_urgent_icd(h.icd_primary)), 0), 2) as let_urgent,
    round(100.0 * count(*) filter (where h.discharge_disposition_id = 1 and not lpz.lpz_is_urgent_icd(h.icd_primary))
          / nullif(count(*) filter (where h.discharge_date is not null and not lpz.lpz_is_urgent_icd(h.icd_primary)), 0), 2) as let_planned
  from lpz.lpz_hospitalizations h
  where h.org_edrpou = p_org
    and h.admission_date is not null
    and (
      h.doc_resource_id = p_doctor
      or exists (
        select 1 from lpz.lpz_hospitalization_doctors hd
        where hd.org_edrpou = h.org_edrpou
          and hd.patient_name = h.patient_name
          and hd.admission_date = h.admission_date
          and hd.doctor_id = p_doctor
      )
      or exists (
        select 1 from lpz.lpz_episodes e
        where e.patient_resource_id = h.patient_id
          and e.org_edrpou = h.org_edrpou
          and e.doc_resource_id = p_doctor
          and e.period_start::date >= h.admission_date
          and e.period_start::date <= coalesce(h.discharge_date, current_date)
      )
    )
    and (
      p_year = 'all'
      or (p_year ~ '^\d{4}$' and extract(year from h.admission_date) = p_year::int)
    )
  group by x
  order by x;
$function$;

create or replace function lpz.lpz_department_last_date(p_org text, p_department uuid, p_doctor uuid default null::uuid)
returns date
language sql
security definer
set search_path to 'lpz', 'public'
as $function$
  select max(h.admission_date)
  from lpz.lpz_hospitalizations h
  where h.org_edrpou = p_org
    and h.department_structure_id = p_department
    and (
      p_doctor is null
      or h.doc_resource_id = p_doctor
      or exists (
        select 1 from lpz.lpz_hospitalization_doctors hd
        where hd.org_edrpou = h.org_edrpou
          and hd.patient_name = h.patient_name
          and hd.admission_date = h.admission_date
          and hd.doctor_id = p_doctor
      )
      or exists (
        select 1 from lpz.lpz_episodes e
        where e.patient_resource_id = h.patient_id
          and e.org_edrpou = h.org_edrpou
          and e.doc_resource_id = p_doctor
          and e.period_start::date >= h.admission_date
          and e.period_start::date <= current_date
      )
    );
$function$;
