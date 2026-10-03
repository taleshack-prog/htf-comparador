#!/usr/bin/env node
// Servidor local que imita a Vercel: URLs limpas (cleanUrls), rewrites do vercel.json
// e funções em /api. Lê variáveis de um arquivo .env, se existir.
//   node tools/serve.mjs            → http://localhost:3010
//   PORT=4000 node tools/serve.mjs
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3010);

// .env simples: CHAVE=valor por linha, # para comentário; não sobrescreve o ambiente.
const envFile = join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const config = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.pdf': 'application/pdf',
};

function rewrite(pathname) {
  for (const r of config.rewrites || []) if (r.source === pathname) return r.destination;
  return pathname;
}

async function runFunction(pathname, req, res) {
  const file = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, '') + '.js');
  if (!file.startsWith(join(ROOT, 'api')) || !existsSync(file)) return false;
  const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`);
  await mod.default(req, res);
  return true;
}

async function serveStatic(pathname, res) {
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const candidates = safe.endsWith('/')
    ? [join(PUBLIC, safe, 'index.html')]
    : [join(PUBLIC, safe), join(PUBLIC, safe + '.html'), join(PUBLIC, safe, 'index.html')];
  for (const c of candidates) {
    if (!c.startsWith(PUBLIC)) continue;
    try {
      if ((await stat(c)).isFile()) {
        res.writeHead(200, { 'Content-Type': TYPES[extname(c)] || 'application/octet-stream' });
        res.end(await readFile(c));
        return true;
      }
    } catch {}
  }
  return false;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  // cleanUrls: /pagina.html → /pagina
  if (url.pathname.endsWith('.html')) {
    const clean = url.pathname.slice(0, -5).replace(/\/index$/, '/') || '/';
    res.writeHead(308, { Location: clean });
    return res.end();
  }
  const pathname = rewrite(url.pathname);
  try {
    if (pathname.startsWith('/api/') && (await runFunction(pathname, req, res))) return;
    if (await serveStatic(pathname, res)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500');
  }
}).listen(PORT, () => console.log(`Comparador local em http://localhost:${PORT}`));
