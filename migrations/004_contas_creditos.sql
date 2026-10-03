-- 004 — Contas, cotas, créditos e Stripe (seções 15.1 e 15.2).

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE app_user (
  id                 BIGSERIAL PRIMARY KEY,
  email              CITEXT UNIQUE NOT NULL,
  stripe_customer_id VARCHAR(64) UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link mágico: guarda só o hash do token; uso único; expira em 15 minutos.
CREATE TABLE login_token (
  token_hash CHAR(64) PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ
);

-- Extrato somente de inserção: saldo = SUM(delta). A unicidade (motivo, referencia)
-- garante que o mesmo evento da Stripe ou a mesma consulta nunca lance duas vezes.
CREATE TABLE credit_ledger (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES app_user(id),
  delta      INT NOT NULL CHECK (delta <> 0),
  motivo     VARCHAR(30) NOT NULL
    CHECK (motivo IN ('compra','uso','cota_mensal','reembolso','ajuste')),
  referencia VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ledger_ref UNIQUE (motivo, referencia)
);
CREATE INDEX idx_ledger_user ON credit_ledger (user_id);

CREATE FUNCTION trg_ledger_imutavel() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'credit_ledger é somente de inserção';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_imutavel
  BEFORE UPDATE OR DELETE ON credit_ledger
  FOR EACH ROW EXECUTE FUNCTION trg_ledger_imutavel();

CREATE VIEW credit_balance AS
  SELECT user_id, SUM(delta)::INT AS saldo FROM credit_ledger GROUP BY user_id;

CREATE TABLE subscription (
  stripe_subscription_id VARCHAR(64) PRIMARY KEY,
  user_id                BIGINT NOT NULL REFERENCES app_user(id),
  plano                  VARCHAR(30) NOT NULL,
  status                 VARCHAR(30) NOT NULL,
  periodo_fim            TIMESTAMPTZ NOT NULL
);

CREATE TABLE stripe_event (
  id          VARCHAR(64) PRIMARY KEY,
  tipo        VARCHAR(60) NOT NULL,
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ok          BOOLEAN NOT NULL DEFAULT TRUE,
  detalhe     TEXT
);

CREATE TABLE ai_answer_cache (
  chave_hash CHAR(64) PRIMARY KEY,   -- hash da consulta normalizada + versão da base
  resposta   JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Limite por IP (segunda barreira contra abuso da cota grátis).
CREATE TABLE rate_limit (
  chave      VARCHAR(120) NOT NULL,   -- ex.: 'ip:203.0.113.4:2026-10-03'
  contagem   INT NOT NULL DEFAULT 0,
  expira_em  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (chave)
);
