import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import crypto from 'node:crypto'
import https from 'node:https'

const canaryEnv = (process.env.OPERATIONAL_EXTERNAL_CANARY_ENV || '').trim().toLowerCase()
const bucket = process.env.R2_BUCKET_NAME || ''
const keyPrefix = normalizePrefix(process.env.R2_CANARY_PREFIX || 'canary/operational-e2e')
const objectKey = `${keyPrefix}/${Date.now()}-${crypto.randomUUID()}.txt`
const body = Buffer.from(`yjlaser-r2-canary:${crypto.randomUUID()}\n`, 'utf8')

async function main() {
  assertSafeEnv()
  const client = new S3Client({
    region: 'auto',
    endpoint: requiredEnv('R2_ENDPOINT'),
    credentials: {
      accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    },
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: new NodeHttpHandler({
      httpsAgent: new https.Agent({ keepAlive: true, rejectUnauthorized: true, maxSockets: 10 }),
    }),
  })

  let putSucceeded = false
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: body,
      ContentType: 'text/plain',
    }))
    putSucceeded = true

    const read = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }))
    const readBody = await read.Body?.transformToByteArray()
    if (!readBody || Buffer.compare(Buffer.from(readBody), body) !== 0) {
      throw new Error('R2 canary readback mismatch')
    }

    const listed = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: objectKey,
      MaxKeys: 1,
    }))
    if ((listed.Contents || []).length !== 1) {
      throw new Error('R2 canary object was not listed')
    }
  } finally {
    if (putSucceeded) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }))
    }
  }

  console.log(JSON.stringify({
    status: 'pass',
    service: 'r2',
    env: canaryEnv,
    bucketClass: classifyBucket(bucket),
    operation: 'put_get_list_delete',
    objectPrefix: keyPrefix,
  }))
}

function assertSafeEnv() {
  if (process.env.ALLOW_REAL_EXTERNAL_CANARY !== 'true') {
    throw new Error('ALLOW_REAL_EXTERNAL_CANARY=true is required')
  }
  if (process.env.R2_CANARY_ALLOW_MUTATION !== 'true') {
    throw new Error('R2_CANARY_ALLOW_MUTATION=true is required')
  }
  if (!['dev', 'test', 'staging', 'sandbox'].includes(canaryEnv)) {
    throw new Error('OPERATIONAL_EXTERNAL_CANARY_ENV must be dev/test/staging/sandbox')
  }
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    throw new Error('production runtime flags are not allowed')
  }
  if (bucket === 'yjlaser' || !/(dev|test|staging|sandbox)/i.test(bucket)) {
    throw new Error('R2_BUCKET_NAME must be a non-prod bucket')
  }
  if (!keyPrefix.startsWith('canary/')) {
    throw new Error('R2_CANARY_PREFIX must stay under canary/')
  }
}

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function normalizePrefix(value) {
  return value.replace(/^\/+|\/+$/g, '')
}

function classifyBucket(value) {
  if (/sandbox/i.test(value)) return 'sandbox'
  if (/staging/i.test(value)) return 'staging'
  if (/test/i.test(value)) return 'test'
  return 'dev'
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'fail',
    service: 'r2',
    env: canaryEnv || 'unknown',
    reason: error instanceof Error ? error.message : 'unknown error',
  }))
  process.exitCode = 1
})
