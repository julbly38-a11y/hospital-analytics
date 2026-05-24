-- Етап: Таблиця операцій (комбінації ACHI-кодів)

CREATE TABLE operations (
  id           bigserial PRIMARY KEY,
  code         text NOT NULL UNIQUE,
  codes_count  int  NOT NULL,
  cases_count  int  NOT NULL DEFAULT 0
);

INSERT INTO operations (code, codes_count, cases_count)
SELECT operation, array_length(string_to_array(operation,','), 1), count(*)::int
FROM lsmd WHERE operation IS NOT NULL AND operation <> ''
GROUP BY operation;

ALTER TABLE lsmd ADD COLUMN operation_id bigint REFERENCES operations(id);
UPDATE lsmd l SET operation_id = o.id FROM operations o WHERE o.code = l.operation;

CREATE INDEX idx_lsmd_op_id ON lsmd(operation_id);
