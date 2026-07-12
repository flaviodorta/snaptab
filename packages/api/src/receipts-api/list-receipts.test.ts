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

function dynamoItem(receiptId: string, date = '2026-07-10'): Record<string, unknown> {
  return {
    PK: 'USER#user-123',
    SK: `RECEIPT#${receiptId}`,
    GSI1PK: 'USER#user-123',
    GSI1SK: `DATE#${date}`,
    receiptId,
    userId: 'user-123',
    s3Key: `user-123/${receiptId}`,
    merchant: 'Mercado São José',
    totalCents: 6949,
    date,
    category: 'Mercado',
    status: 'processed',
    createdAt: '2026-07-10T14:32:00.000Z',
    updatedAt: '2026-07-10T14:32:00.000Z',
  };
}

const base = { ddb, tableName: 'snaptab-main', userId: 'user-123', limit: 20, cursor: null };

function queryInput() {
  return ddbMock.commandCalls(QueryCommand)[0]?.args[0].input;
}

beforeEach(() => ddbMock.reset());

describe('listReceipts', () => {
  it('sem filtros: query descendente na tabela pelo PK do usuário', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [dynamoItem(ULID_B), dynamoItem(ULID_A)] });

    const result = await listReceipts(base);

    const input = queryInput();
    expect(input?.IndexName).toBeUndefined();
    expect(input?.ScanIndexForward).toBe(false);
    expect(result.items.map((r) => r.receiptId)).toEqual([ULID_B, ULID_A]);
    expect(result.items[0]).not.toHaveProperty('PK');
    expect(result.nextCursor).toBeUndefined();
  });

  it('com intervalo de datas: query no GSI1 com BETWEEN', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [dynamoItem(ULID_A)] });

    await listReceipts({ ...base, from: '2026-07-01', to: '2026-07-31' });

    const input = queryInput();
    expect(input?.IndexName).toBe('GSI1');
    expect(input?.KeyConditionExpression).toContain('BETWEEN');
    expect(input?.ExpressionAttributeValues).toMatchObject({
      ':lo': 'DATE#2026-07-01',
      ':hi': 'DATE#2026-07-31',
    });
  });

  it('com categoria: FilterExpression dentro da partição (nunca Scan)', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    await listReceipts({ ...base, category: 'Saúde' });

    const input = queryInput();
    expect(input?.FilterExpression).toBe('#cat = :category');
    expect(input?.ExpressionAttributeValues).toMatchObject({ ':category': 'Saúde' });
    expect(input?.KeyConditionExpression).toContain('PK = :pk');
  });

  it('item corrompido é pulado sem derrubar a lista', async () => {
    ddbMock
      .on(QueryCommand)
      .resolves({ Items: [dynamoItem(ULID_A), { SK: 'RECEIPT#quebrado', totalCents: 'NaN' }] });

    const result = await listReceipts(base);

    expect(result.items).toHaveLength(1);
  });

  it('paginação na tabela: ESK montado com PK do JWT + SK do cursor', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [dynamoItem(ULID_B)],
      LastEvaluatedKey: { PK: 'USER#user-123', SK: `RECEIPT#${ULID_B}` },
    });

    const result = await listReceipts({ ...base, limit: 1, cursor: { sk: `RECEIPT#${ULID_A}` } });

    expect(queryInput()?.ExclusiveStartKey).toEqual({
      PK: 'USER#user-123',
      SK: `RECEIPT#${ULID_A}`,
    });
    expect(decodeCursor(result.nextCursor ?? '')).toEqual({ sk: `RECEIPT#${ULID_B}` });
  });

  it('paginação no GSI1: ESK com as 4 chaves e nextCursor carrega gsi1sk', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [dynamoItem(ULID_B, '2026-07-11')],
      LastEvaluatedKey: {
        PK: 'USER#user-123',
        SK: `RECEIPT#${ULID_B}`,
        GSI1PK: 'USER#user-123',
        GSI1SK: 'DATE#2026-07-11',
      },
    });

    const result = await listReceipts({
      ...base,
      limit: 1,
      from: '2026-07-01',
      to: '2026-07-31',
      cursor: { sk: `RECEIPT#${ULID_A}`, gsi1sk: 'DATE#2026-07-10' },
    });

    expect(queryInput()?.ExclusiveStartKey).toEqual({
      PK: 'USER#user-123',
      SK: `RECEIPT#${ULID_A}`,
      GSI1PK: 'USER#user-123',
      GSI1SK: 'DATE#2026-07-10',
    });
    expect(decodeCursor(result.nextCursor ?? '')).toEqual({
      sk: `RECEIPT#${ULID_B}`,
      gsi1sk: 'DATE#2026-07-11',
    });
  });
});
