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
      { slug: 'resultado-primario-tesouro', nome: 'Resultado primário (governo central)', direcao: 'maior', bloco: 'contas' },
      { slug: 'despesa-total-tesouro', nome: 'Gasto total (% PIB)', direcao: 'menor', bloco: 'contas' },
      { slug: 'tributos-federais-tesouro', nome: 'Carga de tributos federais (% PIB)', direcao: 'menor', bloco: 'contas' },
      { slug: 'pessoal-tesouro', nome: 'Gasto com pessoal (% PIB)', direcao: 'menor', bloco: 'contas' },
      { slug: 'estatais-primario-bcb', nome: 'Resultado das estatais federais', direcao: 'maior', bloco: 'contas' },
      { slug: 'controle-corrupcao-wb', nome: 'Controle da corrupção', direcao: 'maior', bloco: 'instituicoes' },
      { slug: 'qualidade-regulatoria-wb', nome: 'Qualidade regulatória', direcao: 'maior', bloco: 'instituicoes' },
      { slug: 'efetividade-governo-wb', nome: 'Efetividade do governo', direcao: 'maior', bloco: 'instituicoes' },
    ],
  },
  trajetoria: {
    nome: 'Trajetória: o que cada governo fez com o que recebeu',
    descricao: 'Para cada indicador de nível, a média do mandato menos a situação do ano anterior à posse. Melhorar uma herança ruim conta a favor; piorar uma herança boa conta contra. O crescimento do PIB fica de fora: comparar taxas de crescimento com um único ano herdado mede sobretudo a volta à média.',
    trajetoria: true,
    blocos: [
      { slug: 'economia', nome: 'Economia' },
      { slug: 'contas', nome: 'Contas públicas' },
      { slug: 'instituicoes', nome: 'Instituições e ambiente de negócios' },
    ],
    componentes: [
      { slug: 'inflacao-wb', nome: 'Inflação vs. ano herdado', direcao: 'menor', bloco: 'economia' },
      { slug: 'desemprego-oit-wb', nome: 'Desemprego vs. ano herdado', direcao: 'menor', bloco: 'economia' },
      { slug: 'investimento-wb', nome: 'Taxa de investimento vs. ano herdado', direcao: 'maior', bloco: 'economia' },
      { slug: 'resultado-primario-tesouro', nome: 'Resultado primário vs. ano herdado', direcao: 'maior', bloco: 'contas' },
      { slug: 'despesa-total-tesouro', nome: 'Gasto total vs. ano herdado', direcao: 'menor', bloco: 'contas' },
      { slug: 'tributos-federais-tesouro', nome: 'Tributos federais vs. ano herdado', direcao: 'menor', bloco: 'contas' },
      { slug: 'pessoal-tesouro', nome: 'Gasto com pessoal vs. ano herdado', direcao: 'menor', bloco: 'contas' },
      { slug: 'controle-corrupcao-wb', nome: 'Controle da corrupção vs. ano herdado', direcao: 'maior', bloco: 'instituicoes' },
      { slug: 'qualidade-regulatoria-wb', nome: 'Qualidade regulatória vs. ano herdado', direcao: 'maior', bloco: 'instituicoes' },
      { slug: 'efetividade-governo-wb', nome: 'Efetividade do governo vs. ano herdado', direcao: 'maior', bloco: 'instituicoes' },
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
export const COBERTURA_POSICAO = 50;   // % dos pesos com dado para entrar na ordem
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
//   média: os próprios valores anuais; variação: variações de um ano para o outro (o ranking
//   compara o ritmo anual de cada governo); modo relativo: diferença anual Brasil − referência.
export function historicoAnual(br, ref, agregacao) {
  const ok = (o) => o && o.qualidade !== 'projecao';
  const anos = [...br.keys()].filter((a) => a >= 1995 && ok(br.get(a))).sort((a, b) => a - b);
  if (ref) return anos.filter((a) => ok(ref.get(a))).map((a) => br.get(a).valor - ref.get(a).valor);
  if (agregacao === 'variacao') {
    return anos.filter((a) => ok(br.get(a - 1))).map((a) => br.get(a).valor - br.get(a - 1).valor);
  }
  return anos.map((a) => br.get(a).valor);
}

// ---------- sensibilidade aos pesos ----------
// Sorteia N cenários de pesos (cada indicador e cada bloco entre 0,5× e 1,5× do peso
// escolhido), recalcula a nota e a posição de cada governo e mede a estabilidade da ordem.
// Semente fixa: o resultado é reproduzível por qualquer pessoa.
export const SENS = { cenarios: 1000, min: 0.5, max: 1.5, limiar: 0.9, semente: 20261005 };

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function notaCom(itens, blocosSlugs, pesoItem, pesoBloco) {
  let soma = 0, somaB = 0;
  for (const b of blocosSlugs) {
    let sp = 0, sn = 0;
    for (const i of itens) {
      if (i.bloco !== b || i.nota === null) continue;
      const w = pesoItem(i.slug);
      if (w <= 0) continue;
      sp += w; sn += w * i.nota;
    }
    if (sp > 0) { const wb = pesoBloco(b); soma += wb * (sn / sp); somaB += wb; }
  }
  return somaB ? soma / somaB : null;
}

export function sensibilidade(governos, blocosSlugs, pesos, opts = SENS) {
  const rnd = mulberry32(opts.semente);
  const comNota = governos.filter((g) => g.nota !== null && !g.insuficiente);
  const n = comNota.length;
  const posicoes = new Map(comNota.map((g) => [g.slug, []]));
  const frente = new Map();   // "a>b" → quantas vezes a ficou à frente de b
  const sorteio = () => opts.min + rnd() * (opts.max - opts.min);
  for (let k = 0; k < opts.cenarios; k++) {
    const wi = {}; const wb = {};
    for (const slug of Object.keys(pesos)) wi[slug] = pesos[slug] * sorteio();
    for (const b of blocosSlugs) wb[b] = sorteio();
    const notas = comNota.map((g) => ({ slug: g.slug, nota: notaCom(g.itens, blocosSlugs, (s) => wi[s] ?? 0, (b) => wb[b]) }));
    notas.sort((a, b) => b.nota - a.nota);
    notas.forEach((x, i) => posicoes.get(x.slug).push(i + 1));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const key = `${notas[i].slug}>${notas[j].slug}`;
      frente.set(key, (frente.get(key) || 0) + 1);
    }
  }
  const pct = (x) => Math.round((x / opts.cenarios) * 1000) / 10;
  const quantil = (arr, q) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * a.length))]; };
  const porGov = {};
  for (const [slug, ps] of posicoes) {
    porGov[slug] = {
      faixa: [quantil(ps, 0.05), quantil(ps, 0.95)],
      primeiro: pct(ps.filter((p) => p === 1).length),
      distribuicao: Array.from({ length: n }, (_, i) => pct(ps.filter((p) => p === i + 1).length)),
    };
  }
  // empate técnico: vizinhos na ordem oficial em que o de cima fica à frente em menos de 90%
  const ordem = [...comNota].sort((a, b) => b.nota - a.nota).map((g) => g.slug);
  const grupos = [];
  let atual = [ordem[0]];
  for (let i = 1; i < ordem.length; i++) {
    const vence = (frente.get(`${ordem[i - 1]}>${ordem[i]}`) || 0) / opts.cenarios;
    porGov[ordem[i - 1]].a_frente_do_seguinte = pct(vence * opts.cenarios);
    if (vence < opts.limiar) atual.push(ordem[i]); else { grupos.push(atual); atual = [ordem[i]]; }
  }
  if (ordem.length) grupos.push(atual);
  return { porGov, empates: grupos.filter((g) => g.length > 1), cenarios: opts.cenarios, intervalo: [opts.min, opts.max], limiar: opts.limiar };
}

// Trajetória: escala pela distribuição histórica de "média de 4 anos menos o ano anterior",
// com cortes em 5% e 95% (um choque extremo, como o fim da hiperinflação, não achata o resto);
// valores além dos cortes recebem 0 ou 100.
// Escala só com anos-base pós-Real: a saída da hiperinflação (1994–1995) não é comparável.
export const TRAJ_BASE_MIN = 1996;
export function historicoTrajetoria(br) {
  const ok = (o) => o && o.qualidade !== 'projecao';
  const out = [];
  for (const base of [...br.keys()].sort((a, b) => a - b)) {
    if (base < TRAJ_BASE_MIN || !ok(br.get(base))) continue;
    const seg = [1, 2, 3, 4].map((k) => br.get(base + k)).filter(ok);
    if (seg.length >= 3) out.push(seg.reduce((s, o) => s + o.valor, 0) / seg.length - br.get(base).valor);
  }
  return out;
}

export function normalizeRobusta(valores, direcao, historico) {
  if (!valores.some((v) => v !== null)) return valores.map(() => null);
  const h = [...historico].sort((a, b) => a - b);
  const q = (p) => h[Math.min(h.length - 1, Math.max(0, Math.round(p * (h.length - 1))))];
  let min = h.length >= 5 ? q(0.05) : Math.min(...h, ...valores.filter((v) => v !== null));
  let max = h.length >= 5 ? q(0.95) : Math.max(...h, ...valores.filter((v) => v !== null));
  if (max === min) return valores.map((v) => (v === null ? null : 50));
  return valores.map((v) => {
    if (v === null) return null;
    const t = Math.min(1, Math.max(0, (v - min) / (max - min)));
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
      if (def.trajetoria) {
        const a = aggregateWindow(br, w.ano_inicio, w.ano_fim, 'media');
        const base = br.get(w.ano_inicio - 1);
        if (a.valor === null || !base) return { valor: null, qualidade: a.qualidade, cobertura: a.cobertura, ...(a.valor !== null ? { semBase: true } : {}) };
        if (!cobre(a)) return { valor: null, qualidade: a.qualidade, cobertura: a.cobertura, baixa: true };
        return { valor: Math.round((a.valor - base.valor) * 100) / 100, herdado: base.valor, media: a.valor, qualidade: a.qualidade, cobertura: a.cobertura };
      }
      if (!ref) {
        const a = aggregateWindow(br, w.ano_inicio, w.ano_fim, m.agregacao);
        if (a.valor !== null && !cobre(a)) return { valor: null, qualidade: a.qualidade, cobertura: a.cobertura, baixa: true };
        // Variação (estoque, ex.: dívida) vira ritmo anual: mudança total ÷ anos decorridos desde
        // o ano anterior à posse. Sem isso, mandato longo acumula mais e mandato curto parece melhor.
        if (m.agregacao === 'variacao' && a.valor !== null) {
          const anos = a.anos[a.anos.length - 1] - (w.ano_inicio - 1);
          return { valor: Math.round((a.valor / anos) * 100) / 100, total: a.valor, anos, qualidade: a.qualidade, cobertura: a.cobertura };
        }
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
    const notas = def.trajetoria
      ? normalizeRobusta(valores.map((v) => v.valor), c.direcao, historicoTrajetoria(br))
      : normalizeEscala(valores.map((v) => v.valor), c.direcao, historicoAnual(br, ref, m.agregacao));
    const unidade = def.trajetoria ? (m.unidade === '%' ? 'p.p.' : m.unidade === '% PIB' ? 'p.p. do PIB' : m.unidade)
      : ref ? (m.unidade === '%' ? 'p.p.' : m.unidade) : (m.agregacao === 'variacao' && m.unidade === '% PIB' ? 'p.p. do PIB ao ano' : m.unidade);
    componentes.push({ ...c, unidade, agregacao: m.agregacao, peso: pesos[c.slug], valores, notas });
  }

  const blocosDef = (def.blocos || [{ slug: 'geral', nome: 'Geral' }])
    .map((b) => ({ ...b, componentes: componentes.filter((c) => (c.bloco || 'geral') === b.slug) }))
    .map((b) => ({ ...b, pesoTotal: b.componentes.reduce((s, c) => s + c.peso, 0) }))
    .filter((b) => b.pesoTotal > 0);
  const governos = windows.map((w, k) => {
    const itens = componentes.map((c) => ({
      slug: c.slug, bloco: c.bloco || 'geral', valor: c.valores[k].valor, ...(c.valores[k].total !== undefined ? { total: c.valores[k].total, anos: c.valores[k].anos } : {}),
      ...(c.valores[k].herdado !== undefined ? { herdado: c.valores[k].herdado, media: c.valores[k].media } : {}),
      ...(c.valores[k].semBase ? { motivo: 'sem dado do ano anterior à posse' } : {}), nota: c.notas[k], qualidade: c.valores[k].qualidade,
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
  // Governo com menos da metade dos pesos com dado mostra a nota, mas não recebe posição.
  for (const g of governos) if (g.nota !== null && g.peso_coberto < COBERTURA_POSICAO) { g.insuficiente = true; }
  const ordenados = governos.filter((g) => g.nota !== null && !g.insuficiente).sort((a, b) => b.nota - a.nota);
  ordenados.forEach((g, i) => { g.posicao = i + 1; });
  const sens = sensibilidade(governos, blocosDef.map((b) => b.slug), Object.fromEntries(componentes.map((c) => [c.slug, c.peso])));
  for (const g of ordenados) {
    g.sensibilidade = sens.porGov[g.slug];
    g.empate = sens.empates.find((e) => e.includes(g.slug)) || null;
  }

  const avisos = [];
  const incompletos = governos.filter((g) => g.peso_coberto < 100);
  if (incompletos.length) {
    avisos.push(`Sem dado para todos os indicadores em: ${incompletos.map((g) => `${g.nome.replace(/\s*\(.*\)/, '')} (${g.peso_coberto}% dos pesos)`).join(', ')}. A nota desses governos usa só os indicadores disponíveis.`);
  }
  const semBase = governos.flatMap((g) => g.itens.filter((i) => i.motivo === 'sem dado do ano anterior à posse')
    .map((i) => `${g.nome.replace(/\s*\(.*\)/, '')}: ${componentes.find((c) => c.slug === i.slug).nome}`));
  if (semBase.length) avisos.push(`Sem dado do ano anterior à posse, a trajetória não pode ser medida em: ${semBase.join('; ')}.`);
  const baixas = governos.flatMap((g) => g.itens.filter((i) => i.motivo && i.motivo.startsWith('cobertura'))
    .map((i) => `${g.nome.replace(/\s*\(.*\)/, '')}: ${componentes.find((c) => c.slug === i.slug).nome} (${i.cobertura[0]} de ${i.cobertura[1]} anos)`));
  if (baixas.length) avisos.push(`Ficaram fora por ter dado em menos da metade dos anos do governo: ${baixas.join('; ')}.`);
  const insuf = governos.filter((g) => g.insuficiente);
  if (insuf.length) avisos.push(`Sem posição por ter dado em menos da metade dos pesos neste modo: ${insuf.map((g) => `${g.nome.replace(/\s*\(.*\)/, '')} (${g.peso_coberto}%)`).join(', ')}. A nota aparece só como referência.`);
  const nomeDe = (slug) => governos.find((g) => g.slug === slug).nome.replace(/\s*\(.*\)/, '');
  for (const e of sens.empates) {
    avisos.push(`Empate técnico entre ${e.map(nomeDe).join(', ')}: em ${sens.cenarios} cenários de pesos (cada peso entre metade e 1,5 vez o escolhido), a ordem entre eles muda. Não há vencedor claro nesse grupo.`);
  }
  if (governos.some((g) => g.parcial)) avisos.push('Há dados parciais ou estimados (ano corrente) na conta de algum governo.');
  avisos.push('As notas usam a amplitude histórica de cada indicador; confira também os valores brutos.');

  return {
    modo, nome: def.nome, descricao: def.descricao, referencia: def.referencia || null,
    formula: blocosDef.length > 1
      ? 'Nota de cada indicador: de 0 a 100 entre o pior e o melhor ano da série desde 1995 (amplitude histórica). Nota de cada bloco = Σ(peso × nota) ÷ Σ(pesos dos indicadores com dado). Nota geral = média simples dos blocos (cada bloco vale o mesmo). Um indicador só conta para um governo se cobrir pelo menos metade dos anos dele.'
      : 'Nota de cada indicador: de 0 a 100 entre o pior e o melhor ano da série desde 1995 (amplitude histórica). Nota geral = Σ(peso × nota) ÷ Σ(pesos dos indicadores com dado). Um indicador só conta para um governo se cobrir pelo menos metade dos anos dele.',
    blocos: blocosDef.map((b) => ({ slug: b.slug, nome: b.nome, componentes: b.componentes.map((c) => c.slug) })),
    sensibilidade: { cenarios: sens.cenarios, intervalo: sens.intervalo, limiar: sens.limiar, empates: sens.empates,
      metodo: `Em ${sens.cenarios} cenários, cada peso de indicador e de bloco é sorteado entre ${String(sens.intervalo[0]).replace('.', ',')} e ${String(sens.intervalo[1]).replace('.', ',')} vez o peso escolhido (semente fixa). A faixa de posição vai de 5% a 95% dos cenários. Dois governos vizinhos ficam em empate técnico quando o de cima fica à frente em menos de ${Math.round(sens.limiar * 100)}% dos cenários.` },
    componentes: componentes.map(({ valores, notas, ...c }) => c),
    governos: [...ordenados, ...governos.filter((g) => g.insuficiente), ...governos.filter((g) => g.nota === null)],
    avisos,
  };
}
