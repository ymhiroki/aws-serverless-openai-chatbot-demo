import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as apigwv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import { WebSocketLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { CfnOutput } from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';

export interface ApiGatewayStackProps extends cdk.StackProps {
  readonly tokenKey: string,
  readonly openaiApiKey: string,
}

export class ApiGatewayStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, props);

    const { tokenKey, openaiApiKey } = props;

    // rest api resources
    const chatUserInfoTable = new dynamodb.Table(this, 'ChatUserInfoTable', {
      partitionKey: { name: 'username', type: dynamodb.AttributeType.STRING }
    });

    const lambdaLogin = new lambda.Function(this, 'Login', {
      code: lambda.Code.fromAsset('../server/lambda_login'),
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      environment: { 'TOKEN_KEY': 'SAMPLE' },
    });
    chatUserInfoTable.grantReadWriteData(lambdaLogin);

    const restApi = new apigateway.LambdaRestApi(this, 'RestApi', {
      handler: lambdaLogin,
      proxy: false,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      },
    });
    const login = restApi.root.addResource('login');
    login.addMethod('POST'); // POST /login

    // SNS Topic
    const topic = new sns.Topic(this, 'Topic', {
      displayName: 'Chat Message'
    })

    const lambdaChat = new lambda.Function(this, 'Chat', {
      code: lambda.Code.fromAsset('../server/lambda_chat'),
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      environment: { 'OPENAI_API_KEY': openaiApiKey },
    });

    new sns.Subscription(this, 'Subscription', {
      topic,
      protocol: sns.SubscriptionProtocol.LAMBDA,
      endpoint: lambdaChat.functionArn,
    });

    // websocket api resources
    const lambdaConnectHandler = new lambda.Function(this, 'ConnectHandle', {
      code: lambda.Code.fromAsset('../server/lambda_connect_handle'),
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      environment: { 'TOKEN_KEY': tokenKey },
    });

    const lambdaHandleChat = new lambda.Function(this, 'HandleChat', {
      code: lambda.Code.fromAsset('../server/lambda_handle_chat',),
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      environment: { 'SNS_TOPIC_ARN': topic.topicArn },
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

    new CfnOutput(this, 'ApiEndPoint', {
      value: webSocketApi.apiEndpoint,
    });
  }
}
