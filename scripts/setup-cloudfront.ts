#!/usr/bin/env node

/**
 * Sets up CloudFront distribution for webapp
 * - Creates CloudFront distribution pointing to S3 website
 * - Provides HTTPS access (required for WebGPU)
 * - Configures caching and compression
 */

import { 
  CloudFrontClient, 
  CreateDistributionCommand,
  GetDistributionCommand,
  waitUntilDistributionDeployed
} from '@aws-sdk/client-cloudfront';

const WEBAPP_BUCKET = 'medical-volume-renderer-webapp';
const REGION = 'sa-east-1';
const ORIGIN_DOMAIN = `${WEBAPP_BUCKET}.s3-website-${REGION}.amazonaws.com`;

const cloudFrontClient = new CloudFrontClient({ 
  region: 'us-east-1', // CloudFront is global but uses us-east-1
});

async function setupCloudFront() {
  try {
    console.log('Creating CloudFront distribution...');
    console.log(`Origin: ${ORIGIN_DOMAIN}\n`);

    const distributionConfig = {
      CallerReference: `webapp-${Date.now()}`,
      Comment: 'Medical Volume Renderer WebApp',
      Enabled: true,
      DefaultRootObject: 'index.html',
      
      Origins: {
        Quantity: 1,
        Items: [
          {
            Id: 'S3-Website',
            DomainName: ORIGIN_DOMAIN,
            CustomOriginConfig: {
              HTTPPort: 80,
              HTTPSPort: 443,
              OriginProtocolPolicy: 'http-only', // S3 website endpoints only support HTTP
              OriginSslProtocols: {
                Quantity: 1,
                Items: ['TLSv1.2']
              }
            }
          }
        ]
      },

      DefaultCacheBehavior: {
        TargetOriginId: 'S3-Website',
        ViewerProtocolPolicy: 'redirect-to-https', // Force HTTPS
        AllowedMethods: {
          Quantity: 2,
          Items: ['GET', 'HEAD'],
          CachedMethods: {
            Quantity: 2,
            Items: ['GET', 'HEAD']
          }
        },
        Compress: true, // Enable compression
        ForwardedValues: {
          QueryString: false,
          Cookies: {
            Forward: 'none'
          },
          Headers: {
            Quantity: 0
          }
        },
        MinTTL: 0,
        DefaultTTL: 86400, // 1 day
        MaxTTL: 31536000, // 1 year
        TrustedSigners: {
          Enabled: false,
          Quantity: 0
        }
      },

      // Custom error responses for SPA routing
      CustomErrorResponses: {
        Quantity: 1,
        Items: [
          {
            ErrorCode: 404,
            ResponsePagePath: '/index.html',
            ResponseCode: '200',
            ErrorCachingMinTTL: 300
          }
        ]
      },

      PriceClass: 'PriceClass_100', // Use only North America and Europe edge locations (cheapest)
    };

    const response = await cloudFrontClient.send(new CreateDistributionCommand({
      DistributionConfig: distributionConfig
    }));

    const distributionId = response.Distribution?.Id;
    const domainName = response.Distribution?.DomainName;

    console.log('✓ CloudFront distribution created!');
    console.log(`Distribution ID: ${distributionId}`);
    console.log(`Domain: ${domainName}`);
    console.log(`\n⏳ Waiting for distribution to deploy (this takes 5-15 minutes)...`);
    console.log(`You can check status at: https://console.aws.amazon.com/cloudfront/\n`);

    // Wait for deployment (optional - can be slow)
    // Uncomment if you want the script to wait:
    /*
    await waitUntilDistributionDeployed(
      { client: cloudFrontClient, maxWaitTime: 900 }, // 15 min timeout
      { Id: distributionId }
    );
    console.log('✓ Distribution deployed!');
    */

    console.log('✅ CloudFront setup initiated!');
    console.log(`\nOnce deployed (5-15 minutes), your webapp will be available at:`);
    console.log(`https://${domainName}`);
    console.log(`\n📝 Update .env.production and .env.development.aws with:`);
    console.log(`VITE_DATA_BASE_URL=https://medical-volume-renderer-demo.s3.sa-east-1.amazonaws.com`);

  } catch (error: any) {
    console.error('❌ Error setting up CloudFront:', error.message);
    if (error.Code === 'DistributionAlreadyExists') {
      console.log('Distribution may already exist. Check the CloudFront console.');
    }
    process.exit(1);
  }
}

setupCloudFront();