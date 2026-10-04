// Mostra as últimas consultas à IA e o erro de cada uma (diagnóstico).
// Uso: node tools/ia-erros.mjs [quantidade]
import '../lib/env.js';
import { getPool, closePool } from '../lib/db.js';

const n = Math.min(Number(process.argv[2]) || 5, 50);
const { rows } = await getPool().query(
  `SELECT id, to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') AS quando, status,
          gratis, cache_hit, custo_usd::FLOAT AS custo_usd, duracao_ms, left(pergunta, 50) AS pergunta, erro
   FROM ai_query ORDER BY id DESC LIMIT $1`, [n]);
for (const r of rows) {
  console.log(`#${r.id} ${r.quando} ${r.status}${r.cache_hit ? ' (cache)' : ''} custo=${r.custo_usd ?? '-'} ${r.duracao_ms ?? '-'}ms`);
  console.log(`   pergunta: ${r.pergunta}`);
  if (r.erro) console.log(`   ERRO: ${r.erro}`);
}
if (!rows.length) console.log('nenhuma consulta registrada');
await closePool();
