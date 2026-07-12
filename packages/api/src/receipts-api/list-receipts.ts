import { QueryCommand, type QueryCommandInput, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  RECEIPT_SK_PREFIX,
  receiptSchema,
  userPk,
  type Category,
  type ListReceiptsResponse,
  type Receipt,
} from '@snaptab/shared';
import { logWarn } from '../lib/log';
import { encodeCursor, type Cursor } from './cursor';

export async function listReceipts(params: {
  ddb: DynamoDBDocumentClient;
  tableName: string;
  userId: string;
  limit: number;
  cursor: Cursor | null;
  from?: string;
  to?: string;
  category?: Category;
}): Promise<ListReceiptsResponse> {
  const { ddb, tableName, userId, limit, cursor, from, to, category } = params;
  const pk = userPk(userId);
  // Com intervalo de datas a query muda pro GSI1 (ordenado por data da
  // compra); sem datas fica na tabela (ordenado por criação via ULID).
  const useGsi = Boolean(from ?? to);

  const input: QueryCommandInput = useGsi
    ? {
        TableName: tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK BETWEEN :lo AND :hi',
        ExpressionAttributeValues: {
          ':pk': pk,
          ':lo': `DATE#${from ?? '0000-01-01'}`,
          ':hi': `DATE#${to ?? '9999-12-31'}`,
        },
        ScanIndexForward: false,
        Limit: limit,
        ...(cursor?.gsi1sk
          ? { ExclusiveStartKey: { PK: pk, SK: cursor.sk, GSI1PK: pk, GSI1SK: cursor.gsi1sk } }
          : {}),
      }
    : {
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': pk, ':prefix': RECEIPT_SK_PREFIX },
        ScanIndexForward: false,
        Limit: limit,
        ...(cursor ? { ExclusiveStartKey: { PK: pk, SK: cursor.sk } } : {}),
      };

  if (category) {
    // FilterExpression sobre uma Query já restrita à partição do usuário —
    // não é Scan. O Limit é aplicado ANTES do filtro: páginas podem vir
    // menores que o limit, mas o cursor continua de onde parou.
    input.FilterExpression = '#cat = :category';
    input.ExpressionAttributeNames = { '#cat': 'category' };
    input.ExpressionAttributeValues = {
      ...input.ExpressionAttributeValues,
      ':category': category,
    };
  }

  const result = await ddb.send(new QueryCommand(input));

  // Um item corrompido não pode derrubar a lista inteira: loga e pula.
  const items: Receipt[] = [];
  for (const item of result.Items ?? []) {
    const parsed = receiptSchema.safeParse(item);
    if (parsed.success) {
      items.push(parsed.data);
    } else {
      logWarn('item fora do schema ignorado na listagem', { sk: item.SK });
    }
  }

  const lek = result.LastEvaluatedKey;
  const nextCursor =
    typeof lek?.SK === 'string'
      ? encodeCursor({
          sk: lek.SK,
          ...(typeof lek.GSI1SK === 'string' ? { gsi1sk: lek.GSI1SK } : {}),
        })
      : undefined;

  return { items, ...(nextCursor ? { nextCursor } : {}) };
}
