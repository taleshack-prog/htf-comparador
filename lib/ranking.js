// Ranking geral: combina vários indicadores numa nota de 0 a 100 por governo.
// Regras públicas (aparecem na tela e na metodologia):
//   1. Em cada indicador, a nota vai de 0 a 100 na escala da amplitude histórica anual
//      (pior e melhor ano da série desde 1995), não entre as seis médias de governo.
//   2. Os indicadores ficam em blocos (Economia, Contas públicas, Instituições). A nota do
//      bloco é a média ponderada dos indicadores com dado; a nota geral é a média simples
//      dos blocos, que valem o mesmo.
//   3. Cobertura mínima: um indicador só entra na nota de um governo se tiver dado em
//      pelo menos metade dos anos dele (COBERTURA_MIN). Média de 2 anos num mandato de 8
//      não representa o mandato.
//   4. Nenhum bônus ou penalidade manual. O contexto entra só no modo "relativo",
//      que compara o Brasil com a América Latina nos mesmos anos — choques que
//      atingiram toda a região (pandemia, crise de 2009, ciclo de commodities) se anulam.
import { aggregateWindow, loadWindows, seriesFor } from './compare.js';

// Blocos com peso igual entre si: assim, acrescentar vários indicadores parecidos (ex.: fiscais)
// não muda o peso do tema em silêncio. Dentro de cada bloco, média ponderada pelos pesos da tela.
export const MODOS = {
  oficial: {
    nome: 'Dados oficiais do Brasil',
    descricao: 'Números brutos de cada governo: IBGE, Banco Central, Tesouro Nacional, FMI e Banco Mundial, em três blocos de peso igual. O desemprego usa a estimativa da OIT, a única série que cobre os seis governos.',
    blocos: [
      { slug: 'economia', nome: 'Economia' },
      { slug: 'contas', nome: 'Contas públicas' },
      { slug: 'instituicoes', nome: 'Instituições e ambiente de negócios' },
    ],
    componentes: [
      { slug: 'pib-anual', nome: 'Crescimento do PIB', direcao: 'maior', bloco: 'economia' },
      { slug: 'ipca-anual', nome: 'Inflação (IPCA)', direcao: 'menor', bloco: 'economia' },
      { slug: 'desemprego-oit-wb', nome: 'Desemprego (OIT)', direcao: 'menor', bloco: 'economia' },
      { slug: 'investimento-wb', nome: 'Taxa de investimento', direcao: 'maior', bloco: 'economia' },
      { slug: 'resultado-primario-fmi', nome: 'Resultado primário', direcao: 'maior', bloco: 'contas' },
      { slug: 'divida-bruta-fmi', nome: 'Variação da dívida', direcao: 'menor', bloco: 'contas' },
      { slug: 'juros-nominais-bcb', nome: 'Juros pagos (% PIB)', direcao: 'menor', bloco: 'contas' },
      { slug: 'despesa-total-tesouro', nome: 'Gasto total (% PIB)', direcao: 'menor', bloco: 'contas' },
      { slug: 'tributos-federais-tesouro', nome: 'Carga de tributos federais (% PIB)', direcao: 'menor', bloco: 'contas' },
      { slug: 'pessoal-tesouro', nome: 'Gasto com pessoal (% PIB)', direcao: 'menor', bloco: 'contas' },
      { slug: 'estatais-primario-bcb', nome: 'Resultado das estatais federais', direcao: 'maior', bloco: 'contas' },
      { slug: 'controle-corrupcao-wb', nome: 'Controle da corrupção', direcao: 'maior', bloco: 'instituicoes' },
      { slug: 'qualidade-regulatoria-wb', nome: 'Qualidade regulatória', direcao: 'maior', bloco: 'instituicoes' },
      { slug: 'efetividade-governo-wb', nome: 'Efetividade do governo', direcao: 'maior', bloco: 'instituicoes' },
    ],
  },
  relativo: {
    nome: 'Em relação à América Latina',
    descricao: 'Diferença entre o Brasil e a média da América Latina e Caribe nos mesmos anos (Banco Mundial). Controla choques que atingiram toda a região.',
    referencia: 'america-latina',
    componentes: [
      { slug: 'pib-anual-wb', nome: 'Crescimento do PIB vs. região', direcao: 'maior' },
      { slug: 'inflacao-wb', nome: 'Inflação vs. região', direcao: 'menor' },
      { slug: 'desemprego-oit-wb', nome: 'Desemprego vs. região', direcao: 'menor' },
    ],
  },
};

export const COBERTURA_MIN = 0.5;
const cobre = (a) => a.cobertura[1] > 0 && a.cobertura[0] / a.cobertura[1] >= COBERTURA_MIN;

const r1 = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);

export function parsePesos(str, componentes) {
  const pesos = Object.fromEntries(componentes.map((c) => [c.slug, 1]));
  for (const par of (str || '').split(',').filter(Boolean)) {
    const [k, v] = par.split(':');
    const n = Number(v);
    if (k in pesos && Number.isFinite(n) && n >= 0 && n <= 10) pesos[k] = n;
  }
  return pesos;
}

export function normalize(valores, direcao) {
  const vs = valores.filter((v) => v !== null);
  if (!vs.length) return valores.map(() => null);
  const min = Math.min(...vs), max = Math.max(...vs);
  return valores.map((v) => {
    if (v === null) return null;
    if (max === min) return 50;
    const t = (v - min) / (max - min);
    return Math.round((direcao === 'maior' ? t : 1 - t) * 1000) / 10;
  });
}

// Escala pela amplitude histórica: 0 e 100 são o pior e o melhor valor ANUAL observado na
// série (1995 em diante), não o pior e o melhor entre as seis médias de governo. Assim uma
// diferença pequena entre governos vira diferença pequena de nota. Os próprios valores dos
// governos entram na amplitude, para a nota ficar sempre entre 0 e 100.
export function normalizeEscala(valores, direcao, historico) {
  const vs = [...historico, ...valores].filter((v) => v !== null && Number.isFinite(v));
  if (!valores.some((v) => v !== null)) return valores.map(() => null);
  const min = Math.min(...vs), max = Math.max(...vs);
  return valores.map((v) => {
    if (v === null) return null;
    if (max === min) return 50;
    const t = (v - min) / (max - min);
    return Math.round((direcao === 'maior' ? t : 1 - t) * 1000) / 10;
  });
}

// Valores anuais que definem a escala de cada indicador.
//   média: os próprios valores anuais; variação: variações em 4 anos (duração típica de
//   mandato); modo relativo: diferença anual Brasil − referência.
export function historicoAnual(br, ref, agregacao) {
  const ok = (o) => o && o.qualidade !== 'projecao';
  const anos = [...br.keys()].filter((a) => a >= 1995 && ok(br.get(a))).sort((a, b) => a - b);
  if (ref) return anos.filter((a) => ok(ref.get(a))).map((a) => br.get(a).valor - ref.get(a).valor);
  if (agregacao === 'variacao') {
    return anos.filter((a) => ok(br.get(a - 4))).map((a) => br.get(a).valor - br.get(a - 4).valor);
  }
  return anos.map((a) => br.get(a).valor);
}

export async function ranking(pool, { modo = 'oficial', pesos: pesosStr } = {}) {
  const def = MODOS[modo];
  if (!def) return null;
  const windows = await loadWindows(pool);
  const pesos = parsePesos(pesosStr, def.componentes);

  const { rows: meta } = await pool.query(
    'SELECT slug, unidade, agregacao_janela AS agregacao FROM dim_indicator WHERE slug = ANY($1)',
    [def.componentes.map((c) => c.slug)]);
  const metaBy = new Map(meta.map((m) => [m.slug, m]));

  const componentes = [];
  for (const c of def.componentes) {
    const m = metaBy.get(c.slug);
    if (!m) continue;
    const ents = ['brasil', ...(def.referencia ? [def.referencia] : [])];
    const series = await seriesFor(pool, c.slug, ents);
    const br = series.get('brasil');
    const ref = def.referencia ? series.get(def.referencia) : null;
    const valores = windows.map((w) => {
      if (!ref) {
        const a = aggregateWindow(br, w.ano_inicio, w.ano_fim, m.agregacao);
        if (a.valor !== null && !cobre(a)) return { valor: null, qualidade: a.qualidade, cobertura: a.cobertura, baixa: true };
        return { valor: a.valor, qualidade: a.qualidade, cobertura: a.cobertura };
      }
      const pb = new Map([...br].filter(([ano]) => ref.has(ano)));
      const pr = new Map([...ref].filter(([ano]) => br.has(ano)));
      const a = aggregateWindow(pb, w.ano_inicio, w.ano_fim, m.agregacao);
      const b = aggregateWindow(pr, w.ano_inicio, w.ano_fim, m.agregacao);
      const valor = a.valor !== null && b.valor !== null ? Math.round((a.valor - b.valor) * 100) / 100 : null;
      if (valor !== null && !cobre(a)) return { valor: null, qualidade: a.qualidade, cobertura: a.cobertura, baixa: true };
      return { valor, qualidade: a.qualidade, cobertura: a.cobertura };
    });
    const notas = normalizeEscala(valores.map((v) => v.valor), c.direcao, historicoAnual(br, ref, m.agregacao));
    const unidade = ref ? (m.unidade === '%' ? 'p.p.' : m.unidade) : (m.agregacao === 'variacao' && m.unidade === '% PIB' ? 'p.p. do PIB' : m.unidade);
    componentes.push({ ...c, unidade, agregacao: m.agregacao, peso: pesos[c.slug], valores, notas });
  }

  const blocosDef = (def.blocos || [{ slug: 'geral', nome: 'Geral' }])
    .map((b) => ({ ...b, componentes: componentes.filter((c) => (c.bloco || 'geral') === b.slug) }))
    .map((b) => ({ ...b, pesoTotal: b.componentes.reduce((s, c) => s + c.peso, 0) }))
    .filter((b) => b.pesoTotal > 0);
  const governos = windows.map((w, k) => {
    const itens = componentes.map((c) => ({
      slug: c.slug, bloco: c.bloco || 'geral', valor: c.valores[k].valor, nota: c.notas[k], qualidade: c.valores[k].qualidade,
      cobertura: c.valores[k].cobertura, peso: c.peso, ...(c.valores[k].baixa ? { motivo: 'cobertura abaixo de 50% dos anos' } : {}),
    }));
    const blocos = {};
    let cobertura = 0;
    for (const b of blocosDef) {
      const disp = itens.filter((i) => i.bloco === b.slug && i.nota !== null && i.peso > 0);
      const somaPesos = disp.reduce((s, i) => s + i.peso, 0);
      blocos[b.slug] = somaPesos ? r1(disp.reduce((s, i) => s + i.peso * i.nota, 0) / somaPesos) : null;
      cobertura += somaPesos / b.pesoTotal / blocosDef.length;
    }
    const notasBlocos = Object.values(blocos).filter((v) => v !== null);
    const nota = notasBlocos.length ? r1(notasBlocos.reduce((a, b) => a + b, 0) / notasBlocos.length) : null;
    return {
      slug: w.slug, nome: w.nome, ano_inicio: w.ano_inicio, ano_fim: w.ano_fim, nota, blocos,
      peso_coberto: r1(cobertura * 100),
      parcial: itens.some((i) => i.qualidade === 'parcial' || i.qualidade === 'projecao'),
      itens,
    };
  });
  const ordenados = governos.filter((g) => g.nota !== null).sort((a, b) => b.nota - a.nota);
  ordenados.forEach((g, i) => { g.posicao = i + 1; });

  const avisos = [];
  const incompletos = governos.filter((g) => g.peso_coberto < 100);
  if (incompletos.length) {
    avisos.push(`Sem dado para todos os indicadores em: ${incompletos.map((g) => `${g.nome.replace(/\s*\(.*\)/, '')} (${g.peso_coberto}% dos pesos)`).join(', ')}. A nota desses governos usa só os indicadores disponíveis.`);
  }
  const baixas = governos.flatMap((g) => g.itens.filter((i) => i.motivo)
    .map((i) => `${g.nome.replace(/\s*\(.*\)/, '')}: ${componentes.find((c) => c.slug === i.slug).nome} (${i.cobertura[0]} de ${i.cobertura[1]} anos)`));
  if (baixas.length) avisos.push(`Ficaram fora por ter dado em menos da metade dos anos do governo: ${baixas.join('; ')}.`);
  if (governos.some((g) => g.parcial)) avisos.push('Há dados parciais ou estimados (ano corrente) na conta de algum governo.');
  avisos.push('As notas usam a amplitude histórica de cada indicador; confira também os valores brutos.');

  return {
    modo, nome: def.nome, descricao: def.descricao, referencia: def.referencia || null,
    formula: blocosDef.length > 1
      ? 'Nota de cada indicador: de 0 a 100 entre o pior e o melhor ano da série desde 1995 (amplitude histórica). Nota de cada bloco = Σ(peso × nota) ÷ Σ(pesos dos indicadores com dado). Nota geral = média simples dos blocos (cada bloco vale o mesmo). Um indicador só conta para um governo se cobrir pelo menos metade dos anos dele.'
      : 'Nota de cada indicador: de 0 a 100 entre o pior e o melhor ano da série desde 1995 (amplitude histórica). Nota geral = Σ(peso × nota) ÷ Σ(pesos dos indicadores com dado). Um indicador só conta para um governo se cobrir pelo menos metade dos anos dele.',
    blocos: blocosDef.map((b) => ({ slug: b.slug, nome: b.nome, componentes: b.componentes.map((c) => c.slug) })),
    componentes: componentes.map(({ valores, notas, ...c }) => c),
    governos: [...ordenados, ...governos.filter((g) => g.nota === null)],
    avisos,
  };
}
