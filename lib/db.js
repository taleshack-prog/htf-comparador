// Conexão única com o Postgres do Comparador (serviço próprio no Railway).
// Em funções serverless o módulo é reaproveitado entre invocações quentes,
// então o pool fica no escopo do módulo e é pequeno.
import pg from 'pg';

let pool;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL não definida');
    pool = new pg.Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX || 3),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export function query(text, params) {
  return getPool().query(text, params);
}

// Executa fn(client) dentro de uma transação; desfaz tudo se algo falhar.
export async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
