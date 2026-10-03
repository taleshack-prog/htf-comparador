// Adaptador do FMI (DataMapper / World Economic Outlook) — organismo internacional.
// API: https://www.imf.org/external/datamapper/api/v1/{INDICADOR}/{PAIS}
// Resposta: { values: { INDICADOR: { PAIS: { "2000": 3.2, ... } } }, api: {...} }
// O WEO traz estimativas para o ano corrente e projeções para os seguintes:
// anos futuros são descartados; o ano corrente entra como "projecao".
import { fetchJson, round4 } from './base.js';
import { FIRST_YEAR } from './bcb-sgs.js';

// Cada série lista códigos em ordem de preferência: o primeiro que trouxer o Brasil vale.
// GGXONLB_G01_GDP_PT = resultado primário (Fiscal Monitor); "pb" = mesmo conceito em outra base.
export const SERIES = [
  { indicator: 'resultado-primario-fmi', codigos: ['GGXONLB_G01_GDP_PT', 'pb'] },
  { indicator: 'divida-bruta-fmi',       codigos: ['GGXWDG_NGDP', 'G_XWDG_G01_GDP_PT'] },
  { indicator: 'despesa-governo-fmi',    codigos: ['G_X_G01_GDP_PT', 'exp'] },
];
export const imfUrl = (codigo) => `https://www.imf.org/external/datamapper/api/v1/${codigo}/BRA`;
export const imfPublicUrl = (codigo) => `https://www.imf.org/external/datamapper/${codigo}/BRA`;

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
    for (const s of SERIES) {
      for (const codigo of s.codigos) {
        const payload = await fetchJson(imfUrl(codigo), { fetchImpl, log, timeoutMs: 30000 });
        if (payload?.values?.[codigo]?.BRA) { out[s.indicator] = { codigo, payload }; break; }
        log(`  FMI ${codigo}: sem série do Brasil, tentando o próximo código`);
      }
      if (!out[s.indicator]) throw new Error(`FMI: nenhum código trouxe ${s.indicator} (${s.codigos.join(', ')})`);
    }
    return out;
  },
  normalize(raw, { now }) {
    return SERIES.flatMap((s) => {
      const { codigo, payload } = raw[s.indicator];
      return parseImf(payload, codigo, now).map((o) => ({
        entity: 'brasil', indicator: s.indicator, ...o, url: imfPublicUrl(codigo),
      }));
    });
  },
};
