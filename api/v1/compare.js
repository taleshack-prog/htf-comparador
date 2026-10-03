// GET /api/v1/compare?ind=<slug>&gov=fhc,lula,...&ref=<slug>
// Médias por governo, série anual, fontes e fatores de contexto.
import { getPool } from '../../lib/db.js';
import { compare } from '../../lib/compare.js';
import { sendJson } from '../../lib/http.js';

const SLUG = /^[a-z0-9-]{1,60}$/;

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'método não permitido' }, { Allow: 'GET' });
  const url = new URL(req.url, 'http://x');
  const ind = url.searchParams.get('ind') || '';
  const gov = (url.searchParams.get('gov') || '').split(',').filter(Boolean);
  const ref = url.searchParams.get('ref') || '';
  if (!SLUG.test(ind) || gov.some((g) => !SLUG.test(g)) || (ref && !SLUG.test(ref))) {
    return sendJson(res, 400, { error: 'parâmetros inválidos: use ind=<indicador>&gov=a,b&ref=<referência>' });
  }
  try {
    const data = await compare(getPool(), { indicador: ind, governos: gov, referencia: ref || null });
    if (!data) return sendJson(res, 404, { error: `indicador "${ind}" não existe` });
    sendJson(res, 200, data, { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=86400' });
  } catch (err) {
    console.error(err);
    sendJson(res, 503, { error: 'dados indisponíveis no momento; tente de novo em instantes' });
  }
}
