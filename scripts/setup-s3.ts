#!/usr/bin/env node

/**
 * Sets up S3 bucket for medical volume renderer
 * - Creates bucket in sa-east-1 (São Paulo)
 * - Configures CORS for web access
 * - Sets up public read access for medical data
 */

import { 
  S3Client, 
  CreateBucketCommand,
  PutBucketCorsCommand,
  PutPublicAccessBlockCommand,
  PutBucketPolicyCommand
} from '@aws-sdk/client-s3';

const BUCKET_NAME = 'medical-volume-renderer-demo';
const REGION = 'sa-east-1';

const s3Client = new S3Client({ 
  region: REGION,
  // Credentials come from ~/.aws/credentials automatically
});

async function setupBucket() {
  try {
    // 1. Create bucket
    console.log(`Creating bucket: ${BUCKET_NAME} in ${REGION}...`);
    await s3Client.send(new CreateBucketCommand({
      Bucket: BUCKET_NAME,
      CreateBucketConfiguration: {
        LocationConstraint: REGION
      }
    }));
    console.log('Bucket created');

    // 2. Disable public access block (needed for public reads)
    console.log('Configuring public access...');
    await s3Client.send(new PutPublicAccessBlockCommand({
      Bucket: BUCKET_NAME,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: false,
        IgnorePublicAcls: false,
        BlockPublicPolicy: false,
        RestrictPublicBuckets: false
      }
    }));
    console.log('Public access configured');

    // 3. Set bucket policy for public read access
    const bucketPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'PublicReadGetObject',
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: `arn:aws:s3:::${BUCKET_NAME}/*`
        }
      ]
    };

    await s3Client.send(new PutBucketPolicyCommand({
      Bucket: BUCKET_NAME,
      Policy: JSON.stringify(bucketPolicy)
    }));
    console.log('Bucket policy set (public read access)');

    // 4. Configure CORS
    const corsConfiguration = {
      CORSRules: [
        {
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'HEAD'],
          AllowedOrigins: ['*'],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3600
        }
      ]
    };

    await s3Client.send(new PutBucketCorsCommand({
      Bucket: BUCKET_NAME,
      CORSConfiguration: corsConfiguration
    }));
    console.log('CORS configured');

    console.log('\nBucket setup complete!');
    console.log(`Bucket URL: https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/`);
    
  } catch (error: any) {
    if (error.name === 'BucketAlreadyOwnedByYou') {
      console.log('Bucket already exists, updating configuration...');
      // Continue with the rest of the setup
      return;
    }
    console.error('Error setting up bucket:', error.message);
    process.exit(1);
  }
}

setupBucket();