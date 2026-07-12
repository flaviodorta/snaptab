import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { getSummary } from './get-summary';

const ddbMock = mockClient(DynamoDBDocumentClient);
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  }),
);

function receiptItem(receiptId: string, date: string, totalCents: number, status = 'processed') {
  return {
    PK: 'USER#user-123',
    SK: `RECEIPT#${receiptId}`,
    receiptId,
    userId: 'user-123',
    s3Key: `user-123/${receiptId}`,
    merchant: 'Qualquer',
    totalCents,
    date,
    category: 'Mercado',
    status,
    createdAt: '2026-07-10T14:32:00.000Z',
    updatedAt: '2026-07-10T14:32:00.000Z',
  };
}

beforeEach(() => ddbMock.reset());

describe('getSummary', () => {
  it('monta categorias dos CAT#, período e evolução do GSI1', async () => {
    // matcher específico (IndexName) tem precedência sobre o genérico
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { userId: 'user-123', category: 'Mercado', totalCents: 6949, receiptCount: 1 },
        { userId: 'user-123', category: 'Saúde', totalCents: 4590, receiptCount: 1 },
      ],
    });
    ddbMock.on(QueryCommand, { IndexName: 'GSI1' }).resolves({
      Items: [
        receiptItem('01J8ZQ7C3M9WXYZABCDEF01234', '2026-07-08', 2350),
        receiptItem('01J8ZQ7C3M9WXYZABCDEF01235', '2026-07-11', 6949),
        receiptItem('01J8ZQ7C3M9WXYZABCDEF01236', '2026-07-11', 1000),
        // failed não conta no período nem na evolução
        receiptItem('01J8ZQ7C3M9WXYZABCDEF01237', '2026-07-12', 0, 'failed'),
      ],
    });

    const summary = await getSummary({
      ddb,
      tableName: 'snaptab-main',
      userId: 'user-123',
      from: '2026-07-01',
      to: '2026-07-31',
    });

    // categorias ordenadas por total desc
    expect(summary.categories.map((c) => c.category)).toEqual(['Mercado', 'Saúde']);
    expect(summary.period).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
      totalCents: 10299,
      receiptCount: 3,
    });
    // evolução agrupada por dia, ordenada asc
    expect(summary.evolution).toEqual([
      { date: '2026-07-08', totalCents: 2350 },
      { date: '2026-07-11', totalCents: 7949 },
    ]);
  });

  it('usuário sem dados: tudo zerado sem explodir', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const summary = await getSummary({
      ddb,
      tableName: 'snaptab-main',
      userId: 'user-123',
      from: '2026-07-01',
      to: '2026-07-31',
    });

    expect(summary.categories).toEqual([]);
    expect(summary.period.totalCents).toBe(0);
    expect(summary.evolution).toEqual([]);
  });
});
