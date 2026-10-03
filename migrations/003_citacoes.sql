-- 003 — Citações de fontes externas (seção 10.1, RF17, RF18).

CREATE TYPE natureza_citacao_enum AS ENUM ('dado', 'reportagem', 'analise', 'opiniao');

CREATE TABLE fact_citation (
  id             BIGSERIAL PRIMARY KEY,
  source_id      INT NOT NULL REFERENCES dim_source(id),
  window_id      INT REFERENCES dim_government_window(id),
  factor_id      INT REFERENCES dim_context_factor(id),
  natureza       natureza_citacao_enum NOT NULL,
  titulo         TEXT NOT NULL,
  url            TEXT NOT NULL,
  url_arquivo    TEXT NOT NULL,                     -- cópia arquivada para conferência
  trecho         VARCHAR(220) NOT NULL,             -- até ~25 palavras
  publicado_em   DATE NOT NULL,
  acessado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmada_por BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[],
  divergente_de  BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[]
);
CREATE INDEX idx_citation_window ON fact_citation (window_id);
CREATE INDEX idx_citation_factor ON fact_citation (factor_id);
