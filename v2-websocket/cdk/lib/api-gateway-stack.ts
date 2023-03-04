import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as apigwv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import { WebSocketLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { CfnOutput, Duration } from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

export interface ApiGatewayStackProps extends cdk.StackProps {
  readonly tokenKey: string,
  readonly openaiApiKey: string,
}

export class ApiGatewayStack extends cdk.Stack {
  readonly restApi: apigateway.LambdaRestApi;

  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, props);

    const { tokenKey, openaiApiKey } = props;

    // rest api resources
    const chatUserInfoTable = new dynamodb.Table(this, 'ChatUserInfoTable', {
      partitionKey: { name: 'username', type: dynamodb.AttributeType.STRING }
    });

    const lambdaLogin = new NodejsFunction(this, 'Login', {
      entry: '../server/lambda_login/index.mjs',
      environment: { 'TOKEN_KEY': 'SAMPLE' },
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: Duration.minutes(1),
    });
    chatUserInfoTable.grantReadWriteData(lambdaLogin);

    const restApi = new apigateway.LambdaRestApi(this, 'RestApi', {
      handler: lambdaLogin,
      proxy: false,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['*'],
        allowCredentials: true,
      },
    });
    const login = restApi.root.addResource('login');
    login.addMethod('POST'); // POST /login

    // SNS Topic
    const topic = new sns.Topic(this, 'Topic', {
      displayName: 'Chat Message'
    })

    const lambdaChat = new NodejsFunction(this, 'Chat', {
      entry: '../server/lambda_chat/index.mjs',
      environment: { 'OPENAI_API_KEY': openaiApiKey },
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: Duration.minutes(1),
    });

    new sns.Subscription(this, 'Subscription', {
      topic,
      protocol: sns.SubscriptionProtocol.LAMBDA,
      endpoint: lambdaChat.functionArn,
    });

    // websocket api resources
    const lambdaConnectHandler = new NodejsFunction(this, 'ConnectHandle', {
      entry: '../server/lambda_connect_handle/index.mjs',
      environment: { 'TOKEN_KEY': tokenKey },
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: Duration.minutes(1),
    });

    const lambdaHandleChat = new NodejsFunction(this, 'HandleChat', {
      entry: '../server/lambda_handle_chat/index.mjs',
      environment: { 'SNS_TOPIC_ARN': topic.topicArn },
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: Duration.minutes(1),
    });

    const webSocketApi = new apigwv2.WebSocketApi(this, 'WebSocketApi', {
      apiName: 'wschatbot',
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration('ChatbotConnectHandler', lambdaConnectHandler),
      }
    });
    webSocketApi.addRoute('sendprompt', {
      integration: new WebSocketLambdaIntegration('HandleChat', lambdaHandleChat),
    });

    this.restApi = restApi;

    new CfnOutput(this, 'ApiEndPoint', {
      value: webSocketApi.apiEndpoint,
    });
  }
}
