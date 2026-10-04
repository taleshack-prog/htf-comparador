// Adaptador do Tesouro Nacional (fonte oficial).
//  - Governo central, % do PIB, Resultado do Tesouro Nacional (planilha, aba "2.1-A" anual):
//    pessoal e encargos (4.2), despesa total (4) e tributos federais (1.1 + 1.2 + 1.3).
//  - Emendas individuais e de bancada pagas (RP6/RP7): CSV do Tesouro Transparente, somado por
//    ano e dividido pelo PIB nominal da mesma planilha do RTN.
// Os endereços dos arquivos mudam todo mês (ex.: seriehistoricajul26.xlsx), por isso são
// descobertos pela API do catálogo (CKAN) a cada coleta.
import { fetchJson, describeError, round4, USER_AGENT } from './base.js';
import { readXlsx } from '../lib/xlsx.js';

const CKAN = 'https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=';
export const RTN_ID = 'ab56485b-9c40-4efb-8563-9ce3e1973c4b';
export const EMENDAS_ID = '83e419da-1552-46bf-bfc3-05160b2c46c9';
export const RTN_PAGINA = 'https://www.tesourotransparente.gov.br/ckan/dataset/resultado-do-tesouro-nacional';
export const EMENDAS_PAGINA = 'https://www.tesourotransparente.gov.br/ckan/dataset/emendas-parlamentares';
const ABA = '2.1-A';

const qualidade = (ano, year) => (ano < year - 1 ? 'oficial' : 'parcial');

// Baixa um arquivo grande; o tempo-limite cobre conexão e leitura do corpo.
// unref(): o timer não segura o processo aberto nos scripts de linha de comando.
async function baixar(url, { fetchImpl, log, timeoutMs = 180_000 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  timer.unref?.();
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    log(`  baixando ${url}`);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw new Error(describeError(err, url));
  }
}

async function urlDoRecurso(id, teste, { fetchImpl, log }) {
  const j = await fetchJson(CKAN + id, { fetchImpl, log, timeoutMs: 30_000 });
  const r = (j?.result?.resources || []).find(teste);
  if (!r?.url) throw new Error(`Tesouro: recurso não encontrado no conjunto ${id}`);
  return r.url;
}

// ---------- RTN (planilha) ----------
const texto = (c) => (typeof c === 'string' ? c.trim() : '');
// rótulo comparável: espaços simples, sem nota de rodapé ("1/") nem hífen depois do número
const rotulo = (c) => texto(c).replace(/\s+/g, ' ').replace(/\s*\d+\/$/, '').replace(/^(\d+(?:\.\d+)*\.?)\s*-\s*/, '$1 ');

// Séries lidas da aba 2.1-A (% do PIB). "soma": linhas somadas; "opcional": pode faltar.
export const RTN_SERIES = {
  'pessoal-tesouro': [{ re: /^4\.2 Pessoal e Encargos Sociais$/i }],
  'despesa-total-tesouro': [{ re: /^4\.? DESPESA TOTAL$/i }],
  // tributos federais: receita administrada pela Receita Federal + incentivos (negativos) + contribuição ao RGPS
  'tributos-federais-tesouro': [
    { re: /^1\.1 Receita Administrada pela RFB/i },
    { re: /^1\.2 Incentivos Fiscais/i, opcional: true },
    { re: /^1\.3 Arrecada[çc][ãa]o L[íi]quida para o RGPS/i },
  ],
};

export function parseRtn(wb, now = new Date()) {
  if (!wb.abas.includes(ABA)) throw new Error(`RTN: aba ${ABA} ausente (abas: ${wb.abas.slice(0, 12).join(', ')}…)`);
  const L = wb.linhas(ABA).filter(Boolean);
  // autoverificação: a aba precisa declarar "% do PIB" no cabeçalho
  if (!L.slice(0, 6).some((l) => l.some((c) => /%\s*do\s*PIB/i.test(texto(c))))) {
    throw new Error(`RTN: aba ${ABA} não está em % do PIB`);
  }
  const cab = L.find((l) => /^Discrimina/i.test(texto(l[0])));
  const pib = L.find((l) => /^PIB Nominal/i.test(texto(l[0])));
  if (!cab || !pib) throw new Error('RTN: cabeçalho ou PIB nominal não encontrados');
  const year = now.getUTCFullYear();
  const linhasDe = {};
  for (const [ind, partes] of Object.entries(RTN_SERIES)) {
    linhasDe[ind] = [];
    for (const p of partes) {
      const l = L.find((x) => p.re.test(rotulo(x[0])));
      if (!l && !p.opcional) {
        const vistos = L.map((x) => rotulo(x[0])).filter((t) => /^\d/.test(t)).slice(0, 25).join(' | ');
        throw new Error(`RTN: linha ${p.re} não encontrada para ${ind}. Rótulos na aba: ${vistos}`);
      }
      if (l) linhasDe[ind].push(l);
    }
  }
  // se a linha 1.1 já vier "líquida de incentivos", somar a 1.2 contaria os incentivos duas vezes
  const trib = linhasDe['tributos-federais-tesouro'];
  if (/l[íi]quida de incentivos/i.test(rotulo(trib[0][0]))) {
    linhasDe['tributos-federais-tesouro'] = trib.filter((l) => !/^1\.2 Incentivos/i.test(rotulo(l[0])));
  }
  const out = { series: {}, pib: new Map() };
  for (const ind of Object.keys(RTN_SERIES)) out.series[ind] = [];
  for (let j = 1; j < cab.length; j++) {
    const ano = cab[j];
    if (!Number.isInteger(ano) || ano < 1990 || ano > year) continue;
    for (const [ind, linhas] of Object.entries(linhasDe)) {
      const vs = linhas.map((l) => l[j]);
      if (vs.some((v) => typeof v !== 'number')) continue;   // ano sem todas as parcelas
      const f = vs.reduce((a, b) => a + b, 0);
      if (f <= 0 || f >= 1) throw new Error(`RTN: ${ind} de ${ano} fora da escala de fração (${f})`);
      out.series[ind].push({ ano, valor: round4(f * 100), qualidade: qualidade(ano, year) });
    }
    if (typeof pib[j] === 'number' && pib[j] > 0) out.pib.set(ano, pib[j] * 1e6);   // R$ milhões → R$
  }
  for (const [ind, obs] of Object.entries(out.series)) {
    if (obs.length < 10) throw new Error(`RTN: só ${obs.length} anos lidos para ${ind}`);
  }
  out.pessoal = out.series['pessoal-tesouro'];
  return out;
}

// ---------- Emendas (CSV ";" em fluxo) ----------
export function parseValor(s) {
  const t = String(s ?? '').replace(/"/g, '').trim();
  if (!t) return null;
  const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t);
  return Number.isFinite(n) ? n : null;
}

export async function somarEmendas(chunks) {
  const dec = new TextDecoder('utf-8');
  let resto = '';
  let idx = null;
  const porAno = new Map();
  let linhas = 0;
  const processar = (linha) => {
    if (!linha.trim()) return;
    const c = linha.split(';');
    if (!idx) {
      const cab = c.map((x) => x.replace(/^﻿/, '').replace(/"/g, '').trim());
      idx = { ano: cab.indexOf('Ano'), valor: cab.indexOf('Valor'), tipo: cab.indexOf('Nome Emenda') };
      if (idx.ano < 0 || idx.valor < 0) throw new Error(`Emendas: colunas "Ano"/"Valor" ausentes (${cab.join(', ')})`);
      return;
    }
    const ano = Number(String(c[idx.ano]).replace(/"/g, ''));
    const v = parseValor(c[idx.valor]);
    if (!Number.isInteger(ano) || v === null) return;
    const a = porAno.get(ano) || { total: 0, individual: 0, bancada: 0 };
    a.total += v;
    const tipo = String(c[idx.tipo] || '');
    if (/individual/i.test(tipo)) a.individual += v; else if (/bancada/i.test(tipo)) a.bancada += v;
    porAno.set(ano, a);
    linhas++;
  };
  for await (const chunk of chunks) {
    resto += typeof chunk === 'string' ? chunk : dec.decode(chunk, { stream: true });
    const partes = resto.split(/\r?\n/);
    resto = partes.pop();
    partes.forEach(processar);
  }
  resto += dec.decode();
  processar(resto);
  if (!linhas) throw new Error('Emendas: nenhuma linha válida no CSV');
  return { porAno, linhas };
}

export default {
  slug: 'tesouro',
  version: 'tesouro@2',
  async fetch({ fetchImpl, log }) {
    const xlsxUrl = await urlDoRecurso(RTN_ID, (r) => /xlsx/i.test(r.format) && /s[ée]rie hist/i.test(r.name), { fetchImpl, log });
    const res = await baixar(xlsxUrl, { fetchImpl, log });
    const rtnBuf = Buffer.from(await res.arrayBuffer());
    const csvUrl = await urlDoRecurso(EMENDAS_ID, (r) => /csv/i.test(r.format), { fetchImpl, log });
    const r2 = await baixar(csvUrl, { fetchImpl, log });
    const emendas = await somarEmendas(r2.body);
    log(`  emendas: ${emendas.linhas} pagamentos somados`);
    return { rtnBuf, emendas };
  },
  normalize(raw, { now }) {
    const rtn = parseRtn(readXlsx(raw.rtnBuf), now);
    const year = now.getUTCFullYear();
    const obs = Object.entries(rtn.series).flatMap(([indicator, serie]) =>
      serie.map((o) => ({ entity: 'brasil', indicator, ...o, url: RTN_PAGINA })));
    for (const [ano, a] of raw.emendas.porAno) {
      const pib = rtn.pib.get(ano);
      if (!pib) continue;   // ano sem PIB anual publicado (ano corrente) fica de fora
      obs.push({ entity: 'brasil', indicator: 'emendas-tesouro', ano, valor: round4((a.total / pib) * 100),
        qualidade: qualidade(ano, year), url: EMENDAS_PAGINA });
    }
    return obs;
  },
};
