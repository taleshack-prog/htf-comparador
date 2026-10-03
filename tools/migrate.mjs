#!/usr/bin/env node
// Aplica migrações pendentes e o catálogo inicial (seeds idempotentes).
//   node tools/migrate.mjs            → migrações + seeds
//   node tools/migrate.mjs --no-seed  → só migrações
import '../lib/env.js';
import { getPool, closePool } from '../lib/db.js';
import { migrate, seed } from '../lib/migrations.js';

const pool = getPool();
try {
  const done = await migrate(pool);
  if (!done.length) console.log('nenhuma migração pendente');
  if (!process.argv.includes('--no-seed')) await seed(pool);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
