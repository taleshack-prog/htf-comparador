// Modo administrador da consulta com IA (testes do dono).
// POST { token } com o AI_ADMIN_TOKEN → cookie HttpOnly por 30 dias; DELETE → sai do modo.
import { timingSafeEqual } from 'node:crypto';
import { sendJson } from '../../lib/http.js';
import { admCookieValor } from '../../lib/ask.js';

async function lerJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 2000) throw new Error('grande demais'); }
  return raw ? JSON.parse(raw) : {};
}
const igual = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export default async function handler(req, res) {
  const esperado = process.env.AI_ADMIN_TOKEN;
  if (req.method === 'DELETE') {
    return sendJson(res, 200, { admin: false }, { 'Set-Cookie': 'prumo_adm=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict' });
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'método não permitido' }, { Allow: 'POST, DELETE' });
  if (!esperado) return sendJson(res, 503, { error: 'AI_ADMIN_TOKEN não configurado na Vercel' });
  let body;
  try { body = await lerJson(req); } catch { return sendJson(res, 400, { error: 'JSON inválido' }); }
  await new Promise((r) => setTimeout(r, 400));   // freia tentativas em série
  if (!igual(body?.token || '', esperado)) return sendJson(res, 403, { error: 'token incorreto' });
  sendJson(res, 200, { admin: true }, {
    'Set-Cookie': `prumo_adm=${admCookieValor()}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict`,
  });
}
