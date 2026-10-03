// Motor de Contexto e Vieses — versão 1 (seção 13.1 do TDD).
// Cada fator é MEDIDO com dados da base, com a mesma regra para todos os governos.
// Nenhuma nota é atribuída à mão e nada é somado ao ranking: o motor só descreve
// as circunstâncias de cada período, a favor ou contra.
export const CONTEXT_VERSION = 'contexto@1';

const fmt = (n, d = 1) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const signed = (n, d = 1) => (n > 0 ? '+' : '') + fmt(n, d);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Limiares (públicos, aparecem na metodologia)
export const LIMIARES = {
  choque_global_pp: 0.5,      // crescimento mundial ±0,5 p.p. vs média histórica
  termos_troca_pct: 10,       // termos de troca ±10% no mandato
  inflacao_herdada: 10,       // IPCA do ano anterior acima de 10%
  mandato_curto_anos: 2,      // janelas de até 2 anos: baixa significância
};

async function loadSeries(pool, pairs) {
  const { rows } = await pool.query(`
    SELECT c.slug AS entidade, i.slug AS indicador, o.periodo_ano AS ano, o.valor::FLOAT AS valor, o.qualidade
    FROM fact_observation o
    JOIN dim_indicator i ON i.id = o.indicator_id
    JOIN dim_country c ON c.id = o.entity_id
    WHERE (c.slug, i.slug) IN (${pairs.map((_, k) => `($${2 * k + 1}, $${2 * k + 2})`).join(',')})`,
    pairs.flat());
  const m = new Map();
  for (const r of rows) {
    const k = `${r.entidade}|${r.indicador}`;
    if (!m.has(k)) m.set(k, new Map());
    m.get(k).set(r.ano, r);
  }
  return (ent, ind) => m.get(`${ent}|${ind}`) || new Map();
}

const inWindow = (s, ini, fim) => [...s.values()].filter((o) => o.ano >= ini && o.ano <= fim);

export async function computeContext(pool, windows, { now = new Date() } = {}) {
  const get = await loadSeries(pool, [
    ['mundo', 'pib-anual-wb'], ['brasil', 'pib-anual-wb'], ['america-latina', 'pib-anual-wb'],
    ['brasil', 'termos-troca-wb'], ['brasil', 'pib-anual'], ['brasil', 'ipca-anual'], ['brasil', 'desemprego'],
  ]);
  const wld = get('mundo', 'pib-anual-wb');
  const lastFull = now.getUTCFullYear() - 2;
  const wldHist = mean([...wld.values()].filter((o) => o.ano >= 1995 && o.ano <= lastFull).map((o) => o.valor));
  const pib = (ano) => get('brasil', 'pib-anual').get(ano) || get('brasil', 'pib-anual-wb').get(ano);

  return windows.map((w) => {
    const { ano_inicio: ini, ano_fim: fim } = w;
    const fatores = [];

    // 1. Choque global: crescimento mundial no período vs média histórica
    const wy = inWindow(wld, ini, fim);
    if (wy.length && wldHist !== null) {
      const m = mean(wy.map((o) => o.valor));
      const d = m - wldHist;
      fatores.push({
        slug: 'choque_global', nome: 'Economia mundial', valor: Math.round(d * 100) / 100, unidade: 'p.p.',
        efeito: d >= LIMIARES.choque_global_pp ? 'favoravel' : d <= -LIMIARES.choque_global_pp ? 'desfavoravel' : 'neutro',
        texto: `O mundo cresceu em média ${fmt(m)}% ao ano no período, ${signed(d)} p.p. em relação à média de 1995 a ${lastFull} (${fmt(wldHist)}%).`,
        anos: wy.map((o) => o.ano), fonte: 'Banco Mundial',
      });
    }

    // 2. Ciclo de commodities: variação dos termos de troca no mandato
    const tt = get('brasil', 'termos-troca-wb');
    const base = tt.get(ini - 1);
    const ty = inWindow(tt, ini, fim);
    if (base && ty.length) {
      const last = ty[ty.length - 1];
      const pct = (last.valor / base.valor - 1) * 100;
      fatores.push({
        slug: 'termos_troca', nome: 'Preços de exportação (termos de troca)', valor: Math.round(pct * 10) / 10, unidade: '%',
        efeito: pct >= LIMIARES.termos_troca_pct ? 'favoravel' : pct <= -LIMIARES.termos_troca_pct ? 'desfavoravel' : 'neutro',
        texto: `Os termos de troca do Brasil variaram ${signed(pct)}% entre ${ini - 1} e ${last.ano}: ${pct >= 0 ? 'as exportações ficaram mais valiosas em relação às importações' : 'as exportações perderam valor em relação às importações'}.`,
        anos: [ini - 1, last.ano], fonte: 'Banco Mundial',
      });
    }

    // 3. Herança: como estava a economia no ano anterior à posse
    const pPrev = pib(ini - 1);
    const iPrev = get('brasil', 'ipca-anual').get(ini - 1);
    const dPrev = get('brasil', 'desemprego').get(ini - 1);
    if (pPrev || iPrev) {
      const partes = [];
      if (pPrev) partes.push(`PIB ${signed(pPrev.valor)}%`);
      if (iPrev) partes.push(`inflação ${fmt(iPrev.valor)}%`);
      if (dPrev) partes.push(`desemprego ${fmt(dPrev.valor)}%`);
      const recessao = pPrev && pPrev.valor < 0;
      const inflAlta = iPrev && iPrev.valor > LIMIARES.inflacao_herdada;
      fatores.push({
        slug: 'heranca', nome: 'Ponto de partida', valor: pPrev ? pPrev.valor : null, unidade: '%',
        efeito: recessao || inflAlta ? 'desfavoravel' : 'neutro',
        texto: `No ano anterior à posse (${ini - 1}): ${partes.join(', ')}.` +
          (recessao ? ' O governo começou com a economia em recessão.' : '') +
          (inflAlta ? ' A inflação herdada estava acima de 10%.' : ''),
        anos: [ini - 1], fonte: 'IBGE',
      });
      // 4. Efeito base: partir de uma recessão infla as taxas de crescimento seguintes
      if (recessao) {
        fatores.push({
          slug: 'efeito_base', nome: 'Efeito base', valor: null, unidade: null, efeito: 'favoravel',
          texto: 'Como o ano anterior foi de queda, parte do crescimento dos primeiros anos é recuperação do que se perdeu, e não expansão nova. Compare também os níveis, não só as taxas.',
          anos: [ini - 1, ini], fonte: 'IBGE',
        });
      }
    }

    // 5. Desempenho relativo a pares (o principal controle de choques comuns)
    const br = get('brasil', 'pib-anual-wb');
    const lcn = get('america-latina', 'pib-anual-wb');
    const anosPar = [];
    for (let a = ini; a <= fim; a++) if (br.has(a) && lcn.has(a)) anosPar.push(a);
    if (anosPar.length) {
      const d = mean(anosPar.map((a) => br.get(a).valor - lcn.get(a).valor));
      fatores.push({
        slug: 'relativo_pares', nome: 'Brasil em relação à América Latina', valor: Math.round(d * 100) / 100, unidade: 'p.p.',
        efeito: 'medida',
        texto: `O PIB do Brasil cresceu em média ${signed(d)} p.p. por ano em relação à média da América Latina e Caribe no mesmo período. Choques que atingiram toda a região se anulam nessa diferença.`,
        anos: anosPar, fonte: 'Banco Mundial',
      });
    }

    // 6. Duração e significância
    const anos = fim - ini + 1;
    fatores.push({
      slug: 'duracao', nome: 'Duração da janela', valor: anos, unidade: 'anos',
      efeito: 'neutro',
      texto: anos <= LIMIARES.mandato_curto_anos
        ? `Janela de ${anos} anos: poucos pontos de dados. Médias desse período mudam muito com um único ano e devem ser lidas com cautela.`
        : `Janela de ${anos} anos civis (${ini}–${fim}).`,
      anos: [ini, fim], fonte: null,
    });

    if (fim >= now.getUTCFullYear()) {
      fatores.push({
        slug: 'mandato_em_curso', nome: 'Mandato em curso', valor: null, unidade: null, efeito: 'neutro',
        texto: `Os dados de ${now.getUTCFullYear()} ainda são parciais. O resultado do período pode mudar até a consolidação.`,
        anos: [now.getUTCFullYear()], fonte: null,
      });
    }

    return { governo: w.slug, fatores };
  });
}
