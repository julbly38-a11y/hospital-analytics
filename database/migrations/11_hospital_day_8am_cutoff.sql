-- Лікарняна доба = 8:00 ранку до 8:00 наступного ранку (не календарна доба 00:00-24:00).
-- Додає генеровані колонки admission_day_d / discharge_day_d, які зсувають дату на -8 годин
-- перед приведенням до date. Використовуються для СТАТИСТИКИ (WHERE/GROUP BY/фільтри дат
-- у pages/api/stats.js); admission_date_d/discharge_date_d лишаються для показу справжньої
-- календарної дати госпіталізації/виписки пацієнту (картка, історія).
ALTER TABLE lsmd
  ADD COLUMN admission_day_d date GENERATED ALWAYS AS (
    COALESCE((admission_ts - interval '8 hours')::date, admission_date_d)
  ) STORED,
  ADD COLUMN discharge_day_d date GENERATED ALWAYS AS (
    COALESCE((discharge_ts - interval '8 hours')::date, discharge_date_d)
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_lsmd_admission_day_d ON lsmd (admission_day_d);
CREATE INDEX IF NOT EXISTS idx_lsmd_discharge_day_d ON lsmd (discharge_day_d);
