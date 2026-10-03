#!/usr/bin/env node
// Roda a ingestão à mão.
//   node tools/ingest.mjs                 → todos os adaptadores
//   node tools/ingest.mjs bcb-sgs worldbank
import '../lib/env.js';
import { getPool, closePool } from '../lib/db.js';
import { ingestAll } from '../lib/ingest.js';

const only = process.argv.slice(2);
try {
  const results = await ingestAll(getPool(), { only: only.length ? only : undefined, log: console.log });
  if (Object.values(results).some((r) => r.status !== 'ok')) process.exitCode = 1;
} finally {
  await closePool();
}
