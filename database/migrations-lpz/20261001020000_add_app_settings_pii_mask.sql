-- 2026-10-01: серверні налаштування сайту й режим приватності ПІБ (застосовано через Supabase MCP як
-- add_app_settings_pii_mask та grant_service_role_app_settings_and_new_lpz_tables).
-- pii_mask = true: API (lib/pii-mask.js, обгортка withPiiMask) замінює ПІБ пацієнтів і лікарів кодами для ВСІХ ролей.
-- Перемикає лише власник сайту через POST /api/pii-mode.
CREATE TABLE IF NOT EXISTS public.app_settings (
  key         text        PRIMARY KEY,
  value       jsonb       NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);
COMMENT ON TABLE public.app_settings IS 'Серверні налаштування сайту. pii_mask = true: API замінює ПІБ пацієнтів і лікарів на коди для ВСІХ ролей; перемикає лише власник (is_owner).';
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;  -- без політик: anon/authenticated не бачать нічого
INSERT INTO public.app_settings (key, value) VALUES ('pii_mask', 'false'::jsonb) ON CONFLICT (key) DO NOTHING;

-- Нові таблиці в цьому проєкті НЕ отримують прав service_role автоматично: без цього серверний код не бачить таблицю
-- ("permission denied for table ..."), а режим приватності за безпечною поведінкою (збій читання = маскувати) ховав би імена завжди.
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO service_role;
GRANT SELECT ON lpz.lpz_nszu_payments TO service_role;
GRANT SELECT ON lpz.lpz_org_public_structure TO service_role;
