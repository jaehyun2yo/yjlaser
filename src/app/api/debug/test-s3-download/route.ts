import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { requireAdmin } from '@/lib/auth/adminGuard';
import https from 'https';
import { logger } from '@/lib/utils/logger';

const testLogger = logger.createLogger('DEBUG_S3_DOWNLOAD');

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
 * GET /api/debug/test-s3-download
 * Test download using S3 SDK directly
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 });
  }

  const auth = await requireAdmin();
  if (!auth.authorized) {
    return auth.response ?? NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  try {
    const key = new URL(request.url).searchParams.get('key')?.trim();
    if (!key) {
      return NextResponse.json({ error: 'key is required' }, { status: 400 });
    }

    testLogger.info('Attempting S3 download', { keyLength: key.length });

    const s3 = getS3();
    const bucket = process.env.R2_BUCKET_NAME as string;

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    testLogger.info('Sending GetObjectCommand', { bucket });
    const response = await s3.send(command);

    testLogger.info('S3 response received', {
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      lastModified: response.LastModified,
    });

    if (!response.Body) {
      return NextResponse.json({ error: 'No body in response' }, { status: 500 });
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    testLogger.info('Successfully downloaded file', { size: buffer.length });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': response.ContentType || 'application/octet-stream',
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': 'attachment; filename="test-file"',
      },
    });
  } catch (error: unknown) {
    testLogger.error('S3 download error', {
      error: error instanceof Error ? error.message : String(error),
      code: (error as { Code?: string }).Code,
    });
    return NextResponse.json(
      {
        error: 'S3 download failed',
        details: error instanceof Error ? error.message : String(error),
        code: (error as { Code?: string }).Code,
      },
      { status: 500 }
    );
  }
}
