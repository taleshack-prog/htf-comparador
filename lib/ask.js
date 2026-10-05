// Regras de uso da consulta com IA, separadas do HTTP para poder testar:
//   1. Resposta em cache (mesma pergunta normalizada, até 7 dias) sai de graça e não gasta cota.
//   2. Teto diário global de consultas novas (AI_DAILY_CAP) e por IP (AI_IP_DAILY) limitam o custo.
//   3. Cada visitante tem 1 consulta grátis. A reserva é atômica no banco; se a consulta
//      falhar ou for fora do escopo, a cota é devolvida.
//   4. Depois da grátis: créditos/assinatura (próxima fase). Por ora, 402 com explicação.
import { createHash, randomBytes } from 'node:crypto';
import { perguntar, chaveCache, DEFAULT_MODEL } from './ai.js';

export const CACHE_DIAS = 7;
export const VISITANTE_RE = /^[a-f0-9]{32}$/;
export const novoVisitante = () => randomBytes(16).toString('hex');

export function limites(env = process.env) {
  return {
    diario: Number(env.AI_DAILY_CAP || 100),
    porIp: Number(env.AI_IP_DAILY || 5),
    modelo: env.AI_MODEL || DEFAULT_MODEL,
  };
}

const sal = (env) => env.AUTH_SECRET || env.CRON_SECRET || 'prumo';
export const hashDe = (valor, env = process.env) => createHash('sha256').update(`${sal(env)}|${valor}`).digest('hex');

// Cookie do modo administrador: guarda um derivado do AI_ADMIN_TOKEN, nunca o token.
export const admCookieValor = (env = process.env) => (env.AI_ADMIN_TOKEN ? hashDe(`adm:${env.AI_ADMIN_TOKEN}`, env) : null);

export function validarPergunta(p) {
  if (typeof p !== 'string') return 'envie a pergunta em texto';
  const t = p.trim();
  if (t.length < 8) return 'a pergunta está curta demais';
  if (t.length > 500) return 'a pergunta passa de 500 caracteres';
  return null;
}

export async function statusCota(pool, visitante) {
  const { rows } = await pool.query('SELECT 1 FROM ai_query WHERE visitante = $1 AND gratis LIMIT 1', [visitante]);
  return { gratis_restantes: rows.length ? 0 : 1 };
}

async function buscarCache(pool, chave) {
  const { rows: [c] } = await pool.query(
    `UPDATE ai_answer_cache SET usos = usos + 1
     WHERE chave_hash = $1 AND created_at > NOW() - make_interval(days => $2) RETURNING resposta`, [chave, CACHE_DIAS]);
  return c?.resposta || null;
}

async function contarIp(pool, ipHash, dia) {
  const { rows: [r] } = await pool.query(
    `INSERT INTO rate_limit (chave, contagem, expira_em) VALUES ($1, 1, NOW() + INTERVAL '1 day')
     ON CONFLICT (chave) DO UPDATE SET contagem = rate_limit.contagem + 1 RETURNING contagem`,
    [`ia-ip:${ipHash}:${dia}`]);
  return r.contagem;
}

// Retorna { status, body }.
export async function atender(pool, { pergunta, visitante, ip, admin = false, env = process.env, fetchImpl, now = new Date() }) {
  const erro = validarPergunta(pergunta);
  if (erro) return { status: 400, body: { error: erro } };
  if (!env.ANTHROPIC_API_KEY) return { status: 503, body: { error: 'a consulta com IA ainda não está configurada' } };
  pergunta = pergunta.trim();
  const lim = limites(env);
  const visitanteHash = hashDe(`v:${visitante}`, env);
  const ipHash = hashDe(`ip:${ip || 'desconhecido'}`, env);
  const { rows: [ver] } = await pool.query(
    `SELECT COALESCE(to_char(MAX(terminado_em), 'YYYY-MM-DD'), '') AS v FROM ingestion_run WHERE status = 'ok'`);
  const chave = chaveCache(pergunta, lim.modelo, ver.v);

  const emCache = await buscarCache(pool, chave);
  if (emCache) {
    await pool.query(`INSERT INTO ai_query (visitante, ip_hash, pergunta, cache_hit, status, modelo, custo_usd)
                      VALUES ($1, $2, $3, TRUE, 'ok', $4, 0)`, [visitanteHash, ipHash, pergunta.slice(0, 600), lim.modelo]);
    return { status: 200, body: { ...emCache, em_cache: true, cota: await statusCota(pool, visitanteHash) } };
  }

  if (!admin) {
    const { rows: [d] } = await pool.query(
      `SELECT COUNT(*)::INT AS n FROM ai_query WHERE NOT cache_hit AND status IN ('ok','pendente')
       AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`);
    if (d.n >= lim.diario) {
      return { status: 503, body: { error: 'limite diário de consultas atingido; tente amanhã', codigo: 'limite_diario' } };
    }
    const dia = now.toISOString().slice(0, 10);
    if (await contarIp(pool, ipHash, dia) > lim.porIp) {
      return { status: 429, body: { error: 'muitas consultas desta rede hoje; tente amanhã', codigo: 'limite_ip' } };
    }
  }

  // Reserva atômica da consulta grátis (índice único parcial em visitante WHERE gratis).
  const { rows: [reserva] } = await pool.query(
    `INSERT INTO ai_query (visitante, ip_hash, pergunta, gratis, modelo)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING id`,
    [visitanteHash, ipHash, pergunta.slice(0, 600), !admin, lim.modelo]);
  if (!reserva) {
    return { status: 402, body: {
      error: 'Sua consulta grátis já foi usada. Créditos e assinatura chegam em breve; enquanto isso, os gráficos e o ranking seguem livres.',
      codigo: 'cota_esgotada', cota: { gratis_restantes: 0 } } };
  }

  try {
    const r = await perguntar({ pergunta, pool, apiKey: env.ANTHROPIC_API_KEY, fetchImpl, model: lim.modelo, now });
    const recusada = r.fora_do_escopo;
    await pool.query(
      `UPDATE ai_query SET status = $2, gratis = gratis AND NOT $3, tokens_in = $4, tokens_out = $5, buscas = $6,
              custo_usd = $7, duracao_ms = $8, erro = $9 WHERE id = $1`,
      [reserva.id, recusada ? 'recusada' : 'ok', recusada, r.uso.entrada + r.uso.cache_leitura + r.uso.cache_escrita,
        r.uso.saida, r.uso.buscas, r.uso.custo_usd, r.duracao_ms, r.sem_busca ? `sem busca: ${r.sem_busca}`.slice(0, 500)
          : r.dominios_removidos ? `domínios bloqueados removidos: ${r.dominios_removidos.join(', ')}`.slice(0, 500) : null]);
    const publico = { texto: r.texto, fontes: r.fontes, dados: r.dados, fora_do_escopo: recusada, modelo: r.modelo, gerado_em: r.gerado_em };
    if (!recusada) {
      await pool.query(`INSERT INTO ai_answer_cache (chave_hash, resposta) VALUES ($1, $2)
                        ON CONFLICT (chave_hash) DO UPDATE SET resposta = EXCLUDED.resposta, created_at = NOW(), usos = 0`,
        [chave, JSON.stringify(publico)]);
    }
    return { status: 200, body: { ...publico, em_cache: false, cota: await statusCota(pool, visitanteHash) } };
  } catch (err) {
    // falha não consome a cota: tira a marca de grátis e registra o erro
    await pool.query(`UPDATE ai_query SET status = 'erro', gratis = FALSE, erro = $2 WHERE id = $1`,
      [reserva.id, String(err.message).slice(0, 500)]).catch(() => {});
    console.error('IA:', err.message);
    const sobrecarga = err.status === 429 || err.status === 529;
    return { status: 502, body: { error: sobrecarga
      ? 'o serviço de IA está sobrecarregado; tente de novo em alguns minutos (sua consulta grátis não foi gasta)'
      : 'não foi possível concluir a resposta; tente de novo (sua consulta grátis não foi gasta)' } };
  }
}
