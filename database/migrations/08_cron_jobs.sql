-- Етап: Cron Jobs (pg_cron)

-- Щоночі 02:00 — оновлення MView
SELECT cron.schedule('refresh-mviews-nightly', '0 2 * * *', $$SELECT refresh_all_mviews();$$);

-- Щопівгодини — лічильники (staff_count, doctor_stats)
SELECT cron.schedule('refresh-counters-30min', '*/30 * * * *', $$SELECT refresh_counters();$$);
