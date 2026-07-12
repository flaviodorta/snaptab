import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { AnalyzeExpenseCommand, TextractClient } from '@aws-sdk/client-textract';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DEFAULT_CATEGORY,
  parseReceiptObjectKey,
  receiptSchema,
  s3ObjectCreatedEventSchema,
} from '@snaptab/shared';
import type { SQSBatchItemFailure, SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda';
import { requireEnv } from '../lib/env';
import { IrrecoverableError } from './errors';
import { parseExpense, UNKNOWN_MERCHANT, type ParsedExpense } from './parse-expense';
import { storeReceipt } from './store-receipt';

const textract = new TextractClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Erros do Textract que significam "este documento nunca vai ser lido"
// (imagem corrompida, formato inválido). Viram item status=failed + ack.
const UNREADABLE_DOCUMENT_ERRORS = new Set([
  'UnsupportedDocumentException',
  'BadDocumentException',
]);

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchItemFailure[] = [];
  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (err) {
      if (err instanceof IrrecoverableError) {
        console.warn(JSON.stringify({ msg: 'mensagem descartada', reason: err.message }));
        continue; // ack consciente
      }
      console.error('falha recuperável, mensagem volta pra fila:', err);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
}

async function processRecord(record: SQSRecord): Promise<void> {
  let body: unknown;
  try {
    body = JSON.parse(record.body) as unknown;
  } catch {
    throw new IrrecoverableError('body da mensagem não é JSON');
  }

  const event = s3ObjectCreatedEventSchema.safeParse(body);
  if (!event.success) {
    throw new IrrecoverableError('não é evento ObjectCreated (ex.: s3:TestEvent)');
  }

  for (const s3Record of event.data.Records) {
    // Object key chega URL-encoded no evento ('+' no lugar de espaço).
    const key = decodeURIComponent(s3Record.s3.object.key.replace(/\+/g, ' '));
    const ids = parseReceiptObjectKey(key);
    if (!ids) {
      throw new IrrecoverableError(`object key fora do formato <userId>/<ULID>: ${key}`);
    }
    await processReceipt(s3Record.s3.bucket.name, key, ids.userId, ids.receiptId);
  }
}

async function processReceipt(
  bucket: string,
  s3Key: string,
  userId: string,
  receiptId: string,
): Promise<void> {
  let parsed: ParsedExpense = { merchant: UNKNOWN_MERCHANT, totalCents: null, date: null };
  try {
    const output = await textract.send(
      new AnalyzeExpenseCommand({ Document: { S3Object: { Bucket: bucket, Name: s3Key } } }),
    );
    parsed = parseExpense(output);
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'InvalidS3ObjectException') {
      throw new IrrecoverableError(`objeto não existe mais no S3: ${s3Key}`, { cause: err });
    }
    if (!UNREADABLE_DOCUMENT_ERRORS.has(name)) {
      throw err; // recuperável: throttling, 5xx, rede → retry/DLQ
    }
    // documento ilegível: segue com parsed vazio → item failed
  }

  const now = new Date().toISOString();
  // Total é o campo essencial: sem ele o recibo fica 'failed' e o usuário
  // corrige na mão (Fase 9). Data ausente cai no dia do processamento.
  const receipt = receiptSchema.parse({
    receiptId,
    userId,
    s3Key,
    merchant: parsed.merchant,
    totalCents: parsed.totalCents ?? 0,
    date: parsed.date ?? now.slice(0, 10),
    category: DEFAULT_CATEGORY,
    status: parsed.totalCents !== null ? 'processed' : 'failed',
    createdAt: now,
    updatedAt: now,
  });

  const result = await storeReceipt({ ddb, tableName: requireEnv('TABLE_NAME'), receipt });
  console.log(
    JSON.stringify({ msg: 'recibo gravado', receiptId, userId, status: receipt.status, result }),
  );
}
