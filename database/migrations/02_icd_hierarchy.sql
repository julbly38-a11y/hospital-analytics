-- Етап: Ієрархія МКХ-10 (chapters → blocks → codes)

CREATE TABLE icd_chapters (
  id bigserial PRIMARY KEY,
  roman text NOT NULL, letters text NOT NULL,
  name text NOT NULL UNIQUE, block_range text NOT NULL UNIQUE
);
-- 22 глави МКХ-10 (I-XXII) — див. повний INSERT в schema.sql

ALTER TABLE icd_blocks ADD COLUMN chapter_id bigint REFERENCES icd_chapters(id);
-- Прив'язка блоків до глав за літерою block_start
-- (D ділиться: D00-D48 Новоутворення, D50-D89 Кров; H: H00-H59 Око, H60-H95 Вухо)
