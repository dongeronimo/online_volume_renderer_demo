#!/usr/bin/env node

/**
 * Uploads medical volume data to S3
 * Usage: npm run upload-data <path-to-dataset>
 * Example: npm run upload-data public/medical/abdomen-feet-first
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename, relative } from 'path';

const BUCKET_NAME = 'medical-volume-renderer-demo';
const REGION = 'sa-east-1';

const s3Client = new S3Client({ 
  region: REGION,
  // Credentials come from ~/.aws/credentials automatically
});

async function uploadFile(localPath: string, s3Key: string): Promise<void> {
  const fileContent = readFileSync(localPath);
  
  // Determine content type based on extension
  let contentType = 'application/octet-stream';
  if (s3Key.endsWith('.json')) {
    contentType = 'application/json';
  } else if (s3Key.endsWith('.raw') || s3Key.endsWith('.bin')) {
    contentType = 'application/octet-stream';
  }

  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    Body: fileContent,
    ContentType: contentType,
  }));
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = join(dirPath, file);
    if (statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

async function uploadDataset() {
  const datasetPath = process.argv[2];

  if (!datasetPath) {
    console.error('Error: Dataset path required');
    console.log('Usage: npm run upload-data <path-to-dataset>');
    console.log('Example: npm run upload-data public/medical/abdomen-feet-first');
    process.exit(1);
  }

  // Get dataset name from path (e.g., "abdomen-feet-first")
  const datasetName = basename(datasetPath);
  
  console.log(`Uploading dataset: ${datasetName}`);
  console.log(`From: ${datasetPath}`);
  console.log(`To: s3://${BUCKET_NAME}/${datasetName}/\n`);

  try {
    // Get all files recursively
    const files = getAllFiles(datasetPath);
    
    if (files.length === 0) {
      console.error(' No files found in dataset path');
      process.exit(1);
    }

    console.log(`Found ${files.length} files to upload\n`);

    // Upload each file
    let uploadedCount = 0;
    for (const filePath of files) {
      // Get relative path from dataset directory
      const relativePath = relative(datasetPath, filePath);
      const s3Key = `${datasetName}/${relativePath.replace(/\\/g, '/')}`;
      
      process.stdout.write(`Uploading ${relativePath}...`);
      await uploadFile(filePath, s3Key);
      uploadedCount++;
      console.log(`(${uploadedCount}/${files.length})`);
    }

    console.log(`\nUpload complete!`);
    console.log(`Dataset URL: https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${datasetName}/`);
    
  } catch (error: any) {
    console.error('Error uploading dataset:', error.message);
    process.exit(1);
  }
}

uploadDataset();