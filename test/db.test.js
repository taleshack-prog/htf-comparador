// Testes de integração com Postgres. Rodam só se TEST_DATABASE_URL estiver definida
// (use um banco descartável: o teste apaga e recria o schema public).
//   TEST_DATABASE_URL=postgresql://postgres@localhost:5433/comparador_test npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { migrate, seed, pendingMigrations } from '../lib/migrations.js';
import { runAdapter } from '../adapters/base.js';
import bcbSgs from '../adapters/bcb-sgs.js';
import worldbank from '../adapters/worldbank.js';
import { buildSummary } from '../lib/health.js';
import { sgsMonthly, wbPayload, fakeFetch } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const opts = { skip: url ? false : 'defina TEST_DATABASE_URL para rodar' };
const NOW = new Date('2026-10-03T12:00:00Z');
const quiet = { log: () => {} };
let pool;

before(async () => {
  if (!url) return;
  pool = new pg.Pool({ connectionString: url, max: 3 });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
});
after(async () => { if (pool) await pool.end(); });

// SGS: só valores sintéticos (ver test/fixtures/README.md).
function sgsRoutes(ipcaDez2020 = 1) {
  return fakeFetch([
    ['sgs.7326/', (u) => (u.includes('01/01/2015') ? [{ data: '01/01/2020', valor: '-1' }, { data: '01/01/2021', valor: '2' }] : [])],
    ['sgs.433/',  (u) => (u.includes('01/01/2015') ? sgsMonthly(2020, [...Array(11).fill(1), ipcaDez2020]) : [])],
    ['sgs.13762/',(u) => (u.includes('01/01/2015') ? sgsMonthly(2020, Array(12).fill(70)) : [])],
  ]);
}

test('migrações aplicam do zero e são idempotentes', opts, async () => {
  const first = await migrate(pool, quiet);
  assert.equal(first.length, 4);
  assert.deepEqual(await migrate(pool, quiet), []);
  assert.deepEqual(await pendingMigrations(pool), []);
});

test('seed é idempotente e não cria nenhuma observação', opts, async () => {
  await seed(pool, quiet);
  await seed(pool, quiet);
  const { rows: [c] } = await pool.query(`SELECT
    (SELECT COUNT(*) FROM dim_government_window)::INT AS janelas,
    (SELECT COUNT(*) FROM dim_indicator WHERE codigo_verificado)::INT AS verificados,
    (SELECT COUNT(*) FROM fact_observation)::INT AS obs`);
  assert.deepEqual(c, { janelas: 6, verificados: 0, obs: 0 });
});

test('health sem ingestão: degraded, não down', opts, async () => {
  const s = await buildSummary(pool, { now: NOW, env: { MONITOR_TOKEN: 'x', CRON_SECRET: 'y' } });
  assert.equal(s.status, 'degraded');
  assert.match(s.detail, /nenhuma ingestão/);
});

test('ingestão SGS grava observações e registra a execução', opts, async () => {
  const r = await runAdapter(bcbSgs, { pool, fetchImpl: sgsRoutes(), now: NOW });
  assert.equal(r.status, 'ok');
  const { rows } = await pool.query(`
    SELECT i.slug, o.periodo_ano AS ano, o.valor::FLOAT AS valor, o.qualidade
    FROM fact_observation o JOIN dim_indicator i ON i.id = o.indicator_id
    ORDER BY i.slug, o.periodo_ano`);
  assert.deepEqual(rows, [
    { slug: 'divida-bruta', ano: 2020, valor: 70, qualidade: 'oficial' },
    { slug: 'ipca-anual',   ano: 2020, valor: 12.6825, qualidade: 'oficial' },
    { slug: 'pib-anual',    ano: 2020, valor: -1, qualidade: 'oficial' },
    { slug: 'pib-anual',    ano: 2021, valor: 2, qualidade: 'oficial' },
  ]);
});

test('revisão da fonte atualiza o valor e guarda o anterior no histórico', opts, async () => {
  await runAdapter(bcbSgs, { pool, fetchImpl: sgsRoutes(2), now: NOW });
  const { rows: [h] } = await pool.query(`
    SELECT h.valor::FLOAT AS antigo, o.valor::FLOAT AS novo
    FROM fact_observation_history h JOIN fact_observation o ON o.id = h.observation_id`);
  assert.equal(h.antigo, 12.6825);
  assert.ok(h.novo > h.antigo);
});

test('lote inválido é rejeitado inteiro e nada muda', opts, async () => {
  const before = (await pool.query('SELECT COUNT(*)::INT n FROM fact_observation')).rows[0].n;
  const broken = fakeFetch([
    ['sgs.7326/', (u) => (u.includes('01/01/2015') ? [{ data: '01/01/2020', valor: '900' }] : [])],
    ['sgs.433/', []], ['sgs.13762/', []],
  ]);
  const r = await runAdapter(bcbSgs, { pool, fetchImpl: broken, now: NOW });
  assert.equal(r.status, 'rejeitado');
  const after = (await pool.query('SELECT COUNT(*)::INT n FROM fact_observation')).rows[0].n;
  assert.equal(after, before);
  const { rows: [pib] } = await pool.query(`SELECT o.valor::FLOAT v FROM fact_observation o
    JOIN dim_indicator i ON i.id = o.indicator_id WHERE i.slug='pib-anual' AND o.periodo_ano=2020`);
  assert.equal(pib.v, -1);
});

test('fonte fora do ar: execução "falhou", health degraded com último lote mantido', opts, async () => {
  const r = await runAdapter(worldbank, { pool, fetchImpl: fakeFetch([]), now: NOW });
  assert.equal(r.status, 'falhou');
  const s = await buildSummary(pool, { now: NOW, env: { MONITOR_TOKEN: 'x', CRON_SECRET: 'y' } });
  assert.equal(s.status, 'degraded');
  assert.match(s.detail, /worldbank falhou/);
  assert.ok(s.metrics.observacoes >= 4);
});

test('World Bank grava Brasil, países e grupos de pares pela mesma fonte', opts, async () => {
  const rows = (iso) => [{ countryiso3code: iso, date: '2020', value: 1 }];
  const ok = fakeFetch([['api.worldbank.org', wbPayload([...rows('BRA'), ...rows('SGP'), ...rows('SWE'), ...rows('LCN'), ...rows('MIC')])]]);
  const r = await runAdapter(worldbank, { pool, fetchImpl: ok, now: NOW });
  assert.equal(r.status, 'ok');
  assert.equal(r.gravadas, 20); // 5 entidades × 4 séries
});

test('extrato de créditos é somente de inserção e não aceita lançamento duplicado', opts, async () => {
  const { rows: [u] } = await pool.query(`INSERT INTO app_user (email) VALUES ('Teste@Exemplo.com') RETURNING id`);
  await pool.query(`INSERT INTO credit_ledger (user_id, delta, motivo, referencia) VALUES ($1, 10, 'compra', 'evt_1')`, [u.id]);
  await assert.rejects(pool.query(`INSERT INTO credit_ledger (user_id, delta, motivo, referencia) VALUES ($1, 10, 'compra', 'evt_1')`, [u.id]), /uq_ledger_ref/);
  await assert.rejects(pool.query(`UPDATE credit_ledger SET delta = 999`), /somente de inserção/);
  await assert.rejects(pool.query(`DELETE FROM credit_ledger`), /somente de inserção/);
  const { rows: [b] } = await pool.query(`SELECT saldo FROM credit_balance WHERE user_id = $1`, [u.id]);
  assert.equal(b.saldo, 10);
  // e-mail é case-insensitive (citext)
  await assert.rejects(pool.query(`INSERT INTO app_user (email) VALUES ('teste@exemplo.com')`), /unique/i);
});

test('health: migração pendente vira down', opts, async () => {
  await pool.query(`DELETE FROM schema_migrations WHERE nome = '004_contas_creditos.sql'`);
  const s = await buildSummary(pool, { now: NOW, env: {} });
  assert.equal(s.status, 'down');
  assert.match(s.detail, /004_contas_creditos/);
});
