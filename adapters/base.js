// Interface comum dos adaptadores (seção 10 do TDD):
//   fetch(ctx)            → payload bruto da fonte
//   normalize(raw, ctx)   → [{ entity, indicator, ano, valor, qualidade, url }]
//   validate (aqui)       → regras gerais + limites de plausibilidade
//   persist (aqui)        → upsert em transação; histórico guardado por trigger
// Se fetch ou validate falhar, nada é gravado e o app segue servindo o último lote válido.

export const ADAPTER_VERSION_PREFIX = 'v';

// Limites de plausibilidade por unidade: barram erro de parsing (ex.: valor em
// "por mil" lido como %), não julgam se o dado é bom ou ruim.
const BOUNDS = {
  '%':      [-30, 150],
  '% PIB':  [0, 250],
  'pontos': [0, 1000],
  'km²':    [0, 100000],
};

export const USER_AGENT = 'Prumo/0.1 (Hack Tech Farm; +https://hacktechfarm.com.br)';

// Descreve o erro com a causa real (o "fetch failed" do Node esconde o motivo em err.cause).
export function describeError(err, url) {
  const host = (() => { try { return new URL(url).host; } catch { return url; } })();
  if (err?.name === 'AbortError') return `tempo esgotado em ${host}`;
  const c = err?.cause;
  const cause = c ? (c.code || c.message || String(c)) : null;
  return cause ? `${err.message} (${cause}) em ${host}` : `${err?.message || err} em ${host}`;
}

export async function fetchJson(url, { fetchImpl = fetch, timeoutMs = 20000, retries = 2, log = () => {} } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const started = Date.now();
    try {
      const res = await fetchImpl(url, {
        signal: ctrl.signal,
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      log(`  ok ${((Date.now() - started) / 1000).toFixed(1)}s ${url}`);
      return body;
    } catch (err) {
      lastErr = new Error(describeError(err, url));
      log(`  tentativa ${attempt + 1}/${retries + 1} falhou: ${lastErr.message}`);
      if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

// Converte "1,23" / "1.23" / "..." em número ou null.
export function toNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export const round4 = (n) => Math.round(n * 1e4) / 1e4;

export function validate(observations, catalog, { now = new Date() } = {}) {
  const errors = [];
  const seen = new Set();
  const year = now.getUTCFullYear();
  if (!observations.length) errors.push('nenhuma observação normalizada');
  for (const o of observations) {
    const key = `${o.entity}|${o.indicator}|${o.ano}`;
    const ind = catalog.indicators.get(o.indicator);
    if (!ind) { errors.push(`indicador fora do catálogo: ${o.indicator}`); continue; }
    if (!catalog.entities.has(o.entity)) errors.push(`entidade fora do catálogo: ${o.entity}`);
    if (!Number.isInteger(o.ano) || o.ano < 1990 || o.ano > year) errors.push(`ano inválido: ${key}`);
    if (typeof o.valor !== 'number' || !Number.isFinite(o.valor)) errors.push(`valor inválido: ${key}`);
    const b = BOUNDS[ind.unidade];
    if (b && (o.valor < b[0] || o.valor > b[1])) errors.push(`fora do limite plausível (${b.join('…')}): ${key} = ${o.valor}`);
    if (!['oficial', 'parcial', 'projecao', 'estimativa'].includes(o.qualidade)) errors.push(`qualidade inválida: ${key}`);
    if (o.ano === year && o.qualidade === 'oficial') errors.push(`ano corrente não pode ser "oficial" (CA5): ${key}`);
    if (!o.url) errors.push(`sem URL de fonte: ${key}`);
    if (seen.has(key)) errors.push(`duplicada: ${key}`);
    seen.add(key);
  }
  return { ok: errors.length === 0, errors };
}

export async function loadCatalog(pool) {
  const [ind, ent] = await Promise.all([
    pool.query('SELECT id, slug, unidade, fonte_id FROM dim_indicator'),
    pool.query('SELECT id, slug, iso3 FROM dim_country'),
  ]);
  return {
    indicators: new Map(ind.rows.map((r) => [r.slug, r])),
    entities: new Map(ent.rows.map((r) => [r.slug, r])),
    byIso3: new Map(ent.rows.filter((r) => r.iso3).map((r) => [r.iso3, r.slug])),
  };
}

async function persist(client, observations, catalog, version) {
  let n = 0;
  for (const o of observations) {
    const ind = catalog.indicators.get(o.indicator);
    const ent = catalog.entities.get(o.entity);
    await client.query(
      `INSERT INTO fact_observation
         (entity_id, indicator_id, periodo_ano, valor, qualidade, fonte_id, url_fonte, adaptador_versao)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (entity_id, indicator_id, periodo_ano) DO UPDATE SET
         valor = EXCLUDED.valor, qualidade = EXCLUDED.qualidade, url_fonte = EXCLUDED.url_fonte,
         adaptador_versao = EXCLUDED.adaptador_versao, data_coleta = NOW()`,
      [ent.id, ind.id, o.ano, o.valor, o.qualidade, ind.fonte_id, o.url, version],
    );
    n++;
  }
  return n;
}

// Executa um adaptador de ponta a ponta e registra a execução em ingestion_run.
export async function runAdapter(adapter, { pool, fetchImpl = fetch, now = new Date(), log = () => {} }) {
  const { rows: [run] } = await pool.query(
    'INSERT INTO ingestion_run (adaptador) VALUES ($1) RETURNING id', [adapter.slug]);
  const finish = (status, gravadas, detalhe) => pool.query(
    'UPDATE ingestion_run SET status=$2, gravadas=$3, detalhe=$4, terminado_em=NOW() WHERE id=$1',
    [run.id, status, gravadas, detalhe ? String(detalhe).slice(0, 2000) : null]);

  log(`${adapter.slug}: consultando a fonte…`);
  try {
    const catalog = await loadCatalog(pool);
    const ctx = { fetchImpl, now, catalog, log };
    const raw = await adapter.fetch(ctx);
    const obs = adapter.normalize(raw, ctx);
    const v = validate(obs, catalog, { now });
    if (!v.ok) {
      await finish('rejeitado', 0, v.errors.slice(0, 20).join('; '));
      log(`${adapter.slug}: rejeitado (${v.errors.length} erro(s))`);
      return { status: 'rejeitado', errors: v.errors };
    }
    const client = await pool.connect();
    let n;
    try {
      await client.query('BEGIN');
      n = await persist(client, obs, catalog, adapter.version);
      await client.query(
        `UPDATE dim_source SET ultima_sincronizacao = NOW()
         WHERE id IN (SELECT DISTINCT fonte_id FROM dim_indicator WHERE adaptador = $1)`, [adapter.slug]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    await finish('ok', n, null);
    log(`${adapter.slug}: ${n} observação(ões) gravada(s)`);
    return { status: 'ok', gravadas: n };
  } catch (err) {
    await finish('falhou', 0, err.message);
    log(`${adapter.slug}: falhou — ${err.message}`);
    return { status: 'falhou', error: err.message };
  }
}
