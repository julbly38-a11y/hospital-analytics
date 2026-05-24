-- Етап: Типізація дат у lsmd
-- Додає типовані DATE/TIMESTAMP колонки + length_of_stay

ALTER TABLE lsmd ADD COLUMN IF NOT EXISTS admission_date_d date;
ALTER TABLE lsmd ADD COLUMN IF NOT EXISTS admission_ts timestamp;
ALTER TABLE lsmd ADD COLUMN IF NOT EXISTS discharge_date_d date;
ALTER TABLE lsmd ADD COLUMN IF NOT EXISTS discharge_ts timestamp;
ALTER TABLE lsmd ADD COLUMN IF NOT EXISTS birth_date_d date;
ALTER TABLE lsmd ADD COLUMN IF NOT EXISTS length_of_stay int;
ALTER TABLE lsmd ADD COLUMN IF NOT EXISTS shift_time text;
ALTER TABLE lsmd ADD COLUMN IF NOT EXISTS day_type text;

UPDATE lsmd SET
  admission_date_d = to_date(admission_date, 'DD.MM.YYYY'),
  birth_date_d = to_date(birth_date, 'DD.MM.YYYY'),
  admission_ts = CASE WHEN admission_time IS NOT NULL
                      THEN to_date(admission_date,'DD.MM.YYYY') + admission_time::time END,
  discharge_date_d = CASE
    WHEN discharge_date ~ ' \d{2}:\d{2}:\d{2}$'
      THEN to_date(left(discharge_date,10),'DD.MM.YYYY')
    ELSE to_date(discharge_date,'DD.MM.YYYY') END;

UPDATE lsmd SET length_of_stay = (discharge_date_d - admission_date_d)::int;

-- Тригер автосинхронізації дат + класифікації змін (див. 04)

CREATE INDEX IF NOT EXISTS idx_lsmd_admission_d ON lsmd(admission_date_d);
CREATE INDEX IF NOT EXISTS idx_lsmd_los ON lsmd(length_of_stay);
