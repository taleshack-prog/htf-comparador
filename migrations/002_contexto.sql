-- 002 — Motor de Contexto e Vieses (seção 13.1).

CREATE TABLE dim_context_factor (
  id                   SERIAL PRIMARY KEY,
  slug                 VARCHAR(60)  UNIQUE NOT NULL,
  nome_pt              VARCHAR(120) NOT NULL,
  tipo                 VARCHAR(30)  NOT NULL
    CHECK (tipo IN ('choque_global','commodities','juros','heranca','efeito_base','duracao','defasagem','evento')),
  metrica              TEXT NOT NULL,          -- definição reproduzível da medição
  indicadores_afetados TEXT[] NOT NULL,
  fonte_id             INT NOT NULL REFERENCES dim_source(id),
  descricao            TEXT NOT NULL,
  versao               VARCHAR(20) NOT NULL
);

CREATE TABLE fact_context_measure (
  id              BIGSERIAL PRIMARY KEY,
  factor_id       INT NOT NULL REFERENCES dim_context_factor(id),
  window_id       INT NOT NULL REFERENCES dim_government_window(id),
  indicator_id    INT REFERENCES dim_indicator(id),
  valor           NUMERIC(14,4),
  efeito          VARCHAR(12) NOT NULL CHECK (efeito IN ('favoravel','desfavoravel','neutro')),
  calculado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  catalogo_versao VARCHAR(20) NOT NULL
);
-- indicator_id pode ser nulo (fator geral); NULLs não colidem em UNIQUE comum.
CREATE UNIQUE INDEX uq_ctx ON fact_context_measure (factor_id, window_id, COALESCE(indicator_id, 0));
