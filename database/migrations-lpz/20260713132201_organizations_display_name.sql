-- Схема lpz живе напряму в Supabase (див. db-export/lpz-project/), ці файли —
-- лише історія застосованих міграцій, не джерело правди для CI.
ALTER TABLE lpz.lpz_organizations
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS tagline text;

UPDATE lpz.lpz_organizations SET
  display_name = 'ХОТИНСЬКА БАГАТОПРОФІЛЬНА ЛІКАРНЯ',
  tagline = 'ТУРБУЄМОСЬ ПРО НАЙЦІННІШЕ'
WHERE edrpou = '02005875';

UPDATE lpz.lpz_organizations SET
  display_name = 'ЧЕРНІВЕЦЬКА ЛІКАРНЯ ШВИДКОЇ МЕДИЧНОЇ ДОПОМОГИ',
  tagline = 'ТУРБУЄМОСЬ ПРО НАЙЦІННІШЕ'
WHERE edrpou = '43342788';
