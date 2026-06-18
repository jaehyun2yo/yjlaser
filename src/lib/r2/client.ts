// Shared R2/S3 client singleton
// All R2 utilities must import getR2Client() from here instead of instantiating their own S3Client.

import { S3Client } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';

let _client: S3Client | null = null;

/**
 * Returns a shared S3Client singleton configured for Cloudflare R2.
 * Uses NodeHttpHandler with keepAlive for Node.js 22 TLS compatibility.
 */
export function getR2Client(): S3Client {
  if (!_client) {
    const endpoint = process.env.R2_ENDPOINT as string;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID as string;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY as string;

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error('R2 is not configured: missing endpoint or credentials');
    }

    const httpsAgent = new https.Agent({
      keepAlive: true,
      rejectUnauthorized: true,
      maxSockets: 50,
    });

    _client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true, // R2 requires path-style addressing
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      requestHandler: new NodeHttpHandler({ httpsAgent }),
    });
  }

  return _client;
}

/**
 * Test-only: resets the cached singleton so env changes take effect in subsequent calls.
 * Must not be called from production code.
 */
export function __resetR2ClientForTest(): void {
  _client = null;
}
