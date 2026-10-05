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

// Renda por pessoa e séries sociais: adaptador separado, para que a lentidão de uma série
// (a API do Banco Mundial oscila) não derrube as séries econômicas.
export const SOCIAL_SERIES = [
  { indicator: 'pib-per-capita-wb',       codigo: 'NY.GDP.PCAP.KD.ZG' },
  { indicator: 'pobreza-wb',              codigo: 'SI.POV.DDAY' },
  { indicator: 'gini-wb',                 codigo: 'SI.POV.GINI' },
  { indicator: 'mortalidade-infantil-wb', codigo: 'SP.DYN.IMRT.IN' },
];

// Busca as séries em paralelo (cada uma com suas tentativas): o tempo total vira o da mais lenta.
// A API do Banco Mundial devolve 502 em picos: 3 novas tentativas com espera crescente (3 s, 6 s, 12 s).
async function buscarSeries(series, { fetchImpl, now, log, timeoutMs = 45000, esperaMs = 3000 }) {
  const corpos = await Promise.all(series.map((s) => fetchJson(wbUrl(s.codigo, now.getUTCFullYear()), { fetchImpl, log, timeoutMs, retries: 3, esperaMs })));
  return Object.fromEntries(series.map((s, i) => [s.codigo, corpos[i]]));
}

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
  version: 'worldbank@2',
  async fetch({ fetchImpl, now, log }) {
    return buscarSeries(SERIES, { fetchImpl, now, log });
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
// Margem de erro: o WGI publica o limite inferior do intervalo de 90% (SC_LB); a margem é
// nota − limite inferior (o intervalo é simétrico). Só para o Brasil, que é o que o ranking usa.
export const WGI_SERIES = [
  { indicator: 'controle-corrupcao-wb', codigo: 'GOV_WGI_CC.SC', margem: 'controle-corrupcao-wb-margem' },
  { indicator: 'qualidade-regulatoria-wb', codigo: 'GOV_WGI_RQ.SC', margem: 'qualidade-regulatoria-wb-margem' },
  { indicator: 'efetividade-governo-wb', codigo: 'GOV_WGI_GE.SC', margem: 'efetividade-governo-wb-margem' },
];
const lb = (codigo) => `${codigo}_LB`;
// A página pública usa sublinhado no lugar do ponto: GOV_WGI_CC_SC.
export const wgiPublicUrl = (codigo) => `https://data.worldbank.org/indicator/${codigo.replace(/\./g, '_')}`;
export const worldbankWgi = {
  slug: 'worldbank-wgi',
  version: 'worldbank-wgi@2',
  async fetch({ fetchImpl, now, log }) {
    const out = {};
    for (const s of WGI_SERIES) {
      out[s.codigo] = await fetchJson(wbUrl(s.codigo, now.getUTCFullYear(), { paises: ['BRA', 'SGP', 'SWE'], fonte: 3 }), { fetchImpl, log, timeoutMs: 60000 });
      out[lb(s.codigo)] = await fetchJson(wbUrl(lb(s.codigo), now.getUTCFullYear(), { paises: ['BRA'], fonte: 3 }), { fetchImpl, log, timeoutMs: 60000 });
    }
    return out;
  },
  normalize(raw, { catalog, now }) {
    return WGI_SERIES.flatMap((s) => {
      const notas = parseWb(raw[s.codigo], catalog.byIso3, now).map((o) => ({
        ...o, indicator: s.indicator, url: wgiPublicUrl(s.codigo),
      }));
      const notaBr = new Map(notas.filter((o) => o.entity === 'brasil').map((o) => [o.ano, o.valor]));
      const margens = parseWb(raw[lb(s.codigo)], catalog.byIso3, now)
        .filter((o) => o.entity === 'brasil' && notaBr.has(o.ano))
        .map((o) => ({ ...o, indicator: s.margem, valor: round4(notaBr.get(o.ano) - o.valor), url: wgiPublicUrl(lb(s.codigo)) }));
      for (const m of margens) {
        if (!(m.valor > 0 && m.valor < 30)) throw new Error(`WGI: margem de erro implausível em ${s.margem} ${m.ano}: ${m.valor}`);
      }
      return [...notas, ...margens];
    });
  },
};

export const worldbankSocial = {
  slug: 'worldbank-social',
  version: 'worldbank-social@1',
  async fetch({ fetchImpl, now, log }) {
    return buscarSeries(SOCIAL_SERIES, { fetchImpl, now, log });
  },
  normalize(raw, { catalog, now }) {
    return SOCIAL_SERIES.flatMap((s) =>
      parseWb(raw[s.codigo], catalog.byIso3, now).map((o) => ({
        ...o, indicator: s.indicator, url: wbPublicUrl(s.codigo),
      })));
  },
};
