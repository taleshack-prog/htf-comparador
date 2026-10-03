// Utilitários HTTP para as funções em /api (assinatura Node da Vercel: (req, res)).
import { timingSafeEqual } from 'node:crypto';

export function sendJson(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

// Compara "Authorization: Bearer <token>" em tempo constante.
export function hasBearer(req, expected) {
  if (!expected) return false;
  const header = req.headers?.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  const a = Buffer.from(match[1]);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
