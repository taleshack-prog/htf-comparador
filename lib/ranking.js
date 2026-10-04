// Ranking geral: combina vários indicadores numa nota de 0 a 100 por governo.
// Regras públicas (aparecem na tela e na metodologia):
//   1. Em cada indicador, o melhor governo recebe 100 e o pior 0 (normalização mín–máx
//      entre os seis governos); os demais ficam proporcionalmente no meio.
//   2. A nota geral é a média ponderada das notas dos indicadores com dado:
//      Σ(peso × nota) ÷ Σ(pesos dos indicadores disponíveis para aquele governo).
//   3. Cobertura mínima: um indicador só entra na nota de um governo se tiver dado em
//      pelo menos metade dos anos dele (COBERTURA_MIN). Média de 2 anos num mandato de 8
//      não representa o mandato.
//   4. Nenhum bônus ou penalidade manual. O contexto entra só no modo "relativo",
//      que compara o Brasil com a América Latina nos mesmos anos — choques que
//      atingiram toda a região (pandemia, crise de 2009, ciclo de commodities) se anulam.
import { aggregateWindow, loadWindows, seriesFor } from './compare.js';

export const MODOS = {
  oficial: {
    nome: 'Dados oficiais do Brasil',
    descricao: 'Números brutos de cada governo: IBGE, Tesouro Nacional, FMI e Banco Mundial. O desemprego usa a estimativa da OIT, a única série que cobre os seis governos.',
    componentes: [
      { slug: 'pib-anual', nome: 'Crescimento do PIB', direcao: 'maior' },
      { slug: 'ipca-anual', nome: 'Inflação (IPCA)', direcao: 'menor' },
      { slug: 'desemprego-oit-wb', nome: 'Desemprego (OIT)', direcao: 'menor' },
      { slug: 'resultado-primario-fmi', nome: 'Resultado primário', direcao: 'maior' },
      { slug: 'divida-bruta-fmi', nome: 'Variação da dívida', direcao: 'menor' },
      { slug: 'controle-corrupcao-wb', nome: 'Controle da corrupção', direcao: 'maior' },
      { slug: 'pessoal-tesouro', nome: 'Gasto com pessoal (% PIB)', direcao: 'menor' },
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
    const notas = normalize(valores.map((v) => v.valor), c.direcao);
    const unidade = ref ? (m.unidade === '%' ? 'p.p.' : m.unidade) : (m.agregacao === 'variacao' && m.unidade === '% PIB' ? 'p.p. do PIB' : m.unidade);
    componentes.push({ ...c, unidade, agregacao: m.agregacao, peso: pesos[c.slug], valores, notas });
  }

  const pesoTotal = componentes.reduce((s, c) => s + c.peso, 0);
  const governos = windows.map((w, k) => {
    const itens = componentes.map((c) => ({
      slug: c.slug, valor: c.valores[k].valor, nota: c.notas[k], qualidade: c.valores[k].qualidade,
      cobertura: c.valores[k].cobertura, peso: c.peso, ...(c.valores[k].baixa ? { motivo: 'cobertura abaixo de 50% dos anos' } : {}),
    }));
    const disp = itens.filter((i) => i.nota !== null && i.peso > 0);
    const somaPesos = disp.reduce((s, i) => s + i.peso, 0);
    const nota = somaPesos ? r1(disp.reduce((s, i) => s + i.peso * i.nota, 0) / somaPesos) : null;
    return {
      slug: w.slug, nome: w.nome, ano_inicio: w.ano_inicio, ano_fim: w.ano_fim, nota,
      peso_coberto: pesoTotal ? r1((somaPesos / pesoTotal) * 100) : 0,
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
  avisos.push('Com seis governos, a normalização amplia diferenças pequenas: confira sempre os valores brutos de cada indicador.');

  return {
    modo, nome: def.nome, descricao: def.descricao, referencia: def.referencia || null,
    formula: 'Nota de cada indicador: melhor governo = 100, pior = 0. Nota geral = Σ(peso × nota) ÷ Σ(pesos dos indicadores com dado). Um indicador só conta para um governo se cobrir pelo menos metade dos anos dele.',
    componentes: componentes.map(({ valores, notas, ...c }) => c),
    governos: [...ordenados, ...governos.filter((g) => g.nota === null)],
    avisos,
  };
}
