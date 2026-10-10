// GET /api/v1/integridade — leitura auxiliar, fora da nota (ver lib/integridade.js).
import { getPool } from '../../lib/db.js';
import { integridade } from '../../lib/integridade.js';
import { sendJson } from '../../lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'método não permitido' }, { Allow: 'GET' });
  try {
    sendJson(res, 200, await integridade(getPool()), { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' });
  } catch (err) {
    console.error(err);
    sendJson(res, 503, { error: 'dados indisponíveis no momento; tente de novo em instantes' });
  }
}
