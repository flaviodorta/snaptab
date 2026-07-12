import { DynamoDBClient, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
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
  category: 'Alimentação',
  status: 'processed',
  createdAt: '2026-07-10T14:32:00.000Z',
  updatedAt: '2026-07-10T14:32:00.000Z',
};

function transactItems() {
  return ddbMock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems;
}

beforeEach(() => ddbMock.reset());

describe('storeReceipt', () => {
  it('recibo processed: transação com item + agregado CAT# atômico', async () => {
    ddbMock.on(TransactWriteCommand).resolves({});

    const result = await storeReceipt({ ddb, tableName: 'snaptab-main', receipt });

    expect(result).toBe('created');
    const items = transactItems();
    expect(items).toHaveLength(2);
    expect(items?.[0]?.Put?.ConditionExpression).toBe('attribute_not_exists(PK)');
    expect(items?.[0]?.Put?.Item).toMatchObject({
      PK: 'USER#user-123',
      SK: 'RECEIPT#01J8ZQ7C3M9WXYZABCDEF01234',
      GSI1SK: 'DATE#2026-07-10',
    });
    expect(items?.[1]?.Update).toMatchObject({
      Key: { PK: 'USER#user-123', SK: 'CAT#Alimentação' },
    });
    expect(items?.[1]?.Update?.UpdateExpression).toContain('ADD totalCents');
    expect(items?.[1]?.Update?.ExpressionAttributeValues).toMatchObject({
      ':total': 4250,
      ':one': 1,
    });
  });

  it('recibo failed: só o Put, sem tocar no agregado', async () => {
    ddbMock.on(TransactWriteCommand).resolves({});

    await storeReceipt({
      ddb,
      tableName: 'snaptab-main',
      receipt: { ...receipt, status: 'failed', totalCents: 0 },
    });

    expect(transactItems()).toHaveLength(1);
  });

  it('reprocessamento: transação cancelada por condição → already-exists, agregado intacto', async () => {
    ddbMock.on(TransactWriteCommand).rejects(
      new TransactionCanceledException({
        message: 'cancelled',
        $metadata: {},
        CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }],
      }),
    );

    await expect(storeReceipt({ ddb, tableName: 'snaptab-main', receipt })).resolves.toBe(
      'already-exists',
    );
  });

  it('outros erros sobem (recuperável → retry)', async () => {
    ddbMock.on(TransactWriteCommand).rejects(new Error('ThrottlingException'));

    await expect(storeReceipt({ ddb, tableName: 'snaptab-main', receipt })).rejects.toThrow();
  });
});
