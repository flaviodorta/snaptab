import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { decodeCursor } from './cursor';
import { listReceipts } from './list-receipts';

const ddbMock = mockClient(DynamoDBDocumentClient);
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  }),
);

const ULID_A = '01J8ZQ7C3M9WXYZABCDEF01234';
const ULID_B = '01J8ZQ7C3M9WXYZABCDEF01235';

function dynamoItem(receiptId: string): Record<string, unknown> {
  return {
    PK: 'USER#user-123',
    SK: `RECEIPT#${receiptId}`,
    GSI1PK: 'USER#user-123',
    GSI1SK: 'DATE#2026-07-10',
    receiptId,
    userId: 'user-123',
    s3Key: `user-123/${receiptId}`,
    merchant: 'Mercado São José',
    totalCents: 6949,
    date: '2026-07-10',
    category: 'Outros',
    status: 'processed',
    createdAt: '2026-07-10T14:32:00.000Z',
    updatedAt: '2026-07-10T14:32:00.000Z',
  };
}

beforeEach(() => ddbMock.reset());

describe('listReceipts', () => {
  it('consulta descendente pelo PK do usuário e mapeia itens pro domínio', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [dynamoItem(ULID_B), dynamoItem(ULID_A)] });

    const result = await listReceipts({
      ddb,
      tableName: 'snaptab-main',
      userId: 'user-123',
      limit: 20,
      cursorSk: null,
    });

    const input = ddbMock.commandCalls(QueryCommand)[0]?.args[0].input;
    expect(input?.ScanIndexForward).toBe(false);
    expect(input?.ExpressionAttributeValues).toEqual({
      ':pk': 'USER#user-123',
      ':prefix': 'RECEIPT#',
    });
    expect(result.items.map((r) => r.receiptId)).toEqual([ULID_B, ULID_A]);
    // Chaves internas (PK/SK/GSI) não vazam pro shape da API.
    expect(result.items[0]).not.toHaveProperty('PK');
    expect(result.nextCursor).toBeUndefined();
  });

  it('item corrompido é pulado sem derrubar a lista', async () => {
    ddbMock
      .on(QueryCommand)
      .resolves({ Items: [dynamoItem(ULID_A), { SK: 'RECEIPT#quebrado', totalCents: 'NaN' }] });

    const result = await listReceipts({
      ddb,
      tableName: 'snaptab-main',
      userId: 'user-123',
      limit: 20,
      cursorSk: null,
    });

    expect(result.items).toHaveLength(1);
  });

  it('pagina: usa cursor de entrada com PK do usuário e devolve nextCursor', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [dynamoItem(ULID_B)],
      LastEvaluatedKey: { PK: 'USER#user-123', SK: `RECEIPT#${ULID_B}` },
    });

    const result = await listReceipts({
      ddb,
      tableName: 'snaptab-main',
      userId: 'user-123',
      limit: 1,
      cursorSk: `RECEIPT#${ULID_A}`,
    });

    const input = ddbMock.commandCalls(QueryCommand)[0]?.args[0].input;
    // PK do ExclusiveStartKey NUNCA vem do cursor — sempre do userId do JWT.
    expect(input?.ExclusiveStartKey).toEqual({
      PK: 'USER#user-123',
      SK: `RECEIPT#${ULID_A}`,
    });
    expect(result.nextCursor).toBeDefined();
    expect(decodeCursor(result.nextCursor ?? '')).toBe(`RECEIPT#${ULID_B}`);
  });
});
