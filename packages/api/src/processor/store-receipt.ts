import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { dateGsi1Sk, receiptSk, userPk, type Receipt } from '@snaptab/shared';

export type StoreResult = 'created' | 'already-exists';

// Escrita idempotente: a chave PK/SK deriva do object key do S3, e a condição
// impede overwrite. Reprocessar a mesma mensagem SQS → 'already-exists', sem
// duplicar recibo (contrato do CLAUDE.md §8).
export async function storeReceipt(params: {
  ddb: DynamoDBDocumentClient;
  tableName: string;
  receipt: Receipt;
}): Promise<StoreResult> {
  const { ddb, tableName, receipt } = params;
  try {
    await ddb.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          PK: userPk(receipt.userId),
          SK: receiptSk(receipt.receiptId),
          GSI1PK: userPk(receipt.userId),
          GSI1SK: dateGsi1Sk(receipt.date),
          ...receipt,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
    return 'created';
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      return 'already-exists';
    }
    throw err;
  }
}
