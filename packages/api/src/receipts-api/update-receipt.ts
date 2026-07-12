import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  categorySk,
  dateGsi1Sk,
  receiptSchema,
  receiptSk,
  userPk,
  type Category,
  type Receipt,
  type UpdateReceiptRequest,
} from '@snaptab/shared';

export interface AggregateOp {
  category: Category;
  deltaCents: number;
  deltaCount: number;
}

// Deltas nos agregados CAT# quando um recibo muda. Puro e testado à parte:
// - era 'failed' (nunca contou) → só soma na categoria nova;
// - mudou de categoria → decrementa a antiga, incrementa a nova;
// - mesma categoria → só a diferença de total (nada se não mudou).
export function computeAggregateOps(
  old: Pick<Receipt, 'status' | 'category' | 'totalCents'>,
  next: Pick<Receipt, 'category' | 'totalCents'>,
): AggregateOp[] {
  if (old.status !== 'processed') {
    return [{ category: next.category, deltaCents: next.totalCents, deltaCount: 1 }];
  }
  if (old.category !== next.category) {
    return [
      { category: old.category, deltaCents: -old.totalCents, deltaCount: -1 },
      { category: next.category, deltaCents: next.totalCents, deltaCount: 1 },
    ];
  }
  const delta = next.totalCents - old.totalCents;
  return delta === 0 ? [] : [{ category: old.category, deltaCents: delta, deltaCount: 0 }];
}

export type UpdateResult = { receipt: Receipt } | 'not-found' | 'conflict';

export async function updateReceipt(params: {
  ddb: DynamoDBDocumentClient;
  tableName: string;
  userId: string;
  receiptId: string;
  patch: UpdateReceiptRequest;
}): Promise<UpdateResult> {
  const { ddb, tableName, userId, receiptId, patch } = params;
  const pk = userPk(userId);
  const sk = receiptSk(receiptId);

  const current = await ddb.send(
    new GetCommand({ TableName: tableName, Key: { PK: pk, SK: sk } }),
  );
  if (!current.Item) return 'not-found';
  const old = receiptSchema.parse(current.Item);

  const now = new Date().toISOString();
  // Edição é revisão humana: o resultado é sempre 'processed'.
  const next = receiptSchema.parse({ ...old, ...patch, status: 'processed', updatedAt: now });
  const ops = computeAggregateOps(old, next);

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: tableName,
              Key: { PK: pk, SK: sk },
              UpdateExpression:
                'SET merchant = :merchant, totalCents = :totalCents, #date = :date, ' +
                'category = :category, #status = :status, updatedAt = :updatedAt, GSI1SK = :gsi1sk',
              // Lock otimista nos campos dos quais os deltas dependem: se
              // outra edição passou entre o Get e aqui, cancela tudo (409).
              ConditionExpression:
                'attribute_exists(PK) AND #status = :oldStatus AND ' +
                'category = :oldCategory AND totalCents = :oldTotal',
              ExpressionAttributeNames: { '#date': 'date', '#status': 'status' },
              ExpressionAttributeValues: {
                ':merchant': next.merchant,
                ':totalCents': next.totalCents,
                ':date': next.date,
                ':category': next.category,
                ':status': next.status,
                ':updatedAt': next.updatedAt,
                ':gsi1sk': dateGsi1Sk(next.date),
                ':oldStatus': old.status,
                ':oldCategory': old.category,
                ':oldTotal': old.totalCents,
              },
            },
          },
          ...ops.map((op) => ({
            Update: {
              TableName: tableName,
              Key: { PK: pk, SK: categorySk(op.category) },
              UpdateExpression:
                'ADD totalCents :delta, receiptCount :deltaCount ' +
                'SET category = if_not_exists(category, :cat), userId = if_not_exists(userId, :uid)',
              ExpressionAttributeValues: {
                ':delta': op.deltaCents,
                ':deltaCount': op.deltaCount,
                ':cat': op.category,
                ':uid': userId,
              },
            },
          })),
        ],
      }),
    );
  } catch (err) {
    if (err instanceof TransactionCanceledException) return 'conflict';
    throw err;
  }

  return { receipt: next };
}
