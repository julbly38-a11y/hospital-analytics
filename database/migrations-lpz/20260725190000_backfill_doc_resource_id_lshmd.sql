-- Схема lpz живе напряму в Supabase (див. db-export/lpz-project/), ці файли —
-- лише історія застосованих міграцій, не джерело правди для CI.
--
-- Мета: клік на пацієнта в census-списку ("перебуває у відділенні") має
-- підсвітити його лікаря в "Ординаторській" (head-cabinet.html) — той самий
-- патерн, що в старому проєкті (public/head-cabinet.html:.ab-row → .doc-item).
-- Стара сторінка матчила по СИРОМУ тексту ПІБ (lsmd.doc_name ↔ lsmd_doctors,
-- вручну підтримувана таблиця-місток). У lpz-схемі готовий FK-стовпець уже
-- є (lpz_hospitalizations.doc_resource_id → lpz_empl.resource_id), просто
-- порожній — цей бекфіл заповнює його, без жодної нової таблиці.
--
-- Стосується ЛИШЕ ЛШМД (org_edrpou=43342788): лише там doc_name заповнений
-- (95%, текст "Прізвище І. В."). У Хотина (02005875) doc_name порожній
-- узагалі (0%) — цей бекфіл фізично не може там нічого дати, WHERE
-- h.doc_name<>'' природньо виключає ці рядки.
--
-- Двоступеневий нормалізований збіг по ключу "прізвищеПершаБукваІмʼяПершаБукваПоБатькові":
--   1) в межах відділення госпіталізації (h.department_structure_id) — якщо
--      рівно один лікар цього відділення відповідає ключу;
--   2) інакше — по всій лікарні, якщо ключ унікальний (не тезка).
-- Перевірено на реальних даних перед застосуванням: 103 495 з 111 093
-- рядків (93.2%) отримують надійний resource_id. Решта (тезки/звільнені) —
-- лишаються NULL, фолбек-логіка в lpz_department_census нижче далі working.

WITH e AS (
  SELECT resource_id, department_structure_id, org_edrpou,
         lower(regexp_replace(last_name, '\s+', '', 'g'))
           || left(lower(first_name), 1) || left(lower(middle_name), 1) AS k
  FROM lpz.lpz_empl
  WHERE role = 'doctor'
),
ekey_dept AS (
  SELECT org_edrpou, department_structure_id, k,
         count(DISTINCT resource_id) AS n_docs, (array_agg(resource_id))[1] AS only_id
  FROM e GROUP BY org_edrpou, department_structure_id, k
),
ekey_org AS (
  SELECT org_edrpou, k,
         count(DISTINCT resource_id) AS n_docs, (array_agg(resource_id))[1] AS only_id
  FROM e GROUP BY org_edrpou, k
)
UPDATE lpz.lpz_hospitalizations h
SET doc_resource_id = coalesce(
  (SELECT d.only_id FROM ekey_dept d
     WHERE d.org_edrpou = h.org_edrpou
       AND d.department_structure_id = h.department_structure_id
       AND d.k = lower(regexp_replace(replace(h.doc_name, '.', ''), '\s+', '', 'g'))
       AND d.n_docs = 1),
  (SELECT o.only_id FROM ekey_org o
     WHERE o.org_edrpou = h.org_edrpou
       AND o.k = lower(regexp_replace(replace(h.doc_name, '.', ''), '\s+', '', 'g'))
       AND o.n_docs = 1)
)
WHERE h.doc_resource_id IS NULL
  AND h.doc_name IS NOT NULL
  AND h.doc_name <> '';

-- census-RPC: doc_resource_id тепер надійно заповнений напряму на
-- lpz_hospitalizations (для ЛШМД) — ставимо його ПЕРШИМ пріоритетом,
-- старі слабкі джойни (lpz_hospitalization_doctors / lpz_episodes)
-- лишаються фолбеком для решти ~7% (тезки/звільнені) і для Хотина (де
-- h.doc_resource_id завжди NULL після бекфілу вище).
-- p_doctor-фільтр (клік на лікаря в Ординаторській → лише його пацієнти)
-- теж тепер додатково перевіряє h.doc_resource_id напряму.
-- doc.resolved_doc обчислюється ОДИН раз через LATERAL і використовується і
-- в SELECT, і у фільтрі p_doctor — щоб клік на лікаря звужував список ТОЧНО
-- до тих самих пацієнтів, що показані непідфільтрованими за цим лікарем
-- (перший варіант мав баг: фільтр перевіряв лише h.doc_resource_id+episodes,
-- SELECT показував ще й гілку lpz_hospitalization_doctors — розсинхрон
-- виявлено і виправлено на верифікації перед комітом).
CREATE OR REPLACE FUNCTION lpz.lpz_department_census(p_org text, p_department uuid, p_doctor uuid DEFAULT NULL::uuid, p_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(id_case bigint, pib text, age integer, gender text, icd_code text, diagnosis text, hosp_count integer, admission_date date, discharge_date date, days integer, re_admission text, doc_resource_id uuid)
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
    doc.resolved_doc as doc_resource_id
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
