import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handler } from './handler';

const ddbMock = mockClient(DynamoDBDocumentClient);

const ULID = '01J8ZQ7C3M9WXYZABCDEF01234';

const item = {
  PK: 'USER#user-123',
  SK: `RECEIPT#${ULID}`,
  receiptId: ULID,
  userId: 'user-123',
  s3Key: `user-123/${ULID}`,
  merchant: 'Mercado São José',
  totalCents: 6949,
  date: '2026-07-10',
  category: 'Outros',
  status: 'processed',
  createdAt: '2026-07-10T14:32:00.000Z',
  updatedAt: '2026-07-10T14:32:00.000Z',
};

function makeEvent(overrides: {
  routeKey: string;
  sub?: string;
  pathParameters?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
}): APIGatewayProxyEventV2WithJWTAuthorizer {
  const event = {
    routeKey: overrides.routeKey,
    pathParameters: overrides.pathParameters,
    queryStringParameters: overrides.queryStringParameters,
    requestContext: {
      authorizer: overrides.sub
        ? { jwt: { claims: { sub: overrides.sub }, scopes: [] } }
        : undefined,
    },
  };
  return event as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

beforeAll(() => {
  process.env.TABLE_NAME = 'snaptab-main';
  process.env.BUCKET_NAME = 'test-bucket';
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_ACCESS_KEY_ID = 'test';
  process.env.AWS_SECRET_ACCESS_KEY = 'test';
});

beforeEach(() => ddbMock.reset());

describe('handler receipts-api', () => {
  it('401 sem claims', async () => {
    const result = await handler(makeEvent({ routeKey: 'GET /receipts' }));
    expect(result.statusCode).toBe(401);
  });

  it('404 pra rota desconhecida', async () => {
    const result = await handler(makeEvent({ routeKey: 'DELETE /receipts', sub: 'user-123' }));
    expect(result.statusCode).toBe(404);
  });

  it('GET /receipts: 200 com itens', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [item] });

    const result = await handler(makeEvent({ routeKey: 'GET /receipts', sub: 'user-123' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body ?? '{}') as { items: { receiptId: string }[] };
    expect(body.items[0]?.receiptId).toBe(ULID);
  });

  it('GET /receipts: 400 pra limit fora da faixa e cursor forjado', async () => {
    const badQueries: Record<string, string>[] = [
      { limit: '999' },
      { limit: '0' },
      { cursor: '@@@' },
    ];
    for (const queryStringParameters of badQueries) {
      const result = await handler(
        makeEvent({ routeKey: 'GET /receipts', sub: 'user-123', queryStringParameters }),
      );
      expect(result.statusCode).toBe(400);
    }
  });

  it('GET /receipts/{id}: 200 com recibo + imageUrl assinada', async () => {
    ddbMock.on(GetCommand).resolves({ Item: item });

    const result = await handler(
      makeEvent({ routeKey: 'GET /receipts/{id}', sub: 'user-123', pathParameters: { id: ULID } }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body ?? '{}') as {
      receipt: { merchant: string };
      imageUrl: string;
    };
    expect(body.receipt.merchant).toBe('Mercado São José');
    expect(body.imageUrl).toContain('test-bucket');
    expect(body.imageUrl).toContain(`user-123/${ULID}`);
  });

  it('GET /receipts/{id}: 404 pra id inexistente ou fora do formato', async () => {
    ddbMock.on(GetCommand).resolves({});

    for (const id of [ULID, 'nao-e-ulid']) {
      const result = await handler(
        makeEvent({ routeKey: 'GET /receipts/{id}', sub: 'user-123', pathParameters: { id } }),
      );
      expect(result.statusCode).toBe(404);
    }
  });
});
