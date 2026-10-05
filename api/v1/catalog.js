// GET /api/v1/catalog — indicadores com dados, governos (janelas) e referências internacionais.
import { getPool } from '../../lib/db.js';
import { getCatalog } from '../../lib/compare.js';
import { sendJson } from '../../lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'método não permitido' }, { Allow: 'GET' });
  try {
    const data = await getCatalog(getPool());
    // versão = código publicado + última coleta: muda a URL das consultas quando qualquer um dos dois muda
    const codigo = (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7);
    data.versao = `${codigo}-${Date.parse(data.atualizado_em || '') || 0}`;
    sendJson(res, 200, data, { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' });
  } catch (err) {
    console.error(err);
    sendJson(res, 503, { error: 'dados indisponíveis no momento; tente de novo em instantes' });
  }
}
