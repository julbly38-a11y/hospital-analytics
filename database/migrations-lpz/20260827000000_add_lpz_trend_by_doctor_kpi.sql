-- Тренд по ОДНОМУ лікарю для хвилястого графіка (doctor-cabinet.js) — той
-- самий патерн, що lpz_trend_by_department_kpi/lpz_trend_by_direction_kpi
-- (усі 6 показників × ургентні/планові, lpz.lpz_is_urgent_icd), лише
-- звʼязок лікар↔випадок — через lpz_episodes (як lpz_trend_by_doctor/
-- lpz_kpi_by_doctor), без p_month — на doctor-cabinet.html графік завжди
-- річний (utils.js:loadKpiChartBlock: daily-деталізація лише для
-- kind='department').
create or replace function lpz.lpz_trend_by_doctor_kpi(
  p_org text,
  p_year text default 'all'::text,
  p_doctor uuid default null::uuid
)
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
  group by x
  order by x;
$function$;
