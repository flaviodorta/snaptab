// Migração one-off da Fase 7: recategoriza recibos gravados antes das regras
// de palavra-chave e reconstrói os agregados CAT# a partir dos recibos.
//
// Uso (com credenciais AWS no ambiente):
//   pnpm --filter @snaptab/api exec tsx scripts/migrate-categories.ts
//
// Scan é aceitável AQUI: migração one-off, fora de caminho quente (CLAUDE.md §5).
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  paginateScan,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  categorize,
  categorySk,
  receiptSchema,
  userPk,
  type Category,
} from '@snaptab/shared';

const TABLE_NAME = process.env.TABLE_NAME ?? 'snaptab-main';
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const receipts: Array<ReturnType<typeof receiptSchema.parse>> = [];
let recategorized = 0;

// 1. Varre os recibos e corrige categoria onde a regra nova discorda.
for await (const page of paginateScan(
  { client: ddb },
  {
    TableName: TABLE_NAME,
    FilterExpression: 'begins_with(SK, :prefix)',
    ExpressionAttributeValues: { ':prefix': 'RECEIPT#' },
  },
)) {
  for (const item of page.Items ?? []) {
    const receipt = receiptSchema.parse(item);
    const category = categorize(receipt.merchant);
    if (category !== receipt.category) {
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: userPk(receipt.userId), SK: `RECEIPT#${receipt.receiptId}` },
          UpdateExpression: 'SET category = :cat, updatedAt = :now',
          ExpressionAttributeValues: { ':cat': category, ':now': new Date().toISOString() },
        }),
      );
      recategorized += 1;
      receipts.push({ ...receipt, category });
    } else {
      receipts.push(receipt);
    }
  }
}

// 2. Reconstrói os agregados do zero (SET, não ADD: semântica de rebuild).
const groups = new Map<string, { userId: string; category: Category; totalCents: number; receiptCount: number }>();
for (const receipt of receipts) {
  if (receipt.status !== 'processed') continue;
  const key = `${receipt.userId}|${receipt.category}`;
  const group = groups.get(key) ?? {
    userId: receipt.userId,
    category: receipt.category,
    totalCents: 0,
    receiptCount: 0,
  };
  group.totalCents += receipt.totalCents;
  group.receiptCount += 1;
  groups.set(key, group);
}

for (const group of groups.values()) {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: userPk(group.userId),
        SK: categorySk(group.category),
        ...group,
      },
    }),
  );
}

console.log(
  `migração concluída: ${receipts.length} recibos lidos, ${recategorized} recategorizados, ${groups.size} agregados reconstruídos`,
);
