# Роадмеп впровадження Supabase

## 5 етапів

### Етап 1: Materialized Views ✅
- mv_daily_stats (денний потік, ~2265)
- mv_dept_stats (відділення, 20)
- mv_doctor_full (лікарі, 868)
- mv_icd_usage (діагнози, 19824)

### Етап 2: Cron Jobs ✅
- 02:00 щоночі — REFRESH MView
- Кожні 30 хв — лічильники

### Етап 3: RLS + ролі ✅
- 4 ролі: admin / head_dept / doctor / viewer
- empl.auth_user_id + app_role
- Helper-функції, 34 політики
- Протестовано: doctor бачить 2225/110206, admin — все

### Етап 4: Edge Functions ✅
- doctor-stats, case-detail, admissions-today

### Етап 5: Realtime ⏳
- Підписки на INSERT/UPDATE для живого дашборду

## На майбутнє
- Storage (PDF епікризи)
- Database Webhooks (Telegram/Slack)
- pgvector (семантичний пошук)
