import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { requireAdmin } from '@/lib/auth/adminGuard';
import https from 'https';

function getS3() {
  const endpoint = process.env.R2_ENDPOINT as string;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID as string;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY as string;

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

export async function GET(_request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 });
  }

  const auth = await requireAdmin();
  if (!auth.authorized) {
    return auth.response ?? NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  try {
    const s3 = getS3();
    const bucket = process.env.R2_BUCKET_NAME as string;
    const key = new URL(_request.url).searchParams.get('key')?.trim();
    if (!key) {
      return NextResponse.json({ error: 'key is required' }, { status: 400 });
    }

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await s3.send(command);

    if (!response.Body) {
      return NextResponse.json({ error: 'No body in response' }, { status: 500 });
    }

    // Convert the stream to a buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    return NextResponse.json({
      success: true,
      contentLength: response.ContentLength,
      contentType: response.ContentType,
      bufferSize: buffer.length,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        code: (error as { Code?: string }).Code || 'Unknown',
      },
      { status: 500 }
    );
  }
}
