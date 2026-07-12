# CLAUDE.md — Snaptab

> Guia de contexto do projeto para o Claude Code (e para qualquer dev novo no repo).
> Serverless expense tracker: foto de recibo → OCR → dados estruturados → dashboard.

---

## 1. O que é o Snaptab

Snaptab é um rastreador de despesas serverless. O usuário fotografa um recibo, o
sistema extrai valor / data / estabelecimento via OCR, categoriza o gasto e mostra
um dashboard com totais e filtros. Todo o backend é event-driven na AWS; todo o
código (app + infraestrutura) é TypeScript.

**Objetivo do projeto:** portfólio full stack demonstrando TypeScript sólido,
arquitetura AWS event-driven e Infra-as-Code. Priorize clareza e decisões
defensáveis sobre features.

---

## 2. Arquitetura

Fluxo principal (upload → dado estruturado):

```
[React/TS]
   │  1. pede presigned URL
   ▼
[API Gateway] → [Lambda: upload-url]  ── gera presigned PUT ──► [S3: receipts-bucket]
                                                                      │
                                                       2. ObjectCreated event
                                                                      ▼
                                                               [SQS: ingest-queue]
                                                                      │  3. event source mapping (batch)
                                                                      ▼
                                                        [Lambda: processor]
                                                          ├─ Textract (OCR)
                                                          ├─ parse + validação (zod)
                                                          └─ grava ──► [DynamoDB]
                                                                      │
                                                        falhas após N retries
                                                                      ▼
                                                               [SQS: ingest-dlq]

[React/TS] ── query ──► [API Gateway] ─► [Lambda: receipts-api] ─► [DynamoDB]
Auth em todas as rotas protegidas: [Cognito] (JWT authorizer no API Gateway)
```

### Por que cada peça existe (respostas prontas pra entrevista)

- **S3 → SQS → Lambda (não S3 → Lambda direto):** desacopla upload de OCR, dá retry
  automático e Dead-Letter Queue, e absorve picos de tráfego. O upload responde
  rápido; o processamento acontece em background.
- **DynamoDB (não SQL):** acesso por chave, escala serverless, sem gerenciar pool de
  conexão dentro de Lambda. Ver §5 (single-table design).
- **Textract:** OCR gerenciado, sem manter modelo próprio.
- **Cognito:** auth gerenciada (signup, JWT, refresh) sem rolar criptografia na mão.
- **CDK em TypeScript:** infra no mesmo idioma do app, versionada, revisável em PR.

---

## 3. Stack e estrutura

Monorepo com pnpm workspaces. Node 20, TypeScript strict em todos os pacotes.

```
snaptab/
├── CLAUDE.md
├── package.json            # workspaces + scripts raiz
├── pnpm-workspace.yaml
├── packages/
│   ├── shared/             # tipos + schemas zod compartilhados (fonte da verdade)
│   ├── infra/              # AWS CDK (stacks em TypeScript)
│   ├── api/                # handlers Lambda (upload-url, processor, receipts-api)
│   └── web/                # React + TS + Vite frontend
```

- **shared/** é importado por `api/` e `web/`. Tipo de domínio muda? Muda aqui.
  Nunca duplique a shape de um `Receipt` em dois lugares.
- **infra/** define recursos AWS. Nenhum recurso é criado clicando no console.
- **api/** — um handler por arquivo, lógica de negócio em módulos testáveis fora do handler.
- **web/** — data fetching com TanStack Query; sem lógica de negócio no componente.

---

## 4. Comandos

```bash
pnpm install                 # instala tudo (raiz)
pnpm dev                     # sobe o frontend (web) em modo dev
pnpm --filter web dev        # idem, explícito
pnpm build                   # build de todos os pacotes
pnpm test                    # testes unitários (vitest) em todos os pacotes
pnpm typecheck               # tsc --noEmit em todos os pacotes
pnpm lint                    # eslint

# Infra (dentro de packages/infra)
pnpm --filter infra cdk synth      # gera o CloudFormation
pnpm --filter infra cdk diff       # mostra o que vai mudar
pnpm --filter infra cdk deploy     # deploy
pnpm --filter infra cdk destroy    # derruba o stack (cuidado)
```

Antes de considerar qualquer tarefa "pronta": `pnpm typecheck && pnpm test` deve passar.

---

## 5. DynamoDB — single-table design

Uma única tabela `snaptab-main`. Chaves genéricas `PK` / `SK` + um GSI.

| Entidade         | PK                 | SK                        | GSI1PK        | GSI1SK              |
|------------------|--------------------|---------------------------|---------------|---------------------|
| Recibo           | `USER#<userId>`    | `RECEIPT#<receiptId>`     | `USER#<id>`   | `DATE#<isoDate>`    |
| Categoria (agg)  | `USER#<userId>`    | `CAT#<categoria>`         | —             | —                   |

Padrões de acesso suportados:
- Listar recibos de um usuário → `PK = USER#<id>`, `SK begins_with RECEIPT#`
- Recibos por período → GSI1, `GSI1PK = USER#<id>`, `GSI1SK between DATE#..DATE#`
- Total por categoria → itens `CAT#*` do usuário (agregados atualizados na escrita)

Regra: **toda query nova precisa caber num access pattern existente.** Se não couber,
reavalie as chaves/GSI antes de escanear a tabela. Nunca use `Scan` em caminho quente.

---

## 6. Escopo — v1 e v2 (ambos já contemplados)

### v1 — núcleo funcional (feito)
- Auth com Cognito (signup / login / logout, rotas protegidas por JWT).
- Upload de recibo via presigned URL pro S3.
- Pipeline S3 → SQS → Lambda processor → Textract → DynamoDB, com DLQ.
- Parse de valor total, data e estabelecimento; validação com zod.
- Listagem dos recibos do usuário (mais recentes primeiro).
- Detalhe de um recibo (dados extraídos + link pra imagem).
- Toda a infra em CDK.

### v2 — dashboard e categorização (feito)
- Categorização do gasto (regras por palavra-chave do estabelecimento; fallback "Outros").
- Dashboard: total do mês, total por categoria, evolução por período.
- Filtros por intervalo de datas (usa o GSI1) e por categoria.
- Agregados por categoria mantidos na escrita (evita recomputar em toda leitura).
- Edição manual de um campo mal extraído pelo OCR (correção do usuário).

### Backlog (fora de escopo agora — NÃO implementar sem pedir)
Notificações SNS/SES, export CSV/PDF, multi-moeda, OCR de múltiplos itens por recibo,
compartilhamento entre usuários.

---

## 7. Convenções

- **TypeScript strict**, sem `any`. Prefira `unknown` + narrowing. Sem `as` gratuito.
- **Validação nas bordas:** todo dado externo (body de request, payload de SQS, saída
  do Textract) passa por um schema zod de `shared/` antes de virar tipo de domínio.
- **IAM least privilege:** cada Lambda recebe só as permissões que usa. Nada de `*`.
- **Erros:** lançar erro tipado no processor faz a mensagem SQS reprocessar; só
  "engula" o erro (ack) quando for irrecuperável de propósito — senão vai pra DLQ.
- **Sem segredo hardcoded.** Config via variável de ambiente / SSM; nada de chave no repo.
- **Commits:** conventional commits (`feat:`, `fix:`, `chore:`…).
- **Testes:** lógica de parse do recibo e mapeamento de categoria são puros e testados
  em `vitest` — não precisam de AWS pra rodar.

---

## 8. Notas pro Claude Code

- Ao adicionar um serviço AWS, defina-o **em `packages/infra` via CDK** — nunca instrua
  o usuário a criar no console.
- Ao criar/alterar o shape de uma entidade, atualize o schema em `packages/shared`
  primeiro; `api` e `web` derivam dele.
- Ao mexer no processor, preserve o contrato: mensagem SQS → item DynamoDB idempotente
  (reprocessar a mesma mensagem não pode duplicar recibo — use o object key do S3 como
  chave de idempotência).
- Prefira alterações pequenas e verificáveis; rode `pnpm typecheck && pnpm test` ao fim.
- Se uma feature pedida estiver no backlog do §6, confirme com o usuário antes de codar.
