import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

// Identidade vem SEMPRE das claims do JWT (validado pelo authorizer do API
// Gateway) — nunca de body, path ou query. null = evento sem claims úteis.
export function getUserId(event: APIGatewayProxyEventV2WithJWTAuthorizer): string | null {
  const sub = event.requestContext.authorizer?.jwt?.claims?.sub;
  return typeof sub === 'string' && sub !== '' ? sub : null;
}
