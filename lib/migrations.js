// Migrações SQL versionadas em /migrations, aplicadas em ordem, cada uma em transação.
// A tabela schema_migrations guarda nome e checksum: arquivo já aplicado que mudou
// depois é erro (migração publicada não se edita; cria-se uma nova).
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MIGRATIONS_DIR = join(ROOT, 'migrations');
export const SEEDS_DIR = join(ROOT, 'seeds');

const sha = (s) => createHash('sha256').update(s).digest('hex');

export async function listMigrationFiles(dir = MIGRATIONS_DIR) {
  return (await readdir(dir)).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
}

async function ensureTable(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    nome VARCHAR(120) PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    aplicada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

export async function migrate(pool, { log = console.log } = {}) {
  const client = await pool.connect();
  try {
    // Trava consultiva: dois deploys simultâneos não migram ao mesmo tempo.
    await client.query('SELECT pg_advisory_lock(727011)');
    await ensureTable(client);
    const { rows } = await client.query('SELECT nome, checksum FROM schema_migrations');
    const applied = new Map(rows.map((r) => [r.nome, r.checksum]));
    const files = await listMigrationFiles();
    const done = [];
    for (const file of files) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      const sum = sha(sql);
      if (applied.has(file)) {
        if (applied.get(file) !== sum) {
          throw new Error(`Migração ${file} foi alterada depois de aplicada. Crie uma nova migração.`);
        }
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (nome, checksum) VALUES ($1, $2)', [file, sum]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Falha na migração ${file}: ${err.message}`);
      }
      log(`aplicada: ${file}`);
      done.push(file);
    }
    return done;
  } finally {
    await client.query('SELECT pg_advisory_unlock(727011)').catch(() => {});
    client.release();
  }
}

export async function seed(pool, { log = console.log } = {}) {
  const files = (await readdir(SEEDS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = await readFile(join(SEEDS_DIR, file), 'utf8');
    await pool.query(sql);
    log(`seed: ${file}`);
  }
}

// Usado pelo /health/summary: quantas migrações existem no código e não estão no banco.
export async function pendingMigrations(pool) {
  const files = await listMigrationFiles();
  let applied = [];
  try {
    const { rows } = await pool.query('SELECT nome FROM schema_migrations');
    applied = rows.map((r) => r.nome);
  } catch {
    return files; // tabela nem existe: tudo pendente
  }
  return files.filter((f) => !applied.includes(f));
}
