import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { SnaptabStack } from './snaptab-stack';

// Testes de assertions do CDK: travam as decisões estruturais do stack
// (chaves da tabela, DLQ, bloqueio público) contra regressão acidental.
const template = Template.fromStack(new SnaptabStack(new App(), 'TestStack'));

describe('SnaptabStack', () => {
  it('tabela snaptab-main com PK/SK e GSI1 on-demand', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'snaptab-main',
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'GSI1',
          KeySchema: [
            { AttributeName: 'GSI1PK', KeyType: 'HASH' },
            { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
          ],
        }),
      ]),
    });
  });

  it('fila de ingestão manda pra DLQ após 3 tentativas', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: 'snaptab-ingest-queue',
      RedrivePolicy: Match.objectLike({ maxReceiveCount: 3 }),
    });
  });

  it('bucket de recibos bloqueia todo acesso público', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('ObjectCreated do bucket notifica a fila de ingestão', () => {
    template.hasResourceProperties('Custom::S3BucketNotifications', {
      NotificationConfiguration: Match.objectLike({
        QueueConfigurations: Match.arrayWith([
          Match.objectLike({ Events: ['s3:ObjectCreated:*'] }),
        ]),
      }),
    });
  });

  it('rota de upload protegida pelo authorizer JWT', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /receipts/upload-url',
      AuthorizationType: 'JWT',
    });
  });

  it('cognito e http api presentes', () => {
    template.resourceCountIs('AWS::Cognito::UserPool', 1);
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    expect(template.findResources('AWS::Cognito::UserPoolClient')).not.toEqual({});
  });
});
