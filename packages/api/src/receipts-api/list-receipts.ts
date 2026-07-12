import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  RECEIPT_SK_PREFIX,
  receiptSchema,
  userPk,
  type ListReceiptsResponse,
  type Receipt,
} from '@snaptab/shared';
import { encodeCursor } from './cursor';

export async function listReceipts(params: {
  ddb: DynamoDBDocumentClient;
  tableName: string;
  userId: string;
  limit: number;
  cursorSk: string | null;
}): Promise<ListReceiptsResponse> {
  const { ddb, tableName, userId, limit, cursorSk } = params;
  const pk = userPk(userId);

  const result = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': pk, ':prefix': RECEIPT_SK_PREFIX },
      // ULID no SK ordena por criação; descendente = mais recentes primeiro.
      ScanIndexForward: false,
      Limit: limit,
      ...(cursorSk ? { ExclusiveStartKey: { PK: pk, SK: cursorSk } } : {}),
    }),
  );

  // Um item corrompido não pode derrubar a lista inteira: loga e pula.
  const items: Receipt[] = [];
  for (const item of result.Items ?? []) {
    const parsed = receiptSchema.safeParse(item);
    if (parsed.success) {
      items.push(parsed.data);
    } else {
      console.warn(JSON.stringify({ msg: 'item fora do schema ignorado na listagem', sk: item.SK }));
    }
  }

  const lastSk = result.LastEvaluatedKey?.SK;
  return {
    items,
    ...(typeof lastSk === 'string' ? { nextCursor: encodeCursor(lastSk) } : {}),
  };
}
