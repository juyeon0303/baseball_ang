-- Postgres 전환 시 참고용 (MVP는 메모리 모드)

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id VARCHAR(64) UNIQUE NOT NULL,
  points BIGINT NOT NULL DEFAULT 100000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instruments (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  symbol VARCHAR(32) NOT NULL,
  oracle_ops NUMERIC(6, 3) NOT NULL,
  sentiment NUMERIC(8, 5) NOT NULL DEFAULT 1,
  fair_price BIGINT NOT NULL,
  market_price BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS positions (
  user_id UUID REFERENCES users(id),
  instrument_id VARCHAR(64) REFERENCES instruments(id),
  long_shares BIGINT NOT NULL DEFAULT 0,
  short_shares BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, instrument_id)
);

CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  instrument_id VARCHAR(64) REFERENCES instruments(id),
  action VARCHAR(32) NOT NULL,
  quantity INT NOT NULL,
  price BIGINT NOT NULL,
  points_delta BIGINT NOT NULL,
  oracle_ops NUMERIC(6, 3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO instruments (id, name, symbol, oracle_ops, sentiment, fair_price, market_price)
VALUES ('lee-jung-hoo-ops', '이정후 시즌 OPS', 'LJH-OPS', 0.850, 1, 3250, 3250)
ON CONFLICT (id) DO NOTHING;
