// Adaptador do SGS (Sistema Gerenciador de Séries Temporais) do Banco Central.
// API: https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json&dataInicial=dd/MM/aaaa&dataFinal=dd/MM/aaaa
// Resposta: [{ "data": "dd/MM/aaaa", "valor": "1.23" }, ...]
// As consultas são feitas em janelas de até 10 anos (limite do SGS para séries longas).
import { fetchJson, toNumber, round4 } from './base.js';

export const FIRST_YEAR = 1995;

// Cada série: indicador do catálogo, código SGS e como vira valor anual.
//   anual          → a série já é anual
//   mensal_composto→ compõe as 12 variações mensais: (Π(1+v/100) − 1) × 100
//   mensal_dezembro→ posição de dezembro (estoque, ex.: dívida/PIB)
// PIB e IPCA vêm direto do IBGE (adapters/ibge-sidra.js), que é quem os produz.
// O SGS fica só com a dívida bruta, série que é do próprio Banco Central.
export const SERIES = [
  { indicator: 'divida-bruta', codigo: '13762', tipo: 'mensal_dezembro' },
];

const pad = (n) => String(n).padStart(2, '0');
export const sgsUrl = (codigo, ini, fim) =>
  `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados?formato=json` +
  `&dataInicial=01/01/${ini}&dataFinal=31/12/${fim}`;
export const sgsPublicUrl = (codigo) =>
  `https://www3.bcb.gov.br/sgspub/consultarvalores/telaCvsSelecionarSeries.paint?codigoSerie=${codigo}`;

function parseDate(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || '');
  return m ? { dia: +m[1], mes: +m[2], ano: +m[3] } : null;
}

export function windows(fromYear, toYear, size = 10) {
  const out = [];
  for (let y = fromYear; y <= toYear; y += size) out.push([y, Math.min(y + size - 1, toYear)]);
  return out;
}

export function toAnnual(points, tipo, now = new Date()) {
  const currentYear = now.getUTCFullYear();
  const byYear = new Map();
  for (const p of points) {
    const d = parseDate(p.data);
    const v = toNumber(p.valor);
    if (!d || v === null) continue;
    if (!byYear.has(d.ano)) byYear.set(d.ano, []);
    byYear.get(d.ano).push({ mes: d.mes, v });
  }
  const out = [];
  for (const [ano, pts] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    const meses = new Set(pts.map((p) => p.mes));
    let valor, completo;
    if (tipo === 'anual') {
      valor = pts[pts.length - 1].v;
      completo = ano < currentYear;
    } else if (tipo === 'mensal_composto') {
      const ordered = [...new Map(pts.map((p) => [p.mes, p.v])).values()];
      valor = (ordered.reduce((acc, v) => acc * (1 + v / 100), 1) - 1) * 100;
      completo = meses.size === 12;
    } else if (tipo === 'mensal_dezembro') {
      const dez = pts.filter((p) => p.mes === 12);
      const ref = dez.length ? dez[dez.length - 1] : pts.reduce((a, b) => (b.mes > a.mes ? b : a));
      valor = ref.v;
      completo = dez.length > 0;
    } else {
      throw new Error(`tipo de série desconhecido: ${tipo}`);
    }
    out.push({ ano, valor: round4(valor), qualidade: completo && ano < currentYear ? 'oficial' : 'parcial' });
  }
  return out;
}

export default {
  slug: 'bcb-sgs',
  version: 'bcb-sgs@1',
  async fetch({ fetchImpl, now, log }) {
    const year = now.getUTCFullYear();
    const result = {};
    for (const s of SERIES) {
      const points = [];
      for (const [ini, fim] of windows(FIRST_YEAR, year)) {
        const data = await fetchJson(sgsUrl(s.codigo, ini, fim), { fetchImpl, log });
        if (!Array.isArray(data)) throw new Error(`SGS ${s.codigo}: resposta inesperada`);
        points.push(...data);
      }
      result[s.codigo] = points;
    }
    return result;
  },
  normalize(raw, { now }) {
    const out = [];
    for (const s of SERIES) {
      for (const a of toAnnual(raw[s.codigo] || [], s.tipo, now)) {
        out.push({ entity: 'brasil', indicator: s.indicator, ...a, url: sgsPublicUrl(s.codigo) });
      }
    }
    return out;
  },
};
