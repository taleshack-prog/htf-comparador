// Adaptador da API SIDRA do IBGE (PNAD Contínua trimestral).
// API: https://apisidra.ibge.gov.br/values/t/{tabela}/n1/all/v/{variavel}/p/all
// Resposta: array em que o 1º elemento é o cabeçalho (código da coluna → rótulo),
// e os demais são linhas. "V" é o valor; a coluna do período é localizada pelo rótulo
// "Trimestre (Código)" (o código vem como AAAATT, ex.: 202301), porque a letra da
// coluna (D2C, D3C…) muda conforme a tabela.
import { fetchJson, toNumber, round4 } from './base.js';

export const SERIES = [
  { indicator: 'desemprego', tabela: '4099', variavel: '4099' },
];

export const sidraUrl = (t, v) => `https://apisidra.ibge.gov.br/values/t/${t}/n1/all/v/${v}/p/all`;
export const sidraPublicUrl = (t) => `https://sidra.ibge.gov.br/tabela/${t}`;

export function quarterlyToAnnual(rows, now = new Date()) {
  if (!Array.isArray(rows) || rows.length < 2) throw new Error('SIDRA: resposta vazia ou sem cabeçalho');
  const [header, ...data] = rows;
  const periodKey = Object.keys(header).find((k) => /trimestre.*\(código\)/i.test(header[k]));
  if (!periodKey || header.V === undefined) throw new Error('SIDRA: colunas de período/valor não encontradas');
  const byYear = new Map();
  for (const r of data) {
    const code = String(r[periodKey] || '');
    const v = toNumber(r.V);           // "..." / "-" / "X" viram null e são ignorados
    if (!/^\d{6}$/.test(code) || v === null) continue;
    const ano = +code.slice(0, 4);
    const tri = +code.slice(4);
    if (!byYear.has(ano)) byYear.set(ano, new Map());
    byYear.get(ano).set(tri, v);
  }
  const year = now.getUTCFullYear();
  return [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([ano, tris]) => {
    const vals = [...tris.values()];
    const media = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { ano, valor: round4(media), qualidade: tris.size === 4 && ano < year ? 'oficial' : 'parcial' };
  });
}

export default {
  slug: 'ibge-sidra',
  version: 'ibge-sidra@1',
  async fetch({ fetchImpl, log }) {
    const out = {};
    for (const s of SERIES) out[s.tabela] = await fetchJson(sidraUrl(s.tabela, s.variavel), { fetchImpl, log });
    return out;
  },
  normalize(raw, { now }) {
    return SERIES.flatMap((s) =>
      quarterlyToAnnual(raw[s.tabela], now).map((a) => ({
        entity: 'brasil', indicator: s.indicator, ...a, url: sidraPublicUrl(s.tabela),
      })));
  },
};
