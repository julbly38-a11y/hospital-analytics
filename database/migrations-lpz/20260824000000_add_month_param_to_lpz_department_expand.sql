-- Схема lpz живе напряму в Supabase (див. db-export/lpz-project/), ці файли —
-- лише історія застосованих міграцій, не джерело правди для CI.
--
-- Додає p_month (default 'all') до lpz_department_expand — попап відділення
-- на entry.html (openDeptExpand в public/js/entry.js) досі фільтрував лише
-- по року, пігулки місяців його не звужували. Новий параметр — останнім у
-- списку (Postgres CREATE OR REPLACE FUNCTION не дозволяє вставити всередину).

CREATE OR REPLACE FUNCTION lpz.lpz_department_expand(p_org text, p_department uuid, p_year text DEFAULT 'all'::text, p_month text DEFAULT 'all'::text)
 RETURNS TABLE(cases bigint, unique_patients bigint, doctors bigint, beds integer, head_name text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'lpz', 'public'
AS $function$
  select
    (select count(*) from lpz.lpz_hospitalizations h
      where h.org_edrpou = p_org and h.department_structure_id = p_department
        and (p_year = 'all' or (p_year ~ '^\d{4}$' and extract(year from h.admission_date) = p_year::int))
        and (p_month = 'all' or (p_month ~ '^\d{1,2}$' and extract(month from h.admission_date) = p_month::int))
    ) as cases,
    (select count(distinct h.patient_id) from lpz.lpz_hospitalizations h
      where h.org_edrpou = p_org and h.department_structure_id = p_department
        and (p_year = 'all' or (p_year ~ '^\d{4}$' and extract(year from h.admission_date) = p_year::int))
        and (p_month = 'all' or (p_month ~ '^\d{1,2}$' and extract(month from h.admission_date) = p_month::int))
    ) as unique_patients,
    (select count(*) from lpz.lpz_empl e
      where e.org_edrpou = p_org and e.department_structure_id = p_department and e.role = 'doctor'
    ) as doctors,
    (select d.beds from lpz.lpz_departments d
      where d.org_edrpou = p_org and d.structure_id = p_department
    ) as beds,
    (select trim(concat_ws(' ', e.last_name, e.first_name, e.middle_name)) from lpz.lpz_empl e
      where e.org_edrpou = p_org and e.department_structure_id = p_department and e.role = 'head'
      limit 1
    ) as head_name;
$function$;
