# Medical Volume Renderer

WebGPU-based medical volume renderer for visualizing DICOM scan data with real-time ray casting.

## Prerequisites

- **Node.js** (v18 or later)
- **Python 3.x** with CuPy (for DICOM conversion)
- **AWS Account** with IAM user credentials
- **Browser** with WebGPU support (Chrome 113+, Edge 113+)

## Initial Setup

### 1. Clone and Install Dependencies

```
git clone <repository-url>
cd webgpu_engine
npm install
```

### 2. Configure AWS Credentials

Create or edit `~/.aws/credentials` (Windows: `C:\Users\YourUsername\.aws\credentials`):

```ini
[default]
aws_access_key_id = YOUR_ACCESS_KEY
aws_secret_access_key = YOUR_SECRET_KEY
```

Your IAM user needs these permissions:
- `s3:CreateBucket`
- `s3:PutObject`
- `s3:PutBucketPolicy`
- `s3:PutBucketCors`
- `s3:PutBucketWebsite`
- `s3:PutPublicAccessBlock`
- `cloudfront:CreateDistribution`

### 3. Convert DICOM Data

**Important**: The bucket names and paths in this project are configured for a dataset named `abdomen-feet-first`. If you use a different series name, you'll need to update the configuration accordingly.

Convert your DICOM files using the Python converter:

```
python dicom_converter.py path/to/dicom/files --output public/medical/your-series-name
```

This will:
- Anonymize patient data (sets name to "Incognito")
- Convert DICOM slices to raw float16 format
- Generate `metadata.json` with scan parameters
- Create `chunk_minmax.bin` for acceleration structures

**Output structure:**
```
public/medical/your-series-name/
├── metadata.json
├── chunk_minmax.bin
└── slice_0001.raw
└── slice_0002.raw
└── ...
```

### 4. Update Configuration (if using different series name)

If your series name is different from `abdomen-feet-first`, update:

1. **medical.ts** (line 29):
   ```typescript
   const SERIES = "your-series-name";
   ```

2. **Bucket names** in scripts:
   - `scripts/setup-s3.ts` - Update `BUCKET_NAME`
   - `scripts/setup-webapp-bucket.ts` - Update `BUCKET_NAME`
   - `scripts/upload-data.ts` - Update `BUCKET_NAME`
   - `scripts/setup-cloudfront.ts` - Update `WEBAPP_BUCKET`

3. **Environment files**:
   - `.env.development`
   - `.env.development.aws`
   - `.env.production`

## Local Development

### Run with Local Data

```
npm run dev
```

Access at: `http://localhost:5173`

This uses files from `public/medical/` directory.

### Run with AWS Data (for testing)

```
npm run dev-aws
```

This loads data from S3 while running the dev server locally.

## AWS Deployment

### One-Time Setup

Run these scripts once to set up your AWS infrastructure:

#### 1. Create S3 Data Bucket

```
npm run setup-s3
```

Creates `medical-volume-renderer-demo` bucket in `sa-east-1` (São Paulo) with:
- Public read access
- CORS configuration for web access

#### 2. Upload Medical Data

```
npm run upload-data public/medical/abdomen-feet-first
```

Uploads all converted DICOM data to S3. Run this whenever you update your dataset.

#### 3. Create S3 Webapp Bucket

```
npm run setup-webapp-bucket
```

Creates `medical-volume-renderer-webapp` bucket configured for static website hosting.

#### 4. Setup CloudFront (Required for HTTPS/WebGPU)

```
npm run setup-cloudfront
```

Creates CloudFront distribution with HTTPS. **This takes 5-15 minutes to deploy.**

CloudFront is required because:
- WebGPU requires secure context (HTTPS or localhost)
- S3 static hosting only provides HTTP
- CloudFront provides HTTPS and better performance

After setup completes, note the CloudFront domain (e.g., `https://xyz.cloudfront.net`).

### Deploy Webapp

After one-time setup is complete and CloudFront is deployed:

```
npm run build
npm run deploy-webapp
```

Or run both in sequence:
```
npm run build && npm run deploy-webapp
```

This:
1. Compiles TypeScript and bundles with Vite
2. Uploads all files from `dist/` to S3 webapp bucket
3. Sets appropriate content types

Access your deployed app at the CloudFront URL.

## Project Structure

```
webgpu_engine/
├── public/medical/          # Local DICOM data (not deployed)
│   └── abdomen-feet-first/
├── scripts/                 # AWS deployment scripts
│   ├── setup-s3.ts
│   ├── setup-webapp-bucket.ts
│   ├── setup-cloudfront.ts
│   ├── upload-data.ts
│   └── deploy-webapp.ts
├── medical.ts               # Main renderer entry point
├── config.ts                # Environment-based configuration
├── .env.development         # Local dev environment
├── .env.development.aws     # AWS testing environment
└── .env.production          # Production build environment
```

## Environment Variables

Three environment configurations control where data is loaded from:

- **`.env.development`**: Local files (`/medical`)
- **`.env.development.aws`**: S3 data, local dev server
- **`.env.production`**: S3 data, production build

Each sets:
```
VITE_DATA_SOURCE=local|aws
VITE_DATA_BASE_URL=<path-to-data>
```

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `npm run dev` | Local development with local data |
| `npm run dev-aws` | Local development with AWS data |
| `npm run build` | Build production bundle |
| `npm run setup-s3` | Create S3 data bucket (one-time) |
| `npm run setup-webapp-bucket` | Create S3 webapp bucket (one-time) |
| `npm run setup-cloudfront` | Create CloudFront distribution (one-time) |
| `npm run upload-data <path>` | Upload dataset to S3 |
| `npm run deploy-webapp` | Deploy built webapp to S3 |

## Rendering Features

- Real-time volume ray casting with WebGPU
- Bricking acceleration for empty space skipping
- Surface-aware gradient sampling
- Perona-Malik anisotropic smoothing
- Window/Level controls for medical imaging
- Blinn-Phong shading with gradient-based lighting
- Interactive camera controls

### Current Settings

Default rendering parameters (can be adjusted in UI):
- Window: 300 HU
- Level: 100 HU
- Density Scale: 0.5
- Ambient: 0.3

## Troubleshooting

### WebGPU Not Supported

Ensure you're accessing via HTTPS (CloudFront URL) or localhost. HTTP connections will fail.

### 404 Errors on AWS

Wait 5-15 minutes for CloudFront distribution to fully deploy after running `setup-cloudfront`.

### CORS Errors

Verify S3 bucket CORS configuration with `npm run setup-s3`.

### File Not Found Errors

- Check that series name matches in `medical.ts` and uploaded data
- Verify data was uploaded with `npm run upload-data`
- Check AWS S3 console to confirm files exist

## AWS Costs

Approximate monthly costs for light usage:
- S3 Storage: ~$0.023/GB
- S3 Requests: Negligible for demo usage
- CloudFront: First 1TB transfer free, then ~$0.085/GB
- Total: < $5/month for typical demo usage

## License

MIT