-- 006 — Registro das consultas à IA e cota grátis.
-- Guardamos só hashes de visitante e de IP (com sal do servidor), nunca o IP em claro.

CREATE TABLE ai_query (
  id            BIGSERIAL PRIMARY KEY,
  visitante     CHAR(64) NOT NULL,              -- hash do cookie anônimo
  ip_hash       CHAR(64) NOT NULL,
  user_id       BIGINT REFERENCES app_user(id),
  pergunta      VARCHAR(600) NOT NULL,
  gratis        BOOLEAN NOT NULL DEFAULT FALSE, -- consumiu a cota grátis
  cache_hit     BOOLEAN NOT NULL DEFAULT FALSE,
  status        VARCHAR(12) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'ok', 'erro', 'recusada')),
  modelo        VARCHAR(60),
  tokens_in     INT,
  tokens_out    INT,
  buscas        INT,
  custo_usd     NUMERIC(10, 5),
  duracao_ms    INT,
  erro          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_query_dia ON ai_query (created_at);

-- Uma única consulta grátis por visitante: a reserva é atômica (INSERT ... ON CONFLICT).
CREATE UNIQUE INDEX uq_ai_query_gratis ON ai_query (visitante) WHERE gratis;

ALTER TABLE ai_answer_cache ADD COLUMN IF NOT EXISTS usos INT NOT NULL DEFAULT 0;
