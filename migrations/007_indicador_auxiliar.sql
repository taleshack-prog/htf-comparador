-- 007 — Séries auxiliares (ex.: margem de erro do WGI). Ficam no banco para o cálculo,
-- mas não aparecem no catálogo como indicador próprio.
ALTER TABLE dim_indicator ADD COLUMN IF NOT EXISTS auxiliar BOOLEAN NOT NULL DEFAULT FALSE;
