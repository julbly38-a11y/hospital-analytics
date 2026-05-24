-- Етап: Materialized Views (швидкість дашборду)

-- mv_daily_stats (~2265): денний потік
-- mv_dept_stats (20): зведення відділень
-- mv_doctor_full (868): картка лікаря
-- mv_icd_usage (19824): використання діагнозів

CREATE OR REPLACE FUNCTION refresh_all_mviews() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dept_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_doctor_full;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_icd_usage;
END $$ LANGUAGE plpgsql;
