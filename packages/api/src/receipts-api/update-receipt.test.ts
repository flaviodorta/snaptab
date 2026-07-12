import { DynamoDBClient, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { computeAggregateOps, updateReceipt } from './update-receipt';

const ddbMock = mockClient(DynamoDBDocumentClient);
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  }),
);

const ULID = '01J8ZQ7C3M9WXYZABCDEF01234';

const item = {
  PK: 'USER#user-123',
  SK: `RECEIPT#${ULID}`,
  receiptId: ULID,
  userId: 'user-123',
  s3Key: `user-123/${ULID}`,
  merchant: 'FARMACIA SAO JOAO',
  totalCents: 4590,
  date: '2026-07-12',
  category: 'Saúde',
  status: 'processed',
  createdAt: '2026-07-12T10:00:00.000Z',
  updatedAt: '2026-07-12T10:00:00.000Z',
};

const base = { ddb, tableName: 'snaptab-main', userId: 'user-123', receiptId: ULID };

beforeEach(() => ddbMock.reset());

describe('computeAggregateOps', () => {
  it('failed → processed: só soma na categoria nova', () => {
    expect(
      computeAggregateOps(
        { status: 'failed', category: 'Outros', totalCents: 0 },
        { category: 'Mercado', totalCents: 5000 },
      ),
    ).toEqual([{ category: 'Mercado', deltaCents: 5000, deltaCount: 1 }]);
  });

  it('mudou de categoria: decrementa a antiga, incrementa a nova', () => {
    expect(
      computeAggregateOps(
        { status: 'processed', category: 'Saúde', totalCents: 4590 },
        { category: 'Lazer', totalCents: 4590 },
      ),
    ).toEqual([
      { category: 'Saúde', deltaCents: -4590, deltaCount: -1 },
      { category: 'Lazer', deltaCents: 4590, deltaCount: 1 },
    ]);
  });

  it('mesma categoria, total mudou: só a diferença', () => {
    expect(
      computeAggregateOps(
        { status: 'processed', category: 'Saúde', totalCents: 4590 },
        { category: 'Saúde', totalCents: 5250 },
      ),
    ).toEqual([{ category: 'Saúde', deltaCents: 660, deltaCount: 0 }]);
  });

  it('nada relevante mudou: nenhuma operação', () => {
    expect(
      computeAggregateOps(
        { status: 'processed', category: 'Saúde', totalCents: 4590 },
        { category: 'Saúde', totalCents: 4590 },
      ),
    ).toEqual([]);
  });
});

describe('updateReceipt', () => {
  it('recibo inexistente → not-found sem transação', async () => {
    ddbMock.on(GetCommand).resolves({});

    await expect(updateReceipt({ ...base, patch: { totalCents: 100 } })).resolves.toBe(
      'not-found',
    );
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('edição de total: recibo + delta na mesma transação, com lock otimista', async () => {
    ddbMock.on(GetCommand).resolves({ Item: item });
    ddbMock.on(TransactWriteCommand).resolves({});

    const result = await updateReceipt({ ...base, patch: { totalCents: 5250 } });

    expect(result).toMatchObject({ receipt: { totalCents: 5250, status: 'processed' } });
    const items = ddbMock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems;
    expect(items).toHaveLength(2);
    expect(items?.[0]?.Update?.ConditionExpression).toContain('totalCents = :oldTotal');
    expect(items?.[0]?.Update?.ExpressionAttributeValues).toMatchObject({
      ':oldTotal': 4590,
      ':totalCents': 5250,
    });
    expect(items?.[1]?.Update?.ExpressionAttributeValues).toMatchObject({ ':delta': 660 });
  });

  it('mudança de categoria: três updates (recibo + duas categorias)', async () => {
    ddbMock.on(GetCommand).resolves({ Item: item });
    ddbMock.on(TransactWriteCommand).resolves({});

    await updateReceipt({ ...base, patch: { category: 'Lazer' } });

    const items = ddbMock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems;
    expect(items).toHaveLength(3);
    expect(items?.[1]?.Update?.Key).toEqual({ PK: 'USER#user-123', SK: 'CAT#Saúde' });
    expect(items?.[1]?.Update?.ExpressionAttributeValues).toMatchObject({
      ':delta': -4590,
      ':deltaCount': -1,
    });
    expect(items?.[2]?.Update?.Key).toEqual({ PK: 'USER#user-123', SK: 'CAT#Lazer' });
  });

  it('mudança de data atualiza o GSI1SK do recibo', async () => {
    ddbMock.on(GetCommand).resolves({ Item: item });
    ddbMock.on(TransactWriteCommand).resolves({});

    await updateReceipt({ ...base, patch: { date: '2026-07-01' } });

    const items = ddbMock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems;
    expect(items?.[0]?.Update?.ExpressionAttributeValues).toMatchObject({
      ':gsi1sk': 'DATE#2026-07-01',
    });
  });

  it('edição concorrente: transação cancelada → conflict', async () => {
    ddbMock.on(GetCommand).resolves({ Item: item });
    ddbMock.on(TransactWriteCommand).rejects(
      new TransactionCanceledException({
        message: 'cancelled',
        $metadata: {},
        CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
      }),
    );

    await expect(updateReceipt({ ...base, patch: { totalCents: 1 } })).resolves.toBe('conflict');
  });
});
