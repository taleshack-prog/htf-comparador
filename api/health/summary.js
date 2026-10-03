// GET /health/summary — lido pelo painel "Saúde dos apps" do site HTF.
// Protegido por "Authorization: Bearer <MONITOR_TOKEN>" (no site: MONITOR_TOKEN_COMPARADOR).
import { getPool } from '../../lib/db.js';
import { buildSummary } from '../../lib/health.js';
import { sendJson, hasBearer } from '../../lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'método não permitido' }, { Allow: 'GET' });
  if (!hasBearer(req, process.env.MONITOR_TOKEN)) return sendJson(res, 401, { error: 'não autorizado' });

  let pool;
  try {
    pool = getPool();
  } catch (err) {
    return sendJson(res, 200, {
      app: 'Comparador de Governos',
      status: 'down',
      detail: err.message,
      checked_at: new Date().toISOString(),
      checks: [{ name: 'banco', status: 'down', detail: err.message }],
    });
  }
  // O painel trata 5xx como "down"; o estado real vai no corpo, sempre com 200.
  sendJson(res, 200, await buildSummary(pool));
}
