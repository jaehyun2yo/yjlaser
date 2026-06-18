/**
 * R2 버킷 CORS 설정 스크립트
 *
 * 웹하드 파일 업로드는 브라우저에서 R2 Presigned URL로 직접 PUT 요청을 보내므로
 * R2 버킷에 CORS 규칙이 설정되어야 합니다.
 *
 * 사용법: npx tsx scripts/setup-r2-cors.ts
 *
 * .env.local에서 R2 자격증명을 로드합니다.
 * dev/prod 버킷 모두에 실행해야 합니다 (R2_BUCKET_NAME 값에 따라 대상 결정).
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';

// .env.local 파일 탐색 (스크립트 위치 기준)
const envPaths = [resolve(__dirname, '..', '.env.local'), resolve(process.cwd(), '.env.local')];

let envLoaded = false;
for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    config({ path: envPath });
    console.log(`[env] ${envPath} 로드 완료`);
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.error('[error] .env.local 파일을 찾을 수 없습니다.');
  process.exit(1);
}

// 환경변수 검증
const accountId = process.env.R2_ACCOUNT_ID;
const r2Endpoint = process.env.R2_ENDPOINT;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;

if (!accessKeyId || !secretAccessKey || !bucketName) {
  console.error('[error] 필수 환경변수가 누락되었습니다:');
  if (!accessKeyId) console.error('  - R2_ACCESS_KEY_ID');
  if (!secretAccessKey) console.error('  - R2_SECRET_ACCESS_KEY');
  if (!bucketName) console.error('  - R2_BUCKET_NAME');
  process.exit(1);
}

const endpoint = r2Endpoint || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null);

if (!endpoint) {
  console.error('[error] R2_ENDPOINT 또는 R2_ACCOUNT_ID 중 하나가 필요합니다.');
  process.exit(1);
}

// S3Client 생성
const s3Client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const CORS_RULES = [
  {
    AllowedOrigins: [
      'http://localhost:3000',
      'https://yjlaser.com',
      'https://www.yjlaser.com',
      'https://yjlaser.net',
      'https://www.yjlaser.net',
    ],
    AllowedMethods: ['GET', 'PUT', 'HEAD', 'DELETE'],
    AllowedHeaders: ['*'],
    ExposeHeaders: ['ETag'],
    MaxAgeSeconds: 3600,
  },
];

async function main() {
  console.log(`\n[info] 대상 버킷: ${bucketName}`);
  console.log(`[info] 엔드포인트: ${endpoint}\n`);

  // CORS 설정 적용
  try {
    await s3Client.send(
      new PutBucketCorsCommand({
        Bucket: bucketName,
        CORSConfiguration: { CORSRules: CORS_RULES },
      })
    );
    console.log('[success] CORS 규칙 적용 완료');
  } catch (error) {
    console.error('[error] CORS 규칙 적용 실패:', error);
    process.exit(1);
  }

  // 설정 확인
  try {
    const result = await s3Client.send(new GetBucketCorsCommand({ Bucket: bucketName }));
    console.log('\n[verify] 현재 CORS 설정:');
    console.log(JSON.stringify(result.CORSRules, null, 2));
    console.log('\n[done] R2 CORS 설정이 완료되었습니다.');
  } catch (error) {
    console.warn('[warn] CORS 설정 확인 실패 (적용은 성공했을 수 있음):', error);
  }
}

main();
