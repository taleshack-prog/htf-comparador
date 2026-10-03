# Prumo — governos comparados com dados oficiais

App anexo ao site da Hack Tech Farm, publicado em `prumo.hacktechfarm.com.br`.
Especificação: *PRD + TDD v1.3* (seções 9, 14.1, 15 e 16).

Mesma filosofia do site: HTML/CSS/JS sem framework, gerado por script, e funções serverless.
Dependência única: `pg` (driver do Postgres). Stripe, Anthropic, Brevo e as fontes de dados
são chamados por `fetch`, sem SDK.

## Estado

Sprint 0 e Sprint 1 concluídos; API de comparação, motor de contexto v1 e tela de comparação no ar.
Cada deploy na Vercel aplica as migrações e o catálogo antes do build (`vercel.json → buildCommand`).

## Histórico do Sprint 0

| Pronto | O quê |
|---|---|
| ✔ | Estrutura do repositório, `vercel.json` (URLs limpas, rewrite do health, cron diário) |
| ✔ | Build com cache-busting (`?v=<hash>`) e servidor local que imita a Vercel |
| ✔ | 4 migrações: base dimensional, contexto, citações, contas/créditos |
| ✔ | Catálogo inicial (fontes por nível, entidades, 6 janelas de governo, 12 indicadores) — **sem nenhum valor** |
| ✔ | `GET /health/summary` no contrato do painel HTF |
| ✔ | Adaptadores BCB SGS, IBGE SIDRA e World Bank, com validação e histórico de revisões |
| ✔ | 22 testes (unidade + integração com Postgres) |
| ☐ | Conferir cada código de série contra a fonte (todos `codigo_verificado = false`) |
| ☐ | Primeira carga real e auditoria cruzada (Sprint 1) |

## Estrutura

```
api/
  health/summary.js   GET /health/summary (Bearer MONITOR_TOKEN)
  cron/ingest.js      Vercel Cron diário (Bearer CRON_SECRET)
adapters/             bcb-sgs, ibge-sidra, worldbank + base (fetch → normalize → validate → persist)
lib/                  db, http, migrações, health, ingestão
migrations/           SQL versionado (nunca editar um arquivo já aplicado: crie outro)
seeds/                catálogo idempotente (só definições, nenhum número)
site/                 páginas estáticas → build → public/
tools/                build, serve (local), migrate, ingest
test/                 node:test; fixtures só com formato das APIs e valores sintéticos
```

## Rodar localmente

```bash
npm install
cp .env.example .env          # preencha DATABASE_URL etc.
npm run migrate               # migrações + catálogo
npm run build
npm run dev                   # http://localhost:3010
npm test                      # unidade; integração exige TEST_DATABASE_URL (banco descartável!)
```

## Publicar (uma vez)

1. **Railway** → no projeto que já tem o Postgres, *New → Database → PostgreSQL* (serviço
   **próprio** do Comparador). Copie a `DATABASE_URL` pública.
2. **Migrar**: `DATABASE_URL=... npm run migrate` (do seu computador).
3. **Vercel** → time `hack-tech-farm` → *Add New → Project* → este repositório.
   Build Command e Output já vêm do `vercel.json`. Variáveis: `DATABASE_URL`, `MONITOR_TOKEN`,
   `CRON_SECRET` (valores longos e aleatórios: `openssl rand -hex 32`).
4. **Domínio**: na Vercel, *Settings → Domains → prumo.hacktechfarm.com.br*. No Registro.br,
   adicione o CNAME `comparador` com o valor que a Vercel mostrar. Confira depois que gravou
   (o editor de zona só adiciona/remove e mostra rascunho).
5. **Primeira carga**: `DATABASE_URL=... npm run ingest` e confira os números contra as fontes.

## Integração com o site HTF

- **Painel de saúde**: no site, adicionar o app em `api/_monitor.js` com endpoint
  `https://prumo.hacktechfarm.com.br/health/summary` e token `MONITOR_TOKEN_PRUMO`
  (mesmo valor do `MONITOR_TOKEN` daqui).
- **Catálogo**: entrada `comparador` em `data/products.json` com `is_public: false` até o lançamento.

## Regras que o código garante

- Nenhum número entra sem adaptador, fonte e data de coleta (CA9).
- Ano corrente nunca é "oficial" (CA5).
- Lote com qualquer erro é rejeitado inteiro; o app segue com o último lote válido.
- Toda revisão de valor guarda a versão anterior (`fact_observation_history`).
- Extrato de créditos é somente de inserção; evento repetido não lança duas vezes (CA12).
