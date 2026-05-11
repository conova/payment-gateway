-- Хадгалсан карт token-ууд (NEGDI-ийн tokenid).
-- ec1001 эсвэл inquiry-аас ирэх token-ийн мэдээллийг энд хадгална.

CREATE TABLE payment_tokens (
  tokenid              NUMBER PRIMARY KEY,
  customer_id          VARCHAR2(64) NOT NULL,
  customer_name        VARCHAR2(255),
  customer_register_id VARCHAR2(32),
  masked_pan           VARCHAR2(32),
  brand                VARCHAR2(16),         -- 'Visa', 'MC', ...
  bankname             VARCHAR2(16),         -- 'GLMT', 'TDBM', ...
  exp_date             VARCHAR2(4),          -- 'MMYY'
  status               VARCHAR2(16) NOT NULL,
  registered_at        TIMESTAMP,
  created_at           TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  updated_at           TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT chk_tokens_status CHECK (status IN
    ('Active','Cancelled','Expired','Blocked','Unknown'))
);

CREATE INDEX ix_tokens_customer ON payment_tokens (customer_id, status);

COMMIT;
