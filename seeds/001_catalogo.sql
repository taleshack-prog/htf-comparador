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
  ('dilma',     2011, 2015, 'Dilma Rousseff',            3, 'Afastada em 12/05/2016 e destituída em 31/08/2016. Regra do Prumo: o ano de transição fica com quem governou a maior parte dele, por isso 2016 conta para o governo seguinte.'),
  ('temer',     2016, 2018, 'Michel Temer',              4, 'Assumiu em 12/05/2016 (interino) e 31/08/2016 (efetivo), governando cerca de 7,5 dos 12 meses de 2016; pela regra do ano de transição, 2016 conta para este governo. Janela curta: poucos pontos de dados.'),
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
     'Receitas menos despesas, sem contar juros, do governo geral (FMI, Fiscal Monitor). Positivo = superávit. O ano corrente é estimativa do FMI e aparece como projeção.',
     'https://www.imf.org/external/datamapper/GGXONLB_G01_GDP_PT@FM/BRA', 'fmi', 'GGXONLB_G01_GDP_PT'),
  ('divida-bruta-fmi', 'Dívida bruta do governo geral (FMI)', '% PIB', 'fmi', 'menor', 'anual', 'variacao',
     'Dívida bruta do governo geral pela metodologia do FMI (World Economic Outlook), a mesma da série 4537 do Banco Central (metodologia usada até 2007, que inclui os títulos na carteira do Banco Central). É a única série oficial com o ano-base de 2002; a série atual do Banco Central (13762) começa em 2006 e dá níveis menores. Entra na nota como ritmo anual: último ano do governo menos o ano anterior à posse, dividido pelos anos. Inclui o que o governo não controla sozinho: juros sobre a dívida recebida (a Selic é definida pelo Banco Central), câmbio e o efeito do crescimento do PIB. Não há série oficial de dívida desde 1994, por isso o FHC fica sem este indicador.',
     'https://www.imf.org/external/datamapper/GGXWDG_NGDP@WEO/BRA', 'fmi', 'GGXWDG_NGDP'),
  ('despesa-governo-fmi', 'Despesa total do governo geral (FMI)', '% PIB', 'fmi', 'neutra', 'anual', 'media',
     'Gasto total do governo geral (União, estados e municípios), incluindo juros, em % do PIB (FMI), para consulta. O ranking usa o gasto do governo central pelo Tesouro, que é o que o governo federal controla e cobre desde 1997.',
     'https://www.imf.org/external/datamapper/G_X_G01_GDP_PT/BRA', 'fmi', 'G_X_G01_GDP_PT'),
  ('pessoal-tesouro', 'Gasto com pessoal e encargos do governo central', '% PIB', 'tesouro', 'menor', 'anual', 'media',
     'Resultado do Tesouro Nacional, linha "Pessoal e Encargos Sociais" (servidores ativos, aposentados e pensionistas da União, nos três Poderes), em % do PIB, desde 1997. Direção "menor é melhor" é uma escolha do Prumo para medir eficiência do gasto: folha menor em relação ao PIB indica máquina mais enxuta. Quem discorda pode zerar o peso no ranking. Em 2020 e 2021 houve congelamento salarial por lei (LC 173/2020).',
     'https://www.tesourotransparente.gov.br/ckan/dataset/resultado-do-tesouro-nacional', 'tesouro', 'RTN 2.1-A 4.2'),
  ('tributos-federais-tesouro', 'Carga de tributos federais', '% PIB', 'tesouro', 'menor', 'anual', 'media',
     'Resultado do Tesouro Nacional: receita administrada pela Receita Federal (impostos e contribuições federais), menos incentivos fiscais, mais a contribuição previdenciária ao RGPS, em % do PIB, desde 1997. Não inclui tributos de estados e municípios (ICMS, ISS, IPTU), que não são decididos pelo governo federal. Direção "menor é melhor" é uma escolha do Prumo para medir o peso do Estado sobre a economia; pode ser zerada no ranking. A arrecadação também sobe e desce com a atividade econômica e com receitas extraordinárias, não só com mudanças de alíquota.',
     'https://www.tesourotransparente.gov.br/ckan/dataset/resultado-do-tesouro-nacional', 'tesouro', 'RTN 2.1-A 1.1+1.2+1.3'),
  ('despesa-total-tesouro', 'Gasto total do governo central', '% PIB', 'tesouro', 'menor', 'anual', 'media',
     'Resultado do Tesouro Nacional, despesa primária total do governo central (Tesouro, Previdência e Banco Central), sem juros da dívida, em % do PIB, desde 1997. Inclui benefícios previdenciários, pessoal, transferências sociais e investimentos. Direção "menor é melhor" é uma escolha do Prumo para medir o tamanho do gasto; pode ser zerada no ranking. Em 2020 o gasto saltou com as medidas da pandemia, registradas no contexto do período.',
     'https://www.tesourotransparente.gov.br/ckan/dataset/resultado-do-tesouro-nacional', 'tesouro', 'RTN 2.1-A 4'),
  ('juro-real-bcb', 'Juro real (Selic menos inflação)', '%', 'bcb', 'menor', 'anual', 'media',
     'Selic efetiva do ano (Banco Central, série 4189) descontada a inflação do IPCA no mesmo ano (série 433). Mede o custo do dinheiro que trava crédito e investimento. Desde 2021 o Banco Central tem autonomia por lei (LC 179/2021) e define a Selic com mandato próprio; antes disso, a diretoria era livremente nomeada e demitida pelo presidente. Juro alto também é resposta à inflação e ao risco fiscal, que o governo influencia.',
     'https://www3.bcb.gov.br/sgspub/consultarvalores/telaCvsSelecionarSeries.paint?codigoSerie=4189', 'bcb-sgs', '4189/433'),
  ('juros-nominais-bcb', 'Juros pagos pelo setor público', '% PIB', 'bcb', 'menor', 'anual', 'media',
     'Banco Central, necessidade de financiamento do setor público (série 5760): juros nominais apropriados pelo setor público consolidado em 12 meses até dezembro, em % do PIB. É o custo da dívida para o erário. Depende da Selic e do tamanho da dívida herdada. Série desde novembro de 2002.',
     'https://www3.bcb.gov.br/sgspub/consultarvalores/telaCvsSelecionarSeries.paint?codigoSerie=5760', 'bcb-sgs', '5760'),
  ('estatais-primario-bcb', 'Resultado primário das estatais federais', '% PIB', 'bcb', 'maior', 'anual', 'media',
     'Banco Central (série 5790), resultado primário das empresas estatais federais em 12 meses até dezembro, em % do PIB; positivo é superávit (o sinal da série original, de necessidade de financiamento, foi invertido). Petrobras e Eletrobras não entram nessa estatística, por seguirem regras de mercado. Série desde novembro de 2002.',
     'https://www3.bcb.gov.br/sgspub/consultarvalores/telaCvsSelecionarSeries.paint?codigoSerie=5790', 'bcb-sgs', '5790'),
  ('investimento-wb', 'Taxa de investimento (formação bruta de capital fixo)', '% PIB', 'worldbank', 'maior', 'anual', 'media',
     'Banco Mundial (contas nacionais do IBGE): investimento em máquinas, construção e infraestrutura, público e privado, em % do PIB. Mostra a capacidade de crescer no futuro.',
     'https://data.worldbank.org/indicator/NE.GDI.FTOT.ZS', 'worldbank', 'NE.GDI.FTOT.ZS'),
  ('qualidade-regulatoria-wb', 'Qualidade regulatória (Banco Mundial)', 'pontos', 'worldbank', 'maior', 'anual', 'media',
     'Worldwide Governance Indicators, revisão de 2025, nota de 0 a 100: percepção sobre a capacidade do governo de criar regras que permitam e estimulem o setor privado (burocracia, ambiente de negócios). Mede percepção, com defasagem; antes de 2002 a avaliação era bienal.',
     'https://data.worldbank.org/indicator/GOV_WGI_RQ_SC', 'worldbank-wgi', 'GOV_WGI_RQ.SC'),
  ('efetividade-governo-wb', 'Efetividade do governo (Banco Mundial)', 'pontos', 'worldbank', 'maior', 'anual', 'media',
     'Worldwide Governance Indicators, revisão de 2025, nota de 0 a 100: percepção sobre a qualidade dos serviços públicos, da administração e da execução de políticas. Mede percepção, com defasagem; antes de 2002 a avaliação era bienal.',
     'https://data.worldbank.org/indicator/GOV_WGI_GE_SC', 'worldbank-wgi', 'GOV_WGI_GE.SC'),
  ('resultado-primario-tesouro', 'Resultado primário do governo central', '% PIB', 'tesouro', 'maior', 'anual', 'media',
     'Resultado do Tesouro Nacional: receitas líquidas menos despesas do governo central (Tesouro, Previdência e Banco Central), sem juros, em % do PIB, desde 1997. Positivo é superávit. É a mesma fonte e o mesmo perímetro dos indicadores de gasto, tributos e pessoal, e cobre os seis governos (o FHC a partir de 1997).',
     'https://www.tesourotransparente.gov.br/ckan/dataset/resultado-do-tesouro-nacional', 'tesouro', 'RTN 2.1-A 5'),
  ('juros-nominais-tesouro', 'Juros nominais do governo central', '% PIB', 'tesouro', 'menor', 'anual', 'media',
     'Resultado do Tesouro Nacional, juros nominais do governo central em % do PIB, desde 1997, como custo. Depende da Selic e do tamanho da dívida herdada.',
     'https://www.tesourotransparente.gov.br/ckan/dataset/resultado-do-tesouro-nacional', 'tesouro', 'RTN 2.1-A 9'),
  ('dividendos-tesouro', 'Dividendos das estatais pagos ao Tesouro', '% PIB', 'tesouro', 'neutra', 'anual', 'media',
     'Resultado do Tesouro Nacional, "Dividendos e Participações" recebidos pela União, em % do PIB, desde 1997. Aparece para consulta e não entra na nota: dividendo alto pode indicar estatal lucrativa ou governo retirando caixa das empresas (e depende muito do preço do petróleo). Não há série oficial que meça prejuízos ou aportes às estatais desde 1995; o lucro consolidado das estatais (SEST) só é publicado a partir de meados da década de 2010.',
     'https://www.tesourotransparente.gov.br/ckan/dataset/resultado-do-tesouro-nacional', 'tesouro', 'RTN 2.1-A 1.4.x'),
  ('emendas-tesouro', 'Emendas parlamentares individuais e de bancada pagas', '% PIB', 'tesouro', 'menor', 'anual', 'media',
     'Transferências pagas a estados e municípios por emendas individuais (RP6) e de bancada (RP7), Tesouro Nacional, desde 2015, em % do PIB. NÃO inclui emendas de comissão (RP8) nem de relator (RP9, o chamado orçamento secreto de 2020 a 2022): por isso subestima o total em alguns anos e fica fora do ranking até haver a série completa. A execução dessas emendas é obrigatória pela Constituição desde 2015 (individuais) e 2019 (bancada), e o volume é decidido em boa parte pelo Congresso.',
     'https://www.tesourotransparente.gov.br/ckan/dataset/emendas-parlamentares', 'tesouro', 'emendas RP6+RP7'),
  ('pib-per-capita-wb', 'Renda por pessoa: PIB per capita, variação real anual (Banco Mundial)', '%', 'worldbank', 'maior', 'anual', 'media',
     'Crescimento real do PIB dividido pela população (Banco Mundial, contas nacionais do IBGE). Mede o que a economia gerou por pessoa: desconta o crescimento da população, que caiu de cerca de 1,5% ao ano nos anos 1990 para menos de 0,5% hoje. No ranking substitui o PIB total (as duas séries andam juntas). Não é a renda das famílias medida pela PNAD, que só existe desde 2012.',
     'https://data.worldbank.org/indicator/NY.GDP.PCAP.KD.ZG', 'worldbank', 'NY.GDP.PCAP.KD.ZG'),
  ('pobreza-wb', 'Pobreza: pessoas com menos de US$ 3,00 por dia (Banco Mundial)', '%', 'worldbank', 'menor', 'anual', 'variacao',
     'Parcela da população abaixo da linha internacional de pobreza (US$ 3,00 por dia, paridade de poder de compra de 2021), calculada pelo Banco Mundial a partir das pesquisas domiciliares do IBGE (PNAD e PNAD Contínua). Não há dado em 1994, 2000 e 2010 (anos de censo). Entra na nota como variação por ano durante o mandato: o nível tem tendência de queda de longo prazo e premiaria sempre o governo mais recente. Sai com cerca de um ano e meio de atraso. Em 2020 o auxílio emergencial derrubou a pobreza temporariamente.',
     'https://data.worldbank.org/indicator/SI.POV.DDAY', 'worldbank', 'SI.POV.DDAY'),
  ('gini-wb', 'Desigualdade de renda: índice de Gini (Banco Mundial)', 'índice', 'worldbank', 'menor', 'anual', 'variacao',
     'Índice de Gini da renda (0 = todos iguais, 100 = um só tem tudo), Banco Mundial a partir das pesquisas domiciliares do IBGE. Sem dado em 1994, 2000 e 2010. Entra na nota como variação por ano durante o mandato. A troca da PNAD pela PNAD Contínua (2012–2015) muda um pouco o nível da série.',
     'https://data.worldbank.org/indicator/SI.POV.GINI', 'worldbank', 'SI.POV.GINI'),
  ('mortalidade-infantil-wb', 'Mortalidade infantil (por mil nascidos vivos, Banco Mundial)', 'por mil', 'worldbank', 'menor', 'anual', 'media',
     'Mortes antes de 1 ano por mil nascidos vivos, estimativa do grupo interagências da ONU (UN IGME) publicada pelo Banco Mundial. Cai no Brasil e no mundo há décadas; por isso só entra na comparação com a América Latina, que separa a tendência geral do desempenho do país.',
     'https://data.worldbank.org/indicator/SP.DYN.IMRT.IN', 'worldbank', 'SP.DYN.IMRT.IN'),
  ('controle-corrupcao-wb', 'Controle da corrupção (Banco Mundial)', 'pontos', 'worldbank', 'maior', 'anual', 'media',
     'Worldwide Governance Indicators, revisão de 2025: nota de 0 (pior) a 100 (melhor). Mede a PERCEPÇÃO de especialistas, empresas e cidadãos, não casos comprovados; esquemas ocultos só afetam o índice depois de descobertos, então há defasagem entre o fato e a nota. Sai com cerca de um ano de atraso; antes de 2002 a avaliação era bienal.',
     'https://data.worldbank.org/indicator/GOV_WGI_CC_SC', 'worldbank-wgi', 'GOV_WGI_CC.SC')
) AS v(slug, nome, un, src, dir, per, agg, ress, url, ad, cod)
JOIN dim_source s ON s.slug = v.src
ON CONFLICT (slug) DO UPDATE SET
  nome_pt = EXCLUDED.nome_pt, unidade = EXCLUDED.unidade, fonte_id = EXCLUDED.fonte_id,
  direcao_otima = EXCLUDED.direcao_otima, periodicidade = EXCLUDED.periodicidade,
  agregacao_janela = EXCLUDED.agregacao_janela, ressalva_metodologica = EXCLUDED.ressalva_metodologica,
  url_fonte = EXCLUDED.url_fonte, adaptador = EXCLUDED.adaptador, codigo_externo = EXCLUDED.codigo_externo;

-- Margem de erro do WGI (metade do intervalo de confiança de 90% publicado pelo Banco Mundial:
-- nota − limite inferior, GOV_WGI_xx.SC_LB). Série auxiliar: usada no ranking para não tratar
-- como diferença real o que está dentro do erro de medida.
INSERT INTO dim_indicator (slug, nome_pt, unidade, fonte_id, direcao_otima, periodicidade, agregacao_janela,
                           ressalva_metodologica, url_fonte, adaptador, codigo_externo, auxiliar)
SELECT v.slug, v.nome, 'pontos', s.id, 'neutra', 'anual', 'media', v.ress, v.url, 'worldbank-wgi', v.cod, TRUE
FROM (VALUES
  ('controle-corrupcao-wb-margem', 'Margem de erro (90%): controle da corrupção',
     'Metade do intervalo de confiança de 90% do WGI (nota menos o limite inferior publicado).',
     'https://data.worldbank.org/indicator/GOV_WGI_CC_SC_LB', 'GOV_WGI_CC.SC_LB'),
  ('qualidade-regulatoria-wb-margem', 'Margem de erro (90%): qualidade regulatória',
     'Metade do intervalo de confiança de 90% do WGI (nota menos o limite inferior publicado).',
     'https://data.worldbank.org/indicator/GOV_WGI_RQ_SC_LB', 'GOV_WGI_RQ.SC_LB'),
  ('efetividade-governo-wb-margem', 'Margem de erro (90%): efetividade do governo',
     'Metade do intervalo de confiança de 90% do WGI (nota menos o limite inferior publicado).',
     'https://data.worldbank.org/indicator/GOV_WGI_GE_SC_LB', 'GOV_WGI_GE.SC_LB')
) AS v(slug, nome, ress, url, cod)
JOIN dim_source s ON s.slug = 'worldbank'
ON CONFLICT (slug) DO UPDATE SET
  nome_pt = EXCLUDED.nome_pt, ressalva_metodologica = EXCLUDED.ressalva_metodologica, url_fonte = EXCLUDED.url_fonte,
  codigo_externo = EXCLUDED.codigo_externo, auxiliar = TRUE, direcao_otima = 'neutra';
