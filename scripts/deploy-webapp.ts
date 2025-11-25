#!/usr/bin/env node

/**
 * Builds and deploys the webapp to S3
 * - Runs production build
 * - Uploads all files to S3 webapp bucket
 * - Sets appropriate content types
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname } from 'path';

const BUCKET_NAME = 'medical-volume-renderer-webapp';
const REGION = 'sa-east-1';
const DIST_DIR = 'dist';

const s3Client = new S3Client({ 
  region: REGION,
  // Credentials come from ~/.aws/credentials automatically
});

// Map file extensions to content types
function getContentType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
  };
  return contentTypes[ext] || 'application/octet-stream';
}

async function uploadFile(localPath: string, s3Key: string): Promise<void> {
  const fileContent = readFileSync(localPath);
  const contentType = getContentType(localPath);

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

async function deployWebapp() {
  console.log('🚀 Deploying webapp to S3...\n');

  try {
    // Check if dist directory exists
    try {
      statSync(DIST_DIR);
    } catch {
      console.error('❌ Error: dist/ directory not found');
      console.log('Run "npm run build" first to create the production build');
      process.exit(1);
    }

    // Get all files from dist
    const files = getAllFiles(DIST_DIR);
    
    if (files.length === 0) {
      console.error('❌ No files found in dist/');
      process.exit(1);
    }

    console.log(`Found ${files.length} files to upload\n`);

    // Upload each file
    let uploadedCount = 0;
    for (const filePath of files) {
      // Get relative path from dist directory
      const relativePath = relative(DIST_DIR, filePath);
      const s3Key = relativePath.replace(/\\/g, '/');
      
      process.stdout.write(`Uploading ${relativePath}...`);
      await uploadFile(filePath, s3Key);
      uploadedCount++;
      console.log(` ✓ (${uploadedCount}/${files.length})`);
    }

    console.log(`\n✅ Deployment complete!`);
    console.log(`Website URL: http://${BUCKET_NAME}.s3-website-${REGION}.amazonaws.com/`);
    
  } catch (error: any) {
    console.error('❌ Error deploying webapp:', error.message);
    process.exit(1);
  }
}

deployWebapp();