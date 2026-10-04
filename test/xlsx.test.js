import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readXlsx, colIndex, serialParaData } from '../lib/xlsx.js';

test('xlsx: abas, textos compartilhados (com runs), números, inline, linhas puladas', () => {
  const wb = readXlsx(readFileSync(new URL('./fixtures/mini.xlsx', import.meta.url)));
  assert.deepEqual(wb.abas, ['1.4 & PIB', 'Outra']);
  const l = wb.linhas('1.4 & PIB');
  assert.equal(l[0][0], 'Discriminação');
  assert.equal(l[0][1], 35431);
  assert.equal(l[1], undefined);
  assert.equal(l[2][0], 'Pessoal e Encargos Sociais');
  assert.equal(l[2][1], 3.25);
  assert.equal(l[2][26], 'x<y');
  assert.equal(wb.linhas('Outra')[0][0], true);
  assert.throws(() => wb.linhas('Nada'), /não existe/);
  assert.throws(() => readXlsx(Buffer.from('não é zip')), /zip/);
});

test('xlsx: coluna e data serial', () => {
  assert.equal(colIndex('A1'), 0);
  assert.equal(colIndex('AA3'), 26);
  assert.deepEqual(serialParaData(35431), { ano: 1997, mes: 1 });
});
