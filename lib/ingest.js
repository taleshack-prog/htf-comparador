import { ADAPTERS } from '../adapters/index.js';
import { runAdapter } from '../adapters/base.js';

// Roda os adaptadores em sequência; devolve o resultado de cada um.
export async function ingestAll(pool, { only, log = () => {}, fetchImpl } = {}) {
  const list = only ? ADAPTERS.filter((a) => only.includes(a.slug)) : ADAPTERS;
  const results = {};
  for (const adapter of list) {
    results[adapter.slug] = await runAdapter(adapter, { pool, log, ...(fetchImpl && { fetchImpl }) });
  }
  return results;
}
