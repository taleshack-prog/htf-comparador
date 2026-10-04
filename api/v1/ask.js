// GET  /api/v1/ask → { disponivel, cota: { gratis_restantes } }
// POST /api/v1/ask { pergunta } → resposta da IA com fontes rotuladas
// O visitante anônimo é identificado por um cookie aleatório (HttpOnly); no banco só fica o hash.
import { getPool } from '../../lib/db.js';
import { sendJson, hasBearer } from '../../lib/http.js';
import { atender, statusCota, hashDe, novoVisitante, VISITANTE_RE, admCookieValor } from '../../lib/ask.js';

const COOKIE = 'prumo_v';

function lerVisitante(req) {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers?.cookie || '');
  return m && VISITANTE_RE.test(m[1]) ? { id: m[1], novo: false } : { id: novoVisitante(), novo: true };
}
function ehAdmin(req) {
  if (hasBearer(req, process.env.AI_ADMIN_TOKEN)) return true;
  const esperado = admCookieValor();
  const m = /(?:^|;\s*)prumo_adm=([a-f0-9]{64})/.exec(req.headers?.cookie || '');
  return Boolean(esperado && m && m[1] === esperado);
}
const cookieHeader = (id) => `${COOKIE}=${id}; Path=/; Max-Age=63072000; HttpOnly; Secure; SameSite=Lax`;
const ipDe = (req) => String(req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'] || '').split(',')[0].trim();

async function lerJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 10_000) throw new Error('corpo grande demais'); }
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  const v = lerVisitante(req);
  const extra = v.novo ? { 'Set-Cookie': cookieHeader(v.id) } : {};
  try {
    if (req.method === 'GET') {
      const cota = await statusCota(getPool(), hashDe(`v:${v.id}`));
      return sendJson(res, 200, { disponivel: Boolean(process.env.ANTHROPIC_API_KEY), cota, admin: ehAdmin(req) }, extra);
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'método não permitido' }, { Allow: 'GET, POST' });
    let body;
    try { body = await lerJson(req); } catch { return sendJson(res, 400, { error: 'JSON inválido' }, extra); }
    const admin = ehAdmin(req);
    const r = await atender(getPool(), { pergunta: body?.pergunta, visitante: v.id, ip: ipDe(req), admin });
    sendJson(res, r.status, r.body, extra);
  } catch (err) {
    console.error(err);
    sendJson(res, 503, { error: 'serviço indisponível no momento; tente de novo em instantes' }, extra);
  }
}
