import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  receiptSchema,
  receiptSk,
  userPk,
  type ReceiptDetailResponse,
} from '@snaptab/shared';

export const IMAGE_URL_TTL_SECONDS = 300;

export async function getReceipt(params: {
  ddb: DynamoDBDocumentClient;
  s3: S3Client;
  tableName: string;
  bucket: string;
  userId: string;
  receiptId: string;
}): Promise<ReceiptDetailResponse | null> {
  const { ddb, s3, tableName, bucket, userId, receiptId } = params;

  const result = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: userPk(userId), SK: receiptSk(receiptId) },
    }),
  );
  if (!result.Item) return null;

  // Aqui o parse é estrito (diferente da listagem): item único corrompido é
  // bug nosso de escrita — melhor um 500 visível que dado silenciosamente errado.
  const receipt = receiptSchema.parse(result.Item);

  const imageUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: receipt.s3Key }),
    { expiresIn: IMAGE_URL_TTL_SECONDS },
  );

  return { receipt, imageUrl };
}
