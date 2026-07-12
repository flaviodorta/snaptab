import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { receiptObjectKey, type UploadUrlRequest, type UploadUrlResponse } from '@snaptab/shared';
import { ulid } from 'ulid';

export const UPLOAD_URL_TTL_SECONDS = 300;

// O ContentType entra na assinatura: o PUT só funciona se o browser mandar
// exatamente o content-type declarado — ninguém sobe .exe com URL de imagem.
export async function createUploadUrl(params: {
  s3: S3Client;
  bucket: string;
  userId: string;
  request: UploadUrlRequest;
}): Promise<UploadUrlResponse> {
  const receiptId = ulid();
  const key = receiptObjectKey(params.userId, receiptId);

  const uploadUrl = await getSignedUrl(
    params.s3,
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: key,
      ContentType: params.request.contentType,
    }),
    {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
      // Sem isso o presigner v3 só assina 'host' e o content-type viraria decorativo.
      signableHeaders: new Set(['content-type']),
    },
  );

  return { receiptId, uploadUrl, expiresInSeconds: UPLOAD_URL_TTL_SECONDS };
}
