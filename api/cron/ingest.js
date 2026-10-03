// GET /api/cron/ingest — chamado pelo Vercel Cron (vercel.json → crons).
// A Vercel envia "Authorization: Bearer $CRON_SECRET"; sem isso, 401.
import { getPool } from '../../lib/db.js';
import { ingestAll } from '../../lib/ingest.js';
import { sendJson, hasBearer } from '../../lib/http.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (!hasBearer(req, process.env.CRON_SECRET)) return sendJson(res, 401, { error: 'não autorizado' });
  const results = await ingestAll(getPool(), { log: console.log });
  sendJson(res, 200, { results });
}
