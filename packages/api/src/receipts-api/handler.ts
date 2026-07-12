import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { listReceiptsQuerySchema, receiptIdSchema } from '@snaptab/shared';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { getUserId } from '../lib/auth';
import { requireEnv } from '../lib/env';
import { jsonResponse } from '../lib/http';
import { decodeCursor } from './cursor';
import { getReceipt } from './get-receipt';
import { listReceipts } from './list-receipts';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  const userId = getUserId(event);
  if (!userId) {
    return jsonResponse(401, { error: 'não autenticado' });
  }

  switch (event.routeKey) {
    case 'GET /receipts':
      return list(event, userId);
    case 'GET /receipts/{id}':
      return detail(event, userId);
    default:
      return jsonResponse(404, { error: 'rota desconhecida' });
  }
}

async function list(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  userId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  const query = listReceiptsQuerySchema.safeParse(event.queryStringParameters ?? {});
  if (!query.success) {
    return jsonResponse(400, { error: 'parâmetros inválidos: limit deve ser 1–50' });
  }

  const cursorSk = query.data.cursor ? decodeCursor(query.data.cursor) : null;
  if (query.data.cursor && !cursorSk) {
    return jsonResponse(400, { error: 'cursor inválido' });
  }

  const response = await listReceipts({
    ddb,
    tableName: requireEnv('TABLE_NAME'),
    userId,
    limit: query.data.limit,
    cursorSk,
  });
  return jsonResponse(200, response);
}

async function detail(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  userId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  // id fora do formato ULID nunca existe na tabela → mesmo 404 de não achado.
  const receiptId = receiptIdSchema.safeParse(event.pathParameters?.id);
  if (!receiptId.success) {
    return jsonResponse(404, { error: 'recibo não encontrado' });
  }

  const response = await getReceipt({
    ddb,
    s3,
    tableName: requireEnv('TABLE_NAME'),
    bucket: requireEnv('BUCKET_NAME'),
    userId,
    receiptId: receiptId.data,
  });
  if (!response) {
    return jsonResponse(404, { error: 'recibo não encontrado' });
  }
  return jsonResponse(200, response);
}
