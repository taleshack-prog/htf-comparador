import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { sensibilidade, normalize, normalizeEscala, historicoAnual, parsePesos, ranking, MODOS } from '../lib/ranking.js';
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
  assert.deepEqual(historicoAnual(br, null, 'variacao'), []);   // 2000→2004 não são anos seguidos
  const br2 = new Map([[2000, 10], [2001, 12], [2002, 11]].map(([a, v]) => [a, { valor: v, qualidade: 'oficial' }]));
  assert.deepEqual(historicoAnual(br2, null, 'variacao'), [2, -1]);
  assert.ok(!MODOS.oficial.componentes.some((c) => c.slug === 'juro-real-bcb'));
});

test('sensibilidade: notas próximas viram empate técnico; distância grande, não', () => {
  const it = (a, b) => [{ slug: 'x', bloco: 'b1', nota: a }, { slug: 'y', bloco: 'b2', nota: b }];
  const g = [{ slug: 'A', nota: 60, itens: it(70, 50) }, { slug: 'B', nota: 59.5, itens: it(50, 69) }, { slug: 'C', nota: 20, itens: it(20, 20) }];
  const r = sensibilidade(g, ['b1', 'b2'], { x: 1, y: 1 });
  assert.deepEqual(r.empates, [['A', 'B']]);
  assert.deepEqual(r.porGov.C.faixa, [3, 3]);
  assert.equal(r.porGov.C.primeiro, 0);
  // reproduzível: mesma semente, mesmo resultado
  assert.deepEqual(sensibilidade(g, ['b1', 'b2'], { x: 1, y: 1 }).porGov.A, r.porGov.A);
});

test('pesos: padrão 1, aceita 0–10, ignora indicador desconhecido', () => {
  const p = parsePesos('pib-per-capita-wb:3,ipca-anual:0,xyz:5,desemprego-oit-wb:99', MODOS.oficial.componentes);
  assert.equal(p['pib-per-capita-wb'], 3);
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
    await put('brasil', 'pib-per-capita-wb', a, a <= 2002 ? 2 : a <= 2010 ? 4 : a <= 2016 ? 0 : a <= 2018 ? 1 : a <= 2022 ? 1.5 : 3);
    await put('brasil', 'ipca-anual', a, a <= 2002 ? 9 : 5);
    await put('brasil', 'pib-anual-wb', a, a === 2020 ? -3 : 2);
    await put('america-latina', 'pib-anual-wb', a, a === 2020 ? -7 : 2);
    await put('mundo', 'pib-anual-wb', a, a === 2020 ? -3 : a === 2009 ? -1 : 3);
  }
  await put('brasil', 'resultado-primario-fmi', 2002, 3.2);
  await put('brasil', 'resultado-primario-fmi', 2018, -1.6);
  await put('brasil', 'resultado-primario-tesouro', 2002, 2.1);
  await put('brasil', 'resultado-primario-tesouro', 2018, -1.6);
  await put('brasil', 'controle-corrupcao-wb', 2018, 40);
});
after(async () => { if (pool) await pool.end(); });

test('ranking oficial: média ponderada só dos indicadores com dado e aviso de cobertura', opts, async () => {
  // com todos os indicadores, a base de teste cobre menos da metade dos pesos: sem posição
  const todos = await ranking(pool, { modo: 'oficial' });
  const l0 = todos.governos.find((g) => g.slug === 'lula');
  assert.equal(l0.insuficiente, true);
  assert.equal(l0.posicao, undefined);
  assert.match(todos.avisos.join(' '), /Sem posição por ter dado em menos da metade/);
  // só com os indicadores de economia que têm dado na base de teste
  const r = await ranking(pool, { modo: 'oficial', pesos: 'desemprego-oit-wb:0,investimento-wb:1' });
  const lula = r.governos.find((g) => g.slug === 'lula');
  const dilma = r.governos.find((g) => g.slug === 'dilma');
  assert.ok(dilma.nota < lula.nota);              // maior PIB e inflação baixa
  assert.ok(lula.peso_coberto < 100);
  assert.match(r.avisos.join(' '), /Sem dado para todos/);
  assert.match(r.formula, /Σ\(peso × nota\)/);
});

test('peso zero tira o indicador da conta', opts, async () => {
  const r = await ranking(pool, { modo: 'oficial', pesos: 'ipca-anual:0,resultado-primario-tesouro:0' });
  const fhc = r.governos.find((g) => g.slug === 'fhc');
  assert.equal(fhc.nota, r.governos.find((g) => g.slug === 'fhc').itens.find((i) => i.slug === 'pib-per-capita-wb').nota);
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
  const prim = fhc.itens.find((i) => i.slug === 'resultado-primario-tesouro');   // só 2002 de 8 anos
  assert.equal(prim.nota, null);
  assert.match(prim.motivo, /50%/);
  assert.match(r.avisos.join(' '), /menos da metade dos anos/);
  assert.ok(MODOS.oficial.componentes.some((c) => c.slug === 'desemprego-oit-wb'));
});

test('trajetória: média do mandato menos o ano anterior à posse; escala robusta com cortes', async () => {
  const { historicoTrajetoria, normalizeRobusta, MODOS: M } = await import('../lib/ranking.js');
  const br = new Map([[2000, 10], [2001, 8], [2002, 8], [2003, 8], [2004, 8]].map(([a, v]) => [a, { valor: v, qualidade: 'oficial' }]));
  assert.deepEqual(historicoTrajetoria(br), [-2, 0]);   // base 2000: média 2001–2004 (8) − 10; base 2001: 2002–2004 − 8
  const pre = new Map([[1994, 900], [1995, 20], [1996, 10], [1997, 8], [1998, 8], [1999, 8]].map(([a, v]) => [a, { valor: v, qualidade: 'oficial' }]));
  assert.ok(historicoTrajetoria(pre).every((x) => x > -20));   // anos-base pré-Real ficam fora da escala
  const h = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, -900];   // choque extremo não achata a escala
  const n = normalizeRobusta([-900, 0, 4], 'menor', h);
  assert.equal(n[0], 100);
  assert.ok(n[1] > 40 && n[1] < 60);
  assert.ok(M.oficial.componentes.some((c) => c.slug === 'divida-bruta-fmi'));      // dívida: fim − início, por ano
  assert.ok(!M.oficial.componentes.some((c) => c.slug === 'juros-nominais-tesouro'));
  assert.ok(M.trajetoria.trajetoria);
  assert.ok(!M.trajetoria.componentes.some((c) => c.slug.startsWith('pib')));
});

test('ano civil em curso fica fora da nota (ano incompleto não é comparável)', async () => {
  const { semAnoCorrente } = await import('../lib/ranking.js');
  const serie = new Map([[2024, { valor: 4.8 }], [2025, { valor: 4.3 }], [2026, { valor: 2.9 }]]);
  assert.deepEqual([...semAnoCorrente(serie, NOW).keys()], [2024, 2025]);
  assert.equal(semAnoCorrente(null, NOW), null);
});

test('erro de medida: regra da escala do instrumento e conversão da margem', async () => {
  const { usaEscalaInstrumento, normalizeInstrumento, normalizeInstrumentoVariacao, LARGURAS_MIN } = await import('../lib/ranking.js');
  assert.equal(LARGURAS_MIN, 4);
  assert.equal(usaEscalaInstrumento([49, 59], 5.6, [0, 100]), true);     // 10 pontos < 4 × 5,6
  assert.equal(usaEscalaInstrumento([20, 80], 5.6, [0, 100]), false);    // 60 pontos: variação real
  assert.equal(usaEscalaInstrumento([49, 59], null, [0, 100]), false);   // sem margem publicada
  assert.deepEqual(normalizeInstrumento([48.9, 57.6, null], 'maior', [0, 100]), [48.9, 57.6, null]);
  assert.deepEqual(normalizeInstrumentoVariacao([-4, 3], 'maior', [0, 100]), [46, 53]);
});

test('WGI com variação dentro do erro: escala do índice, margem no item e na simulação', opts, async () => {
  const put = (i, a, v) => pool.query(`
    INSERT INTO fact_observation (entity_id, indicator_id, periodo_ano, valor, qualidade, fonte_id, url_fonte, adaptador_versao)
    SELECT c.id, i.id, $2, $3, 'oficial', i.fonte_id, 'https://exemplo.test', 'teste'
    FROM dim_country c, dim_indicator i WHERE c.slug = 'brasil' AND i.slug = $1
    ON CONFLICT DO NOTHING`, [i, a, v]);
  for (let a = 1996; a <= 2025; a++) {
    await put('qualidade-regulatoria-wb', a, a <= 2010 ? 58 : a <= 2018 ? 54 : 49);   // amplitude 9
    await put('qualidade-regulatoria-wb-margem', a, 5.6);
    await put('efetividade-governo-wb', a, a <= 2010 ? 80 : 20);                       // amplitude 60
    await put('efetividade-governo-wb-margem', a, 5);
  }
  const r = await ranking(pool, { modo: 'oficial' });
  const rq = r.componentes.find((c) => c.slug === 'qualidade-regulatoria-wb');
  const ge = r.componentes.find((c) => c.slug === 'efetividade-governo-wb');
  assert.equal(rq.escala, 'instrumento');
  assert.equal(ge.escala, undefined);
  const lula3 = r.governos.find((g) => g.slug === 'lula-3');
  const it = lula3.itens.find((i) => i.slug === 'qualidade-regulatoria-wb');
  assert.equal(it.nota, 49);                          // 1 ponto do índice = 1 ponto de nota
  assert.equal(it.margem, 5.6);
  assert.equal(it.erro, Math.round((5.6 / 1.645) * 100) / 100);
  const itGe = lula3.itens.find((i) => i.slug === 'efetividade-governo-wb');
  assert.equal(itGe.nota, 0);                         // variação real: escala histórica
  assert.equal(itGe.erro, Math.round((5 / 1.645) * (100 / 60) * 100) / 100);
  // simulação: só com os indicadores que têm dado na base de teste (os demais com peso 0)
  const usados = ['pib-per-capita-wb', 'ipca-anual', 'qualidade-regulatoria-wb', 'efetividade-governo-wb'];
  const pesos = MODOS.oficial.componentes.map((c) => `${c.slug}:${usados.includes(c.slug) ? 1 : 0}`).join(',');
  const r2 = await ranking(pool, { modo: 'oficial', pesos });
  assert.equal(r2.sensibilidade.erro_medida, true);
  assert.match(r2.sensibilidade.metodo, /erro de medida/);
  assert.match(r.avisos.join(' '), /escala do próprio índice/);
  const { getCatalog } = await import('../lib/compare.js');
  assert.ok(!(await getCatalog(pool)).indicadores.some((i) => i.slug.endsWith('-margem')));   // série auxiliar
});

test('defasagem de 1 ano: mede os anos do mandato deslocados, mostra o mandato real', opts, async () => {
  const r = await ranking(pool, { modo: 'oficial', defasagem: 1 });
  const lula = r.governos.find((g) => g.slug === 'lula');
  assert.equal(r.defasagem, 1);
  assert.deepEqual([lula.ano_inicio, lula.ano_fim], [2003, 2010]);
  assert.deepEqual(lula.anos_medidos, [2004, 2011]);
  // base de teste: PIB 2 em 1995–2002, 4 em 2003–2010, 0 em 2011–2016 → Lula medido em 2004–2011 = (7×4 + 0) / 8
  assert.equal(lula.itens.find((i) => i.slug === 'pib-per-capita-wb').valor, 3.5);
  assert.match(r.avisos.join(' '), /Defasagem de 1 ano/);
  assert.equal(await ranking(pool, { modo: 'oficial', defasagem: 3 }), null);
});

test('escala com cortes em 5% e 95%: um ano extremo não achata os demais', async () => {
  const { limitesEscala } = await import('../lib/ranking.js');
  const h = [-1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, -10];   // 2020: −10
  assert.deepEqual(limitesEscala(h), [-1, 3.5]);
  const [a, b] = normalizeEscala([-1, 2.1, -10], 'maior', h);
  assert.equal(a, 0); assert.equal(b, 68.9);
  assert.deepEqual(limitesEscala([0, 0, 0, 0, 0, 4]), [0, 4]);   // série quase constante: pior e melhor
});

test('variação sem dado no ano anterior à posse usa o último ano até 2 antes; bloco social', async () => {
  const { aggregateWindow } = await import('../lib/compare.js');
  const { RECUO_BASE, MODOS: M } = await import('../lib/ranking.js');
  const s = new Map([[2009, 8.4], [2011, 7.1], [2015, 5.4]].map(([a, v]) => [a, { valor: v, qualidade: 'oficial' }]));
  assert.equal(aggregateWindow(s, 2011, 2015, 'variacao').valor, null);                   // sem 2010, sem recuo
  const a = aggregateWindow(s, 2011, 2015, 'variacao', { recuoBase: RECUO_BASE });
  assert.equal(a.base_ano, 2009); assert.equal(a.valor, -3);
  assert.deepEqual(M.oficial.blocos.map((b) => b.slug), ['economia', 'contas', 'social', 'instituicoes']);
  assert.ok(!M.oficial.componentes.some((c) => c.slug === 'pib-anual'));                  // PIB total não conta duas vezes
  assert.ok(M.relativo.componentes.some((c) => c.slug === 'mortalidade-infantil-wb'));
});

test('sorte ou política: mínimos quadrados recupera os coeficientes', async () => {
  const { ols } = await import('../lib/sorte.js');
  const X = [[1, 0], [2, 1], [3, 0], [4, 2], [5, 1], [6, 3]];
  const y = X.map(([a, b]) => 0.5 + 2 * a - 1 * b);
  const m = ols(y, X);
  assert.deepEqual(m.beta.map((v) => Math.round(v * 1000) / 1000), [0.5, 2, -1]);
  assert.equal(Math.round(m.r2 * 1000) / 1000, 1);
});

test('integridade: parecer do TCU por exercício (rejeição só em 2014 e 2015)', async () => {
  const { pareceresTcu } = await import('../lib/integridade.js');
  assert.deepEqual(pareceresTcu(2011, 2015).pela_rejeicao, [2014, 2015]);
  assert.equal(pareceresTcu(2011, 2015).exercicios, 5);
  assert.deepEqual(pareceresTcu(2003, 2010).pela_rejeicao, []);
  assert.equal(pareceresTcu(2023, 2026).exercicios, 3);   // 2026 ainda sem parecer
});

test('grupos: governos em empate técnico ficam no mesmo grupo', opts, async () => {
  const usados = ['pib-per-capita-wb', 'ipca-anual'];
  const pesos = MODOS.oficial.componentes.map((c) => `${c.slug}:${usados.includes(c.slug) ? 1 : 0}`).join(',');
  const r = await ranking(pool, { modo: 'oficial', pesos });
  const ord = r.governos.filter((g) => g.posicao);
  assert.equal(ord[0].grupo, 1);
  for (let i = 1; i < ord.length; i++) {
    const mesmo = ord[i].empate && ord[i].empate.includes(ord[i - 1].slug);
    assert.equal(ord[i].grupo, ord[i - 1].grupo + (mesmo ? 0 : 1));
  }
});

test('sorte e integridade respondem com a base de teste (sem inventar dado)', opts, async () => {
  const { sorte } = await import('../lib/sorte.js');
  const { integridade } = await import('../lib/integridade.js');
  const s = await sorte(pool);
  assert.equal(s.disponivel, false);                 // base de teste não tem termos de troca
  assert.match(s.motivo, /faltam séries/);
  const i = await integridade(pool);
  assert.equal(i.governos.length, 6);
  assert.equal(i.fora_da_nota, true);
  assert.deepEqual(i.governos.find((g) => g.slug === 'dilma').tcu.pela_rejeicao, [2014, 2015]);
});
