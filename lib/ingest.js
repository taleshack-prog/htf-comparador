import { ADAPTERS } from '../adapters/index.js';
import { runAdapter } from '../adapters/base.js';

// Roda os adaptadores em paralelo (fontes independentes): o tempo total vira o da fonte mais
// lenta, e não a soma de todas, que passava do limite de 5 minutos da função. A falha de um
// não afeta os outros; devolve o resultado de cada um, na ordem do catálogo.
// Adaptadores do mesmo servidor (ex.: os quatro do Banco Mundial) rodam em sequência entre si,
// para não sobrecarregar uma API que já oscila; servidores diferentes rodam em paralelo.
export const servidorDe = (slug) => slug.split('-')[0];

export async function ingestAll(pool, { only, log = () => {}, fetchImpl } = {}) {
  const list = only ? ADAPTERS.filter((a) => only.includes(a.slug)) : ADAPTERS;
  const results = {};
  const filas = new Map();
  for (const a of list) {
    const k = servidorDe(a.slug);
    if (!filas.has(k)) filas.set(k, []);
    filas.get(k).push(a);
  }
  await Promise.all([...filas.values()].map(async (fila) => {
    for (const adapter of fila) {
      results[adapter.slug] = await runAdapter(adapter, { pool, log, ...(fetchImpl && { fetchImpl }) })
        .catch((err) => ({ status: 'falhou', error: String(err?.message || err) }));
    }
  }));
  return Object.fromEntries(list.map((a) => [a.slug, results[a.slug]]));   // na ordem do catálogo
}
