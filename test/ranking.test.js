import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { normalize, normalizeEscala, historicoAnual, parsePesos, ranking, MODOS } from '../lib/ranking.js';
import { parseImf } from '../adapters/imf.js';
import { migrate, seed } from '../lib/migrations.js';
import { compare } from '../lib/compare.js';

const NOW = new Date('2026-10-03T12:00:00Z');

test('normalização: melhor = 100, pior = 0, respeitando a direção', () => {
  assert.deepEqual(normalize([1, 3, null, 2], 'maior'), [0, 100, null, 50]);
  assert.deepEqual(normalize([1, 3, 2], 'menor'), [100, 0, 50]);
  assert.deepEqual(normalize([2, 2], 'maior'), [50, 50]);
});

test('escala histórica: diferença pequena entre governos vira diferença pequena de nota', () => {
  // médias 0,02 e 0,05 numa série anual que vai de -1 a 1
  assert.deepEqual(normalizeEscala([0.02, 0.05], 'maior', [-1, 1]), [51, 52.5]);
  // governo fora da amplitude histórica amplia a escala (nota nunca sai de 0–100)
  assert.deepEqual(normalizeEscala([3, null], 'menor', [0, 1]), [0, null]);
  const br = new Map([[2000, { valor: 10 }], [2004, { valor: 14 }], [2005, { valor: 20, qualidade: 'projecao' }]].map(([a, o]) => [a, { qualidade: 'oficial', ...o }]));
  assert.deepEqual(historicoAnual(br, null, 'media'), [10, 14]);
  assert.deepEqual(historicoAnual(br, null, 'variacao'), [4]);
  assert.ok(!MODOS.oficial.componentes.some((c) => c.slug === 'juro-real-bcb'));
});

test('pesos: padrão 1, aceita 0–10, ignora indicador desconhecido', () => {
  const p = parsePesos('pib-anual:3,ipca-anual:0,xyz:5,desemprego-oit-wb:99', MODOS.oficial.componentes);
  assert.equal(p['pib-anual'], 3);
  assert.equal(p['ipca-anual'], 0);
  assert.equal(p['desemprego-oit-wb'], 1);
  assert.equal(p.xyz, undefined);
});

test('FMI: lê a série do Brasil, descarta anos futuros, marca o ano corrente como projeção', () => {
  const out = parseImf({ values: { GGXONLB_NGDP: { BRA: { 2001: 3.2, 2024: -0.4, 2025: 0.1, 2026: -0.6, 2027: 0 } } } }, 'GGXONLB_NGDP', NOW);
  assert.deepEqual(out, [
    { ano: 2001, valor: 3.2, qualidade: 'oficial' },
    { ano: 2024, valor: -0.4, qualidade: 'oficial' },
    { ano: 2025, valor: 0.1, qualidade: 'parcial' },
    { ano: 2026, valor: -0.6, qualidade: 'projecao' },
  ]);
  assert.throws(() => parseImf({ values: {} }, 'GGXONLB_NGDP', NOW), /ausente/);
});

// Integração com dados SINTÉTICOS só no banco de teste.
const url = process.env.TEST_DATABASE_URL;
const opts = { skip: url ? false : 'defina TEST_DATABASE_URL para rodar' };
let pool;
before(async () => {
  if (!url) return;
  pool = new pg.Pool({ connectionString: url, max: 3 });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool, { log: () => {} });
  await seed(pool, { log: () => {} });
  const put = (e, i, a, v, q = 'oficial') => pool.query(`
    INSERT INTO fact_observation (entity_id, indicator_id, periodo_ano, valor, qualidade, fonte_id, url_fonte, adaptador_versao)
    SELECT c.id, i.id, $3, $4, $5, i.fonte_id, 'https://exemplo.test', 'teste'
    FROM dim_country c, dim_indicator i WHERE c.slug = $1 AND i.slug = $2`, [e, i, a, v, q]);
  for (let a = 1995; a <= 2025; a++) {
    await put('brasil', 'pib-anual', a, a <= 2002 ? 2 : a <= 2010 ? 4 : a <= 2016 ? 0 : a <= 2018 ? 1 : a <= 2022 ? 1.5 : 3);
    await put('brasil', 'ipca-anual', a, a <= 2002 ? 9 : 5);
    await put('brasil', 'pib-anual-wb', a, a === 2020 ? -3 : 2);
    await put('america-latina', 'pib-anual-wb', a, a === 2020 ? -7 : 2);
    await put('mundo', 'pib-anual-wb', a, a === 2020 ? -3 : a === 2009 ? -1 : 3);
  }
  await put('brasil', 'resultado-primario-fmi', 2002, 3.2);
  await put('brasil', 'resultado-primario-fmi', 2018, -1.6);
  await put('brasil', 'controle-corrupcao-wb', 2018, 40);
});
after(async () => { if (pool) await pool.end(); });

test('ranking oficial: média ponderada só dos indicadores com dado e aviso de cobertura', opts, async () => {
  const r = await ranking(pool, { modo: 'oficial' });
  const lula = r.governos.find((g) => g.slug === 'lula');
  const dilma = r.governos.find((g) => g.slug === 'dilma');
  assert.equal(lula.posicao, 1);                  // maior PIB e inflação baixa
  assert.ok(dilma.nota < lula.nota);
  assert.ok(lula.peso_coberto < 100);             // sem desemprego/dívida no teste
  assert.match(r.avisos.join(' '), /Sem dado para todos/);
  assert.match(r.formula, /Σ\(peso × nota\)/);
});

test('peso zero tira o indicador da conta', opts, async () => {
  const r = await ranking(pool, { modo: 'oficial', pesos: 'ipca-anual:0,resultado-primario-fmi:0' });
  const fhc = r.governos.find((g) => g.slug === 'fhc');
  assert.equal(fhc.nota, r.governos.find((g) => g.slug === 'fhc').itens.find((i) => i.slug === 'pib-anual').nota);
});

test('ranking relativo: queda comum à região não pune o governo', opts, async () => {
  const r = await ranking(pool, { modo: 'relativo', pesos: 'inflacao-wb:0,desemprego-oit-wb:0' });
  const bolso = r.governos.find((g) => g.slug === 'bolsonaro');
  const item = bolso.itens.find((i) => i.slug === 'pib-anual-wb');
  assert.equal(item.valor, 1);                    // (2+2-3+2)/4 − (2+2-7+2)/4 = +1
  assert.equal(bolso.posicao, 1);
});

test('contexto: recessão mundial ano a ano e herança fiscal', opts, async () => {
  const r = await compare(pool, { indicador: 'pib-anual', governos: ['lula', 'bolsonaro', 'temer'] });
  const fat = (g, s) => r.contexto.find((c) => c.governo === g).fatores.find((f) => f.slug === s);
  assert.equal(fat('bolsonaro', 'recessao_mundial').efeito, 'desfavoravel');
  assert.match(fat('bolsonaro', 'recessao_mundial').texto, /2020/);
  assert.equal(fat('lula', 'recessao_mundial').efeito, 'desfavoravel');   // 2009
  assert.equal(fat('temer', 'recessao_mundial').efeito, 'neutro');
  assert.equal(fat('lula', 'heranca_fiscal').efeito, 'favoravel');       // superávit de 2002
  assert.equal(fat('bolsonaro', 'heranca_fiscal').efeito, 'desfavoravel'); // déficit de 2018
});

test('FMI: tenta o próximo código quando o primeiro não traz o Brasil', async () => {
  const { default: imf } = await import('../adapters/imf.js');
  const { fakeFetch } = await import('./helpers.js');
  const f = fakeFetch([
    ['/GGXONLB_G01_GDP_PT/', { values: {} }],
    ['/pb/', { values: { pb: { BRA: { 2002: 3.2 } } } }],
    ['/GGXWDG_NGDP/', { values: { GGXWDG_NGDP: { BRA: { 2002: 60 } } } }],
    ['/G_X_G01_GDP_PT/', { values: { G_X_G01_GDP_PT: { BRA: { 2002: 44.5 } } } }],
  ]);
  const raw = await imf.fetch({ fetchImpl: f, log: () => {} });
  const obs = imf.normalize(raw, { now: NOW });
  assert.deepEqual(obs.map((o) => [o.indicator, o.ano, o.valor]), [['resultado-primario-fmi', 2002, 3.2], ['divida-bruta-fmi', 2002, 60], ['despesa-governo-fmi', 2002, 44.5]]);
});

test('despesa total é neutra (fora do ranking) e corrupção entra no modo oficial', opts, async () => {
  const { rows } = await pool.query("SELECT slug, direcao_otima::text AS d FROM dim_indicator WHERE slug IN ('despesa-governo-fmi','controle-corrupcao-wb') ORDER BY slug");
  assert.deepEqual(rows, [{ slug: 'controle-corrupcao-wb', d: 'maior' }, { slug: 'despesa-governo-fmi', d: 'neutra' }]);
  const slugs = MODOS.oficial.componentes.map((c) => c.slug);
  assert.ok(slugs.includes('controle-corrupcao-wb'));
  assert.ok(!Object.values(MODOS).some((m) => m.componentes.some((c) => c.slug === 'despesa-governo-fmi')));
});

test('catálogo: WGI aparece no grupo internacional', opts, async () => {
  const { getCatalog } = await import('../lib/compare.js');
  const cat = await getCatalog(pool);
  assert.equal(cat.indicadores.find((i) => i.slug === 'controle-corrupcao-wb').grupo, 'internacional');
});

test('cobertura mínima: indicador com menos da metade dos anos não entra na nota', opts, async () => {
  const r = await ranking(pool, { modo: 'oficial' });
  const fhc = r.governos.find((g) => g.slug === 'fhc');
  const prim = fhc.itens.find((i) => i.slug === 'resultado-primario-fmi');   // só 2002 de 8 anos
  assert.equal(prim.nota, null);
  assert.match(prim.motivo, /50%/);
  assert.match(r.avisos.join(' '), /menos da metade dos anos/);
  assert.ok(MODOS.oficial.componentes.some((c) => c.slug === 'desemprego-oit-wb'));
});
