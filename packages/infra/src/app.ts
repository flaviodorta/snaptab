import { App } from 'aws-cdk-lib';
import { SnaptabStack } from './snaptab-stack';

const app = new App();

new SnaptabStack(app, 'SnaptabStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
