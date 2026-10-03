// Contrato de saúde do painel HTF (GET /health/summary).
// Regra combinada com os apps: "down" só para o que impede o app de funcionar
// (banco fora, migração faltando). Atraso de ingestão, variáveis opcionais e
// volume são "degraded" — senão o vermelho vira ruído.
import { pendingMigrations } from './migrations.js';

const ORDER = { ok: 0, degraded: 1, down: 2 };
const worst = (a, b) => (ORDER[b] > ORDER[a] ? b : a);

export const INGESTION_STALE_HOURS = 48;

export async function buildSummary(pool, { now = new Date(), env = process.env } = {}) {
  const checks = [];

  // 1. Banco
  let dbOk = false;
  try {
    await pool.query('SELECT 1');
    dbOk = true;
    checks.push({ name: 'banco', status: 'ok', detail: '' });
  } catch (err) {
    checks.push({ name: 'banco', status: 'down', detail: `sem conexão: ${err.code || err.message}` });
  }

  let metrics = {};
  if (dbOk) {
    // 2. Migrações
    const pending = await pendingMigrations(pool);
    checks.push(pending.length
      ? { name: 'migracoes', status: 'down', detail: `${pending.length} pendente(s): ${pending.join(', ')}` }
      : { name: 'migracoes', status: 'ok', detail: '' });

    // 3. Ingestão (só se o schema existir)
    if (!pending.includes('001_base.sql')) {
      checks.push(await ingestionCheck(pool, now));
      metrics = await collectMetrics(pool);
    }
  }

  // 4. Variáveis de ambiente
  const missing = ['MONITOR_TOKEN', 'CRON_SECRET'].filter((k) => !env[k]);
  checks.push(missing.length
    ? { name: 'variaveis', status: 'degraded', detail: `faltando: ${missing.join(', ')}` }
    : { name: 'variaveis', status: 'ok', detail: '' });

  const status = checks.reduce((acc, c) => worst(acc, c.status), 'ok');
  const detail = checks.filter((c) => c.status !== 'ok').map((c) => `${c.name}: ${c.detail}`).join(' · ');

  return {
    app: 'Comparador de Governos',
    status,
    detail,
    checked_at: now.toISOString(),
    checks,
    metrics,
  };
}

async function ingestionCheck(pool, now) {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (adaptador) adaptador, status, iniciado_em, terminado_em, detalhe
    FROM ingestion_run ORDER BY adaptador, iniciado_em DESC`);
  if (!rows.length) {
    return { name: 'ingestao', status: 'degraded', detail: 'nenhuma ingestão executada ainda' };
  }
  const problems = [];
  for (const r of rows) {
    const ref = r.terminado_em || r.iniciado_em;
    const hours = (now - new Date(ref)) / 36e5;
    if (r.status === 'falhou' || r.status === 'rejeitado') {
      problems.push(`${r.adaptador} ${r.status} (servindo último lote válido)`);
    } else if (hours > INGESTION_STALE_HOURS) {
      problems.push(`${r.adaptador} sem atualizar há ${Math.round(hours)} h`);
    }
  }
  return problems.length
    ? { name: 'ingestao', status: 'degraded', detail: problems.join('; ') }
    : { name: 'ingestao', status: 'ok', detail: `${rows.length} adaptador(es) em dia` };
}

async function collectMetrics(pool) {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM fact_observation)::INT                     AS observacoes,
      (SELECT COUNT(DISTINCT indicator_id) FROM fact_observation)::INT AS indicadores_com_dados,
      (SELECT COUNT(*) FROM dim_indicator)::INT                        AS indicadores_no_catalogo`);
  return rows[0];
}
