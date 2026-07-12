import {
  paginateQuery,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  CATEGORY_SK_PREFIX,
  categoryAggregateSchema,
  receiptSchema,
  userPk,
  type SummaryResponse,
} from '@snaptab/shared';

// Duas leituras, nenhuma varre a tabela:
// 1. Totais por categoria → itens CAT# (≤ nº de categorias, mantidos na escrita).
// 2. Período + evolução → GSI1 BETWEEN DATE#from..DATE#to, somado por dia.
export async function getSummary(params: {
  ddb: DynamoDBDocumentClient;
  tableName: string;
  userId: string;
  from: string;
  to: string;
}): Promise<SummaryResponse> {
  const { ddb, tableName, userId, from, to } = params;
  const pk = userPk(userId);

  const aggregates = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': pk, ':prefix': CATEGORY_SK_PREFIX },
    }),
  );
  const categories = (aggregates.Items ?? [])
    .map((item) => categoryAggregateSchema.safeParse(item))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
    // Agregado zerado (todos os recibos migraram de categoria) fica fora.
    .filter((agg) => agg.receiptCount > 0)
    .sort((a, b) => b.totalCents - a.totalCents);

  let totalCents = 0;
  let receiptCount = 0;
  const byDate = new Map<string, number>();

  for await (const page of paginateQuery(
    { client: ddb },
    {
      TableName: tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK BETWEEN :lo AND :hi',
      ExpressionAttributeValues: {
        ':pk': pk,
        ':lo': `DATE#${from}`,
        ':hi': `DATE#${to}`,
      },
    },
  )) {
    for (const item of page.Items ?? []) {
      const parsed = receiptSchema.safeParse(item);
      // failed (total 0) fica fora — consistente com os agregados CAT#.
      if (!parsed.success || parsed.data.status !== 'processed') continue;
      totalCents += parsed.data.totalCents;
      receiptCount += 1;
      byDate.set(parsed.data.date, (byDate.get(parsed.data.date) ?? 0) + parsed.data.totalCents);
    }
  }

  const evolution = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cents]) => ({ date, totalCents: cents }));

  return {
    categories,
    period: { from, to, totalCents, receiptCount },
    evolution,
  };
}
