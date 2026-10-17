-- ScaleX schema: runs automatically on first Postgres start via docker-entrypoint-initdb.d
CREATE TABLE IF NOT EXISTS urls (
  id            BIGSERIAL PRIMARY KEY,
  short_code    VARCHAR(16)  UNIQUE NOT NULL,
  original_url  TEXT         NOT NULL,
  clicks        BIGINT       NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_urls_short_code ON urls (short_code);
