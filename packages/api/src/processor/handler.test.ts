import { AnalyzeExpenseCommand, TextractClient } from '@aws-sdk/client-textract';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import type { SQSEvent } from 'aws-lambda';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mercado from './__fixtures__/mercado.json';
import { handler } from './handler';

const textractMock = mockClient(TextractClient);
const ddbMock = mockClient(DynamoDBDocumentClient);

const ULID = '01J8ZQ7C3M9WXYZABCDEF01234';
const KEY = `user-123/${ULID}`;

function s3EventBody(key: string): string {
  return JSON.stringify({
    Records: [
      {
        eventName: 'ObjectCreated:Put',
        s3: { bucket: { name: 'test-bucket' }, object: { key } },
      },
    ],
  });
}

function sqsEvent(...bodies: string[]): SQSEvent {
  return {
    Records: bodies.map((body, i) => ({ messageId: `msg-${i}`, body })),
  } as SQSEvent;
}

function namedError(name: string): Error {
  const err = new Error(name);
  err.name = name;
  return err;
}

beforeAll(() => {
  process.env.TABLE_NAME = 'snaptab-main';
});

beforeEach(() => {
  textractMock.reset();
  ddbMock.reset();
});

describe('handler processor', () => {
  it('caminho feliz: OCR → item processed e categorizado + agregado na transação', async () => {
    textractMock.on(AnalyzeExpenseCommand).resolves(mercado as never);
    ddbMock.on(TransactWriteCommand).resolves({});

    const result = await handler(sqsEvent(s3EventBody(KEY)));

    expect(result.batchItemFailures).toEqual([]);
    const items = ddbMock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems;
    expect(items?.[0]?.Put?.Item).toMatchObject({
      SK: `RECEIPT#${ULID}`,
      merchant: 'SUPERMERCADO BOM PRECO LTDA',
      totalCents: 118745,
      date: '2026-07-10',
      status: 'processed',
      category: 'Mercado',
    });
    expect(items?.[1]?.Update?.Key).toEqual({ PK: 'USER#user-123', SK: 'CAT#Mercado' });
  });

  it('s3:TestEvent: ack sem chamar Textract', async () => {
    const result = await handler(
      sqsEvent(JSON.stringify({ Service: 'Amazon S3', Event: 's3:TestEvent' })),
    );

    expect(result.batchItemFailures).toEqual([]);
    expect(textractMock.commandCalls(AnalyzeExpenseCommand)).toHaveLength(0);
  });

  it('object key fora do formato: ack sem processar', async () => {
    const result = await handler(sqsEvent(s3EventBody('caminho/estranho/demais')));

    expect(result.batchItemFailures).toEqual([]);
    expect(textractMock.commandCalls(AnalyzeExpenseCommand)).toHaveLength(0);
  });

  it('throttling do Textract: mensagem volta pro batch (retry → DLQ)', async () => {
    textractMock.on(AnalyzeExpenseCommand).rejects(namedError('ThrottlingException'));

    const result = await handler(sqsEvent(s3EventBody(KEY)));

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-0' }]);
  });

  it('documento ilegível: grava item failed e acka', async () => {
    textractMock.on(AnalyzeExpenseCommand).rejects(namedError('UnsupportedDocumentException'));
    ddbMock.on(TransactWriteCommand).resolves({});

    const result = await handler(sqsEvent(s3EventBody(KEY)));

    expect(result.batchItemFailures).toEqual([]);
    const items = ddbMock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems;
    expect(items).toHaveLength(1); // failed não entra no agregado
    expect(items?.[0]?.Put?.Item).toMatchObject({
      status: 'failed',
      totalCents: 0,
      merchant: 'Desconhecido',
      category: 'Outros',
    });
  });

  it('falha só nas mensagens quebradas do batch, não no batch todo', async () => {
    textractMock.on(AnalyzeExpenseCommand).rejects(namedError('InternalServerError'));

    const result = await handler(
      sqsEvent(
        JSON.stringify({ Event: 's3:TestEvent' }), // ack
        s3EventBody(KEY), // falha recuperável
      ),
    );

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-1' }]);
  });
});
