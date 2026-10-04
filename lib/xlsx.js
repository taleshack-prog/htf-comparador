// Leitor mínimo de .xlsx sem dependências (zip + XML), suficiente para planilhas de
// dados públicos: lê as abas, os textos compartilhados e os valores das células.
// Não interpreta fórmulas (usa o valor calculado gravado no arquivo) nem estilos.
import { inflateRawSync } from 'node:zlib';

function unzip(buf) {
  // fim do diretório central: assinatura 0x06054b50, procurada de trás para frente
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('xlsx: arquivo não é um zip válido');
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let k = 0; k < total; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('xlsx: diretório central corrompido');
    const metodo = buf.readUInt16LE(p + 10);
    const tamComp = buf.readUInt32LE(p + 20);
    const nLen = buf.readUInt16LE(p + 28), xLen = buf.readUInt16LE(p + 30), cLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + nLen);
    files.set(nome, { metodo, tamComp, local });
    p += 46 + nLen + xLen + cLen;
  }
  return (nome) => {
    const f = files.get(nome);
    if (!f) return null;
    const ini = f.local + 30 + buf.readUInt16LE(f.local + 26) + buf.readUInt16LE(f.local + 28);
    const dados = buf.subarray(ini, ini + f.tamComp);
    if (f.metodo === 0) return dados.toString('utf8');
    if (f.metodo === 8) return inflateRawSync(dados).toString('utf8');
    throw new Error(`xlsx: compressão ${f.metodo} não suportada`);
  };
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()]);
const attr = (tag, nome) => { const m = new RegExp(`\\b${nome}="([^"]*)"`).exec(tag); return m ? decode(m[1]) : null; };
const textos = (xml) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');

// "AB12" → índice de coluna 27 (0-based)
export function colIndex(ref) {
  const letras = /^[A-Z]+/.exec(ref)[0];
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

export function readXlsx(buf) {
  const ler = unzip(buf);
  const wb = ler('xl/workbook.xml');
  if (!wb) throw new Error('xlsx: workbook.xml ausente');
  const rels = ler('xl/_rels/workbook.xml.rels') || '';
  const alvo = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], 'Id'), attr(m[0], 'Target')]));
  const ss = ler('xl/sharedStrings.xml');
  const shared = ss ? [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textos(m[1])) : [];
  const abas = [...wb.matchAll(/<sheet\b[^>]*\/?>/g)].map((m) => {
    const t = alvo.get(attr(m[0], 'r:id')) || '';
    return { nome: attr(m[0], 'name'), caminho: t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}` };
  });
  const cache = new Map();
  function linhas(nome) {
    if (cache.has(nome)) return cache.get(nome);
    const aba = abas.find((a) => a.nome === nome);
    if (!aba) throw new Error(`xlsx: aba "${nome}" não existe`);
    const xml = ler(aba.caminho) || '';
    const out = [];
    for (const r of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const linha = [];
      for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(c[1], 'r');
        const tipo = attr(c[1], 't');
        const corpo = c[2] || '';
        const v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1];
        let valor = null;
        if (tipo === 's') valor = v !== undefined ? shared[Number(v)] ?? null : null;
        else if (tipo === 'inlineStr') valor = textos(corpo);
        else if (tipo === 'str' || tipo === 'e') valor = v !== undefined ? decode(v) : null;
        else if (tipo === 'b') valor = v === '1';
        else if (v !== undefined) valor = Number(v);
        linha[ref ? colIndex(ref) : linha.length] = valor;
      }
      out[Number(attr(r[1], 'r')) - 1 || out.length] = linha;
    }
    cache.set(nome, out);
    return out;
  }
  return { abas: abas.map((a) => a.nome), linhas };
}

// Data serial do Excel (base 1899-12-30) → { ano, mes }
export function serialParaData(n) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000);
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
}
