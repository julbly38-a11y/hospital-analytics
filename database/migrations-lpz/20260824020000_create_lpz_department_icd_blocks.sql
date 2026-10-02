-- Схема lpz живе напряму в Supabase (див. db-export/lpz-project/), ці файли —
-- лише історія застосованих міграцій, не джерело правди для CI.
--
-- Перенесення periodIcdBlocks + ICD_BLOCK_CASE зі старого проекту
-- (hospital-analytics/pages/api/stats.js) на схему lpz — для донат-діаграми
-- "Структура діагнозів" (public/js/dept-pie.js:renderDeptPie) на
-- head-cabinet.html, lf-left-bottom. Розподіл МКХ-блоків для пацієнтів, що
-- ПЕРЕБУВАЮТЬ у відділенні на конкретну дату (топ-5 + "Інші"). ELSE-фолбек —
-- coalesce(d.name, 'Інші') замість старого i.category_level1 (у lpz канону
-- немає рівня категорій, лише code/name в lpz_icd_diagnoses).

CREATE OR REPLACE FUNCTION lpz.lpz_department_icd_blocks(p_org text, p_department uuid, p_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(name text, cases bigint, pct numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'lpz', 'public'
AS $function$
  with blocks as (
    select case
      when left(h.icd_primary,3) between 'G00' and 'G09' then 'Запальні хвороби ЦНС'
      when left(h.icd_primary,3) between 'G20' and 'G26' then 'Екстрапірамідні розлади'
      when left(h.icd_primary,3) between 'G35' and 'G37' then 'Демієлінізуючі хвороби'
      when left(h.icd_primary,3) between 'G40' and 'G47' then 'Епілепсія та пароксизмальні розлади'
      when left(h.icd_primary,3) between 'G50' and 'G64' then 'Периферична нервова система та корінці'
      when left(h.icd_primary,3) between 'G80' and 'G83' then 'Паралітичні синдроми'
      when left(h.icd_primary,3) between 'G90' and 'G99' then 'Інші розлади нервової системи'
      when left(h.icd_primary,3) between 'I10' and 'I16' then 'Гіпертонічна хвороба'
      when left(h.icd_primary,3) between 'I20' and 'I25' then 'Ішемічна хвороба серця'
      when left(h.icd_primary,3) between 'I30' and 'I39' then 'Ендокардит, перикардит та вади серця'
      when left(h.icd_primary,3) between 'I40' and 'I43' then 'Кардіоміопатії та міокардит'
      when left(h.icd_primary,3) between 'I44' and 'I49' then 'Порушення ритму серця'
      when left(h.icd_primary,3) between 'I50' and 'I52' then 'Серцева недостатність'
      when left(h.icd_primary,3) between 'I60' and 'I69' then 'Цереброваскулярні хвороби'
      when left(h.icd_primary,3) between 'I70' and 'I79' then 'Атеросклероз та хвороби артерій'
      when left(h.icd_primary,3) between 'I80' and 'I89' then 'Хвороби вен та лімфатичних судин'
      when left(h.icd_primary,3) between 'J10' and 'J18' then 'Грип та пневмонія'
      when left(h.icd_primary,3) between 'J20' and 'J22' then 'Гострий бронхіт'
      when left(h.icd_primary,3) between 'J40' and 'J47' then 'Хронічні хвороби нижніх дихальних шляхів'
      when left(h.icd_primary,3) between 'J80' and 'J99' then 'Інші хвороби органів дихання'
      when left(h.icd_primary,3) between 'K20' and 'K31' then 'Хвороби стравоходу, шлунку та ДПК'
      when left(h.icd_primary,3) between 'K35' and 'K38' then 'Апендицит'
      when left(h.icd_primary,3) between 'K40' and 'K46' then 'Грижі черевної стінки'
      when left(h.icd_primary,3) between 'K50' and 'K52' then 'Неінфекційний ентерит та коліт'
      when left(h.icd_primary,3) between 'K55' and 'K64' then 'Інші хвороби кишківника'
      when left(h.icd_primary,3) between 'K70' and 'K77' then 'Хвороби печінки'
      when left(h.icd_primary,3) between 'K80' and 'K87' then 'Хвороби жовчного міхура та підшлункової залози'
      when left(h.icd_primary,3) between 'K90' and 'K93' then 'Інші хвороби органів травлення'
      when left(h.icd_primary,3) between 'L00' and 'L08' then 'Гнійні та інфекційні хвороби шкіри'
      when left(h.icd_primary,3) between 'L80' and 'L99' then 'Рубці, виразки та інші хвороби шкіри'
      when left(h.icd_primary,3) between 'M00' and 'M14' then 'Артрити та поліартропатії'
      when left(h.icd_primary,3) between 'M15' and 'M19' then 'Артрози великих суглобів'
      when left(h.icd_primary,3) between 'M20' and 'M25' then 'Інші хвороби суглобів'
      when left(h.icd_primary,3) between 'M40' and 'M54' then 'Дорсопатії (хребет, корінці)'
      when left(h.icd_primary,3) between 'M60' and 'M79' then 'Хвороби мʼяких тканин та сухожиль'
      when left(h.icd_primary,3) between 'M80' and 'M90' then 'Хвороби кісток'
      when left(h.icd_primary,3) between 'M91' and 'M94' then 'Хондропатії та хвороби росту'
      when left(h.icd_primary,3) between 'N00' and 'N08' then 'Гломерулонефрити'
      when left(h.icd_primary,3) between 'N10' and 'N16' then 'Тубуло-інтерстиціальні нефрити та уропатії'
      when left(h.icd_primary,3) between 'N20' and 'N23' then 'Сечокамʼяна хвороба'
      when left(h.icd_primary,3) between 'N25' and 'N29' then 'Інші хвороби нирок'
      when left(h.icd_primary,3) between 'N30' and 'N39' then 'Стриктура уретри, цистит та хвороби сечового міхура'
      when left(h.icd_primary,3) between 'N40' and 'N53' then 'Хвороби передміхурової залози та статевих органів'
      when left(h.icd_primary,3) between 'E10' and 'E14' then 'Діабетичні ускладнення'
      when left(h.icd_primary,3) between 'E70' and 'E90' then 'Хвороби накопичення та амілоїдоз'
      when left(h.icd_primary,3) between 'C60' and 'C68' then 'Злоякісні новоутворення сечостатевої системи'
      when left(h.icd_primary,3) between 'C81' and 'C96' then 'Злоякісні новоутворення крові та лімфатичної тканини'
      when left(h.icd_primary,3) between 'C00' and 'C59' then 'Злоякісні новоутворення (солідні пухлини)'
      when left(h.icd_primary,3) between 'C69' and 'C80' then 'Злоякісні новоутворення (солідні пухлини)'
      when left(h.icd_primary,3) between 'D10' and 'D36' then 'Доброякісні новоутворення'
      when left(h.icd_primary,3) between 'D37' and 'D44' then 'Новоутворення невизначеного характеру'
      when left(h.icd_primary,3) between 'D45' and 'D47' then 'Мієлодиспластичні синдроми та мієлопроліферативні хвороби'
      when left(h.icd_primary,3) between 'D50' and 'D64' then 'Анемії'
      when left(h.icd_primary,3) between 'D65' and 'D69' then 'Порушення згортання крові'
      when left(h.icd_primary,3) between 'Q60' and 'Q64' then 'Вроджені вади сечостатевої системи'
      when left(h.icd_primary,3) between 'Q65' and 'Q79' then 'Вроджені вади опорно-рухового апарату'
      when left(h.icd_primary,3) between 'S00' and 'S09' then 'Травми голови (ЧМТ)'
      when left(h.icd_primary,3) between 'S10' and 'S19' then 'Травми шиї'
      when left(h.icd_primary,3) between 'S20' and 'S39' then 'Травми грудної клітки та хребта'
      when left(h.icd_primary,3) between 'S40' and 'S49' then 'Травми плечового суглоба та плеча'
      when left(h.icd_primary,3) between 'S50' and 'S59' then 'Травми ліктьового суглоба та передпліччя'
      when left(h.icd_primary,3) between 'S60' and 'S69' then 'Травми запʼястка та кисті'
      when left(h.icd_primary,3) between 'S70' and 'S79' then 'Травми кульшового суглоба та стегна'
      when left(h.icd_primary,3) between 'S80' and 'S89' then 'Травми колінного суглоба та гомілки'
      when left(h.icd_primary,3) between 'S90' and 'S99' then 'Травми гомілковостопного суглоба та стопи'
      when left(h.icd_primary,3) between 'T00' and 'T07' then 'Множинні травми'
      when left(h.icd_primary,3) between 'T20' and 'T28' then 'Опіки зовнішніх ділянок тіла'
      when left(h.icd_primary,3) between 'T29' and 'T32' then 'Опіки множинних ділянок'
      when left(h.icd_primary,3) between 'T33' and 'T35' then 'Відмороження'
      when left(h.icd_primary,3) between 'T80' and 'T88' then 'Ускладнення хірургічних процедур та протезів'
      when left(h.icd_primary,3) = 'T78' then 'Алергічні реакції'
      when left(h.icd_primary,3) between 'T36' and 'T65' then 'Отруєння та токсична дія'
      when left(h.icd_primary,3) between 'A30' and 'A49' then 'Бактеріальні інфекції (рожа, сепсис)'
      when left(h.icd_primary,3) between 'B15' and 'B19' then 'Вірусний гепатит'
      when left(h.icd_primary,3) between 'R30' and 'R39' then 'Симптоми з боку сечовидільної системи'
      when left(h.icd_primary,1) in ('V','W','X','Y') then 'Зовнішні причини травм'
      when left(h.icd_primary,3) between 'G10' and 'G14' then 'Інші розлади нервової системи'
      when left(h.icd_primary,3) between 'G30' and 'G32' then 'Інші розлади нервової системи'
      when left(h.icd_primary,3) between 'G70' and 'G73' then 'Інші розлади нервової системи'
      else coalesce(d.name, 'Інші')
    end as blok
    from lpz.lpz_hospitalizations h
    left join lpz.lpz_icd_diagnoses d on d.code = h.icd_primary
    where h.org_edrpou = p_org
      and h.department_structure_id = p_department
      and h.admission_date <= p_date
      and (h.discharge_date > p_date or h.discharge_date is null)
      and h.icd_primary is not null
  ),
  grouped as (select blok, count(*) as cnt from blocks where blok is not null group by blok),
  ranked as (select blok, cnt, row_number() over (order by cnt desc) as rn, sum(cnt) over () as total from grouped)
  select
    case when rn <= 5 then blok else 'Інші' end as name,
    sum(cnt) as cases,
    round(100.0 * sum(cnt)::numeric / nullif(max(total),0), 1) as pct
  from ranked
  group by case when rn <= 5 then blok else 'Інші' end, (rn <= 5)
  order by min(rn);
$function$;
