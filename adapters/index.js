import bcbSgs from './bcb-sgs.js';
import { ibgePnad, ibgeIpca, ibgePib } from './ibge-sidra.js';
import worldbank from './worldbank.js';

// Ordem de execução da ingestão. Cada adaptador é independente:
// a falha de um não impede os outros.
export const ADAPTERS = [ibgePib, ibgeIpca, ibgePnad, bcbSgs, worldbank];
export const ADAPTER_SLUGS = ADAPTERS.map((a) => a.slug);
