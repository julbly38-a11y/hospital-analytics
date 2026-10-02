-- Схема lpz живе напряму в Supabase (див. db-export/lpz-project/), ці файли —
-- лише історія застосованих міграцій, не джерело правди для CI.
--
-- Додає blok (lpz_icd_block_name, той самий хелпер, що lpz_department_icd_blocks)
-- до lpz_department_census — клік на пацієнта в "Перебуває у відділенні"
-- (head-cabinet.js) тепер знає, який сегмент донату "Структура діагнозів"
-- підсвітити/повернути вгору (dept-pie.js:selectByName). Зміна РЕЗУЛЬТАТУ
-- функції — DROP + CREATE, не REPLACE (як і в 20260824010000).

DROP FUNCTION lpz.lpz_department_census(text, uuid, uuid, date);

CREATE FUNCTION lpz.lpz_department_census(p_org text, p_department uuid, p_doctor uuid DEFAULT NULL::uuid, p_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(id_case bigint, pib text, age integer, gender text, icd_code text, diagnosis text, hosp_count integer, admission_date date, discharge_date date, days integer, re_admission text, doc_resource_id uuid, birth_date date, blok text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'lpz', 'public'
AS $function$
  select h.id_case,
    h.patient_name as pib,
    h.age,
    h.gender,
    h.icd_primary as icd_code,
    coalesce(d.name, h.icd_primary) as diagnosis,
    (select count(*)::int from lpz.lpz_hospitalizations h2
       where h2.patient_id = h.patient_id and h2.org_edrpou = h.org_edrpou) as hosp_count,
    h.admission_date,
    h.discharge_date,
    (case
       when h.discharge_date is not null then (h.discharge_date - h.admission_date)
       else (p_date - h.admission_date + 1)
     end)::int as days,
    r.name as re_admission,
    doc.resolved_doc as doc_resource_id,
    h.birth_date,
    lpz.lpz_icd_block_name(h.icd_primary, d.name) as blok
  from lpz.lpz_hospitalizations h
  left join lpz.lpz_icd_diagnoses d on d.code = h.icd_primary
  left join lpz.lpz_dict_re_admission r on r.id = h.re_admission_id
  cross join lateral (
    select coalesce(
      h.doc_resource_id,
      (select hd.doctor_id from lpz.lpz_hospitalization_doctors hd
         join lpz.lpz_empl em on em.org_edrpou = hd.org_edrpou and em.resource_id = hd.doctor_id
         where hd.org_edrpou = h.org_edrpou
           and hd.patient_name = h.patient_name
           and hd.admission_date = h.admission_date
           and em.department_structure_id = p_department
           and em.role = 'doctor'
         limit 1),
      (select e.doc_resource_id from lpz.lpz_episodes e
         join lpz.lpz_empl em on em.org_edrpou = e.org_edrpou and em.resource_id = e.doc_resource_id
         where e.patient_resource_id = h.patient_id
           and e.org_edrpou = h.org_edrpou
           and em.department_structure_id = p_department
           and em.role = 'doctor'
           and e.period_start::date >= h.admission_date
           and e.period_start::date <= p_date
         order by e.period_start desc
         limit 1)
    ) as resolved_doc
  ) doc
  where h.org_edrpou = p_org
    and h.department_structure_id = p_department
    and h.admission_date <= p_date
    and (h.discharge_date is null or h.discharge_date >= p_date)
    and (p_doctor is null or doc.resolved_doc = p_doctor)
  order by h.admission_date asc;
$function$;
