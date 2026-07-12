# Snaptab 📸🧾

**Rastreador de despesas serverless: fotografe um recibo → OCR extrai valor, data e estabelecimento → dashboard com totais por categoria.**

Projeto de portfólio full stack: TypeScript de ponta a ponta, arquitetura event-driven na AWS e infraestrutura 100% como código (CDK). Nenhum recurso foi criado clicando no console.

---

## Como funciona

1. O usuário autenticado (Cognito) pede uma **presigned URL** e sobe a foto direto pro S3 — o backend nunca recebe o arquivo.
2. O evento `ObjectCreated` cai numa **fila SQS**; uma Lambda consome em batch, chama o **Textract** (`AnalyzeExpense`), parseia total/data/estabelecimento, **categoriza por palavra-chave** e grava no **DynamoDB** — recibo e agregado de categoria na mesma transação.
3. O frontend (React + TanStack Query) faz polling até o recibo aparecer, lista com filtros por data/categoria e mostra um dashboard cujos totais vêm de agregados mantidos na escrita — nunca recomputados varrendo a tabela.
4. OCR errou? O usuário corrige inline; os agregados são reajustados atomicamente.

```
[React/TS]
   │  1. pede presigned URL
   ▼
[API Gateway] → [Lambda: upload-url]  ── presigned PUT ──► [S3: receipts-bucket]
  (JWT authorizer                                                │
   do Cognito em                                    2. ObjectCreated event
   toda rota)                                                    ▼
                                                          [SQS: ingest-queue]
                                                                 │  3. batch + partial batch response
                                                                 ▼
                                                       [Lambda: processor]
                                                         ├─ Textract (OCR)
                                                         ├─ parse + zod + categorização
                                                         └─ TransactWrite ──► [DynamoDB: snaptab-main]
                                                                 │                (recibo + agregado CAT#)
                                                   falhas após 3 tentativas
                                                                 ▼
                                                          [SQS: ingest-dlq] ─► [CloudWatch Alarm]

[React/TS] ── GET /receipts, /summary, PATCH /receipts/:id ──► [Lambda: receipts-api] ─► [DynamoDB]
```

## Decisões de arquitetura (e os porquês)

| Decisão | Por quê |
|---|---|
| **S3 → SQS → Lambda** (não S3 → Lambda direto) | Desacopla upload de OCR: retry automático, DLQ, absorve picos. Upload responde rápido; OCR roda em background. |
| **DynamoDB single-table** (`PK`/`SK` + GSI1) | Acesso sempre por chave, escala serverless, sem pool de conexão em Lambda. Toda query cabe num access pattern — **zero `Scan` em caminho quente**. |
| **`receiptId` é ULID** (não UUID) | Ordena lexicograficamente por criação → o SK `RECEIPT#<id>` sai do Dynamo já em "mais recentes primeiro" com `ScanIndexForward=false`, sem sort na aplicação. |
| **Dinheiro em centavos inteiros** | `totalCents: 6949`, nunca float. Parser aceita "R$ 1.234,56" e "1,234.56". |
| **Recibo + agregado `CAT#` numa `TransactWriteItems`** | Idempotência de verdade: reprocessar a mesma mensagem SQS cancela a transação inteira (condition no Put) — o agregado nunca soma duas vezes; um crash nunca deixa os dois divergentes. |
| **Chave de idempotência = object key do S3** (`<userId>/<receiptId>`) | Reentrega de evento → `already-exists`, sem duplicata (provado com evento duplicado real). |
| **Erros tipados no processor** | `IrrecoverableError` (TestEvent, key malformada) → ack consciente; ilegível → item `failed` que o usuário corrige; resto → retry → DLQ → alarme. |
| **Cursor de paginação só carrega sort keys** | O partition key vem sempre do JWT na hora da query — cursor forjado não pagina dados de outro usuário. |
| **Edição manual com lock otimista** | O PATCH condiciona nos valores lidos (`status`, `category`, `totalCents`); edição concorrente → 409, nunca agregado corrompido. |
| **Validação zod nas bordas, schemas em `shared/`** | Body de request, payload SQS, saída do Textract e config: tudo passa por schema antes de virar tipo de domínio. `api` e `web` importam do mesmo lugar. |
| **IAM least privilege** | Cada Lambda só tem o que usa. Única exceção documentada: `textract:AnalyzeExpense` exige `Resource: *` (Textract não tem permissão por recurso). |
| **Cognito + JWT authorizer como default** | Toda rota nasce protegida (`defaultAuthorizer`); `userId` sai das claims, nunca do input. |

## Stack

Monorepo pnpm — Node 20, TypeScript strict em tudo:

```
packages/
├── shared/   # fonte da verdade: tipos, schemas zod, chaves do Dynamo, categorização
├── infra/    # AWS CDK (stack + testes de assertions)
├── api/      # Lambdas: upload-url, processor, receipts-api (lógica pura fora dos handlers)
└── web/      # React + Vite + TanStack Query (zero lógica de negócio em componente)
```

## Rodando

Pré-requisitos: Node 20+, pnpm 10+, conta AWS com credenciais configuradas e `cdk bootstrap` feito na região (Textract não existe em `sa-east-1` — use `us-east-1`).

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm lint   # 88 testes, sem AWS

# deploy da infra (gera os outputs de config)
pnpm --filter infra cdk deploy

# frontend: copie os outputs do deploy pro env
cp packages/web/.env.example packages/web/.env.local   # e preencha
pnpm dev                                                # http://localhost:5173
```

Testes unitários não precisam de AWS: parser do Textract roda contra fixtures, handlers contra `aws-sdk-client-mock`, stack contra assertions do CDK.

## Modelo de dados

Tabela única `snaptab-main`:

| Entidade | PK | SK | GSI1PK | GSI1SK |
|---|---|---|---|---|
| Recibo | `USER#<id>` | `RECEIPT#<ulid>` | `USER#<id>` | `DATE#<yyyy-mm-dd>` |
| Agregado categoria | `USER#<id>` | `CAT#<categoria>` | — | — |

Access patterns: listar recibos (PK + `begins_with`), por período (GSI1 `BETWEEN`), totais por categoria (itens `CAT#`), filtro por categoria (`FilterExpression` dentro da partição).

## Custos

Tudo on-demand / free tier: DynamoDB e Lambda no free tier permanente, SQS/S3 centavos, Textract cobra por página analisada (~US$ 0,01/recibo). Um mês de uso pessoal custa menos que um café. `cdk destroy` derruba tudo sem sobras (buckets com `autoDeleteObjects`).

## Screenshots

<!-- TODO: adicionar screenshots — login, lista com filtros, detalhe com edição, dashboard -->
*Em breve — rode `pnpm dev` e veja ao vivo.*

## Backlog (fora de escopo por decisão)

Notificações SNS/SES, export CSV/PDF, multi-moeda, OCR de múltiplos itens por recibo, compartilhamento entre usuários. Ver [ROADMAP.md](ROADMAP.md) pro histórico de construção fase a fase.
