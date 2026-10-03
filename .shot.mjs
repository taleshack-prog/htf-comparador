import { chromium } from 'playwright';
const b = await chromium.launch();
for (const [name, w, scheme, q] of [['desk', 1280, 'light', '?ind=pib-anual'], ['desk-ipca', 1280, 'light', '?ind=ipca-anual&ordem=valor'], ['wb-ref', 1280, 'dark', '?ind=pib-anual-wb&ref=america-latina'], ['mobile', 390, 'light', '?ind=pib-anual']]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.goto('http://localhost:3020/' + q, { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  await p.screenshot({ path: `/tmp/shot-${name}.png`, fullPage: true });
  console.log(name, errs.join(' | ') || 'sem erros');
  await p.close();
}
await b.close();
