import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import tesouro, { parseRtn, somarEmendas, parseValor, RTN_ID, EMENDAS_ID } from '../adapters/tesouro.js';
import { readXlsx } from '../lib/xlsx.js';
import { validate } from '../adapters/base.js';

const NOW = new Date('2026-10-04T12:00:00Z');
const RTN = readFileSync(new URL('./fixtures/rtn-mini.xlsx', import.meta.url));
const CSV = 'Nome Ente;UF;Código Siafi;Código IBGE;Data;Ano;Mês;Tipo Ente;OB;CNPJ do Favorecido;Nome Favorecido;Nome Emenda;Transferência Especial;Categoria Econômica Despesa;Valor\n'
  + 'A;PR;1;2;42005;2015;janeiro;Município;OB1;1;M A;Emenda Individual;Não;DESPESAS DE CAPITAL;1000000\n'
  + 'B;RS;1;2;42005;2015;janeiro;Município;OB2;1;M B;Emenda de Bancada;Não;DESPESAS DE CAPITAL;500000,50\n'
  + 'C;ES;1;2;46000;2026;março;Município;OB3;1;M C;Emenda Individual;Não;DESPESAS CORRENTES;300\n';

test('RTN: lê pessoal em % do PIB (fração ×100) e o PIB nominal da aba 2.1-A', () => {
  const r = parseRtn(readXlsx(RTN), NOW);
  assert.deepEqual(r.pessoal[0], { ano: 1997, valor: 4.5, qualidade: 'oficial' });
  assert.equal(r.pessoal.at(-1).ano, 2025);
  assert.equal(r.pessoal.at(-1).qualidade, 'parcial');
  assert.equal(r.pib.get(1997), 1e12);
  // tributos = 1.1 + 1.2 (incentivos, negativos) + 1.3; despesa total pela linha 4
  assert.deepEqual(r.series['tributos-federais-tesouro'][0], { ano: 1997, valor: 16.9, qualidade: 'oficial' });
  assert.equal(r.series['despesa-total-tesouro'][0].valor, 18);
  // resultado primário pode ser negativo; juros guardados como custo positivo
  assert.equal(r.series['resultado-primario-tesouro'][0].valor, 2);
  assert.equal(r.series['resultado-primario-tesouro'].at(-1).valor, -1);
  assert.equal(r.series['juros-nominais-tesouro'][0].valor, 5);
});

test('RTN: sem a linha 5, o primário sai de receita líquida − despesa; juros são opcionais', () => {
  const L = [['% do PIB'], ['Discriminação', ...Array.from({ length: 12 }, (_, i) => 2000 + i)],
    ['1.1 Receita Administrada pela RFB', ...Array(12).fill(0.1)], ['1.3 Arrecadação Líquida para o RGPS', ...Array(12).fill(0.05)],
    ['3. RECEITA LÍQUIDA (1-2)', ...Array(12).fill(0.17)], ['4. DESPESA TOTAL', ...Array(12).fill(0.18)],
    ['4.2  Pessoal e Encargos Sociais', ...Array(12).fill(0.04)], [' PIB Nominal (R$ Milhões)', ...Array(12).fill(1)]];
  const r = parseRtn({ abas: ['2.1-A'], linhas: () => L }, NOW);
  assert.equal(r.series['resultado-primario-tesouro'][0].valor, -1);
  assert.equal(r.series['juros-nominais-tesouro'], undefined);
});

test('RTN: linha ausente gera erro com os rótulos encontrados (diagnóstico)', () => {
  const L = [['% do PIB'], ['Discriminação', 2020], ['4.2  Pessoal e Encargos Sociais', 0.04], [' PIB Nominal (R$ Milhões)', 1]];
  assert.throws(() => parseRtn({ abas: ['2.1-A'], linhas: () => L }, NOW), /DESPESA TOTAL.*Rótulos na aba: 4\.2 Pessoal/);
});

test('RTN: recusa planilha sem a aba, sem "% do PIB" ou fora da escala', () => {
  assert.throws(() => parseRtn({ abas: ['1.1'], linhas: () => [] }, NOW), /aba 2.1-A ausente/);
  assert.throws(() => parseRtn({ abas: ['2.1-A'], linhas: () => [['R$ Milhões']] }, NOW), /% do PIB/);
  const L = [['% do PIB'], ['Discriminação', 2020], ['1.1 Receita Administrada pela RFB', 0.1], ['1.3 Arrecadação Líquida para o RGPS', 0.05],
    ['4. DESPESA TOTAL', 0.18], ['4.2  Pessoal e Encargos Sociais', 4.2], ['5. RESULTADO PRIMÁRIO DO GOV. CENTRAL (3-4)', 0.01], [' PIB Nominal (R$ Milhões)', 1]];
  assert.throws(() => parseRtn({ abas: ['2.1-A'], linhas: () => L }, NOW), /escala de fração/);
});

test('emendas: soma por ano em fluxo, com linhas partidas entre pedaços e valores 1.234,56', async () => {
  assert.equal(parseValor('500000,50'), 500000.5);
  assert.equal(parseValor('1.234,56'), 1234.56);
  assert.equal(parseValor('243750'), 243750);
  assert.equal(parseValor(''), null);
  const enc = new TextEncoder().encode(CSV);
  const pedacos = [enc.slice(0, 37), enc.slice(37, 260), enc.slice(260)];   // corta no meio de linhas
  const { porAno, linhas } = await somarEmendas(pedacos);
  assert.equal(linhas, 3);
  assert.deepEqual(porAno.get(2015), { total: 1500000.5, individual: 1000000, bancada: 500000.5 });
  await assert.rejects(() => somarEmendas(['x;y\n1;2\n']), /colunas/);
});

test('adaptador completo: descobre URLs no CKAN, baixa e normaliza dentro do catálogo', async () => {
  const chamadas = [];
  const fetchImpl = async (url) => {
    chamadas.push(url);
    if (url.includes(RTN_ID)) return { ok: true, status: 200, json: async () => ({ result: { resources: [
      { name: 'Metadados', format: 'PDF', url: 'x.pdf' },
      { name: 'Resultado do Tesouro Nacional - Série Histórica - Mensal', format: 'XLSX', url: 'https://t/serie.xlsx' }] } }) };
    if (url.includes(EMENDAS_ID)) return { ok: true, status: 200, json: async () => ({ result: { resources: [
      { name: 'Emendas', format: 'CSV', url: 'https://t/emendas.csv' }] } }) };
    if (url.endsWith('.xlsx')) return { ok: true, status: 200, arrayBuffer: async () => RTN.buffer.slice(RTN.byteOffset, RTN.byteOffset + RTN.length) };
    if (url.endsWith('.csv')) return { ok: true, status: 200, body: [new TextEncoder().encode(CSV)] };
    return { ok: false, status: 404 };
  };
  const raw = await tesouro.fetch({ fetchImpl, log: () => {} });
  const obs = tesouro.normalize(raw, { now: NOW });
  const emendas = obs.filter((o) => o.indicator === 'emendas-tesouro');
  assert.deepEqual(emendas.map((o) => [o.ano, o.valor]), [[2015, round(1500000.5 / (1e12 * (1 + 18 * 0.1)) * 100)]]);   // 2026 sem PIB: fora
  assert.equal(obs.filter((o) => o.indicator === 'pessoal-tesouro').length, 29);
  assert.equal(obs.filter((o) => o.indicator === 'tributos-federais-tesouro').length, 29);
  const un = { unidade: '% PIB' };
  const catalog = { indicators: new Map(['pessoal-tesouro', 'emendas-tesouro', 'despesa-total-tesouro', 'tributos-federais-tesouro', 'resultado-primario-tesouro', 'juros-nominais-tesouro'].map((k) => [k, un])), entities: new Map([['brasil', {}]]) };
  assert.equal(validate(obs, catalog, { now: NOW }).ok, true);
  assert.ok(chamadas.some((u) => u === 'https://t/serie.xlsx'));
});
const round = (n) => Math.round(n * 1e4) / 1e4;
