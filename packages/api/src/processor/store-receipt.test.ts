import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { Receipt } from '@snaptab/shared';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { storeReceipt } from './store-receipt';

const ddbMock = mockClient(DynamoDBDocumentClient);
// Client real com credenciais falsas — o mock intercepta o send, nada sai pra rede.
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  }),
);

const receipt: Receipt = {
  receiptId: '01J8ZQ7C3M9WXYZABCDEF01234',
  userId: 'user-123',
  s3Key: 'user-123/01J8ZQ7C3M9WXYZABCDEF01234',
  merchant: 'Padaria do Zé',
  totalCents: 4250,
  date: '2026-07-10',
  category: 'Outros',
  status: 'processed',
  createdAt: '2026-07-10T14:32:00.000Z',
  updatedAt: '2026-07-10T14:32:00.000Z',
};

beforeEach(() => ddbMock.reset());

describe('storeReceipt', () => {
  it('grava item com chaves do single-table design e condição anti-overwrite', async () => {
    ddbMock.on(PutCommand).resolves({});

    const result = await storeReceipt({ ddb, tableName: 'snaptab-main', receipt });

    expect(result).toBe('created');
    const input = ddbMock.commandCalls(PutCommand)[0]?.args[0].input;
    expect(input?.ConditionExpression).toBe('attribute_not_exists(PK)');
    expect(input?.Item).toMatchObject({
      PK: 'USER#user-123',
      SK: 'RECEIPT#01J8ZQ7C3M9WXYZABCDEF01234',
      GSI1PK: 'USER#user-123',
      GSI1SK: 'DATE#2026-07-10',
      totalCents: 4250,
    });
  });

  it('reprocessamento não duplica: condição falha → already-exists, sem throw', async () => {
    ddbMock
      .on(PutCommand)
      .rejects(new ConditionalCheckFailedException({ message: 'exists', $metadata: {} }));

    await expect(storeReceipt({ ddb, tableName: 'snaptab-main', receipt })).resolves.toBe(
      'already-exists',
    );
  });

  it('outros erros do Dynamo sobem (recuperável → retry)', async () => {
    ddbMock.on(PutCommand).rejects(new Error('ProvisionedThroughputExceeded'));

    await expect(storeReceipt({ ddb, tableName: 'snaptab-main', receipt })).rejects.toThrow();
  });
});
