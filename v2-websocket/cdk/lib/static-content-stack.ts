import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as iam from 'aws-cdk-lib/aws-iam';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

export interface StaticContentStackProps extends cdk.StackProps {
  // readonly restApi: apigateway.IRestApi;
}

export class StaticContentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StaticContentStackProps) {
    super(scope, id, props);

    // const {restApi} = props;

    const logBucket = new s3.Bucket(this, 'LogBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const corsRule: s3.CorsRule = {
      allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
      allowedOrigins: [`*`],
      allowedHeaders: ['*'],
    };
    const deploymentBucket = new s3.Bucket(this, 'DeploymentBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      serverAccessLogsBucket: logBucket,
      serverAccessLogsPrefix: 'deployment-bucket-logs',
      cors: [corsRule],
    });

    // Static site hosting with CF & S3 Bucket: https://prototyping-blog.com/blog/cdk-static-website
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OriginAccessIdentity', {});
    const bucketPolicyStatement = new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      effect: iam.Effect.ALLOW,
      principals: [
        new iam.CanonicalUserPrincipal(
          originAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId
        ),
      ],
      resources: [`${deploymentBucket.bucketArn}/*`],
    });
    deploymentBucket.addToResourcePolicy(bucketPolicyStatement);

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        origin: new S3Origin(deploymentBucket, {
          originAccessIdentity,
        }),
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
    })

    new BucketDeployment(this, 'Deployment', {
      sources: [Source.asset('../client/build')],
      destinationBucket: deploymentBucket,
      distribution: distribution,
      distributionPaths: ['/*']
    });

    new CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
    });
  }
}
