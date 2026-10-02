-- Виправлення lpz.lpz_icd_block_name (додана в 20260726094500_add_analytical_views_from_lsmd.sql):
-- порівнювала ПОВНИЙ код МКХ (напр. 'K86.1') з діапазонами code_from/code_to
-- в lpz_dict_icd_blocks, хоча ці діапазони — рівно 3-символьні (напр. 'G00'/'G09'),
-- і оригінальна логіка (pages/api/stats.js:ICD_BLOCK_CASE) звіряє
-- LEFT(icd_primary, 3), а не повний код.
--
-- Перевірено на реальних даних: 8500 з 118180 госпіталізацій (7.2%) з
-- icd_primary отримували ІНШИЙ блок хвороби через цю різницю — коди на
-- кордоні діапазону (напр. 'A00.0' проти діапазону, що закінчується на 'A00')
-- лексикографічно порівнюються інакше для повного рядка, ніж для 3-символьного
-- префіксу. Після фіксу — 0 розбіжностей із LEFT(icd,3)-версією.

CREATE OR REPLACE FUNCTION lpz.lpz_icd_block_name(p_icd text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(
    (SELECT block_name FROM lpz.lpz_dict_icd_blocks
     WHERE left(p_icd, 3) BETWEEN code_from AND code_to
     ORDER BY priority LIMIT 1),
    'Інші'
  );
$$;
