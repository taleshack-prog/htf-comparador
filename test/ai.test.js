import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { tipoFonte, dominiosBloqueados, montarResposta, perguntar, normalizarPergunta, chaveCache, custoUsd, ALLOWED_DOMAINS, MARCA_FORA } from '../lib/ai.js';
import { atender, hashDe } from '../lib/ask.js';
import { migrate, seed } from '../lib/migrations.js';

const NOW = new Date('2026-10-03T12:00:00Z');

test('rótulo da fonte pelo domínio, do mais específico ao mais geral', () => {
  assert.equal(tipoFonte('https://www.ibge.gov.br/x'), 'governo');
  assert.equal(tipoFonte('https://www.imf.org/en/Publications'), 'organismo');
  assert.equal(tipoFonte('https://www.bloomberg.com/a'), 'imprensa');
  assert.equal(tipoFonte('https://www.economist.com/a'), 'outro');
  assert.equal(tipoFonte('https://piaui.folha.uol.com.br/a'), 'imprensa');
  assert.equal(tipoFonte('https://portal.fgv.br/a'), 'academia');
  assert.equal(tipoFonte('https://www.transparency.org/cpi'), 'ong');
  assert.equal(tipoFonte('https://exemplo.com'), 'outro');
  assert.equal(tipoFonte('não é url'), 'outro');
  assert.ok(ALLOWED_DOMAINS.includes('worldbank.org'));
});

test('pergunta normalizada ignora acento, caixa e pontuação na chave do cache', () => {
  assert.equal(normalizarPergunta('  Inflação no governo   TEMER?! '), 'inflacao no governo temer');
  assert.equal(chaveCache('Inflação no Temer?', 'm'), chaveCache('inflacao no temer', 'm'));
  assert.notEqual(chaveCache('inflacao no temer', 'm'), chaveCache('inflacao no temer', 'outro'));
  assert.notEqual(chaveCache('inflacao no temer', 'm', '2026-10-03'), chaveCache('inflacao no temer', 'm', '2026-10-04'));
});

test('custo: tokens, cache e buscas', () => {
  assert.equal(custoUsd({ entrada: 1e6, saida: 1e5, cache_leitura: 0, cache_escrita: 0, buscas: 2 }), 2 + 1 + 0.02);
});

test('resposta final: só o texto após a última busca, com [n] por URL e rótulos', () => {
  const content = [
    { type: 'text', text: 'Vou pesquisar.' },
    { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'x' } },
    { type: 'web_search_tool_result', tool_use_id: 's1', content: [] },
    { type: 'text', text: 'A inflação caiu', citations: [{ type: 'web_search_result_location', url: 'https://www.imf.org/a', title: 'FMI', cited_text: 'trecho' }] },
    { type: 'text', text: ' e o FMI confirma.', citations: [{ url: 'https://www.imf.org/a', title: 'FMI' }, { url: 'https://valor.globo.com/b', title: 'Valor' }] },
  ];
  const r = montarResposta(content, [{ indicador: 'ipca-anual', nome: 'IPCA', fonte: 'IBGE', url: 'u' }, { indicador: 'ipca-anual', nome: 'IPCA' }]);
  assert.equal(r.texto, 'A inflação caiu [1] e o FMI confirma. [1] [2]');
  assert.deepEqual(r.fontes.map((f) => [f.n, f.tipo]), [[1, 'organismo'], [2, 'imprensa']]);
  assert.equal(r.dados.length, 1);
  assert.equal(r.dados[0].rotulo, 'Dado do Prumo');
  assert.equal(r.fora_do_escopo, false);
  assert.equal(montarResposta([{ type: 'text', text: `${MARCA_FORA} Não recomendo voto.` }], []).fora_do_escopo, true);
});

// ---------- API falsa da Anthropic ----------
function apiFalsa(respostas) {
  const corpos = [];
  const impl = async (url, init) => {
    corpos.push(JSON.parse(init.body));
    const r = respostas.shift();
    if (r instanceof Error) throw r;
    if (r.status) return { ok: false, status: r.status, json: async () => ({ error: { message: 'x' } }) };
    return { ok: true, status: 200, json: async () => r };
  };
  impl.corpos = corpos;
  return impl;
}
const usage = { input_tokens: 1000, output_tokens: 200, server_tool_use: { web_search_requests: 0 } };

const url = process.env.TEST_DATABASE_URL;
const opts = { skip: url ? false : 'defina TEST_DATABASE_URL para rodar' };
let pool;
before(async () => {
  if (!url) return;
  pool = new pg.Pool({ connectionString: url, max: 3 });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool, { log: () => {} });
  await seed(pool, { log: () => {} });
  for (let a = 1995; a <= 2025; a++) {
    await pool.query(`INSERT INTO fact_observation (entity_id, indicator_id, periodo_ano, valor, qualidade, fonte_id, url_fonte, adaptador_versao)
      SELECT c.id, i.id, $1, $2, 'oficial', i.fonte_id, 'https://ibge.test', 't' FROM dim_country c, dim_indicator i
      WHERE c.slug = 'brasil' AND i.slug = 'ipca-anual'`, [a, a < 2003 ? 9 : 5]);
  }
});
after(async () => { if (pool) await pool.end(); });

const respostaComFerramenta = () => [
  { stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: 't1', name: 'comparar_governos', input: { indicador: 'ipca-anual' } }] },
  { stop_reason: 'pause_turn', usage, content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'q' } }] },
  { stop_reason: 'end_turn', usage: { ...usage, server_tool_use: { web_search_requests: 1 } }, content: [
    { type: 'web_search_tool_result', tool_use_id: 's1', content: [] },
    { type: 'text', text: 'Pelo IPCA (IBGE), a inflação média foi menor depois de 2002.', citations: [{ url: 'https://www.bcb.gov.br/r', title: 'BCB' }] },
  ] },
];

test('loop: executa a ferramenta local, continua pause_turn e devolve dados e fontes', opts, async () => {
  const f = apiFalsa(respostaComFerramenta());
  const r = await perguntar({ pergunta: 'Como foi a inflação?', pool, apiKey: 'k', fetchImpl: f, now: NOW });
  assert.match(r.texto, /IPCA/);
  assert.equal(r.fontes[0].tipo, 'governo');
  assert.equal(r.dados[0].indicador, 'ipca-anual');
  assert.equal(r.uso.buscas, 1);
  // 2ª chamada leva o resultado da ferramenta; a 3ª reenvia a mensagem pausada sem mensagem nova
  const tr = f.corpos[1].messages.at(-1).content[0];
  assert.equal(tr.type, 'tool_result');
  assert.match(tr.content, /"governo":"FHC \(1995–2002\)"/);
  assert.equal(f.corpos[2].messages.at(-1).role, 'assistant');
  assert.equal(f.corpos[2].messages.length, f.corpos[1].messages.length + 1);
  const ws = f.corpos[0].tools.find((t) => t.name === 'web_search');
  assert.equal(ws.max_uses, 3);
  assert.ok(ws.allowed_domains.includes('imf.org'));
  assert.equal(f.corpos[0].system[0].cache_control.type, 'ephemeral');
});

const env = { ANTHROPIC_API_KEY: 'k', AUTH_SECRET: 's', AI_DAILY_CAP: '100', AI_IP_DAILY: '50' };

test('cota: 1 grátis por visitante; segunda pergunta nova dá 402; cache não gasta', opts, async () => {
  await pool.query('TRUNCATE ai_query, ai_answer_cache, rate_limit');
  const a = await atender(pool, { pergunta: 'Como foi a inflação?', visitante: 'a'.repeat(32), ip: '1.1.1.1', env, fetchImpl: apiFalsa(respostaComFerramenta()), now: NOW });
  assert.equal(a.status, 200);
  assert.equal(a.body.cota.gratis_restantes, 0);
  const b = await atender(pool, { pergunta: 'E o desemprego no período?', visitante: 'a'.repeat(32), ip: '1.1.1.1', env, fetchImpl: apiFalsa([]), now: NOW });
  assert.equal(b.status, 402);
  assert.equal(b.body.codigo, 'cota_esgotada');
  // mesma pergunta (com outra grafia) vem do cache, sem chamar a API
  const c = await atender(pool, { pergunta: 'como foi a INFLACAO', visitante: 'a'.repeat(32), ip: '1.1.1.1', env, fetchImpl: apiFalsa([]), now: NOW });
  assert.equal(c.status, 200);
  assert.equal(c.body.em_cache, true);
  const { rows: [q] } = await pool.query("SELECT custo_usd::FLOAT AS c, status FROM ai_query WHERE gratis");
  assert.equal(q.status, 'ok');
  assert.ok(q.c > 0);
});

test('falha da API e pergunta fora do escopo devolvem a cota', opts, async () => {
  await pool.query('TRUNCATE ai_query, ai_answer_cache, rate_limit');
  const v = 'b'.repeat(32);
  const e = await atender(pool, { pergunta: 'Pergunta que vai falhar', visitante: v, ip: '2.2.2.2', env, fetchImpl: apiFalsa([{ status: 529 }]), now: NOW });
  assert.equal(e.status, 502);
  assert.match(e.body.error, /não foi gasta/);
  const fora = await atender(pool, { pergunta: 'Em quem devo votar no domingo?', visitante: v, ip: '2.2.2.2', env,
    fetchImpl: apiFalsa([{ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: `${MARCA_FORA} O Prumo não recomenda voto.` }] }]), now: NOW });
  assert.equal(fora.status, 200);
  assert.equal(fora.body.fora_do_escopo, true);
  assert.equal(fora.body.cota.gratis_restantes, 1);
  const { rows } = await pool.query('SELECT status FROM ai_query ORDER BY id');
  assert.deepEqual(rows.map((r) => r.status), ['erro', 'recusada']);
  const { rows: [c] } = await pool.query('SELECT COUNT(*)::INT AS n FROM ai_answer_cache');
  assert.equal(c.n, 0);   // recusa não vai para o cache
});

test('tetos: limite por rede e diário; admin passa; sem chave dá 503; validação', opts, async () => {
  await pool.query('TRUNCATE ai_query, ai_answer_cache, rate_limit');
  const e2 = { ...env, AI_IP_DAILY: '1' };
  const fim = () => apiFalsa([{ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'ok' }] }]);
  assert.equal((await atender(pool, { pergunta: 'Primeira pergunta aqui', visitante: 'c'.repeat(32), ip: '3.3.3.3', env: e2, fetchImpl: fim(), now: NOW })).status, 200);
  assert.equal((await atender(pool, { pergunta: 'Segunda pergunta aqui', visitante: 'd'.repeat(32), ip: '3.3.3.3', env: e2, fetchImpl: fim(), now: NOW })).status, 429);
  const e3 = { ...env, AI_DAILY_CAP: '1' };
  assert.equal((await atender(pool, { pergunta: 'Terceira pergunta aqui', visitante: 'e'.repeat(32), ip: '4.4.4.4', env: e3, fetchImpl: fim(), now: NOW })).body.codigo, 'limite_diario');
  const adm = await atender(pool, { pergunta: 'Pergunta do dono', visitante: 'c'.repeat(32), ip: '3.3.3.3', env: e3, admin: true, fetchImpl: fim(), now: NOW });
  assert.equal(adm.status, 200);
  assert.equal((await atender(pool, { pergunta: 'Qualquer pergunta', visitante: 'f'.repeat(32), ip: '5', env: {}, now: NOW })).status, 503);
  assert.equal((await atender(pool, { pergunta: 'curta', visitante: 'f'.repeat(32), ip: '5', env, now: NOW })).status, 400);
  assert.notEqual(hashDe('v:x', { AUTH_SECRET: 'a' }), hashDe('v:x', { AUTH_SECRET: 'b' }));
});

test('se a API recusar a busca (400), refaz sem ela e registra o motivo', opts, async () => {
  const f = apiFalsa([{ status: 400 }, { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Resposta só com dados.' }] }]);
  const r = await perguntar({ pergunta: 'Pergunta qualquer aqui', pool, apiKey: 'k', fetchImpl: f, now: NOW });
  assert.equal(r.texto, 'Resposta só com dados.');
  assert.match(r.sem_busca, /400/);
  assert.ok(f.corpos[0].tools.some((t) => t.name === 'web_search'));
  assert.ok(!f.corpos[1].tools.some((t) => t.name === 'web_search'));
});

test('domínio bloqueado ao robô: tira da lista e refaz com busca', opts, async () => {
  const msg = "The following domains are not accessible to our user agent: ['bloomberg.com', 'folha.uol.com.br']. Read more: x";
  assert.deepEqual(dominiosBloqueados(msg), ['bloomberg.com', 'folha.uol.com.br']);
  const f = async (url, init) => {
    f.corpos.push(JSON.parse(init.body));
    if (f.corpos.length === 1) return { ok: false, status: 400, json: async () => ({ error: { message: msg } }) };
    return { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'ok' }] }) };
  };
  f.corpos = [];
  const r = await perguntar({ pergunta: 'Pergunta qualquer aqui', pool, apiKey: 'k', fetchImpl: f, now: NOW });
  const ws = f.corpos[1].tools.find((t) => t.name === 'web_search');
  assert.ok(ws && !ws.allowed_domains.includes('bloomberg.com') && ws.allowed_domains.includes('imf.org'));
  assert.deepEqual(r.dominios_removidos, ['bloomberg.com', 'folha.uol.com.br']);
  assert.equal(r.sem_busca, undefined);
});
