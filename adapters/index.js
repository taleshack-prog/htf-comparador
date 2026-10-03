import bcbSgs from './bcb-sgs.js';
import ibgeSidra from './ibge-sidra.js';
import worldbank from './worldbank.js';

// Ordem de execução da ingestão. Cada adaptador é independente:
// a falha de um não impede os outros.
export const ADAPTERS = [bcbSgs, ibgeSidra, worldbank];
