// Adaptador do FMI (DataMapper / World Economic Outlook) — organismo internacional.
// API: https://www.imf.org/external/datamapper/api/v1/{INDICADOR}/{PAIS}
// Resposta: { values: { INDICADOR: { PAIS: { "2000": 3.2, ... } } }, api: {...} }
// O WEO traz estimativas para o ano corrente e projeções para os seguintes:
// anos futuros são descartados; o ano corrente entra como "projecao".
import { fetchJson, round4 } from './base.js';
import { FIRST_YEAR } from './bcb-sgs.js';

export const SERIES = [
  { indicator: 'resultado-primario-fmi', codigo: 'GGXONLB_NGDP' },
  { indicator: 'divida-bruta-fmi',       codigo: 'GGXWDG_NGDP' },
];
export const imfUrl = (codigo) => `https://www.imf.org/external/datamapper/api/v1/${codigo}/BRA`;
export const imfPublicUrl = (codigo) => `https://www.imf.org/external/datamapper/${codigo}@WEO/BRA`;

export function parseImf(payload, codigo, now = new Date()) {
  const serie = payload?.values?.[codigo]?.BRA;
  if (!serie || typeof serie !== 'object') throw new Error(`FMI ${codigo}: série do Brasil ausente na resposta`);
  const year = now.getUTCFullYear();
  const out = [];
  for (const [k, v] of Object.entries(serie)) {
    const ano = Number(k);
    if (!Number.isInteger(ano) || ano < FIRST_YEAR || ano > year || v === null || v === '') continue;
    out.push({ ano, valor: round4(Number(v)), qualidade: ano < year - 1 ? 'oficial' : ano === year - 1 ? 'parcial' : 'projecao' });
  }
  return out.sort((a, b) => a.ano - b.ano);
}

export default {
  slug: 'fmi',
  version: 'fmi@1',
  async fetch({ fetchImpl, log }) {
    const out = {};
    for (const s of SERIES) out[s.codigo] = await fetchJson(imfUrl(s.codigo), { fetchImpl, log, timeoutMs: 30000 });
    return out;
  },
  normalize(raw, { now }) {
    return SERIES.flatMap((s) =>
      parseImf(raw[s.codigo], s.codigo, now).map((o) => ({
        entity: 'brasil', indicator: s.indicator, ...o, url: imfPublicUrl(s.codigo),
      })));
  },
};
