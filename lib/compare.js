// Comparação entre governos: agrega as observações anuais de cada janela de governo,
// com cobertura, qualidade e fonte de cada número. Nada é estimado: ano sem dado fica
// fora da conta e a cobertura mostra quantos anos entraram.
import { computeContext, CONTEXT_VERSION } from './context.js';

const QUAL_ORDER = ['oficial', 'parcial', 'projecao', 'estimativa'];
const worstQual = (qs) => qs.reduce((a, q) => (QUAL_ORDER.indexOf(q) > QUAL_ORDER.indexOf(a) ? q : a), 'oficial');
const r2 = (n) => (n === null || n === undefined ? null : Math.round(n * 100) / 100);

export async function loadWindows(pool) {
  const { rows } = await pool.query(`
    SELECT c.slug, c.nome_pt AS nome, w.presidente, w.ano_inicio, w.ano_fim, w.mandato_ordem, w.nota
    FROM dim_government_window w JOIN dim_country c ON c.id = w.entity_id
    ORDER BY w.mandato_ordem`);
  return rows;
}

export async function getCatalog(pool) {
  const [ind, gov, ref, upd] = await Promise.all([
    pool.query(`
      SELECT i.slug, i.nome_pt AS nome, i.unidade, i.direcao_otima AS direcao, i.agregacao_janela AS agregacao,
             i.ressalva_metodologica AS ressalva, i.url_fonte, i.adaptador,
             s.slug AS fonte_slug, s.nome AS fonte_nome, s.nivel AS fonte_nivel, s.governamental,
             (SELECT COUNT(*) FROM fact_observation o WHERE o.indicator_id = i.id)::INT AS observacoes,
             (SELECT MIN(periodo_ano) FROM fact_observation o WHERE o.indicator_id = i.id) AS primeiro_ano,
             (SELECT MAX(periodo_ano) FROM fact_observation o WHERE o.indicator_id = i.id) AS ultimo_ano
      FROM dim_indicator i JOIN dim_source s ON s.id = i.fonte_id
      ORDER BY i.id`),
    loadWindows(pool),
    pool.query(`SELECT slug, nome_pt AS nome, tipo FROM dim_country
                WHERE tipo IN ('pais', 'grupo_pares') AND slug <> 'brasil' ORDER BY tipo DESC, nome_pt`),
    pool.query(`SELECT MAX(terminado_em) AS em FROM ingestion_run WHERE status = 'ok'`),
  ]);
  return {
    indicadores: ind.rows.filter((r) => r.observacoes > 0).map((r) => ({
      slug: r.slug, nome: r.nome, unidade: r.unidade, direcao: r.direcao, agregacao: r.agregacao,
      ressalva: r.ressalva, url_fonte: r.url_fonte,
      grupo: r.adaptador?.startsWith('worldbank') ? 'internacional' : 'brasil',
      fonte: { slug: r.fonte_slug, nome: r.fonte_nome, nivel: r.fonte_nivel, governamental: r.governamental },
      periodo: [r.primeiro_ano, r.ultimo_ano],
    })),
    governos: gov,
    referencias: ref.rows,
    atualizado_em: upd.rows[0]?.em || null,
  };
}

// Agrega uma série {ano: {valor, qualidade}} numa janela [ini, fim].
export function aggregateWindow(series, ini, fim, agregacao) {
  const anos = [];
  for (let a = ini; a <= fim; a++) if (series.has(a)) anos.push(a);
  const total = fim - ini + 1;
  if (!anos.length) return { valor: null, anos: [], cobertura: [0, total], qualidade: null };
  let valor;
  if (agregacao === 'variacao') {
    const base = series.get(ini - 1);
    const last = series.get(anos[anos.length - 1]);
    if (!base) return { valor: null, anos, cobertura: [anos.length, total], qualidade: null, motivo: `sem dado de ${ini - 1} para a base` };
    valor = last.valor - base.valor;
  } else if (agregacao === 'ultimo') {
    valor = series.get(anos[anos.length - 1]).valor;
  } else {
    valor = anos.reduce((s, a) => s + series.get(a).valor, 0) / anos.length;
  }
  return {
    valor: r2(valor),
    anos,
    cobertura: [anos.length, total],
    qualidade: worstQual(anos.map((a) => series.get(a).qualidade)),
  };
}

export async function seriesFor(pool, indicatorSlug, entitySlugs) {
  const { rows } = await pool.query(`
    SELECT c.slug AS entidade, o.periodo_ano AS ano, o.valor::FLOAT AS valor, o.qualidade,
           o.url_fonte, o.data_coleta
    FROM fact_observation o
    JOIN dim_indicator i ON i.id = o.indicator_id
    JOIN dim_country c ON c.id = o.entity_id
    WHERE i.slug = $1 AND c.slug = ANY($2)
    ORDER BY o.periodo_ano`, [indicatorSlug, entitySlugs]);
  const out = new Map(entitySlugs.map((s) => [s, new Map()]));
  for (const r of rows) out.get(r.entidade).set(r.ano, r);
  return out;
}

export async function compare(pool, { indicador, governos, referencia }) {
  const { rows: [ind] } = await pool.query(`
    SELECT i.slug, i.nome_pt AS nome, i.unidade, i.direcao_otima AS direcao, i.agregacao_janela AS agregacao,
           i.ressalva_metodologica AS ressalva, i.url_fonte, i.adaptador,
           s.nome AS fonte_nome, s.nivel AS fonte_nivel, s.governamental, s.url_base
    FROM dim_indicator i JOIN dim_source s ON s.id = i.fonte_id WHERE i.slug = $1`, [indicador]);
  if (!ind) return null;

  const allWindows = await loadWindows(pool);
  const windows = governos?.length ? allWindows.filter((w) => governos.includes(w.slug)) : allWindows;
  const entities = ['brasil', ...(referencia ? [referencia] : [])];
  const series = await seriesFor(pool, indicador, entities);
  const br = series.get('brasil');
  const ref = referencia ? series.get(referencia) : null;

  const resultado = windows.map((w) => {
    const a = aggregateWindow(br, w.ano_inicio, w.ano_fim, ind.agregacao);
    const item = { ...w, ...a };
    if (ref) {
      // diferença só nos anos que existem nas duas séries (pareamento)
      const paired = new Map([...br].filter(([ano]) => ref.has(ano)));
      const pb = aggregateWindow(paired, w.ano_inicio, w.ano_fim, ind.agregacao);
      const pr = aggregateWindow(new Map([...ref].filter(([ano]) => br.has(ano))), w.ano_inicio, w.ano_fim, ind.agregacao);
      item.referencia = { valor: pr.valor, cobertura: pr.cobertura, qualidade: pr.qualidade };
      item.diferenca = pb.valor !== null && pr.valor !== null ? r2(pb.valor - pr.valor) : null;
    }
    return item;
  });

  const toArr = (m) => [...m.values()].map((o) => ({ ano: o.ano, valor: o.valor, qualidade: o.qualidade }));
  const coleta = [...br.values()].map((o) => o.data_coleta).sort().pop() || null;

  return {
    indicador: {
      slug: ind.slug, nome: ind.nome, unidade: ind.unidade, direcao: ind.direcao, agregacao: ind.agregacao,
      ressalva: ind.ressalva,
      grupo: ind.adaptador?.startsWith('worldbank') ? 'internacional' : 'brasil',
    },
    referencia: referencia || null,
    governos: resultado,
    serie: { brasil: toArr(br), ...(ref ? { referencia: toArr(ref) } : {}) },
    fontes: [{
      nome: ind.fonte_nome, nivel: ind.fonte_nivel, governamental: ind.governamental,
      url: [...br.values()][0]?.url_fonte || ind.url_fonte, coletado_em: coleta,
    }],
    contexto: await computeContext(pool, windows),
    contexto_versao: CONTEXT_VERSION,
  };
}
