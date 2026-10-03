-- Catálogo inicial: só definições (fontes, entidades, janelas, indicadores).
-- NENHUM valor numérico de indicador entra por aqui: observações vêm só dos adaptadores.
-- Idempotente: pode rodar quantas vezes quiser.

-- Fontes (seção 10.1) -------------------------------------------------------
INSERT INTO dim_source (slug, nome, url_base, metodo, nivel, governamental, paywall) VALUES
  ('ibge',        'IBGE',                                 'https://www.ibge.gov.br',              'api_rest',           'oficial_br', TRUE,  FALSE),
  ('bcb',         'Banco Central do Brasil (SGS)',        'https://www.bcb.gov.br',               'api_rest',           'oficial_br', TRUE,  FALSE),
  ('tesouro',     'Tesouro Nacional',                     'https://www.tesourotransparente.gov.br','arquivo',           'oficial_br', TRUE,  FALSE),
  ('inpe',        'INPE (PRODES/DETER)',                  'https://terrabrasilis.dpi.inpe.br',    'dataset_versionado', 'oficial_br', TRUE,  FALSE),
  ('inep',        'INEP',                                 'https://www.gov.br/inep',              'dataset_versionado', 'oficial_br', TRUE,  FALSE),
  ('ipea',        'Ipea',                                 'https://www.ipea.gov.br',              'api_rest',           'oficial_br', TRUE,  FALSE),
  ('worldbank',   'Banco Mundial (World Bank Open Data)', 'https://data.worldbank.org',           'api_rest',           'organismo_internacional', TRUE, FALSE),
  ('fmi',         'Fundo Monetário Internacional',        'https://www.imf.org',                  'api_rest',           'organismo_internacional', TRUE, FALSE),
  ('ocde',        'OCDE (inclui PISA)',                   'https://www.oecd.org',                 'dataset_versionado', 'organismo_internacional', TRUE, FALSE),
  ('onu',         'ONU / PNUD',                           'https://hdr.undp.org',                 'dataset_versionado', 'organismo_internacional', TRUE, FALSE),
  ('oms',         'Organização Mundial da Saúde',         'https://www.who.int',                  'api_rest',           'organismo_internacional', TRUE, FALSE),
  ('cepal',       'CEPAL',                                'https://www.cepal.org',                'api_rest',           'organismo_internacional', TRUE, FALSE),
  ('ti',          'Transparência Internacional',          'https://www.transparency.org',         'dataset_versionado', 'pesquisa_independente', FALSE, FALSE),
  ('vdem',        'V-Dem Institute',                      'https://www.v-dem.net',                'dataset_versionado', 'pesquisa_independente', FALSE, FALSE),
  ('owid',        'Our World in Data',                    'https://ourworldindata.org',           'api_rest',           'pesquisa_independente', FALSE, FALSE),
  ('fgv-ibre',    'FGV IBRE',                             'https://portalibre.fgv.br',            'arquivo',            'pesquisa_independente', FALSE, FALSE),
  ('economist',   'The Economist',                        'https://www.economist.com',            'busca', 'imprensa', FALSE, TRUE),
  ('ft',          'Financial Times',                      'https://www.ft.com',                   'busca', 'imprensa', FALSE, TRUE),
  ('bloomberg',   'Bloomberg',                            'https://www.bloomberg.com',            'busca', 'imprensa', FALSE, TRUE),
  ('reuters',     'Reuters',                              'https://www.reuters.com',              'busca', 'imprensa', FALSE, FALSE),
  ('ap',          'Associated Press',                     'https://apnews.com',                   'busca', 'imprensa', FALSE, FALSE),
  ('bbc',         'BBC',                                  'https://www.bbc.com',                  'busca', 'imprensa', FALSE, FALSE),
  ('wsj',         'The Wall Street Journal',              'https://www.wsj.com',                  'busca', 'imprensa', FALSE, TRUE),
  ('valor',       'Valor Econômico',                      'https://valor.globo.com',              'busca', 'imprensa', FALSE, TRUE),
  ('folha',       'Folha de S.Paulo',                     'https://www.folha.uol.com.br',         'busca', 'imprensa', FALSE, TRUE),
  ('estadao',     'O Estado de S. Paulo',                 'https://www.estadao.com.br',           'busca', 'imprensa', FALSE, TRUE),
  ('oglobo',      'O Globo',                              'https://oglobo.globo.com',             'busca', 'imprensa', FALSE, TRUE),
  ('poder360',    'Poder360',                             'https://www.poder360.com.br',          'busca', 'imprensa', FALSE, FALSE),
  ('lupa',        'Agência Lupa',                         'https://lupa.uol.com.br',              'busca', 'checagem', FALSE, FALSE),
  ('aosfatos',    'Aos Fatos',                            'https://www.aosfatos.org',             'busca', 'checagem', FALSE, FALSE),
  ('comprova',    'Projeto Comprova',                     'https://projetocomprova.com.br',       'busca', 'checagem', FALSE, FALSE)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome, url_base = EXCLUDED.url_base, metodo = EXCLUDED.metodo,
  nivel = EXCLUDED.nivel, governamental = EXCLUDED.governamental, paywall = EXCLUDED.paywall;

-- Entidades -------------------------------------------------------------------
INSERT INTO dim_country (iso3, slug, nome_pt, nome_en, tipo) VALUES
  ('BRA', 'brasil',    'Brasil',    'Brazil',    'pais'),
  ('SGP', 'singapura', 'Singapura', 'Singapore', 'pais'),
  ('SWE', 'suecia',    'Suécia',    'Sweden',    'pais'),
  ('LCN', 'america-latina', 'América Latina e Caribe', 'Latin America & Caribbean', 'grupo_pares'),
  ('WLD', 'mundo',          'Mundo',                   'World',                     'grupo_pares'),
  ('MIC', 'renda-media',    'Países de renda média',   'Middle income',             'grupo_pares'),
  (NULL,  'fhc',       'FHC (1995–2002)',       'Cardoso (1995–2002)',        'governo_brasil'),
  (NULL,  'lula',      'Lula I e II (2003–2010)','Lula I–II (2003–2010)',     'governo_brasil'),
  (NULL,  'dilma',     'Dilma (2011–2016)',      'Rousseff (2011–2016)',      'governo_brasil'),
  (NULL,  'temer',     'Temer (2017–2018)',      'Temer (2017–2018)',         'governo_brasil'),
  (NULL,  'bolsonaro', 'Bolsonaro (2019–2022)',  'Bolsonaro (2019–2022)',     'governo_brasil'),
  (NULL,  'lula-3',    'Lula III (2023–2026)',   'Lula III (2023–2026)',      'governo_brasil')
ON CONFLICT (slug) DO UPDATE SET
  iso3 = EXCLUDED.iso3, nome_pt = EXCLUDED.nome_pt, nome_en = EXCLUDED.nome_en, tipo = EXCLUDED.tipo;

-- Janelas de governo (anos civis) ----------------------------------------------
INSERT INTO dim_government_window (entity_id, ano_inicio, ano_fim, presidente, mandato_ordem, nota)
SELECT c.id, v.ini, v.fim, v.pres, v.ord, v.nota
FROM (VALUES
  ('fhc',       1995, 2002, 'Fernando Henrique Cardoso', 1, NULL),
  ('lula',      2003, 2010, 'Luiz Inácio Lula da Silva', 2, NULL),
  ('dilma',     2011, 2016, 'Dilma Rousseff',            3, 'Mandato encerrado em 31/08/2016 (impeachment). Por convenção de anos civis, 2016 fica nesta janela.'),
  ('temer',     2017, 2018, 'Michel Temer',              4, 'Assumiu em 12/05/2016 (interino) e 31/08/2016 (efetivo). Janela em anos civis completos: 2017–2018. Poucos pontos de dados: baixa significância.'),
  ('bolsonaro', 2019, 2022, 'Jair Bolsonaro',            5, NULL),
  ('lula-3',    2023, 2026, 'Luiz Inácio Lula da Silva', 6, 'Mandato em curso até 31/12/2026: dados de 2026 são parciais.')
) AS v(slug, ini, fim, pres, ord, nota)
JOIN dim_country c ON c.slug = v.slug
ON CONFLICT (entity_id) DO UPDATE SET
  ano_inicio = EXCLUDED.ano_inicio, ano_fim = EXCLUDED.ano_fim,
  presidente = EXCLUDED.presidente, mandato_ordem = EXCLUDED.mandato_ordem, nota = EXCLUDED.nota;

-- Indicadores ------------------------------------------------------------------
-- codigo_verificado = FALSE em todos: o Sprint 1 confere cada código contra a fonte
-- antes de a primeira carga ir ao ar (auditoria cruzada, CA1/CA9).
INSERT INTO dim_indicator
  (slug, nome_pt, unidade, fonte_id, direcao_otima, periodicidade, agregacao_janela,
   ressalva_metodologica, url_fonte, adaptador, codigo_externo)
SELECT v.slug, v.nome, v.un, s.id, v.dir::direcao_enum, v.per, v.agg, v.ress, v.url, v.ad, v.cod
FROM (VALUES
  ('pib-anual',  'PIB — variação real anual', '%', 'ibge', 'maior', 'anual', 'media',
     'Contas Nacionais Trimestrais do IBGE: taxa acumulada no ano até o 4º trimestre. Ano em curso fica parcial (acumulado até o último trimestre divulgado).',
     'https://www.ibge.gov.br/estatisticas/economicas/contas-nacionais.html', 'ibge-pib', '5932/v6563/c11255/90707'),
  ('ipca-anual', 'IPCA — variação anual', '%', 'ibge', 'menor', 'mensal', 'media',
     'Inflação oficial (IBGE). Valor anual composto a partir das 12 variações mensais; ano incompleto é marcado como parcial.',
     'https://www.ibge.gov.br/estatisticas/economicas/precos-e-custos/9256-indice-nacional-de-precos-ao-consumidor-amplo.html', 'ibge-ipca', '1737/v63'),
  ('desemprego', 'Taxa de desocupação', '%', 'ibge', 'menor', 'trimestral', 'media',
     'PNAD Contínua desde 2012, calculada aqui como média dos quatro trimestres do ano; o IBGE divulga a média anual por outro cálculo, que pode diferir em alguns décimos. Antes de 2012 a série oficial era a PME, com metodologia diferente: não há dado comparável para FHC e Lula I–II.',
     'https://www.ibge.gov.br/estatisticas/sociais/trabalho/9171-pesquisa-nacional-por-amostra-de-domicilios-continua-mensal.html', 'ibge-pnad', '4099/v4099'),
  ('divida-bruta', 'Dívida bruta do governo geral', '% PIB', 'bcb', 'menor', 'mensal', 'variacao',
     'DBGG, metodologia do Banco Central a partir de 2008 (posição de dezembro). Antes disso a série usa metodologia anterior.',
     'https://www.bcb.gov.br/estatisticas/estatisticasfiscais', 'bcb-sgs', '13762'),
  ('carga-tributaria', 'Carga tributária bruta', '% PIB', 'tesouro', 'menor', 'anual', 'media',
     'Estimativa do Tesouro Nacional para o governo geral.',
     'https://www.tesourotransparente.gov.br', NULL, NULL),
  ('pisa-media', 'PISA — média das três áreas', 'pontos', 'ocde', 'maior', 'trienal', 'variacao',
     'Média de Leitura, Matemática e Ciências. Edições a cada três anos (2022 adiada pela pandemia). Só entra edição oficialmente divulgada pela OCDE.',
     'https://www.oecd.org/pisa/', NULL, NULL),
  ('ipc-corrupcao', 'Índice de Percepção da Corrupção', 'pontos', 'ti', 'maior', 'anual', 'media',
     'Escala 0–100 desde 2012 (0–10 antes; não convertida automaticamente). Mede percepção, com defasagem em relação a esquemas não revelados.',
     'https://www.transparency.org/en/cpi', NULL, NULL),
  ('prodes-amazonia', 'Desmatamento na Amazônia Legal (PRODES)', 'km²', 'inpe', 'menor', 'anual', 'media',
     'Taxa anual PRODES (período agosto–julho). Valores preliminares são substituídos pelos consolidados.',
     'https://terrabrasilis.dpi.inpe.br', NULL, NULL),
  -- Séries harmonizadas do Banco Mundial: mesma fonte e metodologia para Brasil, países
  -- de referência e grupos de pares. São estas que alimentam a leitura relativa a pares.
  ('pib-anual-wb', 'PIB — variação real anual (Banco Mundial)', '%', 'worldbank', 'maior', 'anual', 'media',
     'World Bank WDI, PIB a preços constantes. Pode divergir levemente da série do IBGE por revisões e metodologia.',
     'https://data.worldbank.org/indicator/NY.GDP.MKTP.KD.ZG', 'worldbank', 'NY.GDP.MKTP.KD.ZG'),
  ('inflacao-wb', 'Inflação ao consumidor (Banco Mundial)', '%', 'worldbank', 'menor', 'anual', 'media',
     'World Bank WDI, índice de preços ao consumidor, variação anual média.',
     'https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG', 'worldbank', 'FP.CPI.TOTL.ZG'),
  ('desemprego-oit-wb', 'Desemprego, estimativa modelada OIT (Banco Mundial)', '%', 'worldbank', 'menor', 'anual', 'media',
     'Estimativa modelada da OIT para comparação entre países; não substitui a PNAD Contínua.',
     'https://data.worldbank.org/indicator/SL.UEM.TOTL.ZS', 'worldbank', 'SL.UEM.TOTL.ZS'),
  ('receita-tributaria-wb', 'Receita tributária do governo central (Banco Mundial)', '% PIB', 'worldbank', 'menor', 'anual', 'media',
     'Governo central apenas; menor que a carga tributária bruta do governo geral. Usar só para comparação entre países.',
     'https://data.worldbank.org/indicator/GC.TAX.TOTL.GD.ZS', 'worldbank', 'GC.TAX.TOTL.GD.ZS'),
  ('termos-troca-wb', 'Termos de troca (Banco Mundial)', 'índice', 'worldbank', 'maior', 'anual', 'variacao',
     'Índice de termos de troca de mercadorias (2015 = 100): preço das exportações dividido pelo das importações. Mede o ciclo de commodities a favor ou contra o país; usado no motor de contexto.',
     'https://data.worldbank.org/indicator/TT.PRI.MRCH.XD.WD', 'worldbank', 'TT.PRI.MRCH.XD.WD'),
  ('resultado-primario-fmi', 'Resultado primário do governo geral (FMI)', '% PIB', 'fmi', 'maior', 'anual', 'media',
     'Receitas menos despesas, sem contar juros, do governo geral (FMI, World Economic Outlook). Positivo = superávit. O ano corrente é estimativa do FMI e aparece como projeção.',
     'https://www.imf.org/external/datamapper/GGXONLB_NGDP@WEO/BRA', 'fmi', 'GGXONLB_NGDP'),
  ('divida-bruta-fmi', 'Dívida bruta do governo geral (FMI)', '% PIB', 'fmi', 'menor', 'anual', 'variacao',
     'Dívida bruta do governo geral pela metodologia do FMI (World Economic Outlook), que difere da metodologia do Banco Central. A variação compara o último ano do governo com o ano anterior à posse.',
     'https://www.imf.org/external/datamapper/GGXWDG_NGDP@WEO/BRA', 'fmi', 'GGXWDG_NGDP')
) AS v(slug, nome, un, src, dir, per, agg, ress, url, ad, cod)
JOIN dim_source s ON s.slug = v.src
ON CONFLICT (slug) DO UPDATE SET
  nome_pt = EXCLUDED.nome_pt, unidade = EXCLUDED.unidade, fonte_id = EXCLUDED.fonte_id,
  direcao_otima = EXCLUDED.direcao_otima, periodicidade = EXCLUDED.periodicidade,
  agregacao_janela = EXCLUDED.agregacao_janela, ressalva_metodologica = EXCLUDED.ressalva_metodologica,
  url_fonte = EXCLUDED.url_fonte, adaptador = EXCLUDED.adaptador, codigo_externo = EXCLUDED.codigo_externo;
