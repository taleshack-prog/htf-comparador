// Sondagem dos arquivos do Tesouro (RTN e emendas) para escrever os adaptadores.
// Uso: node tools/sonda-tesouro.mjs  → imprime a estrutura, sem gravar nada.
import { readXlsx, serialParaData } from '../lib/xlsx.js';

const UA = { 'User-Agent': 'Prumo/1.0 (+https://hacktechfarm.com.br)' };
const CKAN = 'https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=';
const RTN = 'ab56485b-9c40-4efb-8563-9ce3e1973c4b';
const EMENDAS = '83e419da-1552-46bf-bfc3-05160b2c46c9';
const curto = (v) => (v === null || v === undefined ? '·' : typeof v === 'number' ? (v > 30000 && v < 60000 ? `${v}=${JSON.stringify(serialParaData(v))}` : +v.toFixed(3)) : String(v).slice(0, 40));
const resumo = (linha = []) => { const a = [...linha]; return a.length > 8 ? [...a.slice(0, 4).map(curto), '…', ...a.slice(-3).map(curto), `(${a.length} col)`].join(' | ') : a.map(curto).join(' | '); };

async function recursos(id) {
  const r = await fetch(CKAN + id, { headers: UA });
  const j = await r.json();
  return j.result.resources.map((x) => ({ nome: x.name, formato: x.format, url: x.url }));
}

console.log('=== RTN: recursos ===');
const rr = await recursos(RTN);
rr.forEach((x) => console.log(`- ${x.nome} [${x.formato}] ${x.url}`));
const xl = rr.find((x) => /xlsx/i.test(x.formato) && /s[ée]rie/i.test(x.nome));
const buf = Buffer.from(await (await fetch(xl.url, { headers: UA })).arrayBuffer());
console.log(`\nbaixado: ${(buf.length / 1e6).toFixed(1)} MB`);
const wb = readXlsx(buf);
console.log('abas:', wb.abas.join(' || '));
for (const aba of wb.abas) {
  const linhas = wb.linhas(aba);
  const alvo = linhas.map((l, i) => [i, l]).filter(([, l]) => l && l.some((c) => typeof c === 'string' && /pessoal|^\s*pib|produto interno/i.test(c)));
  if (!alvo.length) continue;
  console.log(`\n--- aba "${aba}" (${linhas.length} linhas) ---`);
  linhas.slice(0, 6).forEach((l, i) => console.log(`  L${i + 1}: ${resumo(l)}`));
  alvo.slice(0, 6).forEach(([i, l]) => console.log(`  >L${i + 1}: ${resumo(l)}`));
}

console.log('\n=== Emendas: recursos ===');
const re = await recursos(EMENDAS);
re.forEach((x) => console.log(`- ${x.nome} [${x.formato}] ${x.url}`));
const csvR = re.find((x) => /csv/i.test(x.formato));
const raw = Buffer.from(await (await fetch(csvR.url, { headers: UA })).arrayBuffer());
let txt = raw.toString('utf8');
if (txt.includes('�')) txt = raw.toString('latin1');
const ls = txt.split(/\r?\n/).filter(Boolean);
console.log(`\nbaixado: ${(raw.length / 1e6).toFixed(1)} MB, ${ls.length} linhas`);
ls.slice(0, 4).forEach((l, i) => console.log(`  L${i + 1}: ${l.slice(0, 300)}`));
const sep = (ls[0].match(/;/g) || []).length > (ls[0].match(/,/g) || []).length ? ';' : ',';
const cab = ls[0].split(sep).map((c) => c.replace(/^"|"$/g, '').trim());
const iAno = cab.findIndex((c) => /ano/i.test(c));
const iVal = cab.findIndex((c) => /valor/i.test(c));
const iTipo = cab.findIndex((c) => /tipo.*emenda|emenda.*tipo/i.test(c));
console.log(`separador "${sep}", colunas: ano=${cab[iAno]} valor=${cab[iVal]} tipo=${cab[iTipo]}`);
const num = (s) => Number(String(s).replace(/"/g, '').replace(/\./g, '').replace(',', '.'));
const soma = {};
for (const l of ls.slice(1)) {
  const c = l.split(sep);
  const ano = String(c[iAno]).replace(/"/g, '').slice(0, 4);
  const k = `${ano}${iTipo >= 0 ? ' ' + String(c[iTipo]).replace(/"/g, '') : ''}`;
  soma[k] = (soma[k] || 0) + (num(c[iVal]) || 0);
}
Object.entries(soma).sort().forEach(([k, v]) => console.log(`  ${k}: R$ ${(v / 1e9).toFixed(2)} bi`));
