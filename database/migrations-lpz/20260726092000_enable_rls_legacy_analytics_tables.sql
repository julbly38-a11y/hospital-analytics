-- Увімкнути RLS на 7 таблицях, які мали його вимкненим (Supabase advisory:
-- critical, повністю відкриті для anon/authenticated). Це саме ті таблиці,
-- що були одноразово перенесені зі старого проєкту LSMD і 1 незрозуміла
-- (lpz_hospitalization_doctors) — жодних слідів використання в коді.
--
-- Той самий патерн org_isolation, що вже стоїть на решті lpz-таблиць з
-- колонкою org_edrpou (не lpz_read_all — той лише для спільних довідників
-- без прив'язки до лікарні). current_user_org_edrpou() повертає NULL для
-- anon/непризначеного користувача, і політика трактує NULL як "дозволити" —
-- тому нічого в дашборді не ламається.

ALTER TABLE lpz.lpz_icd_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON lpz.lpz_icd_usage
  FOR ALL USING (current_user_org_edrpou() IS NULL OR org_edrpou = current_user_org_edrpou());

ALTER TABLE lpz.lpz_doctor_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON lpz.lpz_doctor_stats
  FOR ALL USING (current_user_org_edrpou() IS NULL OR org_edrpou = current_user_org_edrpou());

ALTER TABLE lpz.lpz_analytics_doctor_dept ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON lpz.lpz_analytics_doctor_dept
  FOR ALL USING (current_user_org_edrpou() IS NULL OR org_edrpou = current_user_org_edrpou());

ALTER TABLE lpz.lpz_analytics_dept_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON lpz.lpz_analytics_dept_summary
  FOR ALL USING (current_user_org_edrpou() IS NULL OR org_edrpou = current_user_org_edrpou());

ALTER TABLE lpz.lpz_analytics_block_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON lpz.lpz_analytics_block_summary
  FOR ALL USING (current_user_org_edrpou() IS NULL OR org_edrpou = current_user_org_edrpou());

ALTER TABLE lpz.lpz_dept_stats_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON lpz.lpz_dept_stats_snapshot
  FOR ALL USING (current_user_org_edrpou() IS NULL OR org_edrpou = current_user_org_edrpou());

ALTER TABLE lpz.lpz_hospitalization_doctors ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON lpz.lpz_hospitalization_doctors
  FOR ALL USING (current_user_org_edrpou() IS NULL OR org_edrpou = current_user_org_edrpou());
