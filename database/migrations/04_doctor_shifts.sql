-- Етап: Реконструкція чергувань + класифікація змін

-- Чергування: 09:00 → 09:00 наступної доби
-- Нічне: 22:00-07:00, Вихідні: сб/нд

UPDATE lsmd SET
  shift_time = CASE
    WHEN admission_time IS NULL THEN NULL
    WHEN admission_time::time >= '22:00'::time OR admission_time::time < '07:00'::time THEN 'нічне'
    ELSE 'денне' END,
  day_type = CASE
    WHEN EXTRACT(DOW FROM admission_date_d) IN (0,6) THEN 'вихідний'
    ELSE 'будній' END;

-- doctor_shifts: агрегат лікар × дата зміни
CREATE INDEX idx_lsmd_shift_time ON lsmd(shift_time);
CREATE INDEX idx_lsmd_day_type ON lsmd(day_type);
