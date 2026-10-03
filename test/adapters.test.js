import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toAnnual, windows } from '../adapters/bcb-sgs.js';
import { ibgePnad, ibgeIpca, ibgePib } from '../adapters/ibge-sidra.js';
import { parseWb } from '../adapters/worldbank.js';
import { validate, toNumber, describeError } from '../adapters/base.js';
import { sgsMonthly, sidraPayload, wbPayload } from './helpers.js';

const NOW = new Date('2026-10-03T12:00:00Z');

test('toNumber aceita vírgula e rejeita marcadores de ausência', () => {
  assert.equal(toNumber('1,5'), 1.5);
  assert.equal(toNumber('-0.25'), -0.25);
  assert.equal(toNumber('...'), null);
  assert.equal(toNumber('-'), null);
  assert.equal(toNumber(''), null);
});

test('janelas de 10 anos cobrem o intervalo sem buracos', () => {
  assert.deepEqual(windows(1995, 2026), [[1995, 2004], [2005, 2014], [2015, 2024], [2025, 2026]]);
});

test('IPCA mensal composto: 12 meses de 1% → 12,6825% e oficial', () => {
  const [a] = toAnnual(sgsMonthly(2020, Array(12).fill(1)), 'mensal_composto', NOW);
  assert.equal(a.ano, 2020);
  assert.equal(a.valor, 12.6825);
  assert.equal(a.qualidade, 'oficial');
});

test('ano com meses faltando fica parcial', () => {
  const [a] = toAnnual(sgsMonthly(2025, Array(8).fill(1)), 'mensal_composto', NOW);
  assert.equal(a.qualidade, 'parcial');
});

test('ano corrente nunca é oficial, mesmo completo', () => {
  const [a] = toAnnual(sgsMonthly(2026, Array(12).fill(0.5)), 'mensal_composto', NOW);
  assert.equal(a.qualidade, 'parcial');
});

test('estoque mensal usa dezembro; sem dezembro usa o último mês e marca parcial', () => {
  const pts = [...sgsMonthly(2024, [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61]),
               ...sgsMonthly(2025, [62, 63, 64])];
  const [y24, y25] = toAnnual(pts, 'mensal_dezembro', NOW);
  assert.deepEqual(y24, { ano: 2024, valor: 61, qualidade: 'oficial' });
  assert.deepEqual(y25, { ano: 2025, valor: 64, qualidade: 'parcial' });
});

const norm = (ad, raw) => ad.normalize(raw, { now: NOW }).map(({ ano, valor, qualidade }) => ({ ano, valor, qualidade }));

test('PNAD: média dos trimestres, ignora "..." e marca ano incompleto', () => {
  const out = norm(ibgePnad, sidraPayload({ 202401: '8', 202402: '7', 202403: '6', 202404: '5', 202501: '4', 202502: '...' }));
  assert.deepEqual(out, [
    { ano: 2024, valor: 6.5, qualidade: 'oficial' },
    { ano: 2025, valor: 4, qualidade: 'parcial' },
  ]);
});

test('IPCA: compõe 12 variações mensais', () => {
  const pts = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`2020${String(i + 1).padStart(2, '0')}`, '1']));
  const [a] = norm(ibgeIpca, sidraPayload(pts, { periodo: 'Mês', variavel: 'IPCA - Variação mensal' }));
  assert.deepEqual(a, { ano: 2020, valor: 12.6825, qualidade: 'oficial' });
});

test('PIB: usa a taxa acumulada do 4º trimestre; ano sem 4º trimestre fica parcial', () => {
  const out = norm(ibgePib, sidraPayload({ 202401: '1', 202402: '2', 202403: '2.5', 202404: '3.4', 202601: '0.9' },
    { variavel: 'Taxa acumulada ao longo do ano (em relação ao mesmo período do ano anterior)', categoria: 'PIB a preços de mercado' }));
  assert.deepEqual(out, [
    { ano: 2024, valor: 3.4, qualidade: 'oficial' },
    { ano: 2026, valor: 0.9, qualidade: 'parcial' },
  ]);
});

test('autoverificação: variável diferente da esperada recusa o lote', () => {
  const raw = sidraPayload({ 202401: '1' }, { periodo: 'Mês', variavel: 'IPCA - Número-índice' });
  assert.throws(() => norm(ibgeIpca, raw), /variável inesperada/);
});

test('autoverificação: PIB sem a categoria "PIB a preços de mercado" é recusado', () => {
  const raw = sidraPayload({ 202404: '3' }, { variavel: 'Taxa acumulada ao longo do ano', categoria: 'Agropecuária' });
  assert.throws(() => norm(ibgePib, raw), /categoria esperada/);
});

test('SIDRA: falha clara se o cabeçalho não tiver a coluna de período', () => {
  assert.throws(() => norm(ibgePnad, [{ V: 'Valor' }, { V: '1' }]), /colunas/);
});

test('World Bank: mapeia ISO3 para slug, pula nulos e anos recentes ficam parciais', () => {
  const byIso3 = new Map([['SGP', 'singapura'], ['LCN', 'america-latina']]);
  const out = parseWb(wbPayload([
    { countryiso3code: 'SGP', date: '2020', value: 1.5 },
    { countryiso3code: 'SGP', date: '2025', value: 2 },
    { countryiso3code: 'LCN', date: '2020', value: null },
    { countryiso3code: 'XXX', date: '2020', value: 9 },
  ]), byIso3, NOW);
  assert.deepEqual(out, [
    { entity: 'singapura', ano: 2020, valor: 1.5, qualidade: 'oficial' },
    { entity: 'singapura', ano: 2025, valor: 2, qualidade: 'parcial' },
  ]);
});

test('World Bank: erro da API vira exceção (o lote não é gravado)', () => {
  assert.throws(() => parseWb([{ message: [{ key: 'Invalid value' }] }], new Map(), NOW), /World Bank/);
});

test('validação barra fora do catálogo, implausível, duplicada e 2026 "oficial"', () => {
  const catalog = {
    indicators: new Map([['ipca-anual', { unidade: '%' }]]),
    entities: new Map([['brasil', {}]]),
  };
  const base = { entity: 'brasil', indicator: 'ipca-anual', ano: 2020, valor: 4, qualidade: 'oficial', url: 'u' };
  assert.equal(validate([base], catalog, { now: NOW }).ok, true);
  const bad = validate([
    base, base,
    { ...base, ano: 2021, valor: 999 },
    { ...base, ano: 2026, qualidade: 'oficial' },
    { ...base, ano: 2022, indicator: 'inventado' },
    { ...base, ano: 2023, url: '' },
  ], catalog, { now: NOW });
  assert.equal(bad.ok, false);
  const msg = bad.errors.join('\n');
  assert.match(msg, /duplicada/);
  assert.match(msg, /fora do limite/);
  assert.match(msg, /CA5/);
  assert.match(msg, /fora do catálogo/);
  assert.match(msg, /sem URL/);
});

test('validação rejeita lote vazio', () => {
  assert.equal(validate([], { indicators: new Map(), entities: new Map() }).ok, false);
});

test('erro de rede mostra a causa real e o servidor', () => {
  const err = new TypeError('fetch failed');
  err.cause = { code: 'ECONNRESET' };
  assert.equal(describeError(err, 'https://api.bcb.gov.br/x'), 'fetch failed (ECONNRESET) em api.bcb.gov.br');
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  assert.equal(describeError(abort, 'https://api.worldbank.org/v2'), 'tempo esgotado em api.worldbank.org');
});
