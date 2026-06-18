import { NextRequest, NextResponse } from 'next/server';
import { verifySession, getSessionUser } from '@/lib/auth/session';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';
import { logger } from '@/lib/utils/logger';

const debugLogger = logger.createLogger('DEBUG_R2_FILES');

function getS3() {
  const endpoint = process.env.R2_ENDPOINT as string;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID as string;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY as string;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 is not configured');
  }

  const httpsAgent = new https.Agent({
    keepAlive: true,
    rejectUnauthorized: true,
    maxSockets: 50,
  });

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
    requestHandler: new NodeHttpHandler({
      httpsAgent,
    }),
  });
}

/**
 * GET /api/debug/r2-files
 * Debug endpoint: List all files in R2 webhard folder
 * Admin only
 */
export async function GET(_request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 });
  }

  try {
    // 인증 확인
    const isAuthenticated = await verifySession();
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getSessionUser();
    if (!user || user.userType !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const s3 = getS3();
    const bucket = process.env.R2_BUCKET_NAME as string;

    // List webhard files
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'webhard/',
      MaxKeys: 100,
    });

    const response = await s3.send(command);

    const files = (response.Contents || []).map((obj) => ({
      Key: obj.Key,
      Size: obj.Size,
      LastModified: obj.LastModified,
      StorageClass: obj.StorageClass,
    }));

    debugLogger.info('Listed R2 files', { count: files.length });

    return NextResponse.json({
      bucket,
      prefix: 'webhard/',
      totalFiles: files.length,
      files: files.slice(0, 20), // Return first 20 files
      message: files.length > 20 ? `Showing first 20 of ${files.length} files` : undefined,
    });
  } catch (error: unknown) {
    debugLogger.error('Failed to list R2 files', error);
    return NextResponse.json(
      {
        error: 'Failed to list R2 files',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
