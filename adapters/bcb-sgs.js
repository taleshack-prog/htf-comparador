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
// sinal: -1 inverte a convenção das NFSP (positivo = necessidade de financiamento) para
// que positivo signifique superávit.
export const SERIES = [
  { indicator: 'divida-bruta', codigo: '13762', tipo: 'mensal_dezembro' },
  { indicator: 'juros-nominais-bcb', codigo: '5760', tipo: 'mensal_dezembro' },
  { indicator: 'estatais-primario-bcb', codigo: '5790', tipo: 'mensal_dezembro', sinal: -1 },
];
// Séries usadas só para calcular o juro real (não são gravadas): Selic anualizada do mês
// (4189) e IPCA mensal (433, mesma série do IBGE espelhada no SGS).
export const AUXILIARES = [{ codigo: '4189' }, { codigo: '433' }];

// Juro real ex-post: (1 + Selic efetiva do ano) / (1 + IPCA do ano) − 1.
// Selic efetiva do ano = Π (1 + taxa anualizada do mês)^(1/12) − 1. Só anos com os 12 meses
// das duas séries; o ano corrente fica parcial.
export function juroReal(selicPts, ipcaPts, now = new Date()) {
  const porAno = (pts) => {
    const m = new Map();
    for (const p of pts) {
      const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(p.data || '');
      const v = toNumber(p.valor);
      if (!d || v === null) continue;
      const ano = +d[3];
      if (!m.has(ano)) m.set(ano, new Map());
      m.get(ano).set(+d[2], v);
    }
    return m;
  };
  const S = porAno(selicPts), I = porAno(ipcaPts);
  const year = now.getUTCFullYear();
  const out = [];
  for (const [ano, sm] of [...S.entries()].sort((a, b) => a[0] - b[0])) {
    const im = I.get(ano);
    if (!im || sm.size !== 12 || im.size !== 12) continue;
    const selic = [...sm.values()].reduce((a, v) => a * (1 + v / 100) ** (1 / 12), 1) - 1;
    const ipca = [...im.values()].reduce((a, v) => a * (1 + v / 100), 1) - 1;
    out.push({ ano, valor: round4(((1 + selic) / (1 + ipca) - 1) * 100), qualidade: ano < year - 1 ? 'oficial' : 'parcial' });
  }
  return out;
}

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
  version: 'bcb-sgs@2',
  async fetch({ fetchImpl, now, log }) {
    const year = now.getUTCFullYear();
    const result = {};
    for (const s of [...SERIES, ...AUXILIARES]) {
      const points = [];
      for (const [ini, fim] of windows(FIRST_YEAR, year)) {
        // Blocos anteriores ao início da série (a 13762 começa em 2006) vêm como 404 ou
        // objeto de erro: são pulados. Só falha se nenhum bloco trouxer dados.
        let data;
        try {
          data = await fetchJson(sgsUrl(s.codigo, ini, fim), { fetchImpl, log, retries: 1 });
        } catch (err) {
          if (/HTTP 404/.test(err.message)) { log(`  SGS ${s.codigo} ${ini}-${fim}: sem dados (404)`); continue; }
          throw err;
        }
        if (!Array.isArray(data)) { log(`  SGS ${s.codigo} ${ini}-${fim}: sem dados (${JSON.stringify(data).slice(0, 120)})`); continue; }
        points.push(...data);
      }
      if (!points.length) log(`  SGS ${s.codigo}: nenhum bloco de anos trouxe dados`);
      result[s.codigo] = points;
    }
    if (!SERIES.some((s) => result[s.codigo].length)) throw new Error('SGS: nenhum bloco de anos trouxe dados em nenhuma série');
    return result;
  },
  normalize(raw, { now }) {
    const out = [];
    for (const s of SERIES) {
      for (const a of toAnnual(raw[s.codigo] || [], s.tipo, now)) {
        out.push({ entity: 'brasil', indicator: s.indicator, ...a, valor: round4(a.valor * (s.sinal || 1)), url: sgsPublicUrl(s.codigo) });
      }
    }
    for (const a of juroReal(raw['4189'] || [], raw['433'] || [], now)) {
      out.push({ entity: 'brasil', indicator: 'juro-real-bcb', ...a, url: sgsPublicUrl('4189') });
    }
    return out;
  },
};
