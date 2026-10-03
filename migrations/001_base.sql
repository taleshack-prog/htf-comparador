-- 001 — Base dimensional: fontes, entidades, janelas de governo, indicadores e observações.
-- Espelha a seção 11 do PRD/TDD v1.3, já com os níveis de fonte da seção 10.1.

CREATE TYPE nivel_fonte_enum AS ENUM (
  'oficial_br', 'organismo_internacional', 'pesquisa_independente', 'imprensa', 'checagem'
);
CREATE TYPE tipo_entidade_enum AS ENUM ('pais', 'governo_brasil', 'grupo_pares');
CREATE TYPE direcao_enum      AS ENUM ('maior', 'menor');
CREATE TYPE qualidade_enum    AS ENUM ('oficial', 'parcial', 'projecao', 'estimativa');

CREATE TABLE dim_source (
  id                   SERIAL PRIMARY KEY,
  slug                 VARCHAR(40)  UNIQUE NOT NULL,
  nome                 VARCHAR(120) NOT NULL,
  url_base             VARCHAR(255) NOT NULL,
  metodo               VARCHAR(50)  NOT NULL,          -- api_rest | arquivo | dataset_versionado | busca
  nivel                nivel_fonte_enum NOT NULL,
  governamental        BOOLEAN NOT NULL,
  paywall              BOOLEAN NOT NULL DEFAULT FALSE,
  ativa                BOOLEAN NOT NULL DEFAULT TRUE,
  ultima_sincronizacao TIMESTAMPTZ,
  status               VARCHAR(20) NOT NULL DEFAULT 'OPERACIONAL'
);

CREATE TABLE dim_country (
  id      SERIAL PRIMARY KEY,
  iso3    VARCHAR(3),
  slug    VARCHAR(50) UNIQUE NOT NULL,
  nome_pt VARCHAR(100) NOT NULL,
  nome_en VARCHAR(100) NOT NULL,
  tipo    tipo_entidade_enum NOT NULL,
  meta    JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE dim_government_window (
  id            SERIAL PRIMARY KEY,
  entity_id     INT NOT NULL REFERENCES dim_country(id) ON DELETE CASCADE,
  ano_inicio    INT NOT NULL,
  ano_fim       INT NOT NULL,
  presidente    VARCHAR(100) NOT NULL,
  mandato_ordem INT NOT NULL,
  nota          TEXT,
  CONSTRAINT chk_anos CHECK (ano_fim >= ano_inicio),
  CONSTRAINT uq_janela UNIQUE (entity_id)
);

CREATE TABLE dim_indicator (
  id                    SERIAL PRIMARY KEY,
  slug                  VARCHAR(60)  UNIQUE NOT NULL,
  nome_pt               VARCHAR(120) NOT NULL,
  unidade               VARCHAR(20)  NOT NULL,
  fonte_id              INT NOT NULL REFERENCES dim_source(id),
  direcao_otima         direcao_enum NOT NULL,
  periodicidade         VARCHAR(30)  NOT NULL,
  agregacao_janela      VARCHAR(20)  NOT NULL DEFAULT 'media',  -- media | variacao | ultimo
  ressalva_metodologica TEXT NOT NULL,
  url_fonte             VARCHAR(255) NOT NULL,
  adaptador             VARCHAR(40),                            -- slug do adaptador que alimenta
  codigo_externo        VARCHAR(80),                            -- código da série na fonte
  codigo_verificado     BOOLEAN NOT NULL DEFAULT FALSE          -- conferido contra a fonte?
);

CREATE TABLE fact_observation (
  id               BIGSERIAL PRIMARY KEY,
  entity_id        INT NOT NULL REFERENCES dim_country(id),
  indicator_id     INT NOT NULL REFERENCES dim_indicator(id),
  periodo_ano      INT NOT NULL,
  valor            NUMERIC(14,4) NOT NULL,
  qualidade        qualidade_enum NOT NULL DEFAULT 'oficial',
  fonte_id         INT NOT NULL REFERENCES dim_source(id),
  url_fonte        VARCHAR(500) NOT NULL,
  data_coleta      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  adaptador_versao VARCHAR(20) NOT NULL,
  CONSTRAINT uq_observacao UNIQUE (entity_id, indicator_id, periodo_ano)
);
CREATE INDEX idx_obs_qualidade ON fact_observation (qualidade);

-- RNF04: histórico imutável. Toda alteração de uma observação guarda a versão anterior.
CREATE TABLE fact_observation_history (
  id              BIGSERIAL PRIMARY KEY,
  observation_id  BIGINT NOT NULL,
  entity_id       INT NOT NULL,
  indicator_id    INT NOT NULL,
  periodo_ano     INT NOT NULL,
  valor           NUMERIC(14,4) NOT NULL,
  qualidade       qualidade_enum NOT NULL,
  fonte_id        INT NOT NULL,
  url_fonte       VARCHAR(500) NOT NULL,
  data_coleta     TIMESTAMPTZ NOT NULL,
  adaptador_versao VARCHAR(20) NOT NULL,
  substituida_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE FUNCTION trg_observation_history() RETURNS trigger AS $$
BEGIN
  IF (OLD.valor, OLD.qualidade) IS DISTINCT FROM (NEW.valor, NEW.qualidade) THEN
    INSERT INTO fact_observation_history
      (observation_id, entity_id, indicator_id, periodo_ano, valor, qualidade,
       fonte_id, url_fonte, data_coleta, adaptador_versao)
    VALUES
      (OLD.id, OLD.entity_id, OLD.indicator_id, OLD.periodo_ano, OLD.valor, OLD.qualidade,
       OLD.fonte_id, OLD.url_fonte, OLD.data_coleta, OLD.adaptador_versao);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER observation_history
  BEFORE UPDATE ON fact_observation
  FOR EACH ROW EXECUTE FUNCTION trg_observation_history();

-- Registro de cada execução de adaptador (o /health/summary lê a mais recente).
CREATE TABLE ingestion_run (
  id            BIGSERIAL PRIMARY KEY,
  adaptador     VARCHAR(40) NOT NULL,
  iniciado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  terminado_em  TIMESTAMPTZ,
  status        VARCHAR(12) NOT NULL DEFAULT 'rodando',   -- rodando | ok | falhou | rejeitado
  gravadas      INT NOT NULL DEFAULT 0,
  detalhe       TEXT
);
CREATE INDEX idx_ingestion_recente ON ingestion_run (adaptador, iniciado_em DESC);

CREATE TABLE ai_query_log (
  id                BIGSERIAL PRIMARY KEY,
  texto_usuario     TEXT NOT NULL,
  query_estruturada JSONB NOT NULL,
  validada          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
