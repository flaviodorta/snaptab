import { S3Client } from '@aws-sdk/client-s3';
import { parseReceiptObjectKey, uploadUrlResponseSchema } from '@snaptab/shared';
import { describe, expect, it } from 'vitest';
import { createUploadUrl, UPLOAD_URL_TTL_SECONDS } from './create-upload';

// A assinatura de presigned URL é 100% local — credenciais falsas bastam.
const s3 = new S3Client({
  region: 'us-east-1',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
});

describe('createUploadUrl', () => {
  it('gera URL assinada com key <userId>/<ULID> e content-type travado', async () => {
    const response = await createUploadUrl({
      s3,
      bucket: 'test-bucket',
      userId: 'user-123',
      request: { contentType: 'image/jpeg' },
    });

    expect(uploadUrlResponseSchema.safeParse(response).success).toBe(true);

    const url = new URL(response.uploadUrl);
    expect(url.hostname).toContain('test-bucket');
    // Key da URL bate com o formato de idempotência e com o receiptId retornado.
    const key = decodeURIComponent(url.pathname.slice(1));
    expect(parseReceiptObjectKey(key)).toEqual({
      userId: 'user-123',
      receiptId: response.receiptId,
    });
    // content-type participa da assinatura (browser não pode mandar outro).
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
    expect(url.searchParams.get('X-Amz-Expires')).toBe(String(UPLOAD_URL_TTL_SECONDS));
  });

  it('gera receiptIds distintos a cada chamada', async () => {
    const params = {
      s3,
      bucket: 'test-bucket',
      userId: 'user-123',
      request: { contentType: 'image/png' } as const,
    };
    const [a, b] = await Promise.all([createUploadUrl(params), createUploadUrl(params)]);
    expect(a.receiptId).not.toBe(b.receiptId);
  });
});
