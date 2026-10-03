// Fetch falso para os testes: responde conforme a URL, com payloads no formato
// real das APIs e valores SINTÉTICOS (ver test/fixtures/README.md).

export function sgsMonthly(year, values) {
  return values.map((v, i) => ({ data: `01/${String(i + 1).padStart(2, '0')}/${year}`, valor: String(v) }));
}

export function sidraPayload(quarters) {
  // quarters: { '202301': '8.0', ... }
  return [
    { NC: 'Nível Territorial (Código)', D1C: 'Brasil (Código)', D2C: 'Trimestre (Código)', D2N: 'Trimestre', V: 'Valor' },
    ...Object.entries(quarters).map(([code, v]) => ({ NC: '1', D1C: '1', D2C: code, D2N: code, V: v })),
  ];
}

export function wbPayload(rows) {
  return [{ page: 1, pages: 1, per_page: 2000, total: rows.length }, rows];
}

export function fakeFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    for (const [pattern, body] of routes) {
      if (url.includes(pattern)) {
        const payload = typeof body === 'function' ? body(url) : body;
        return { ok: true, status: 200, json: async () => payload };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  impl.calls = calls;
  return impl;
}
