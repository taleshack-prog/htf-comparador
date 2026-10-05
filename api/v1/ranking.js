// GET /api/v1/ranking?modo=oficial|trajetoria|relativo&pesos=pib-anual:2,ipca-anual:1&defasagem=0|1
import { getPool } from '../../lib/db.js';
import { ranking, MODOS, DEFASAGENS } from '../../lib/ranking.js';
import { sendJson } from '../../lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'método não permitido' }, { Allow: 'GET' });
  const url = new URL(req.url, 'http://x');
  const modo = url.searchParams.get('modo') || 'oficial';
  const pesos = url.searchParams.get('pesos') || '';
  const defasagem = Number(url.searchParams.get('defasagem') || 0);
  if (!(modo in MODOS) || !/^[a-z0-9:,.\-]{0,300}$/.test(pesos) || !DEFASAGENS.includes(defasagem)) {
    return sendJson(res, 400, { error: 'parâmetros inválidos: modo=oficial|trajetoria|relativo, pesos=indicador:peso,... e defasagem=0|1' });
  }
  try {
    sendJson(res, 200, await ranking(getPool(), { modo, pesos, defasagem }),
      { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' });
  } catch (err) {
    console.error(err);
    sendJson(res, 503, { error: 'dados indisponíveis no momento; tente de novo em instantes' });
  }
}
