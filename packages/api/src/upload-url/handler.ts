import { S3Client } from '@aws-sdk/client-s3';
import { uploadUrlRequestSchema } from '@snaptab/shared';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { getUserId } from '../lib/auth';
import { requireEnv } from '../lib/env';
import { jsonResponse, parseJsonBody } from '../lib/http';
import { createUploadUrl } from './create-upload';

const s3 = new S3Client({});

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  const userId = getUserId(event);
  if (!userId) {
    return jsonResponse(401, { error: 'não autenticado' });
  }

  const parsed = uploadUrlRequestSchema.safeParse(parseJsonBody(event.body));
  if (!parsed.success) {
    return jsonResponse(400, {
      error: 'body inválido: esperado { "contentType": "image/jpeg" | "image/png" | "image/webp" }',
    });
  }

  const response = await createUploadUrl({
    s3,
    bucket: requireEnv('BUCKET_NAME'),
    userId,
    request: parsed.data,
  });
  return jsonResponse(201, response);
}
