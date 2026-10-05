// Adaptador do World Bank Open Data (WDI) — séries harmonizadas para Brasil,
// países de referência e grupos de pares, todos pela mesma fonte.
// API: https://api.worldbank.org/v2/country/BRA;SGP;SWE;LCN;MIC/indicator/{codigo}?format=json&date=1995:AAAA&per_page=2000
// Resposta: [ metadados, [ { countryiso3code, date, value }, ... ] | null ]
import { fetchJson, round4 } from './base.js';
import { FIRST_YEAR } from './bcb-sgs.js';

export const COUNTRIES = ['BRA', 'SGP', 'SWE', 'LCN', 'MIC', 'WLD'];

export const SERIES = [
  { indicator: 'pib-anual-wb',          codigo: 'NY.GDP.MKTP.KD.ZG' },
  { indicator: 'inflacao-wb',           codigo: 'FP.CPI.TOTL.ZG' },
  { indicator: 'desemprego-oit-wb',     codigo: 'SL.UEM.TOTL.ZS' },
  { indicator: 'receita-tributaria-wb', codigo: 'GC.TAX.TOTL.GD.ZS' },
  { indicator: 'termos-troca-wb',       codigo: 'TT.PRI.MRCH.XD.WD' },
  { indicator: 'investimento-wb',       codigo: 'NE.GDI.FTOT.ZS' },
];

export const wbUrl = (codigo, toYear, { paises = COUNTRIES, fonte } = {}) =>
  `https://api.worldbank.org/v2/country/${paises.join(';')}/indicator/${codigo}` +
  `?format=json&date=${FIRST_YEAR}:${toYear}&per_page=2000${fonte ? `&source=${fonte}` : ''}`;
export const wbPublicUrl = (codigo) => `https://data.worldbank.org/indicator/${codigo}`;

export function parseWb(payload, byIso3, now = new Date()) {
  if (!Array.isArray(payload)) throw new Error('World Bank: resposta inesperada');
  if (payload[0]?.message) throw new Error(`World Bank: ${JSON.stringify(payload[0].message)}`);
  const meta = payload[0] || {};
  if (meta.pages > 1) throw new Error('World Bank: resposta paginada; aumente per_page');
  const rows = payload[1] || [];
  const year = now.getUTCFullYear();
  const out = [];
  for (const r of rows) {
    if (r.value === null || r.value === undefined) continue;
    const entity = byIso3.get(r.countryiso3code);
    const ano = Number(r.date);
    if (!entity || !Number.isInteger(ano)) continue;
    // O WDI revisa anos recentes; o último ano publicado fica como parcial até o seguinte.
    out.push({ entity, ano, valor: round4(Number(r.value)), qualidade: ano < year - 1 ? 'oficial' : 'parcial' });
  }
  return out;
}

export default {
  slug: 'worldbank',
  version: 'worldbank@1',
  async fetch({ fetchImpl, now, log }) {
    const out = {};
    for (const s of SERIES) out[s.codigo] = await fetchJson(wbUrl(s.codigo, now.getUTCFullYear()), { fetchImpl, log });
    return out;
  },
  normalize(raw, { catalog, now }) {
    return SERIES.flatMap((s) =>
      parseWb(raw[s.codigo], catalog.byIso3, now).map((o) => ({
        ...o, indicator: s.indicator, url: wgiPublicUrl(s.codigo),
      })));
  },
};

// Worldwide Governance Indicators (Banco Mundial, base 3): controle da corrupção.
// Adaptador separado: se a base de governança falhar, as séries econômicas seguem.
// Desde a revisão de 2025 o WGI publica uma nota de 0 a 100 (GOV_WGI_CC.SC); o antigo
// percentil CC.PER.RNK foi arquivado e a API responde "indicator was not found".
export const WGI_SERIES = [
  { indicator: 'controle-corrupcao-wb', codigo: 'GOV_WGI_CC.SC' },
  { indicator: 'qualidade-regulatoria-wb', codigo: 'GOV_WGI_RQ.SC' },
  { indicator: 'efetividade-governo-wb', codigo: 'GOV_WGI_GE.SC' },
];
// A página pública usa sublinhado no lugar do ponto: GOV_WGI_CC_SC.
export const wgiPublicUrl = (codigo) => `https://data.worldbank.org/indicator/${codigo.replace(/\./g, '_')}`;
export const worldbankWgi = {
  slug: 'worldbank-wgi',
  version: 'worldbank-wgi@1',
  async fetch({ fetchImpl, now, log }) {
    const out = {};
    for (const s of WGI_SERIES) {
      out[s.codigo] = await fetchJson(wbUrl(s.codigo, now.getUTCFullYear(), { paises: ['BRA', 'SGP', 'SWE'], fonte: 3 }), { fetchImpl, log, timeoutMs: 60000 });
    }
    return out;
  },
  normalize(raw, { catalog, now }) {
    return WGI_SERIES.flatMap((s) =>
      parseWb(raw[s.codigo], catalog.byIso3, now).map((o) => ({
        ...o, indicator: s.indicator, url: wgiPublicUrl(s.codigo),
      })));
  },
};
