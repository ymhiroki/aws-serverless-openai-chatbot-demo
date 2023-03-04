#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ApiGatewayStack } from '../lib/api-gateway-stack';
import { StaticContentStack } from '../lib/static-content-stack';

const app = new cdk.App();

const tokenKey = '';
const openaiApiKey = '';
new ApiGatewayStack(app, 'ApiGatewayStack', {
  tokenKey,
  openaiApiKey,
});

new StaticContentStack(app, 'StaticContentStack', {
});
