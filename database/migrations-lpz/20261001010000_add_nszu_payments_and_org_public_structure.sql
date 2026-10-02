-- 2026-10-01: платежі НСЗУ за ПМГ по закладах і публічна структура закладу (застосовано через Supabase MCP як
-- add_nszu_payments_and_org_public_structure). Наповнення: scripts/load_nszu_payments.py (щотижня, набір оновлюється
-- щотижня) та scripts/sql/seed_public_structure_<ЄДРПОУ>.sql.

CREATE TABLE IF NOT EXISTS lpz.lpz_nszu_payments (
  org_edrpou        text          NOT NULL REFERENCES lpz.lpz_organizations(edrpou),
  period_year       smallint      NOT NULL,
  period_month     smallint      NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  package_id        integer       NOT NULL,
  pay_package       numeric(18,4) NOT NULL,
  pay_all           numeric(18,4),
  contract_number   text          NOT NULL,
  pay_date          date          NOT NULL,
  doc_parent        text          NOT NULL,
  pay_type          smallint      NOT NULL,
  kekv              text,
  referral          text,
  legal_entity_name text,
  source_file       text          NOT NULL,
  loaded_at         timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (org_edrpou, doc_parent, package_id, period_year, period_month, pay_type, pay_date)
);
COMMENT ON TABLE  lpz.lpz_nszu_payments IS 'Оплати НСЗУ закладу за програмою медичних гарантій: один рядок = сума по пакету в платіжному документі. Джерело: data.gov.ua, payments_on_contracts_pmg_<рік>.csv.';
COMMENT ON COLUMN lpz.lpz_nszu_payments.period_month IS 'Місяць, ЗА який нарахована оплата (не місяць платежу; дата платежу в pay_date).';
COMMENT ON COLUMN lpz.lpz_nszu_payments.package_id    IS 'Номер пакета НСЗУ з набору даних; довідника назв пакетів у джерелі нема.';
COMMENT ON COLUMN lpz.lpz_nszu_payments.pay_package   IS 'Сума оплати за цим пакетом у цьому платіжному документі, грн.';
COMMENT ON COLUMN lpz.lpz_nszu_payments.pay_all       IS 'Сума всього платіжного документа (однакова в усіх його рядках); сума pay_package за документом дорівнює pay_all.';
COMMENT ON COLUMN lpz.lpz_nszu_payments.doc_parent    IS 'Ідентифікатор платіжного документа.';
COMMENT ON COLUMN lpz.lpz_nszu_payments.pay_type      IS 'Тип оплати з набору даних (1 або 2); розшифровки в джерелі нема.';
CREATE INDEX IF NOT EXISTS idx_nszu_payments_org_period ON lpz.lpz_nszu_payments (org_edrpou, period_year, period_month);
ALTER TABLE lpz.lpz_nszu_payments ENABLE ROW LEVEL SECURITY;  -- без політик: лише серверний ключ

CREATE TABLE IF NOT EXISTS lpz.lpz_org_public_structure (
  org_edrpou   text    NOT NULL REFERENCES lpz.lpz_organizations(edrpou),
  kind         text    NOT NULL CHECK (kind IN ('summary','inpatient_surgical','inpatient_therapeutic','icu','outpatient','diagnostic_support','center','other_unit','administration','contact')),
  name         text    NOT NULL,
  beds         integer,
  note         text,
  source_url   text    NOT NULL,
  retrieved_on date    NOT NULL,
  PRIMARY KEY (org_edrpou, kind, name)
);
COMMENT ON TABLE lpz.lpz_org_public_structure IS 'Публічна інформація про структуру закладу з офіційного сайту (не з helsi); перевіряти актуальність за retrieved_on.';
ALTER TABLE lpz.lpz_org_public_structure ENABLE ROW LEVEL SECURITY;  -- без політик: лише серверний ключ
