// Prumo — tela de comparação. JavaScript puro, gráficos em SVG próprio.
const $ = (s) => document.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const nf = (d = 1) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const REF_COR = (slug) => `var(--ref-${slug})`;
const NIVEL = {
  oficial_br: 'Oficial BR', organismo_internacional: 'Organismo internacional',
  pesquisa_independente: 'Pesquisa independente', imprensa: 'Imprensa', checagem: 'Checagem',
};

const state = { catalog: null, data: null, ind: null, gov: new Set(), ref: '', ordem: 'periodo', rmodo: 'oficial', rpesos: {}, rdata: null };

// ---------- formatação ----------
function fmtValor(v, unidade, { sinal = false } = {}) {
  if (v === null || v === undefined) return '—';
  const casas = unidade === 'km²' ? 0 : 1;
  const s = (sinal && v > 0 ? '+' : '') + nf(casas).format(v);
  if (unidade === '%') return `${s}%`;
  if (unidade === '% PIB') return `${s}% do PIB`;
  if (unidade === 'p.p.') return `${s} p.p.`;
  if (unidade === 'p.p. do PIB') return `${s} p.p. do PIB`;
  if (unidade === 'km²') return `${s} km²`;
  if (unidade === 'pontos') return `${s} pontos`;
  return s;
}
const unidadeVariacao = (u) => (u === '%' || u === '% PIB' ? 'p.p.' : u);
const nomeCurto = (nome) => nome.replace(/\s*\(.*\)\s*$/, '');
const svg = (tag, attrs = {}, parent) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
};

// ---------- URL ----------
function readUrl() {
  const p = new URLSearchParams(location.search);
  const rpesos = {};
  for (const par of (p.get('pesos') || '').split(',').filter(Boolean)) { const [k, v] = par.split(':'); if (k && v !== undefined) rpesos[k] = Number(v); }
  return { ind: p.get('ind'), gov: p.get('gov'), ref: p.get('ref') || '', ordem: p.get('ordem') || 'periodo',
    rmodo: p.get('ranking') === 'relativo' ? 'relativo' : 'oficial', rpesos };
}
function writeUrl() {
  const p = new URLSearchParams();
  p.set('ind', state.ind);
  const todos = state.catalog.governos.map((g) => g.slug);
  if (state.gov.size !== todos.length) p.set('gov', [...state.gov].join(','));
  if (state.ref) p.set('ref', state.ref);
  if (state.ordem !== 'periodo') p.set('ordem', state.ordem);
  if (state.rmodo !== 'oficial') p.set('ranking', state.rmodo);
  const pesos = Object.entries(state.rpesos).filter(([, v]) => v !== 1).map(([k, v]) => `${k}:${v}`);
  if (pesos.length) p.set('pesos', pesos.join(','));
  history.replaceState(null, '', `${location.pathname}?${p}`);
}

// ---------- tooltip ----------
const tip = $('#dica-flutuante');
function showTip(html, x, y) {
  tip.innerHTML = html;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = `${Math.min(x + 14, innerWidth - r.width - 8)}px`;
  tip.style.top = `${Math.max(8, y - r.height - 12)}px`;
}
const hideTip = () => { tip.hidden = true; };

// ---------- controles ----------
function indicadorAtual() { return state.catalog.indicadores.find((i) => i.slug === state.ind); }

function buildControls() {
  const sel = $('#sel-indicador');
  sel.innerHTML = '';
  const grupos = [['brasil', 'Brasil — fontes oficiais'], ['internacional', 'Comparação internacional — Banco Mundial']];
  for (const [g, rotulo] of grupos) {
    const og = document.createElement('optgroup');
    og.label = rotulo;
    for (const i of state.catalog.indicadores.filter((x) => x.grupo === g)) {
      const o = new Option(i.nome, i.slug);
      og.appendChild(o);
    }
    if (og.children.length) sel.appendChild(og);
  }
  sel.value = state.ind;
  sel.onchange = () => { state.ind = sel.value; syncRef(); load(); };

  const ref = $('#sel-referencia');
  ref.innerHTML = '';
  ref.appendChild(new Option('Nenhuma referência', ''));
  for (const r of state.catalog.referencias) ref.appendChild(new Option(r.nome, r.slug));
  ref.onchange = () => { state.ref = ref.value; load(); };
  syncRef();

  const chips = $('#chips-governos');
  chips.innerHTML = '';
  for (const g of state.catalog.governos) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.slug = g.slug;
    b.innerHTML = `${nomeCurto(g.nome)}<small>${g.ano_inicio}–${g.ano_fim}</small>`;
    b.setAttribute('aria-pressed', state.gov.has(g.slug));
    b.onclick = () => {
      if (state.gov.has(g.slug)) { if (state.gov.size > 1) state.gov.delete(g.slug); } else state.gov.add(g.slug);
      b.setAttribute('aria-pressed', state.gov.has(g.slug));
      load();
    };
    chips.appendChild(b);
  }

  document.querySelectorAll('[data-modo]').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.modo === state.rmodo);
    b.onclick = () => {
      state.rmodo = b.dataset.modo;
      state.rpesos = {};
      document.querySelectorAll('[data-modo]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      loadRanking();
    };
  });

  document.querySelectorAll('[data-ordem]').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.ordem === state.ordem);
    b.onclick = () => {
      state.ordem = b.dataset.ordem;
      document.querySelectorAll('[data-ordem]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      writeUrl();
      renderBars();
    };
  });
}

function syncRef() {
  const ind = indicadorAtual();
  const ref = $('#sel-referencia');
  const dica = $('#dica-referencia');
  const internacional = ind?.grupo === 'internacional';
  ref.disabled = !internacional;
  if (!internacional) {
    state.ref = '';
    dica.hidden = false;
    dica.textContent = 'A comparação com outros países usa as séries do Banco Mundial, que seguem a mesma metodologia para todos. Escolha um indicador do grupo "Comparação internacional".';
  } else dica.hidden = true;
  ref.value = state.ref;
}

// ---------- carga ----------
// Versão (código publicado + hora da última coleta): entra na URL das consultas para que
// deploy ou coleta nova nunca sejam escondidos por resposta antiga no cache da CDN.
const versaoDados = () => state.catalog?.versao || String(Date.parse(state.catalog?.atualizado_em || '') || 0);
async function load() {
  writeUrl();
  const p = new URLSearchParams({ ind: state.ind, gov: [...state.gov].join(',') });
  if (state.ref) p.set('ref', state.ref);
  p.set('v', versaoDados());
  aviso('');
  try {
    const r = await fetch(`/api/v1/compare?${p}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `erro ${r.status}`);
    state.data = await r.json();
    render();
  } catch (e) {
    aviso(`Não foi possível carregar os dados: ${e.message}`);
  }
}
function aviso(msg) { const a = $('#aviso'); a.textContent = msg; a.hidden = !msg; }

function render() {
  renderBars();
  renderTable();
  renderLine();
  renderContext();
  renderSources();
  renderPrintMeta();
}

// ---------- ranking geral ----------
async function loadRanking() {
  writeUrl();
  const pesos = Object.entries(state.rpesos).map(([k, v]) => `${k}:${v}`).join(',');
  const p = new URLSearchParams({ modo: state.rmodo });
  if (pesos) p.set('pesos', pesos);
  p.set('v', versaoDados());
  try {
    const r = await fetch(`/api/v1/ranking?${p}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `erro ${r.status}`);
    state.rdata = await r.json();
    renderRanking();
  } catch (e) {
    $('#grafico-ranking').innerHTML = `<p class="vazio">Não foi possível montar o ranking: ${e.message}</p>`;
  }
}

function renderPesos(d) {
  const box = $('#ranking-pesos');
  const chave = d.componentes.map((c) => c.slug).join('|');
  if (box.dataset.chave === chave) return; // não recria os controles durante o arraste
  box.dataset.chave = chave;
  box.innerHTML = '';
  const grupos = (d.blocos && d.blocos.length > 1)
    ? d.blocos.map((b) => ({ nome: b.nome, itens: d.componentes.filter((c) => b.componentes.includes(c.slug)) }))
    : [{ nome: null, itens: d.componentes }];
  for (const g of grupos) {
    if (g.nome) {
      const h = document.createElement('p');
      h.className = 'peso-bloco';
      h.textContent = `${g.nome} · vale 1/${grupos.length} da nota`;
      box.appendChild(h);
    }
  for (const c of g.itens) {
    const id = `peso-${c.slug}`;
    const wrap = document.createElement('label');
    wrap.className = 'peso';
    wrap.htmlFor = id;
    const rotulo = (v) => (Number(v) === 0 ? 'fora' : `peso ${v}`);
    wrap.innerHTML = `<span>${c.nome}</span><output id="${id}-o">${rotulo(c.peso)}</output>
      <input id="${id}" type="range" min="0" max="3" step="1" value="${c.peso}" aria-describedby="${id}-o">`;
    const input = wrap.querySelector('input');
    let t;
    input.addEventListener('input', () => {
      wrap.querySelector('output').textContent = rotulo(input.value);
      state.rpesos[c.slug] = Number(input.value);
      clearTimeout(t); t = setTimeout(loadRanking, 200);
    });
    box.appendChild(wrap);
  }
  }
}

function renderRanking() {
  const d = state.rdata;
  $('#ranking-descricao').textContent = d.descricao;
  $('#ranking-formula').textContent = d.formula + (d.sensibilidade ? ` Sensibilidade: ${d.sensibilidade.metodo}` : '');
  $('#ranking-avisos').innerHTML = d.avisos.map((a) => `<li>${a}</li>`).join('');
  renderPesos(d);
  const box = $('#grafico-ranking');
  box.innerHTML = '';
  const rows = d.governos;
  const W = Math.max(320, box.clientWidth - 16);
  const narrow = W < 560;
  const labelW = narrow ? 0 : 210;
  const rowH = narrow ? 58 : 42;
  const H = 8 + rows.length * rowH + 22;
  const x0 = labelW + 30, x1 = W - 70;
  const X = (v) => x0 + (v / 100) * (x1 - x0);
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Ranking geral: ${d.nome}` });
  for (const v of [0, 50, 100]) {
    svg('line', { x1: X(v), x2: X(v), y1: 0, y2: H - 18, class: v === 0 ? 'prumo' : 'grade' }, s);
    const t = svg('text', { x: X(v), y: H - 4, 'font-size': 11, 'text-anchor': 'middle', class: 'muted' }, s);
    t.textContent = v;
  }
  rows.forEach((g, k) => {
    const y = 8 + k * rowH;
    const barY = narrow ? y + 24 : y + 10;
    const grp = svg('g', { class: 'alvo', tabindex: 0 }, s);
    const pos = svg('text', { x: narrow ? x0 - 24 : labelW + 4, y: barY + 15, 'font-size': 15, 'font-weight': 800 }, grp);
    pos.textContent = g.posicao ? `${g.posicao}º` : '—';
    const nome = nomeCurto(g.nome);
    const t = svg('text', { x: narrow ? x0 : 0, y: narrow ? y + 16 : barY + 15, 'font-size': 14, 'font-weight': 600 }, grp);
    t.textContent = nome + ' ';
    const ts = svg('tspan', { 'font-size': 12, 'font-weight': 400, class: 'muted' }, t);
    ts.textContent = `${g.ano_inicio}–${g.ano_fim}`;
    if (g.nota === null) {
      const nt = svg('text', { x: x0 + 6, y: barY + 15, 'font-size': 13, class: 'muted' }, grp);
      nt.textContent = 'sem dados suficientes';
    } else {
      svg('rect', { class: 'barra', x: x0, y: barY, width: Math.max(2, X(g.nota) - x0), height: 20, rx: 4,
        fill: 'var(--brasil)', 'fill-opacity': g.peso_coberto < 100 ? 0.6 : 1 }, grp);
      const vt = svg('text', { x: X(g.nota) + 6, y: barY + 15, 'font-size': 14, 'font-weight': 600 }, grp);
      vt.textContent = nf(1).format(g.nota);
      const sens = g.sensibilidade;
      const faixa = sens && sens.faixa[0] !== sens.faixa[1] ? `${sens.faixa[0]}º a ${sens.faixa[1]}º conforme os pesos` : '';
      const extras = [g.empate ? 'empate técnico' : '', faixa, g.peso_coberto < 100 ? `${nf(0).format(g.peso_coberto)}% dos pesos` : '', g.parcial ? 'parcial' : ''].filter(Boolean);
      if (extras.length) {
        const et = svg('text', { x: X(g.nota) + 6, y: barY + 31, 'font-size': 11, class: 'muted' }, grp);
        et.textContent = extras.join(' · ');
      }
      if (g.empate) svg('rect', { x: (narrow ? x0 - 28 : labelW) , y: barY - 2, width: 4, height: 24, rx: 2, fill: 'var(--latao)' }, grp);
    }
    const linhas = d.componentes.map((c) => {
      const it = g.itens.find((i) => i.slug === c.slug);
      return `${c.nome}: ${it.nota === null ? 'sem dado' : `${nf(0).format(it.nota)} (${fmtValor(it.valor, c.unidade, { sinal: c.unidade.startsWith('p.p.') })})`}${c.peso === 0 ? ' · fora' : ''}`;
    }).join('<br>');
    const blocosTxt = (d.blocos || []).length > 1
      ? d.blocos.map((b) => `${b.nome}: ${g.blocos?.[b.slug] == null ? '—' : nf(1).format(g.blocos[b.slug])}`).join(' · ') + '<br>' : '';
    const sensTxt = g.sensibilidade ? `Em ${d.sensibilidade.cenarios} cenários de pesos: 1º lugar em ${nf(1).format(g.sensibilidade.primeiro)}%; posição entre ${g.sensibilidade.faixa[0]}º e ${g.sensibilidade.faixa[1]}º.${g.empate ? ' Empate técnico.' : ''}<br>` : '';
    const html = `<strong>${nome}</strong> (${g.ano_inicio}–${g.ano_fim})<br>Nota geral: ${g.nota === null ? '—' : nf(1).format(g.nota)}<br>${sensTxt}${blocosTxt}${linhas}`;
    grp.addEventListener('mousemove', (e) => showTip(html, e.clientX, e.clientY));
    grp.addEventListener('mouseleave', hideTip);
    grp.addEventListener('focus', () => { const bb = grp.getBoundingClientRect(); showTip(html, bb.left + 40, bb.top); });
    grp.addEventListener('blur', hideTip);
  });
  box.appendChild(s);

  const multi = (d.blocos || []).length > 1;
  const cabBlocos = multi ? d.blocos.map((b) => `<th class="num">${b.nome}</th>`).join('') : '';
  const celBlocos = (g) => (multi ? d.blocos.map((b) => `<td class="num">${g.blocos?.[b.slug] == null ? '—' : nf(1).format(g.blocos[b.slug])}</td>`).join('') : '');
  const cab = d.componentes.map((c) => `<th class="num">${c.nome}${c.peso === 0 ? ' (fora)' : c.peso !== 1 ? ` (peso ${c.peso})` : ''}</th>`).join('');
  const faixaCel = (g) => (g.sensibilidade ? `${g.sensibilidade.faixa[0]}º–${g.sensibilidade.faixa[1]}º${g.empate ? '<br><span class="muted">empate</span>' : ''}` : '—');
  const lin = d.governos.map((g) => `<tr><td>${g.posicao ? `${g.posicao}º` : '—'}</td><td>${nomeCurto(g.nome)}</td><td class="num">${faixaCel(g)}</td>
    <td class="num"><strong>${g.nota === null ? '—' : nf(1).format(g.nota)}</strong></td>${celBlocos(g)}
    ${d.componentes.map((c) => { const it = g.itens.find((i) => i.slug === c.slug);
      return `<td class="num">${it.nota === null ? '—' : `${nf(0).format(it.nota)}<br><span class="muted">${fmtValor(it.valor, c.unidade, { sinal: c.unidade.startsWith('p.p.') })}</span>`}</td>`; }).join('')}</tr>`).join('');
  $('#tabela-ranking').innerHTML = `<table><thead><tr><th>#</th><th>Governo</th><th class="num">Faixa nos cenários</th><th class="num">Nota</th>${cabBlocos}${cab}</tr></thead><tbody>${lin}</tbody></table>`;
}

// ---------- gráfico de barras com o prumo ----------
function renderBars() {
  const d = state.data;
  const ind = d.indicador;
  const variacao = ind.agregacao === 'variacao';
  const un = variacao ? unidadeVariacao(ind.unidade) : ind.unidade;
  $('#t-barras').textContent = `${ind.nome}: ${variacao ? 'variação durante cada governo' : 'média anual por governo'}`;
  const neutra = ind.direcao === 'neutra';
  $('#direcao').textContent = (neutra
    ? 'Não há consenso sobre qual valor é desejável para este indicador: ele aparece para consulta, sem posição, e não entra no ranking.'
    : `Para este indicador, valores ${ind.direcao === 'menor' ? 'menores' : 'maiores'} são desejáveis. O número ao lado de cada barra é a posição entre os governos mostrados (1º = melhor).`) +
    (variacao ? ' A variação compara o último ano do governo com o ano anterior à posse.' : '') +
    (state.ordem === 'periodo' ? ' Barras em ordem cronológica.' : '');
  // posição de cada governo entre os mostrados, segundo a direção desejável
  const posicao = new Map();
  if (!neutra) {
    const comValor = d.governos.filter((r) => r.valor !== null)
      .sort((a, b) => (ind.direcao === 'menor' ? a.valor - b.valor : b.valor - a.valor));
    let ult = null, pos = 0;
    comValor.forEach((r, i) => { if (r.valor !== ult) { pos = i + 1; ult = r.valor; } posicao.set(r.slug, pos); });
    posicao.total = comValor.length;
  }

  const refNome = d.referencia ? state.catalog.referencias.find((r) => r.slug === d.referencia)?.nome : null;
  $('#legenda-barras').innerHTML =
    `<span><i style="border-color:var(--brasil)"></i>Brasil</span>` +
    (refNome ? `<span><i class="losango" style="border-color:${REF_COR(d.referencia)}"></i>${refNome}, mesmos anos</span>` : '') +
    `<span><i class="prumo"></i>Zero</span>`;

  let rows = d.governos.slice();
  if (state.ordem === 'valor') {
    rows.sort((a, b) => (a.valor === null) - (b.valor === null) || (ind.direcao === 'maior' ? b.valor - a.valor : a.valor - b.valor));
  }
  const box = $('#grafico-barras');
  box.innerHTML = '';
  if (!rows.some((r) => r.valor !== null)) {
    box.innerHTML = '<p class="vazio">Nenhum dos governos escolhidos tem dado comparável para este indicador. Veja a nota de método abaixo.</p>';
    return;
  }

  const W = Math.max(320, box.clientWidth - 16);
  const narrow = W < 560;
  const labelW = narrow ? 0 : 190;
  const rowH = narrow ? 64 : 46;
  const top = 8;
  const H = top + rows.length * rowH + 24;
  const vals = rows.flatMap((r) => [r.valor, r.referencia?.valor]).filter((v) => v !== null && v !== undefined);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const pad = (hi - lo || 1) * 0.18;
  if (lo < 0) lo -= pad;
  hi += pad;
  const x0 = labelW + 8, x1 = W - (narrow ? 8 : 24);
  const X = (v) => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);

  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': $('#t-barras').textContent });
  // prumo: o zero como fio vertical
  svg('line', { x1: X(0), x2: X(0), y1: 0, y2: H - 18, class: 'prumo' }, s);
  svg('path', { d: `M${X(0)} ${H - 18} l4 5 l-4 6 l-4 -6 z`, fill: 'var(--latao)' }, s);

  rows.forEach((r, k) => {
    const y = top + k * rowH;
    const barY = narrow ? y + 26 : y + 12;
    const barH = 20;
    const g = svg('g', { class: 'alvo', tabindex: 0 }, s);
    const nome = nomeCurto(r.nome);
    if (narrow) {
      const t = svg('text', { x: X(Math.min(0, lo)) + 8, y: y + 16, 'font-size': 14, 'font-weight': 600 }, g);
      t.textContent = nome + ' ';
      const ts = svg('tspan', { 'font-size': 12, 'font-weight': 400, class: 'muted' }, t);
      ts.textContent = `${r.ano_inicio}–${r.ano_fim}`;
    } else {
      const t = svg('text', { x: 0, y: y + 27, 'font-size': 14, 'font-weight': 600 }, g);
      t.textContent = nome;
      const sub = svg('text', { x: 0, y: y + 43, 'font-size': 12, class: 'muted' }, g);
      sub.textContent = `${r.ano_inicio}–${r.ano_fim}`;
    }

    if (r.valor === null) {
      const nt = svg('text', { x: X(0) + 8, y: barY + 15, 'font-size': 13, class: 'muted' }, g);
      nt.textContent = r.motivo ? `sem dado (${r.motivo})` : 'sem dado comparável';
    } else {
      const a = X(Math.min(0, r.valor)), b = X(Math.max(0, r.valor));
      svg('rect', { class: 'barra', x: a, y: barY, width: Math.max(2, b - a), height: barH, rx: 4,
        fill: 'var(--brasil)', 'fill-opacity': r.qualidade === 'parcial' ? 0.55 : 1 }, g);
      const neg = r.valor < 0;
      const rv = r.referencia?.valor;
      const refX = rv !== null && rv !== undefined ? X(rv) : null;
      let lxv = neg ? a - 6 : b + 6;
      if (refX !== null && !neg && refX + 9 > b - 2 && refX - 9 < b + 60) lxv = Math.max(b, refX) + 14;
      if (refX !== null && neg && refX - 9 < a + 2 && refX + 9 > a - 60) lxv = Math.min(a, refX) - 14;
      const vt = svg('text', { x: lxv, y: barY + 15, 'font-size': 14, 'font-weight': 600, 'text-anchor': neg ? 'end' : 'start' }, g);
      vt.textContent = fmtValor(r.valor, un, { sinal: variacao });
      const extras = [];
      if (posicao.has(r.slug)) extras.push(`${posicao.get(r.slug)}º de ${posicao.total}`);
      if (r.qualidade === 'parcial') extras.push('parcial');
      if (r.cobertura[0] < r.cobertura[1]) extras.push(`${r.cobertura[0]} de ${r.cobertura[1]} anos`);
      if (extras.length) {
        const et = svg('text', { x: lxv, y: barY + 32, 'font-size': 12, class: 'muted', 'text-anchor': neg ? 'end' : 'start' }, g);
        et.textContent = extras.join(' · ');
      }
    }
    if (r.referencia && r.referencia.valor !== null) {
      const rx = X(r.referencia.valor), cy = barY + barH / 2;
      svg('path', { d: `M${rx} ${cy - 7} l7 7 l-7 7 l-7 -7 z`, fill: 'var(--papel)', stroke: REF_COR(d.referencia), 'stroke-width': 2.5 }, g);
    }
    const tipHtml = `<strong>${nome}</strong> (${r.ano_inicio}–${r.ano_fim})<br>Brasil: ${fmtValor(r.valor, un, { sinal: variacao })}` +
      (r.referencia ? `<br>${refNome}: ${fmtValor(r.referencia.valor, un, { sinal: variacao })}<br>Diferença: ${fmtValor(r.diferenca, unidadeVariacao(ind.unidade), { sinal: true })}` : '') +
      (posicao.has(r.slug) ? `<br>Posição: ${posicao.get(r.slug)}º de ${posicao.total}` : '') +
      `<br>Anos com dado: ${r.cobertura[0]} de ${r.cobertura[1]}${r.qualidade === 'parcial' ? ' · inclui dado parcial' : ''}`;
    g.addEventListener('mousemove', (e) => showTip(tipHtml, e.clientX, e.clientY));
    g.addEventListener('mouseleave', hideTip);
    g.addEventListener('focus', () => { const bb = g.getBoundingClientRect(); showTip(tipHtml, bb.left + 40, bb.top); });
    g.addEventListener('blur', hideTip);
  });
  box.appendChild(s);
}

function renderTable() {
  const d = state.data;
  const ind = d.indicador;
  const un = ind.agregacao === 'variacao' ? unidadeVariacao(ind.unidade) : ind.unidade;
  const ref = d.referencia ? state.catalog.referencias.find((r) => r.slug === d.referencia)?.nome : null;
  const linhas = d.governos.map((g) => `<tr><td>${nomeCurto(g.nome)}</td><td>${g.ano_inicio}–${g.ano_fim}</td>
    <td class="num">${fmtValor(g.valor, un, { sinal: ind.agregacao === 'variacao' })}</td>
    <td class="num">${g.cobertura[0]} de ${g.cobertura[1]}</td><td>${g.qualidade || '—'}</td>
    ${ref ? `<td class="num">${fmtValor(g.referencia?.valor, un)}</td><td class="num">${fmtValor(g.diferenca, unidadeVariacao(ind.unidade), { sinal: true })}</td>` : ''}</tr>`).join('');
  $('#tabela-numeros').innerHTML = `<table><thead><tr><th>Governo</th><th>Período</th><th class="num">Brasil</th>
    <th class="num">Anos com dado</th><th>Qualidade</th>${ref ? `<th class="num">${ref}</th><th class="num">Diferença</th>` : ''}</tr></thead>
    <tbody>${linhas}</tbody></table>`;
}

// ---------- linha ano a ano ----------
function renderLine() {
  const d = state.data;
  const ind = d.indicador;
  const box = $('#grafico-linha');
  box.innerHTML = '';
  const br = d.serie.brasil;
  const rf = d.serie.referencia || [];
  const refNome = d.referencia ? state.catalog.referencias.find((r) => r.slug === d.referencia)?.nome : null;
  $('#legenda-linha').innerHTML = `<span><i style="border-color:var(--brasil)"></i>Brasil</span>` +
    (refNome ? `<span><i class="tracejado" style="border-color:${REF_COR(d.referencia)}"></i>${refNome}</span>` : '') +
    `<span><i class="tracejado" style="border-color:var(--chumbo)"></i>Ano parcial</span>`;
  if (!br.length) { box.innerHTML = '<p class="vazio">Sem série anual para este indicador.</p>'; return; }

  const govs = state.catalog.governos;
  const anoIni = 1995, anoFim = Math.max(...govs.map((g) => g.ano_fim));
  const W = Math.max(320, box.clientWidth - 16), H = 300;
  const m = { l: 44, r: 12, t: 30, b: 28 };
  const vals = [...br, ...rf].map((o) => o.valor);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const pad = (hi - lo || 1) * 0.1; lo -= lo < 0 ? pad : 0; hi += pad;
  const X = (a) => m.l + ((a - anoIni) / (anoFim - anoIni)) * (W - m.l - m.r);
  const Y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${ind.nome}, ano a ano` });

  // faixas dos governos (alternadas) com o nome no topo
  govs.forEach((g, k) => {
    const xa = X(g.ano_inicio - 0.5), xb = X(g.ano_fim + 0.5);
    if (k % 2 === 0) svg('rect', { x: xa, y: m.t, width: xb - xa, height: H - m.t - m.b, class: 'faixa' }, s);
    const sel = state.gov.has(g.slug);
    const fs = W < 560 ? 10 : 12;
    const largura = xb - xa;
    const cabe = (txt) => txt.length * fs * 0.58 <= largura - 2;
    const cheio = nomeCurto(g.nome);
    const curto = cheio.split(' ')[0];
    const rotulo = cabe(cheio) ? cheio : cabe(curto) ? curto : curto.slice(0, Math.max(1, Math.floor((largura - 2) / (fs * 0.58)))) ;
    const t = svg('text', { x: (xa + xb) / 2, y: m.t - 10, 'font-size': fs, 'text-anchor': 'middle',
      'font-weight': sel ? 600 : 400, class: sel ? '' : 'muted' }, s);
    t.textContent = rotulo;
    const ti = svg('title', {}, t); ti.textContent = `${cheio} (${g.ano_inicio}–${g.ano_fim})`;
  });
  // grade e eixo y
  const passo = (() => {
    const bruto = (hi - lo) / 4, p10 = 10 ** Math.floor(Math.log10(bruto)), f = bruto / p10;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p10;
  })();
  lo = Math.floor(lo / passo) * passo; hi = Math.ceil(hi / passo) * passo;
  for (let v = lo; v <= hi + passo / 2; v += passo) {
    svg('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: 'grade' }, s);
    const t = svg('text', { x: m.l - 6, y: Y(v) + 4, 'font-size': 11, 'text-anchor': 'end', class: 'muted' }, s);
    t.textContent = nf(passo < 1 ? 1 : 0).format(Math.abs(v) < 1e-9 ? 0 : v);
  }
  if (lo < 0) svg('line', { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), class: 'prumo', 'stroke-width': 1.5 }, s);
  for (let a = anoIni; a <= anoFim; a += 5) {
    const t = svg('text', { x: X(a), y: H - 8, 'font-size': 11, 'text-anchor': 'middle', class: 'muted' }, s);
    t.textContent = a;
  }

  const desenha = (serie, cor, tracejado) => {
    const oficial = serie.filter((o) => o.qualidade !== 'parcial');
    const segs = [];
    let cur = [];
    for (const o of oficial) {
      if (cur.length && o.ano !== cur[cur.length - 1].ano + 1) { segs.push(cur); cur = []; }
      cur.push(o);
    }
    if (cur.length) segs.push(cur);
    for (const sg of segs) {
      svg('path', { d: sg.map((o, i) => `${i ? 'L' : 'M'}${X(o.ano)} ${Y(o.valor)}`).join(' '), fill: 'none',
        stroke: cor, 'stroke-width': 2, 'stroke-dasharray': tracejado ? '6 4' : 'none', 'stroke-linejoin': 'round' }, s);
    }
    // ano parcial: tracejado curto até o ponto, marcador vazado
    for (const o of serie.filter((x) => x.qualidade === 'parcial')) {
      const prev = serie.find((x) => x.ano === o.ano - 1);
      if (prev) svg('path', { d: `M${X(prev.ano)} ${Y(prev.valor)} L${X(o.ano)} ${Y(o.valor)}`, stroke: cor, 'stroke-width': 2, 'stroke-dasharray': '2 3', fill: 'none' }, s);
      svg('circle', { cx: X(o.ano), cy: Y(o.valor), r: 4.5, fill: 'var(--papel)', stroke: cor, 'stroke-width': 2 }, s);
    }
  };
  if (rf.length) desenha(rf, REF_COR(d.referencia), true);
  desenha(br, 'var(--brasil)', false);

  // cursor e dica
  const cursor = svg('line', { y1: m.t, y2: H - m.b, stroke: 'var(--chumbo)', 'stroke-width': 1, visibility: 'hidden' }, s);
  const capa = svg('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' }, s);
  const porAno = new Map(br.map((o) => [o.ano, o]));
  const refAno = new Map(rf.map((o) => [o.ano, o]));
  const un = ind.unidade;
  capa.addEventListener('mousemove', (e) => {
    const pt = s.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const loc = pt.matrixTransform(s.getScreenCTM().inverse());
    const ano = Math.round(anoIni + ((loc.x - m.l) / (W - m.l - m.r)) * (anoFim - anoIni));
    const g = govs.find((x) => ano >= x.ano_inicio && ano <= x.ano_fim);
    cursor.setAttribute('x1', X(ano)); cursor.setAttribute('x2', X(ano)); cursor.setAttribute('visibility', 'visible');
    const o = porAno.get(ano), r = refAno.get(ano);
    showTip(`<strong>${ano}</strong>${g ? ` · ${nomeCurto(g.nome)}` : ''}<br>Brasil: ${o ? fmtValor(o.valor, un) + (o.qualidade === 'parcial' ? ' (parcial)' : '') : 'sem dado'}` +
      (refNome ? `<br>${refNome}: ${r ? fmtValor(r.valor, un) : 'sem dado'}` : ''), e.clientX, e.clientY);
  });
  capa.addEventListener('mouseleave', () => { cursor.setAttribute('visibility', 'hidden'); hideTip(); });
  box.appendChild(s);
}

// ---------- contexto ----------
function renderContext() {
  const d = state.data;
  const box = $('#contexto');
  box.innerHTML = '';
  const SINAL = { favoravel: '▲', desfavoravel: '▼', medida: '◆', neutro: '○' };
  const ROT = { favoravel: 'A favor', desfavoravel: 'Contra', medida: 'Medida', neutro: 'Informação' };
  for (const c of d.contexto) {
    const g = d.governos.find((x) => x.slug === c.governo);
    const art = document.createElement('article');
    art.innerHTML = `<h3>${nomeCurto(g.nome)}<small>${g.ano_inicio}–${g.ano_fim}</small></h3>` +
      `<ul>${c.fatores.map((f) => `<li><span class="sinal ${f.efeito}" title="${ROT[f.efeito]}" aria-label="${ROT[f.efeito]}">${SINAL[f.efeito]}</span>
        <span><strong>${f.nome}</strong>${f.texto}${f.fonte ? ` <span class="muted">Fonte: ${f.fonte}.</span>` : ''}</span></li>`).join('')}</ul>` +
      (g.nota ? `<p class="nota" style="margin:10px 0 0">${g.nota}</p>` : '');
    box.appendChild(art);
  }
}

// ---------- fontes ----------
function renderSources() {
  const d = state.data;
  const f = d.fontes[0];
  const coleta = f.coletado_em ? new Date(f.coletado_em).toLocaleDateString('pt-BR') : '—';
  const refFonte = d.referencia ? ' A referência internacional vem da mesma fonte e metodologia.' : '';
  $('#fontes').innerHTML = `<p><strong>${f.nome}</strong><span class="selo">${NIVEL[f.nivel] || f.nivel}</span>
    · coletado em ${coleta} · <a href="${f.url}" target="_blank" rel="noopener">conferir na fonte</a></p>
    <p class="ressalva">${d.indicador.ressalva}${refFonte}</p>
    <p class="ressalva"><a href="/metodologia">Como o Prumo calcula médias, variações e o contexto</a></p>`;
  $('#atualizado').textContent = state.catalog.atualizado_em
    ? `Dados atualizados em ${new Date(state.catalog.atualizado_em).toLocaleDateString('pt-BR')}.` : '';
}

function renderPrintMeta() {
  $('#meta-impressao').innerHTML = `Gerado pelo Prumo (Hack Tech Farm) em ${new Date().toLocaleString('pt-BR')}.<br>
    Para conferir e reabrir esta mesma visualização: ${location.href}`;
}

// ---------- ações ----------
$('#btn-link').onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); $('#btn-link').textContent = 'Link copiado'; }
  catch { prompt('Copie o link:', location.href); }
  setTimeout(() => { $('#btn-link').textContent = 'Copiar link'; }, 2000);
};
$('#btn-pdf').onclick = () => window.print();
addEventListener('beforeprint', () => { document.querySelector('.tabela').open = true; renderPrintMeta(); });
let rz;
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (state.data) { renderBars(); renderLine(); } if (state.rdata) renderRanking(); }, 150); });


// ---------- Pergunte ao Prumo ----------
const escHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');

// Texto da IA → HTML seguro: escapa tudo, depois parágrafos, listas "- ", **negrito** e [n] → link da fonte.
function textoParaHtml(texto, nFontes) {
  const inline = (l) => escHtml(l)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/ ?\[(\d{1,2})\]/g, (m, n) => (Number(n) >= 1 && Number(n) <= nFontes ? `<sup><a href="#fonte-${n}">[${n}]</a></sup>` : m));
  const item = /^\s*[-•]\s+/;
  // agrupa linhas consecutivas de lista em <ul>, o resto em <p>
  return texto.split(/\n{2,}/).map((bloco) => {
    const partes = [];
    for (const l of bloco.split('\n').filter((x) => x.trim())) {
      const tipo = item.test(l) ? 'ul' : 'p';
      if (partes.at(-1)?.tipo === tipo) partes.at(-1).linhas.push(l); else partes.push({ tipo, linhas: [l] });
    }
    return partes.map((g) => (g.tipo === 'ul'
      ? `<ul>${g.linhas.map((l) => `<li>${inline(l.replace(item, ''))}</li>`).join('')}</ul>`
      : `<p>${g.linhas.map(inline).join('<br>')}</p>`)).join('');
  }).join('');
}

function renderResposta(pergunta, r) {
  const fontes = r.fontes || [];
  const dados = r.dados || [];
  const quando = new Date(r.gerado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const itensDados = dados.map((d) => `<li><span><span class="selo selo-prumo">${escHtml(d.rotulo)}</span>${escHtml(d.nome)}${d.fonte ? ` — ${escHtml(d.fonte)}` : ''}${d.url ? ` · <a href="${escHtml(safeUrl(d.url))}" target="_blank" rel="noopener">conferir na fonte</a>` : ''}</span></li>`).join('');
  const itensWeb = fontes.map((f) => `<li id="fonte-${f.n}"><span>[${f.n}] <span class="selo selo-${escHtml(f.tipo)}">${escHtml(f.rotulo)}</span><a href="${escHtml(safeUrl(f.url))}" target="_blank" rel="noopener">${escHtml(f.titulo)}</a></span>${f.trecho ? `<span class="trecho">“${escHtml(f.trecho)}”</span>` : ''}</li>`).join('');
  $('#resposta').innerHTML = `
    <p class="resposta-pergunta">${escHtml(pergunta)}</p>
    <div class="resposta-corpo">${textoParaHtml(r.texto, fontes.length)}</div>
    ${itensDados ? `<h3>Dados do Prumo usados</h3><ul class="lista-fontes">${itensDados}</ul>` : ''}
    ${itensWeb ? `<h3>Fontes pesquisadas</h3><ul class="lista-fontes">${itensWeb}</ul>` : ''}
    <p class="resposta-meta">Resposta gerada por IA em ${quando}${r.em_cache ? ' (já respondida antes; não gastou consulta)' : ''}. Pode conter erros: confira os números nos gráficos e nas fontes.</p>`;
}

let modoAdmin = false;
function mostrarCota(c) {
  const info = $('#cota-info');
  if (modoAdmin) { info.textContent = 'Modo administrador: consultas sem cota neste navegador.'; return; }
  if (!c) { info.textContent = ''; return; }
  info.textContent = c.gratis_restantes > 0
    ? 'Você tem 1 consulta grátis. Perguntas já respondidas antes não gastam consulta.'
    : 'Sua consulta grátis já foi usada. Créditos e assinatura chegam em breve; perguntas já respondidas antes continuam liberadas.';
}

async function initPergunte() {
  let st;
  try { st = await (await fetch('/api/v1/ask', { credentials: 'same-origin' })).json(); } catch { return; }
  if (!st?.disponivel) return;
  $('#pergunte').hidden = false;
  modoAdmin = Boolean(st.admin);
  mostrarCota(st.cota);
  const campo = $('#campo-pergunta');
  campo.addEventListener('input', () => { $('#contador').textContent = `${campo.value.length} / 500`; });
  $('#form-pergunta').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pergunta = campo.value.trim();
    if (pergunta.length < 8) { campo.focus(); return; }
    const btn = $('#btn-perguntar');
    btn.disabled = true;
    $('#resposta').innerHTML = '<p class="carregando">Consultando os dados e as fontes. Pode levar até um minuto.</p>';
    try {
      const res = await fetch('/api/v1/ask', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pergunta }) });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) {
        $('#resposta').innerHTML = `<p class="aviso">${escHtml(r.error || `erro ${res.status}`)}</p>`;
      } else {
        renderResposta(pergunta, r);
      }
      if (r.cota) mostrarCota(r.cota);
    } catch {
      $('#resposta').innerHTML = '<p class="aviso">Sem conexão com o servidor. Tente de novo.</p>';
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- início ----------
(async function init() {
  try {
    const r = await fetch('/api/v1/catalog');
    if (!r.ok) throw new Error(`erro ${r.status}`);
    state.catalog = await r.json();
  } catch (e) {
    aviso(`Não foi possível carregar o catálogo: ${e.message}. Tente recarregar a página.`);
    return;
  }
  const u = readUrl();
  const inds = state.catalog.indicadores.map((i) => i.slug);
  state.ind = inds.includes(u.ind) ? u.ind : (inds.includes('pib-anual') ? 'pib-anual' : inds.includes('pib-anual-wb') ? 'pib-anual-wb' : inds[0]);
  const todos = state.catalog.governos.map((g) => g.slug);
  const pedidos = (u.gov || '').split(',').filter((g) => todos.includes(g));
  state.gov = new Set(pedidos.length ? pedidos : todos);
  state.ref = state.catalog.referencias.some((r) => r.slug === u.ref) ? u.ref : '';
  state.ordem = u.ordem === 'valor' ? 'valor' : 'periodo';
  state.rmodo = u.rmodo;
  state.rpesos = u.rpesos;
  buildControls();
  loadRanking();
  load();
  initPergunte();
})();
