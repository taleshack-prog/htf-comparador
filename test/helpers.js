// Fetch falso para os testes: responde conforme a URL, com payloads no formato
// real das APIs e valores SINTÉTICOS (ver test/fixtures/README.md).

export function sgsMonthly(year, values) {
  return values.map((v, i) => ({ data: `01/${String(i + 1).padStart(2, '0')}/${year}`, valor: String(v) }));
}

// periodo: 'Trimestre' | 'Mês'; points: { 'AAAAPP': 'valor' }
export function sidraPayload(points, { periodo = 'Trimestre', variavel = 'Taxa de desocupação', categoria } = {}) {
  const header = { NC: 'Nível Territorial (Código)', V: 'Valor', D1C: 'Brasil (Código)',
    D2C: `${periodo} (Código)`, D2N: periodo, D3C: 'Variável (Código)', D3N: 'Variável' };
  if (categoria) Object.assign(header, { D4C: 'Setores (Código)', D4N: 'Setores' });
  return [header, ...Object.entries(points).map(([code, v]) => ({
    NC: '1', V: v, D1C: '1', D2C: code, D2N: code, D3C: '1', D3N: variavel,
    ...(categoria ? { D4C: '1', D4N: categoria } : {}),
  }))];
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
