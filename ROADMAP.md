# ROADMAP — Snaptab

> Plano de construção do zero ao deploy. Cada fase termina num estado verificável:
> `pnpm typecheck && pnpm test` verdes + critério de aceite da fase.
> Marque os checkboxes conforme avançamos; commits em conventional commits.

---

## Fase 0 — Fundação do monorepo

Objetivo: esqueleto do repo compilando, testando e lintando (mesmo vazio).

- [x] `git init` + `.gitignore` (node_modules, cdk.out, dist, .env)
- [x] `pnpm-workspace.yaml` + `package.json` raiz com scripts (`dev`, `build`, `test`, `typecheck`, `lint`)
- [x] Pacotes criados: `packages/shared`, `packages/infra`, `packages/api`, `packages/web`
- [x] `tsconfig.base.json` strict compartilhado; cada pacote estende
- [x] ESLint + vitest configurados na raiz
- [x] CI (GitHub Actions): `pnpm install && pnpm typecheck && pnpm test && pnpm lint` em todo push

**Aceite:** todos os scripts raiz rodam verdes num repo recém-clonado.

---

## Fase 1 — `shared`: modelo de domínio

Objetivo: fonte da verdade de tipos e validação, antes de qualquer infra ou handler.

- [x] Schema zod `Receipt` (id, userId, total, data, estabelecimento, categoria, s3Key, status, timestamps)
- [x] Schema `Category` + união literal das categorias v2 (com `"Outros"`)
- [x] Schemas das bordas: body do request de upload, payload do evento S3→SQS, resposta da API
- [x] Helpers de chave DynamoDB (`USER#<id>`, `RECEIPT#<id>`, `CAT#<cat>`, `DATE#<iso>`) — puros e testados
- [x] Testes vitest dos schemas (casos válidos/inválidos)

**Aceite:** `api` e `web` poderão importar tudo daqui; zero duplicação de shape.

---

## Fase 2 — `infra`: stack base em CDK

Objetivo: todos os recursos AWS declarados, sintetizando sem erro (deploy ainda opcional).

- [x] Stack `SnaptabStack` criado (`cdk bootstrap` real acontece no primeiro deploy, Fase 3)
- [x] S3 `receipts-bucket` (bloqueio de acesso público, CORS pro presigned PUT)
- [x] DynamoDB `snaptab-main`: `PK`/`SK` + `GSI1` (`GSI1PK`/`GSI1SK`), billing on-demand
- [x] SQS `ingest-queue` + `ingest-dlq` (maxReceiveCount 3)
- [x] Notificação S3 `ObjectCreated` → `ingest-queue`
- [x] Cognito User Pool + client (signup/login, JWT)
- [x] API Gateway (HTTP API) com JWT authorizer do Cognito como default de toda rota
- [x] IAM least privilege por Lambda (roles criadas junto com cada função nas fases seguintes)

**Aceite:** `pnpm --filter infra cdk synth` gera CloudFormation limpo; `cdk diff` revisável.

---

## Fase 3 — Upload: presigned URL

Objetivo: primeiro fluxo fim-a-fim parcial — usuário autenticado consegue subir imagem pro S3.

- [x] Lambda `upload-url`: valida body com zod, gera presigned PUT (key = `<userId>/<receiptId>`)
- [x] Rota `POST /receipts/upload-url` protegida por JWT no API Gateway
- [x] Permissão IAM mínima: `s3:PutObject` só nos objetos do bucket
- [x] Teste unitário da montagem de key e validação do body
- [x] Primeiro `cdk deploy` real + teste manual com `curl`/token do Cognito (401 sem token, 201 com token, 400 body inválido, 403 content-type divergente, objeto no S3, evento na fila)

**Aceite:** upload de uma imagem via presigned URL aparece no bucket e enfileira mensagem na `ingest-queue`.

---

## Fase 4 — Processor: OCR → DynamoDB

Objetivo: o coração do pipeline. Mensagem SQS vira item estruturado na tabela.

- [x] Lambda `processor` com event source mapping da `ingest-queue` (batch + partial batch response)
- [x] Chamada Textract (`AnalyzeExpense`) sobre o objeto S3
- [x] Módulo puro de parse: total, data, estabelecimento a partir da saída do Textract
- [x] Validação zod do resultado antes de gravar
- [x] Escrita idempotente no DynamoDB (chave de idempotência = object key do S3; condition expression) — provada ao vivo: evento duplicado → `already-exists`, 1 item só
- [x] Erros tipados: recuperável → throw (retry/DLQ); irrecuperável → ack consciente + log
- [x] Testes vitest do parser com fixtures reais de saída do Textract (sem AWS)

**Aceite:** foto enviada na Fase 3 vira item `RECEIPT#` na tabela; reprocessar a mesma mensagem não duplica; falha proposital cai na DLQ após N tentativas.

---

## Fase 5 — API de leitura

Objetivo: dados saem do DynamoDB pro cliente.

- [x] Lambda `receipts-api`: `GET /receipts` (lista do usuário, mais recentes primeiro — query `PK = USER#`, `begins_with RECEIPT#`)
- [x] `GET /receipts/:id` (detalhe + presigned GET da imagem)
- [x] Paginação por cursor (LastEvaluatedKey encodado; cursor só carrega SK — PK sempre vem do JWT)
- [x] userId sempre extraído do JWT (claims), nunca do input
- [x] Testes do mapeamento item→domínio

**Aceite:** `curl` autenticado lista e detalha recibos reais processados.

---

## Fase 6 — `web`: frontend v1

Objetivo: v1 completo de ponta a ponta na UI.

- [x] Vite + React + TS + TanStack Query + roteamento
- [x] Auth Cognito (signup com confirmação por código, login SRP, logout, guarda de rotas, refresh via getSession)
- [x] Tela de upload: pega presigned URL → PUT direto no S3 → feedback de "processando"
- [x] Lista de recibos (polling de 3s enquanto houver upload pendente; para sozinho)
- [x] Detalhe do recibo (dados extraídos + imagem via presigned GET)
- [x] Nenhuma lógica de negócio em componente; fetching só via TanStack Query

**Aceite (marco v1):** fluxo completo — cadastro → foto → OCR → recibo na lista — funcionando em deploy real.

---

## Fase 7 — v2: categorização

Objetivo: gasto ganha categoria e agregados prontos pra dashboard.

- [x] Módulo puro de categorização (regras por palavra-chave do estabelecimento; fallback `"Outros"`) em `shared`, testado
- [x] Processor passa a gravar categoria no recibo
- [x] Agregados `CAT#<categoria>` atualizados na mesma escrita — recibo + agregado numa `TransactWriteItems` atômica (retry não conta duas vezes)
- [x] Migração: script one-off recategorizou recibos antigos e reconstruiu agregados (`scripts/migrate-categories.ts`)

**Aceite:** novo recibo entra categorizado e o item `CAT#` do usuário reflete o total.

---

## Fase 8 — v2: dashboard e filtros

Objetivo: valor visível do projeto — números e filtros.

- [x] API: `GET /summary` — total do período, total por categoria (itens `CAT#`), evolução por dia (GSI1 `DATE#..DATE#`)
- [x] API: filtros por intervalo de datas (GSI1) e por categoria (FilterExpression na partição) — sem `Scan`
- [x] Web: página de dashboard (stat tiles + colunas de evolução + barras por categoria)
- [x] Web: filtros de data e categoria na listagem (paginação por cursor funciona nos dois modos)

**Aceite:** dashboard bate com os recibos cadastrados; toda query cabe num access pattern do §5 do CLAUDE.md.

---

## Fase 9 — v2: correção manual

Objetivo: usuário conserta o que o OCR errou.

- [ ] `PATCH /receipts/:id` — campos editáveis: total, data, estabelecimento, categoria (validação zod)
- [ ] Ajuste dos agregados `CAT#` quando total/categoria mudam (decrementa antigo, incrementa novo)
- [ ] Web: edição inline no detalhe do recibo
- [ ] Testes do recálculo de agregados

**Aceite (marco v2):** editar um recibo atualiza lista, detalhe e dashboard de forma consistente.

---

## Fase 10 — Polimento de portfólio

Objetivo: o projeto se apresenta sozinho.

- [ ] README: o que é, diagrama de arquitetura, decisões (o "porquê" de cada peça), como rodar, screenshots/GIF
- [ ] Logs estruturados (JSON) nas Lambdas + alarme CloudWatch para mensagens na DLQ
- [ ] Revisão final de IAM (nenhum `*` sobrou)
- [ ] Revisão de custos (tudo dentro do free tier / on-demand)
- [ ] Deploy final limpo a partir do zero (`cdk destroy` + `cdk deploy` pra provar reprodutibilidade)

**Aceite:** um recrutador clona, lê o README e entende arquitetura e decisões em 5 minutos.

---

## Ordem e dependências

```
F0 → F1 → F2 → F3 → F4 → F5 → F6 (marco v1)
                              └→ F7 → F8 → F9 (marco v2) → F10
```

Regra prática: nunca começar uma fase com a anterior quebrada; cada fase gera
commits pequenos e um estado deployável (ou pelo menos sintetizável) do stack.
