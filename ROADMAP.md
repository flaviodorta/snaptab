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

- [ ] Schema zod `Receipt` (id, userId, total, data, estabelecimento, categoria, s3Key, status, timestamps)
- [ ] Schema `Category` + união literal das categorias v2 (com `"Outros"`)
- [ ] Schemas das bordas: body do request de upload, payload do evento S3→SQS, resposta da API
- [ ] Helpers de chave DynamoDB (`USER#<id>`, `RECEIPT#<id>`, `CAT#<cat>`, `DATE#<iso>`) — puros e testados
- [ ] Testes vitest dos schemas (casos válidos/inválidos)

**Aceite:** `api` e `web` poderão importar tudo daqui; zero duplicação de shape.

---

## Fase 2 — `infra`: stack base em CDK

Objetivo: todos os recursos AWS declarados, sintetizando sem erro (deploy ainda opcional).

- [ ] Bootstrap CDK + stack `SnaptabStack`
- [ ] S3 `receipts-bucket` (bloqueio de acesso público, CORS pro presigned PUT)
- [ ] DynamoDB `snaptab-main`: `PK`/`SK` + `GSI1` (`GSI1PK`/`GSI1SK`), billing on-demand
- [ ] SQS `ingest-queue` + `ingest-dlq` (maxReceiveCount definido)
- [ ] Notificação S3 `ObjectCreated` → `ingest-queue`
- [ ] Cognito User Pool + client (signup/login, JWT)
- [ ] API Gateway (HTTP API) com JWT authorizer do Cognito
- [ ] IAM least privilege por Lambda (roles criadas junto com cada função nas fases seguintes)

**Aceite:** `pnpm --filter infra cdk synth` gera CloudFormation limpo; `cdk diff` revisável.

---

## Fase 3 — Upload: presigned URL

Objetivo: primeiro fluxo fim-a-fim parcial — usuário autenticado consegue subir imagem pro S3.

- [ ] Lambda `upload-url`: valida body com zod, gera presigned PUT (key = `<userId>/<receiptId>`)
- [ ] Rota `POST /receipts/upload-url` protegida por JWT no API Gateway
- [ ] Permissão IAM mínima: `s3:PutObject` só no bucket/prefixo
- [ ] Teste unitário da montagem de key e validação do body
- [ ] Primeiro `cdk deploy` real + teste manual com `curl`/token do Cognito

**Aceite:** upload de uma imagem via presigned URL aparece no bucket e enfileira mensagem na `ingest-queue`.

---

## Fase 4 — Processor: OCR → DynamoDB

Objetivo: o coração do pipeline. Mensagem SQS vira item estruturado na tabela.

- [ ] Lambda `processor` com event source mapping da `ingest-queue` (batch + partial batch response)
- [ ] Chamada Textract (`AnalyzeExpense`) sobre o objeto S3
- [ ] Módulo puro de parse: total, data, estabelecimento a partir da saída do Textract
- [ ] Validação zod do resultado antes de gravar
- [ ] Escrita idempotente no DynamoDB (chave de idempotência = object key do S3; condition expression)
- [ ] Erros tipados: recuperável → throw (retry/DLQ); irrecuperável → ack consciente + log
- [ ] Testes vitest do parser com fixtures reais de saída do Textract (sem AWS)

**Aceite:** foto enviada na Fase 3 vira item `RECEIPT#` na tabela; reprocessar a mesma mensagem não duplica; falha proposital cai na DLQ após N tentativas.

---

## Fase 5 — API de leitura

Objetivo: dados saem do DynamoDB pro cliente.

- [ ] Lambda `receipts-api`: `GET /receipts` (lista do usuário, mais recentes primeiro — query `PK = USER#`, `begins_with RECEIPT#`)
- [ ] `GET /receipts/:id` (detalhe + presigned GET da imagem)
- [ ] Paginação por cursor (LastEvaluatedKey encodado)
- [ ] userId sempre extraído do JWT (claims), nunca do input
- [ ] Testes do mapeamento item→domínio

**Aceite:** `curl` autenticado lista e detalha recibos reais processados.

---

## Fase 6 — `web`: frontend v1

Objetivo: v1 completo de ponta a ponta na UI.

- [ ] Vite + React + TS + TanStack Query + roteamento
- [ ] Auth Cognito (signup, login, logout, guarda de rotas, refresh de token)
- [ ] Tela de upload: pega presigned URL → PUT direto no S3 → feedback de "processando"
- [ ] Lista de recibos (polling/refetch até o processor concluir)
- [ ] Detalhe do recibo (dados extraídos + imagem)
- [ ] Nenhuma lógica de negócio em componente; fetching só via TanStack Query

**Aceite (marco v1):** fluxo completo — cadastro → foto → OCR → recibo na lista — funcionando em deploy real.

---

## Fase 7 — v2: categorização

Objetivo: gasto ganha categoria e agregados prontos pra dashboard.

- [ ] Módulo puro de categorização (regras por palavra-chave do estabelecimento; fallback `"Outros"`) em `shared` ou `api`, testado
- [ ] Processor passa a gravar categoria no recibo
- [ ] Agregados `CAT#<categoria>` atualizados na mesma escrita (update atômico `ADD`)
- [ ] Migração leve: recibos antigos sem categoria tratados como `"Outros"`

**Aceite:** novo recibo entra categorizado e o item `CAT#` do usuário reflete o total.

---

## Fase 8 — v2: dashboard e filtros

Objetivo: valor visível do projeto — números e filtros.

- [ ] API: total do mês, total por categoria (itens `CAT#`), evolução por período (GSI1 `DATE#..DATE#`)
- [ ] API: filtros por intervalo de datas (GSI1) e por categoria — sem `Scan`
- [ ] Web: página de dashboard (cards de totais + gráfico de evolução + quebra por categoria)
- [ ] Web: filtros de data e categoria na listagem

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
