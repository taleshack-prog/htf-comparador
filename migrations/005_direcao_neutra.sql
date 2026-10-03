-- 005 — Indicadores sem direção desejável consensual (ex.: tamanho da despesa pública).
-- Aparecem para consulta, mas não entram no ranking nem recebem posição.
ALTER TYPE direcao_enum ADD VALUE IF NOT EXISTS 'neutra';
