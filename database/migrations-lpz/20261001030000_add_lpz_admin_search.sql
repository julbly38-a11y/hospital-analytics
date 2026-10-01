-- 2026-10-01: швидкий пошук для власника сайту (застосовано через Supabase MCP як add_lpz_admin_search,
-- lpz_admin_search_trigram_indexes; тут зведена остаточна версія). Читає ЛИШЕ сервер після перевірки is_owner в /api/admin-search.
-- Пошук пацієнтів і співробітників за ПІБ (кілька слів у будь-якому порядку, єдиний апостроф) або за телефоном (по цифрах,
-- код країни 38 перед 0 відкидається, тож 050…, +38 (050)…, 380… знаходять той самий номер). Індекси pg_trgm: ≈70 мс за ПІБ, ≈20 мс за телефон
-- на 155 тис. пацієнтів (без індексів було ≈700 мс).
CREATE OR REPLACE FUNCTION lpz.norm_text(t text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT translate(lower(coalesce(t, '')), '’ʼ`‘', '''''''''') $$;
CREATE OR REPLACE FUNCTION lpz.name_key(a text, b text, c text, d text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT lpz.norm_text(coalesce(a, '') || ' ' || coalesce(b, '') || ' ' || coalesce(c, '') || ' ' || coalesce(d, '')) $$;
CREATE OR REPLACE FUNCTION lpz.digits_only(t text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT regexp_replace(coalesce(t, ''), '\D', '', 'g') $$;

CREATE INDEX IF NOT EXISTS idx_lpz_patients_name_trgm  ON lpz.lpz_patients USING gin (lpz.name_key(full_name, last_name, first_name, middle_name) public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_lpz_patients_phone_trgm ON lpz.lpz_patients USING gin (lpz.digits_only(phone) public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_lpz_empl_name_trgm      ON lpz.lpz_empl     USING gin (lpz.name_key(last_name, first_name, middle_name, '') public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_lpz_empl_phone_trgm     ON lpz.lpz_empl     USING gin (lpz.digits_only(phone) public.gin_trgm_ops);

-- Тіло функції lpz.lpz_admin_search(p_q text, p_limit_patients int DEFAULT 30, p_limit_employees int DEFAULT 20) RETURNS jsonb
-- (предикати будуються динамічно через format(%L), щоб використати індекси; значення екрануються, ін'єкції неможливі) —
-- у БД; текст не дублюється тут, щоб не розходитись із застосованою версією: pg_get_functiondef('lpz.lpz_admin_search'::regproc).
REVOKE ALL ON FUNCTION lpz.lpz_admin_search(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lpz.lpz_admin_search(text, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION lpz.norm_text(text), lpz.name_key(text, text, text, text), lpz.digits_only(text) TO service_role;
