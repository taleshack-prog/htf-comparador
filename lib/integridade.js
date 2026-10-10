// Painel de integridade: registros oficiais sobre a gestão de cada governo. Fica FORA da nota.
// Só entra o que vale para todos os governos pela mesma regra e tem fonte oficial:
//   1. Parecer prévio do TCU sobre as contas anuais do presidente (todos os exercícios).
//   2. Percepção de corrupção (WGI, Banco Mundial), com a margem de erro publicada.
//   3. Estatais: resultado primário das estatais federais (Banco Central, sem Petrobras e
//      Eletrobras) e dividendos pagos ao Tesouro.
// Não há série oficial de "corrupção ocorrida por ano", de desperdício ou de prejuízo
// consolidado das estatais desde 1995; o painel diz isso em vez de estimar.
import { aggregateWindow, loadWindows, seriesFor } from './compare.js';

// Parecer prévio do TCU por exercício. A recomendação de rejeição das contas de 2014 foi a
// primeira desde 1937; a de 2015, a segunda. Todos os demais exercícios desde 1995 receberam
// parecer pela aprovação (com ou sem ressalvas).
export const TCU_REJEICAO = {
  2014: 'https://portal.tcu.gov.br/imprensa/noticias/tcu-conclui-parecer-sobre-contas-prestadas-pela-presidente-da-republica-referentes-a-2014',
  2015: 'https://www.congressoemfoco.com.br/noticias/por-unanimidade-tcu-recomenda-ao-congresso-rejeicao-das-contas-de-dilma/',
};
export const TCU_ULTIMO_EXERCICIO = 2025;   // parecer de junho de 2026
export const TCU_FONTE = 'https://revista.tcu.gov.br/ojs/index.php/RTCU/article/download/1332/1447';

const r2 = (n) => (n === null || n === undefined || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);

export function pareceresTcu(ini, fim, ultimo = TCU_ULTIMO_EXERCICIO) {
  const exercicios = [];
  for (let a = Math.max(ini, 1995); a <= Math.min(fim, ultimo); a++) exercicios.push(a);
  const rejeitados = exercicios.filter((a) => TCU_REJEICAO[a]);
  return {
    exercicios: exercicios.length,
    pela_rejeicao: rejeitados,
    pela_aprovacao: exercicios.length - rejeitados.length,
    fontes: rejeitados.map((a) => TCU_REJEICAO[a]),
  };
}

export async function integridade(pool, { now = new Date() } = {}) {
  const anoAtual = now.getUTCFullYear();
  const corte = (s) => s && new Map([...s].filter(([a]) => a < anoAtual));
  const cc = corte((await seriesFor(pool, 'controle-corrupcao-wb', ['brasil'])).get('brasil'));
  const ccm = corte((await seriesFor(pool, 'controle-corrupcao-wb-margem', ['brasil'])).get('brasil'));
  const est = corte((await seriesFor(pool, 'estatais-primario-bcb', ['brasil'])).get('brasil'));
  const div = corte((await seriesFor(pool, 'dividendos-tesouro', ['brasil'])).get('brasil'));
  const windows = await loadWindows(pool);
  const media = (s, w) => {
    if (!s) return { valor: null, cobertura: [0, w.ano_fim - w.ano_inicio + 1] };
    const a = aggregateWindow(s, w.ano_inicio, w.ano_fim, 'media');
    return { valor: r2(a.valor), cobertura: a.cobertura };
  };
  const governos = windows.map((w) => ({
    slug: w.slug, nome: w.nome, ano_inicio: w.ano_inicio, ano_fim: w.ano_fim,
    tcu: pareceresTcu(w.ano_inicio, w.ano_fim),
    corrupcao_percebida: { ...media(cc, w), margem: media(ccm, w).valor },
    estatais_primario: media(est, w),
    dividendos: media(div, w),
  }));
  return {
    governos,
    notas: {
      tcu: 'Parecer prévio do Tribunal de Contas da União sobre as contas anuais do presidente da República, enviado ao Congresso, que faz o julgamento. A recomendação de rejeição das contas de 2014 foi a primeira desde 1937, e a de 2015 a segunda; os dois casos envolveram as chamadas pedaladas fiscais. Todos os outros exercícios desde 1995 tiveram parecer pela aprovação, quase sempre com ressalvas.',
      corrupcao: 'Controle da corrupção (WGI, Banco Mundial), 0 a 100, com margem de erro de 90%. Mede a percepção, que muda quando os casos são descobertos, não quando acontecem: escândalos revelados anos depois pesam sobre outros governos.',
      estatais: 'Resultado primário das estatais federais (Banco Central), em % do PIB, desde 2002; a série exclui Petrobras e Eletrobras. Dividendos pagos ao Tesouro (Tesouro Nacional), em % do PIB, desde 1997. Não existe série oficial de lucro ou prejuízo consolidado de todas as estatais desde 1995: o boletim da Secretaria de Coordenação e Governança das Empresas Estatais só começa em meados da década de 2010.',
      ausentes: 'Sem série oficial comparável: corrupção ocorrida por ano, desperdício de recursos e prejuízo das estatais desde 1995. O Prumo não estima o que a fonte não publica.',
    },
    fontes: { tcu: TCU_FONTE },
    fora_da_nota: true,
  };
}
