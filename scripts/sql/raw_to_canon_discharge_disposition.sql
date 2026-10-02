-- raw_to_canon_discharge_disposition.sql
--
-- Заповнює lpz_hospitalizations.discharge_disposition_id (результат
-- лікування: помер/з покращенням/здоровий/...) з даних, зібраних
-- scripts/helsi_extract_discharge_disposition.js у таблицю
-- lpz_raw_discharge_disposition (завантажується окремо через PostgREST,
-- напр. коротким Python-скриптом за зразком load_json_raw.py — сирі дані
-- малі, ~6-7к рядків, bulk INSERT з Prefer: resolution=merge-duplicates).
--
-- ІСТОРІЯ: 2026-09-08 двічі помилково вважали, що сигналу смерті в даних
-- взагалі нема (спершу через обмежені columns= у /api/cards, потім навіть
-- перевірили patient_data_status/death_date — теж порожньо) — виявилось,
-- що це окремий, багатший API /api/hospital/api/v1/encounter_cases/.
-- Замінює попередню заглушку (усі виписані -> "2, з поліпшенням"), яка
-- встигла записатись в 3375 нових рядків у ту саму сесію.
--
-- Запускати ПІСЛЯ raw_to_canon_hospitalizations.sql (helsi_record_id має
-- бути вже проставлений) і ПІСЛЯ завантаження lpz_raw_discharge_disposition.

-- 0) Таблиця (створити один раз; IF NOT EXISTS — безпечно повторювати)
CREATE TABLE IF NOT EXISTS lpz.lpz_raw_discharge_disposition (
  org_edrpou text NOT NULL,
  helsi_record_id uuid NOT NULL,
  number text,
  disposition_id int,
  loaded_at timestamptz DEFAULT now(),
  PRIMARY KEY (org_edrpou, helsi_record_id)
);

-- 1) Перенесення в канон — лише де є реальне значення (не NULL), не чіпаємо
--    рядків, для яких свіжого знімку ще нема (напр. відкриті випадки).
UPDATE lpz.lpz_hospitalizations h
SET discharge_disposition_id = s.disposition_id
FROM lpz.lpz_raw_discharge_disposition s
WHERE h.org_edrpou = s.org_edrpou
  AND h.helsi_record_id = s.helsi_record_id
  AND s.disposition_id IS NOT NULL
  AND s.org_edrpou = '43342788';

-- Контроль
SELECT discharge_disposition_id, count(*)
FROM lpz.lpz_hospitalizations
WHERE org_edrpou = '43342788' AND helsi_record_id IS NOT NULL
GROUP BY discharge_disposition_id ORDER BY 1;
