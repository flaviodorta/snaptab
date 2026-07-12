import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { beforeAll, describe, expect, it } from 'vitest';
import { handler } from './handler';

// Evento mínimo com só o que o handler consome; o resto do shape do API GW
// não importa pro teste, daí o cast em cima de um objeto parcial explícito.
function makeEvent(overrides: { sub?: string; body?: string }): APIGatewayProxyEventV2WithJWTAuthorizer {
  const event = {
    requestContext: {
      authorizer: overrides.sub
        ? { jwt: { claims: { sub: overrides.sub }, scopes: [] } }
        : undefined,
    },
    body: overrides.body,
  };
  return event as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

beforeAll(() => {
  process.env.BUCKET_NAME = 'test-bucket';
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_ACCESS_KEY_ID = 'test';
  process.env.AWS_SECRET_ACCESS_KEY = 'test';
});

describe('handler upload-url', () => {
  it('retorna 401 sem claims do JWT', async () => {
    const result = await handler(makeEvent({ body: '{"contentType":"image/jpeg"}' }));
    expect(result.statusCode).toBe(401);
  });

  it('retorna 400 pra body inválido', async () => {
    for (const body of [undefined, 'não é json', '{}', '{"contentType":"application/pdf"}']) {
      const result = await handler(makeEvent({ sub: 'user-123', body }));
      expect(result.statusCode).toBe(400);
    }
  });

  it('retorna 201 com URL assinada pra request válido', async () => {
    const result = await handler(
      makeEvent({ sub: 'user-123', body: '{"contentType":"image/jpeg"}' }),
    );
    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body ?? '{}') as { uploadUrl: string; receiptId: string };
    expect(body.uploadUrl).toContain('test-bucket');
    expect(body.uploadUrl).toContain(`user-123/${body.receiptId}`);
  });
});
