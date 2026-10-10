// Sorte ou política? Quanto do crescimento de cada governo acompanha o cenário externo.
// Regressão linear (mínimos quadrados) com os anos desde 1996:
//   crescimento do PIB do Brasil = a + b1 × crescimento do PIB mundial + b2 × variação dos termos de troca
// Fontes: Banco Mundial (PIB do Brasil e do mundo; termos de troca do Brasil).
// Para cada governo: crescimento médio = média geral + efeito do cenário externo + parte não explicada.
//   efeito externo = b1 × (PIB mundial no mandato − média) + b2 × (termos de troca no mandato − média)
//   parte não explicada = média dos resíduos no mandato (política do governo, choques internos e erro)
// Leitura auxiliar: com cerca de 30 anos de dados, a estimativa é imprecisa e não entra na nota.
import { loadWindows, seriesFor } from './compare.js';

export const SORTE = { inicio: 1996 };
const r2 = (n) => (n === null || n === undefined || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Mínimos quadrados com intercepto; X = linhas de regressores (sem a coluna de 1).
export function ols(y, X) {
  const n = y.length;
  const k = X[0].length + 1;
  const Z = X.map((x) => [1, ...x]);
  const A = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => Z.reduce((s, z) => s + z[i] * z[j], 0)));
  const b = Array.from({ length: k }, (_, i) => Z.reduce((s, z, t) => s + z[i] * y[t], 0));
  // eliminação de Gauss com pivoteamento parcial
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    if (Math.abs(A[c][c]) < 1e-12) throw new Error('regressão sem solução (regressores colineares)');
    for (let r = c + 1; r < k; r++) {
      const f = A[r][c] / A[c][c];
      for (let j = c; j < k; j++) A[r][j] -= f * A[c][j];
      b[r] -= f * b[c];
    }
  }
  const beta = Array(k).fill(0);
  for (let i = k - 1; i >= 0; i--) beta[i] = (b[i] - A[i].slice(i + 1).reduce((s, a, j) => s + a * beta[i + 1 + j], 0)) / A[i][i];
  const ajuste = Z.map((z) => z.reduce((s, v, i) => s + v * beta[i], 0));
  const residuos = y.map((v, t) => v - ajuste[t]);
  const my = media(y);
  const sqt = y.reduce((s, v) => s + (v - my) ** 2, 0);
  const sqr = residuos.reduce((s, v) => s + v ** 2, 0);
  return { beta, ajuste, residuos, r2: sqt ? 1 - sqr / sqt : null, n };
}

export async function sorte(pool, { now = new Date() } = {}) {
  const anoAtual = now.getUTCFullYear();
  const pib = await seriesFor(pool, 'pib-anual-wb', ['brasil', 'mundo']);
  const tt = (await seriesFor(pool, 'termos-troca-wb', ['brasil'])).get('brasil');
  const br = pib.get('brasil'), mundo = pib.get('mundo');
  if (!br?.size || !mundo?.size || !tt?.size) return { disponivel: false, motivo: 'faltam séries do Banco Mundial' };
  const anos = [];
  for (let a = SORTE.inicio; a < anoAtual; a++) {
    if (br.has(a) && mundo.has(a) && tt.has(a) && tt.has(a - 1)) anos.push(a);
  }
  if (anos.length < 15) return { disponivel: false, motivo: `só ${anos.length} anos com as três séries` };
  const dtt = (a) => (tt.get(a).valor / tt.get(a - 1).valor - 1) * 100;
  const y = anos.map((a) => br.get(a).valor);
  const X = anos.map((a) => [mundo.get(a).valor, dtt(a)]);
  const m = ols(y, X);
  const [a0, bMundo, bTroca] = m.beta;
  const mediaMundo = media(X.map((x) => x[0])), mediaTroca = media(X.map((x) => x[1])), mediaY = media(y);
  const porAno = new Map(anos.map((a, t) => [a, { y: y[t], mundo: X[t][0], troca: X[t][1], residuo: m.residuos[t] }]));
  const windows = await loadWindows(pool);
  const governos = windows.map((w) => {
    const usados = [];
    for (let a = w.ano_inicio; a <= w.ano_fim; a++) if (porAno.has(a)) usados.push(porAno.get(a));
    if (usados.length < Math.ceil((w.ano_fim - w.ano_inicio + 1) / 2)) {
      return { slug: w.slug, nome: w.nome, ano_inicio: w.ano_inicio, ano_fim: w.ano_fim, anos: usados.length, crescimento: null };
    }
    const mMundo = media(usados.map((u) => u.mundo)), mTroca = media(usados.map((u) => u.troca));
    return {
      slug: w.slug, nome: w.nome, ano_inicio: w.ano_inicio, ano_fim: w.ano_fim, anos: usados.length,
      crescimento: r2(media(usados.map((u) => u.y))),
      efeito_externo: r2(bMundo * (mMundo - mediaMundo) + bTroca * (mTroca - mediaTroca)),
      efeito_mundo: r2(bMundo * (mMundo - mediaMundo)),
      efeito_troca: r2(bTroca * (mTroca - mediaTroca)),
      nao_explicado: r2(media(usados.map((u) => u.residuo))),
      pib_mundial: r2(mMundo), termos_troca: r2(mTroca),
    };
  });
  return {
    disponivel: true,
    periodo: [anos[0], anos[anos.length - 1]], n: m.n, r2: r2(m.r2),
    media_geral: r2(mediaY),
    coeficientes: { intercepto: r2(a0), pib_mundial: r2(bMundo), termos_troca: r2(bTroca) },
    metodo: `Regressão do crescimento do PIB do Brasil sobre o crescimento do PIB mundial e a variação anual dos termos de troca do Brasil (Banco Mundial), ${anos[0]}–${anos[anos.length - 1]}, ${m.n} anos. Para cada governo, crescimento médio = média do período (${r2(mediaY)}%) + efeito do cenário externo + parte não explicada. A parte não explicada inclui a política do governo, mas também choques internos (secas, greves, crises políticas) e erro de estimativa. Os juros americanos não entram: o Prumo ainda não coleta essa série.`,
    governos,
    avisos: [
      'Leitura auxiliar, fora da nota: com cerca de 30 anos de dados, a separação entre sorte e política é imprecisa.',
      'Os anos de cada governo são os mesmos do ranking; o ano em curso fica fora.',
    ],
  };
}
