# Phase 1: S3Client 체크섬 비활성화 + R2 CORS 설정 스크립트

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/CLOUDFLARE_SETUP.md` (R2 CORS 설정 섹션 — Phase 0에서 추가됨)
- `docs/WEBHARD_ARCHITECTURE.md` (업로드 플로우)
- `CLAUDE.md` (프로젝트 컨벤션)
- `/tasks/7-upload-cors-fix/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- Phase 0에서 업데이트된 `docs/CLOUDFLARE_SETUP.md`, `docs/WEBHARD_ARCHITECTURE.md`

현재 수정 대상 파일들을 반드시 읽어라:

- `webhard-api/src/storage/storage.service.ts` (NestJS S3Client — presigned URL 생성)
- `src/lib/r2/client.ts` (Next.js S3Client 싱글톤)

## 배경

### 문제 1: AWS SDK v3 체크섬

AWS SDK v3.723+ 부터 `PutObjectCommand`에 CRC32 체크섬이 기본 활성화된다.
presigned URL 생성 시 Body가 없으므로 더미 체크섬(`AAAAAA==`, CRC32=0)이 삽입된다.
이로 인해:

- presigned URL에 `x-amz-checksum-crc32=AAAAAA%3D%3D` 파라미터가 포함됨
- 실제 파일의 CRC32와 불일치 → R2가 업로드 거부 가능

해결: S3Client 생성 시 `requestChecksumCalculation: "WHEN_REQUIRED"` 설정.
R2는 체크섬을 요구하지 않으므로 이 설정이 안전하다.

### 문제 2: R2 CORS 미설정

브라우저에서 R2 presigned URL로 PUT 요청 시 CORS preflight가 실패한다.
R2 버킷에 CORS 규칙을 설정해야 한다.

## 작업 내용

### 1. NestJS S3Client 체크섬 비활성화

파일: `webhard-api/src/storage/storage.service.ts`

`constructor` 내 `this.s3Client = new S3Client({...})` 부분에 두 옵션을 추가하라:

```typescript
this.s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED', // ← 추가
  responseChecksumValidation: 'WHEN_REQUIRED', // ← 추가
  requestHandler: new NodeHttpHandler({
    // ... 기존 설정 유지
  }),
});
```

다른 코드는 절대 변경하지 마라. 이 두 줄만 추가.

### 2. Next.js R2 Client 체크섬 비활성화

파일: `src/lib/r2/client.ts`

`getR2Client()` 함수 내 `_client = new S3Client({...})` 부분에 동일하게 두 옵션을 추가하라:

```typescript
_client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED', // ← 추가
  responseChecksumValidation: 'WHEN_REQUIRED', // ← 추가
  requestHandler: new NodeHttpHandler({ httpsAgent }),
});
```

다른 코드는 절대 변경하지 마라. 이 두 줄만 추가.

### 3. R2 CORS 설정 스크립트 생성

파일: `scripts/setup-r2-cors.ts` (신규)

이 스크립트는 `PutBucketCorsCommand`를 사용하여 R2 버킷에 CORS 규칙을 설정한다.
`.env.local` 환경변수를 로드하여 R2 자격증명을 사용한다.

요구사항:

- `dotenv`로 `../../.env.local` (또는 `../.env.local`, `.env.local` 순서로 탐색) 로드
- `@aws-sdk/client-s3`의 `S3Client`, `PutBucketCorsCommand`, `GetBucketCorsCommand` 사용
- R2 환경변수: `R2_ACCOUNT_ID` 또는 `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
- `R2_ENDPOINT`가 있으면 그대로 사용, 없으면 `R2_ACCOUNT_ID`로 `https://{id}.r2.cloudflarestorage.com` 구성

CORS 규칙:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": [
        "http://localhost:3000",
        "https://yjlaser.com",
        "https://www.yjlaser.com",
        "https://yjlaser.net",
        "https://www.yjlaser.net"
      ],
      "AllowedMethods": ["GET", "PUT", "HEAD", "DELETE"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

스크립트 동작:

1. 환경변수 로드 및 검증
2. S3Client 생성 (forcePathStyle: true, requestChecksumCalculation: "WHEN_REQUIRED")
3. `PutBucketCorsCommand`로 CORS 설정
4. `GetBucketCorsCommand`로 설정 확인 및 출력
5. 성공/실패 메시지 출력

실행 방법: `npx tsx scripts/setup-r2-cors.ts`

### 4. CORS 스크립트 실행 (dev 버킷)

스크립트 생성 후, dev 환경의 `.env.local`을 사용하여 `npx tsx scripts/setup-r2-cors.ts`를 실행하라.
실행 결과가 성공인지 확인하라.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && cd webhard-api && pnpm build
```

추가로: `npx tsx scripts/setup-r2-cors.ts` 실행이 성공해야 한다.

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/7-upload-cors-fix/index.json`의 phase 1 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- `storage.service.ts`와 `client.ts`에서 S3Client 옵션 2줄 추가 외에 다른 코드를 변경하지 마라.
- `scripts/setup-r2-cors.ts`는 기존 프로젝트의 R2 환경변수 패턴을 따라라 (`R2_ENDPOINT`, `R2_ACCESS_KEY_ID` 등).
- `dotenv` 패키지가 이미 설치되어 있는지 확인하라. 없으면 설치하지 말고 Node.js 내장 방식(`import 'dotenv/config'` 또는 수동 파싱)을 사용하라.
- 기존 테스트를 깨뜨리지 마라.
- `requestChecksumCalculation` 타입 오류가 발생하면 `as any`로 우회하지 말고, `@aws-sdk/client-s3` 패키지의 타입 정의를 확인하라. 최신 SDK에서는 `S3ClientConfig`에 해당 옵션이 포함되어 있다.
