#!/usr/bin/env node
// Build sem dependências: copia site/ para public/ e acrescenta ?v=<hash> a cada
// referência de CSS/JS (cache-busting, mesma solução do site HTF).
import { readdir, readFile, writeFile, mkdir, rm, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'site');
const OUT = join(ROOT, 'public');

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const hashOf = async (file) =>
  createHash('sha256').update(await readFile(file)).digest('hex').slice(0, 10);

await rm(OUT, { recursive: true, force: true });
const files = await walk(SRC);

// Hash de cada asset, indexado pelo caminho público ("/css/app.css").
const hashes = new Map();
for (const f of files) {
  if (['.css', '.js'].includes(extname(f))) {
    hashes.set('/' + relative(SRC, f).split('\\').join('/'), await hashOf(f));
  }
}

for (const f of files) {
  const dest = join(OUT, relative(SRC, f));
  await mkdir(dirname(dest), { recursive: true });
  if (extname(f) === '.html') {
    let html = await readFile(f, 'utf8');
    html = html.replace(/(href|src)="(\/[^"?#]+\.(?:css|js))"/g, (m, attr, path) =>
      hashes.has(path) ? `${attr}="${path}?v=${hashes.get(path)}"` : m);
    await writeFile(dest, html);
  } else {
    await copyFile(f, dest);
  }
}

const total = (await walk(OUT)).length;
console.log(`build: ${total} arquivo(s) em public/ (${hashes.size} com cache-busting)`);
await stat(join(OUT, 'index.html')); // falha o build se a página inicial sumir
