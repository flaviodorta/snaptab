import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { categorySk, dateGsi1Sk, receiptSk, userPk, type Receipt } from '@snaptab/shared';

export type StoreResult = 'created' | 'already-exists';

// Escrita idempotente E atômica: recibo + agregado CAT# vão na mesma
// transação. Se a condição do Put falha (reprocessamento), a transação
// inteira cancela — o agregado nunca é somado duas vezes; se o processo
// morresse entre duas escritas separadas, recibo e agregado divergiriam.
// Recibos 'failed' (total não extraído) ficam fora do agregado: entram
// quando o usuário corrigir na edição manual.
export async function storeReceipt(params: {
  ddb: DynamoDBDocumentClient;
  tableName: string;
  receipt: Receipt;
}): Promise<StoreResult> {
  const { ddb, tableName, receipt } = params;
  const pk = userPk(receipt.userId);

  const transactItems: NonNullable<
    ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']
  > = [
    {
      Put: {
        TableName: tableName,
        Item: {
          PK: pk,
          SK: receiptSk(receipt.receiptId),
          GSI1PK: pk,
          GSI1SK: dateGsi1Sk(receipt.date),
          ...receipt,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
  ];

  if (receipt.status === 'processed') {
    transactItems.push({
      Update: {
        TableName: tableName,
        Key: { PK: pk, SK: categorySk(receipt.category) },
        // ADD é atômico e cria o item se não existir.
        UpdateExpression:
          'ADD totalCents :total, receiptCount :one ' +
          'SET category = if_not_exists(category, :cat), userId = if_not_exists(userId, :uid)',
        ExpressionAttributeValues: {
          ':total': receipt.totalCents,
          ':one': 1,
          ':cat': receipt.category,
          ':uid': receipt.userId,
        },
      },
    });
  }

  try {
    await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }));
    return 'created';
  } catch (err) {
    if (
      err instanceof TransactionCanceledException &&
      err.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed'
    ) {
      return 'already-exists';
    }
    throw err;
  }
}
