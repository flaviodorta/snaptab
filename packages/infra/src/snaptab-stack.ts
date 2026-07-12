import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { AccountRecovery, UserPool, type UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { AttributeType, BillingMode, ProjectionType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  EventType,
  HttpMethods,
} from 'aws-cdk-lib/aws-s3';
import { SqsDestination } from 'aws-cdk-lib/aws-s3-notifications';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

// Timeout que o processor vai usar na Fase 4. A visibilidade da fila é 6x isso,
// como a AWS recomenda para event source mapping (evita reentrega durante retry).
const PROCESSOR_TIMEOUT = Duration.seconds(60);

// Handlers do @snaptab/api, bundlados pelo esbuild via NodejsFunction.
function apiEntry(file: string): string {
  return fileURLToPath(new URL(`../../api/src/${file}`, import.meta.url));
}

const DEPS_LOCK_FILE = fileURLToPath(new URL('../../../pnpm-lock.yaml', import.meta.url));

export class SnaptabStack extends Stack {
  readonly table: Table;
  readonly receiptsBucket: Bucket;
  readonly ingestQueue: Queue;
  readonly ingestDlq: Queue;
  readonly userPool: UserPool;
  readonly userPoolClient: UserPoolClient;
  readonly httpApi: HttpApi;
  readonly jwtAuthorizer: HttpJwtAuthorizer;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Origem do frontend para CORS (S3 e API). Em deploy real:
    //   cdk deploy -c webOrigin=https://app.exemplo.com
    const webOrigin =
      (this.node.tryGetContext('webOrigin') as string | undefined) ?? 'http://localhost:5173';

    // ─── Dados: single-table design (CLAUDE.md §5) ─────────────────────────
    this.table = new Table(this, 'MainTable', {
      tableName: 'snaptab-main',
      partitionKey: { name: 'PK', type: AttributeType.STRING },
      sortKey: { name: 'SK', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      // Portfólio: dados descartáveis. Em produção seria RETAIN + PITR.
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // ─── Ingestão: S3 → SQS (+ DLQ) ────────────────────────────────────────
    this.ingestDlq = new Queue(this, 'IngestDlq', {
      queueName: 'snaptab-ingest-dlq',
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });

    this.ingestQueue = new Queue(this, 'IngestQueue', {
      queueName: 'snaptab-ingest-queue',
      visibilityTimeout: Duration.seconds(PROCESSOR_TIMEOUT.toSeconds() * 6),
      enforceSSL: true,
      deadLetterQueue: {
        queue: this.ingestDlq,
        maxReceiveCount: 3,
      },
    });

    this.receiptsBucket = new Bucket(this, 'ReceiptsBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      cors: [
        {
          // Só o PUT do presigned URL vem do browser; leitura é via presigned GET.
          allowedMethods: [HttpMethods.PUT, HttpMethods.GET],
          allowedOrigins: [webOrigin],
          allowedHeaders: ['content-type'],
          maxAge: 3600,
        },
      ],
      lifecycleRules: [{ abortIncompleteMultipartUploadAfter: Duration.days(7) }],
      // Portfólio: cdk destroy limpa tudo. Em produção seria RETAIN.
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    this.receiptsBucket.addEventNotification(
      EventType.OBJECT_CREATED,
      new SqsDestination(this.ingestQueue),
    );

    // ─── Auth: Cognito ─────────────────────────────────────────────────────
    this.userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.userPoolClient = this.userPool.addClient('WebClient', {
      // SPA: SRP sem client secret (o browser não guarda segredo).
      // adminUserPassword permite gerar token via CLI pra smoke tests.
      authFlows: { userSrp: true, adminUserPassword: true },
    });

    // ─── API: HTTP API com JWT authorizer ──────────────────────────────────
    this.jwtAuthorizer = new HttpJwtAuthorizer(
      'CognitoJwt',
      `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`,
      { jwtAudience: [this.userPoolClient.userPoolClientId] },
    );

    this.httpApi = new HttpApi(this, 'HttpApi', {
      // Toda rota registrada sem authorizer explícito exige JWT do Cognito.
      defaultAuthorizer: this.jwtAuthorizer,
      corsPreflight: {
        allowOrigins: [webOrigin],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.PATCH],
        allowHeaders: ['authorization', 'content-type'],
        maxAge: Duration.hours(1),
      },
    });

    // ─── Lambdas + rotas ───────────────────────────────────────────────────
    const uploadUrlFn = new NodejsFunction(this, 'UploadUrlFn', {
      entry: apiEntry('upload-url/handler.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: Duration.seconds(10),
      depsLockFilePath: DEPS_LOCK_FILE,
      environment: { BUCKET_NAME: this.receiptsBucket.bucketName },
    });
    // Least privilege: só PutObject (e afins) nos objetos do bucket de recibos.
    this.receiptsBucket.grantPut(uploadUrlFn);

    this.httpApi.addRoutes({
      path: '/receipts/upload-url',
      methods: [HttpMethod.POST],
      // Sem authorizer explícito → herda o JWT do Cognito (defaultAuthorizer).
      integration: new HttpLambdaIntegration('UploadUrlIntegration', uploadUrlFn),
    });

    const receiptsApiFn = new NodejsFunction(this, 'ReceiptsApiFn', {
      entry: apiEntry('receipts-api/handler.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: Duration.seconds(10),
      depsLockFilePath: DEPS_LOCK_FILE,
      environment: {
        TABLE_NAME: this.table.tableName,
        BUCKET_NAME: this.receiptsBucket.bucketName,
      },
    });
    this.table.grantReadData(receiptsApiFn);
    // Presigned GET da imagem é assinado com as credenciais desta role.
    this.receiptsBucket.grantRead(receiptsApiFn);

    const receiptsApiIntegration = new HttpLambdaIntegration(
      'ReceiptsApiIntegration',
      receiptsApiFn,
    );
    this.httpApi.addRoutes({
      path: '/receipts',
      methods: [HttpMethod.GET],
      integration: receiptsApiIntegration,
    });
    this.httpApi.addRoutes({
      path: '/receipts/{id}',
      methods: [HttpMethod.GET],
      integration: receiptsApiIntegration,
    });
    this.httpApi.addRoutes({
      path: '/summary',
      methods: [HttpMethod.GET],
      integration: receiptsApiIntegration,
    });

    const processorFn = new NodejsFunction(this, 'ProcessorFn', {
      entry: apiEntry('processor/handler.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: PROCESSOR_TIMEOUT,
      depsLockFilePath: DEPS_LOCK_FILE,
      environment: { TABLE_NAME: this.table.tableName },
    });
    this.table.grantWriteData(processorFn);
    // O AnalyzeExpense lê o objeto com as credenciais de quem chama.
    this.receiptsBucket.grantRead(processorFn);
    // Exceção documentada ao "nada de *": Textract não tem permissão por
    // recurso — a action específica é o menor escopo possível.
    processorFn.addToRolePolicy(
      new PolicyStatement({ actions: ['textract:AnalyzeExpense'], resources: ['*'] }),
    );
    processorFn.addEventSource(
      new SqsEventSource(this.ingestQueue, {
        batchSize: 5,
        // Só as mensagens que falharam voltam pra fila, não o batch inteiro.
        reportBatchItemFailures: true,
      }),
    );

    // ─── Outputs que o web/api consomem como config ────────────────────────
    new CfnOutput(this, 'ApiUrl', { value: this.httpApi.apiEndpoint });
    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
    new CfnOutput(this, 'ReceiptsBucketName', { value: this.receiptsBucket.bucketName });
    new CfnOutput(this, 'TableName', { value: this.table.tableName });
  }
}
