import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { aggregateWindow, compare, getCatalog } from '../lib/compare.js';
import { migrate, seed } from '../lib/migrations.js';

const S = (pairs) => new Map(pairs.map(([ano, valor, qualidade = 'oficial']) => [ano, { ano, valor, qualidade }]));

test('média da janela usa só os anos com dado e informa a cobertura', () => {
  const a = aggregateWindow(S([[2019, 1], [2020, -3], [2022, 3]]), 2019, 2022, 'media');
  assert.equal(a.valor, 0.33);
  assert.deepEqual(a.cobertura, [3, 4]);
  assert.deepEqual(a.anos, [2019, 2020, 2022]);
});

test('variação usa o ano anterior à posse como base', () => {
  const a = aggregateWindow(S([[2018, 70], [2019, 72], [2022, 78]]), 2019, 2022, 'variacao');
  assert.equal(a.valor, 8);
  assert.equal(aggregateWindow(S([[2019, 72]]), 2019, 2022, 'variacao').valor, null);
});

test('qualidade da janela é a pior entre os anos (parcial contamina)', () => {
  assert.equal(aggregateWindow(S([[2025, 2], [2026, 1, 'parcial']]), 2023, 2026, 'media').qualidade, 'parcial');
});

test('janela sem nenhum dado devolve valor nulo, não zero', () => {
  const a = aggregateWindow(S([[2015, 1]]), 1995, 2002, 'media');
  assert.equal(a.valor, null);
  assert.deepEqual(a.cobertura, [0, 8]);
});

// Integração: dados SINTÉTICOS só neste banco de teste.
const url = process.env.TEST_DATABASE_URL;
const opts = { skip: url ? false : 'defina TEST_DATABASE_URL para rodar' };
let pool;
const NOW = new Date('2026-10-03T12:00:00Z');

before(async () => {
  if (!url) return;
  pool = new pg.Pool({ connectionString: url, max: 3 });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool, { log: () => {} });
  await seed(pool, { log: () => {} });
  const put = (ent, ind, ano, valor, q = 'oficial') => pool.query(`
    INSERT INTO fact_observation (entity_id, indicator_id, periodo_ano, valor, qualidade, fonte_id, url_fonte, adaptador_versao)
    SELECT c.id, i.id, $3, $4, $5, i.fonte_id, 'https://exemplo.test', 'teste'
    FROM dim_country c, dim_indicator i WHERE c.slug = $1 AND i.slug = $2`, [ent, ind, ano, valor, q]);
  for (let a = 1995; a <= 2025; a++) await put('mundo', 'pib-anual-wb', a, a === 2009 || a === 2020 ? -2 : 3);
  for (let a = 2014; a <= 2025; a++) {
    await put('brasil', 'pib-anual-wb', a, a === 2015 || a === 2016 ? -3 : 2);
    await put('america-latina', 'pib-anual-wb', a, 1);
    await put('brasil', 'termos-troca-wb', a, 100 + (a - 2014) * 2);
    await put('brasil', 'pib-anual', a, a === 2015 || a === 2016 ? -3.5 : 2);
    await put('brasil', 'ipca-anual', a, a === 2015 ? 10.7 : 4);
  }
  await put('brasil', 'ipca-anual', 2026, 3, 'parcial');
});
after(async () => { if (pool) await pool.end(); });

test('catálogo lista só indicadores com dados e todas as janelas', opts, async () => {
  const c = await getCatalog(pool);
  assert.ok(c.indicadores.find((i) => i.slug === 'ipca-anual'));
  assert.ok(!c.indicadores.find((i) => i.slug === 'pisa-media'));
  assert.equal(c.governos.length, 6);
  assert.ok(c.referencias.find((r) => r.slug === 'america-latina'));
});

test('comparação traz média, cobertura, qualidade e fonte de cada governo', opts, async () => {
  const r = await compare(pool, { indicador: 'ipca-anual', governos: ['temer', 'lula-3'] });
  const temer = r.governos.find((g) => g.slug === 'temer');
  const lula3 = r.governos.find((g) => g.slug === 'lula-3');
  assert.equal(temer.valor, 4);
  assert.deepEqual(temer.cobertura, [3, 3]);   // 2016–2018: 2016 conta para quem governou a maior parte dele
  assert.equal(lula3.qualidade, 'parcial');
  assert.equal(r.fontes[0].nome, 'IBGE');
});

test('diferença para a referência usa só anos pareados', opts, async () => {
  const r = await compare(pool, { indicador: 'pib-anual-wb', governos: ['bolsonaro'], referencia: 'america-latina' });
  assert.equal(r.governos[0].valor, 2);
  assert.equal(r.governos[0].referencia.valor, 1);
  assert.equal(r.governos[0].diferenca, 1);
});

test('contexto: mesmos fatores para todos, medidos pelos dados', opts, async () => {
  const r = await compare(pool, { indicador: 'pib-anual', governos: ['temer', 'bolsonaro'] });
  const fat = (g, s) => r.contexto.find((c) => c.governo === g).fatores.find((f) => f.slug === s);
  // Temer: herdou recessão (2016 = -3,5) → ponto de partida desfavorável + efeito base
  assert.equal(fat('temer', 'heranca').efeito, 'desfavoravel');
  assert.ok(fat('temer', 'efeito_base'));
  assert.match(fat('temer', 'duracao').texto, /poucos pontos/);
  // Bolsonaro: 2020 com queda mundial → choque global medido, sem nota manual
  assert.ok(fat('bolsonaro', 'choque_global'));
  assert.equal(fat('bolsonaro', 'heranca').efeito, 'neutro');
  assert.ok(!fat('bolsonaro', 'efeito_base'));
  // simetria: os fatores medidos existem para os dois governos
  for (const s of ['choque_global', 'termos_troca', 'heranca', 'relativo_pares', 'duracao']) {
    assert.ok(fat('temer', s) && fat('bolsonaro', s), `fator ${s} ausente`);
  }
});
