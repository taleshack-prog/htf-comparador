// Adaptadores da API SIDRA do IBGE — fonte primária de PIB, IPCA e PNAD Contínua.
// API: https://apisidra.ibge.gov.br/values/t/{tabela}/n1/all/v/{variavel}/p/all[/c{classif}/{categoria}]
// Resposta: array; o 1º elemento é o cabeçalho (código da coluna → rótulo), os demais são linhas.
// "V" é o valor. As colunas de período e de variável são achadas pelo RÓTULO, porque a
// letra (D2C, D3C…) muda conforme a tabela.
//
// Autoverificação: cada série declara o nome esperado da variável (e, se houver, da
// categoria). Se a API devolver outra coisa — código errado, tabela reestruturada —
// o adaptador lança erro e nada é gravado.
import { fetchJson, toNumber, round4 } from './base.js';
import { FIRST_YEAR } from './bcb-sgs.js';

export const sidraUrl = (s) =>
  `https://apisidra.ibge.gov.br/values/t/${s.tabela}/n1/all/v/${s.variavel}/p/all` +
  (s.classificacao ? `/c${s.classificacao}/${s.categoria}` : '');
export const sidraPublicUrl = (t) => `https://sidra.ibge.gov.br/tabela/${t}`;

const keyByLabel = (header, re) => Object.keys(header).find((k) => re.test(String(header[k])));

// Lê as linhas, confere variável/categoria e devolve [{ ano, sub, valor }]
// (sub = mês 1–12 ou trimestre 1–4).
export function parseSidra(rows, s) {
  if (!Array.isArray(rows) || rows.length < 2) throw new Error(`SIDRA ${s.tabela}: resposta vazia`);
  const [header, ...data] = rows;
  const periodKey = keyByLabel(header, new RegExp(`^${s.periodo} \\(Código\\)$`, 'i'));
  const varKey = keyByLabel(header, /^Variável$/i);
  if (!periodKey || header.V === undefined) throw new Error(`SIDRA ${s.tabela}: colunas de período/valor não encontradas`);
  if (varKey) {
    const nomes = [...new Set(data.map((r) => r[varKey]))];
    if (!nomes.length || !nomes.every((n) => s.esperaVariavel.test(n))) {
      throw new Error(`SIDRA ${s.tabela}: variável inesperada (${nomes.join(' | ')}); esperado ${s.esperaVariavel}`);
    }
  } else {
    throw new Error(`SIDRA ${s.tabela}: coluna "Variável" ausente — não dá para verificar a série`);
  }
  if (s.esperaCategoria) {
    const ok = data.some((r) => Object.values(r).some((v) => s.esperaCategoria.test(String(v))));
    if (!ok) throw new Error(`SIDRA ${s.tabela}: categoria esperada ${s.esperaCategoria} não encontrada`);
  }
  const out = [];
  for (const r of data) {
    const code = String(r[periodKey] || '');
    const v = toNumber(r.V); // "...", "-", "X" → null
    if (!/^\d{6}$/.test(code) || v === null) continue;
    const ano = +code.slice(0, 4);
    if (ano < FIRST_YEAR) continue;
    out.push({ ano, sub: +code.slice(4), valor: v });
  }
  return out;
}

const byYear = (pts) => {
  const m = new Map();
  for (const p of pts) {
    if (!m.has(p.ano)) m.set(p.ano, new Map());
    m.get(p.ano).set(p.sub, p.valor);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
};

// Agregações anuais ------------------------------------------------------------
export const AGG = {
  // média dos trimestres (PNAD)
  media_trimestres(pts, year) {
    return byYear(pts).map(([ano, t]) => {
      const vals = [...t.values()];
      return { ano, valor: round4(vals.reduce((a, b) => a + b, 0) / vals.length),
        qualidade: t.size === 4 && ano < year ? 'oficial' : 'parcial' };
    });
  },
  // composição de 12 variações mensais (IPCA)
  composto_mensal(pts, year) {
    return byYear(pts).map(([ano, m]) => {
      const valor = ([...m.values()].reduce((acc, v) => acc * (1 + v / 100), 1) - 1) * 100;
      return { ano, valor: round4(valor), qualidade: m.size === 12 && ano < year ? 'oficial' : 'parcial' };
    });
  },
  // taxa acumulada no ano: o 4º trimestre é a taxa anual (PIB)
  quarto_trimestre(pts, year) {
    return byYear(pts).map(([ano, t]) => {
      const last = Math.max(...t.keys());
      return { ano, valor: round4(t.get(last)), qualidade: last === 4 && ano < year ? 'oficial' : 'parcial' };
    });
  },
};

export function makeSidraAdapter({ slug, indicator, serie }) {
  return {
    slug,
    version: `${slug}@1`,
    serie,
    async fetch({ fetchImpl, log }) {
      return fetchJson(sidraUrl(serie), { fetchImpl, log, timeoutMs: 45000 });
    },
    normalize(raw, { now }) {
      const pts = parseSidra(raw, serie);
      return AGG[serie.agregacao](pts, now.getUTCFullYear()).map((a) => ({
        entity: 'brasil', indicator, ...a, url: sidraPublicUrl(serie.tabela),
      }));
    },
  };
}

export const ibgePnad = makeSidraAdapter({
  slug: 'ibge-pnad',
  indicator: 'desemprego',
  serie: { tabela: '4099', variavel: '4099', periodo: 'Trimestre', agregacao: 'media_trimestres',
    esperaVariavel: /desocupa/i },
});

export const ibgeIpca = makeSidraAdapter({
  slug: 'ibge-ipca',
  indicator: 'ipca-anual',
  serie: { tabela: '1737', variavel: '63', periodo: 'Mês', agregacao: 'composto_mensal',
    esperaVariavel: /IPCA.*varia[çc][ãa]o mensal/i },
});

export const ibgePib = makeSidraAdapter({
  slug: 'ibge-pib',
  indicator: 'pib-anual',
  serie: { tabela: '5932', variavel: '6563', periodo: 'Trimestre', agregacao: 'quarto_trimestre',
    classificacao: '11255', categoria: '90707',
    esperaVariavel: /acumulada ao longo do ano/i, esperaCategoria: /PIB a pre[çc]os de mercado/i },
});
