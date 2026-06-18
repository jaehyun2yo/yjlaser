# Phase 0: 문서 업데이트

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/CLOUDFLARE_SETUP.md` (Cloudflare DNS, R2, Email 설정 가이드)
- `docs/WEBHARD_ARCHITECTURE.md` (웹하드 전체 아키텍처)
- `docs/specs/api/endpoints/webhard.md` (웹하드 API 엔드포인트 상세)
- `CLAUDE.md` (프로젝트 컨벤션)

## 배경

웹하드 파일 업로드가 R2 CORS 미설정으로 인해 실패한다.
업로드 플로우는 3단계로 구성된다:

1. `POST /api/webhard/upload/batch` → NestJS에서 presigned URL 발급
2. **브라우저 → R2 직접 PUT** (presigned URL 사용, cross-origin 요청 → CORS 필수)
3. `POST /api/webhard/upload/batch-complete` → NestJS에 메타데이터 저장

Step 2가 cross-origin이므로 R2 버킷에 CORS 설정이 반드시 필요하다.
추가로, AWS SDK v3.723+ 부터 `PutObjectCommand`에 CRC32 체크섬이 기본 삽입되어
presigned URL에 더미 체크섬 파라미터가 포함되는 문제도 있다.

## 작업 내용

### 1. `docs/CLOUDFLARE_SETUP.md` 업데이트

기존 문서의 "R2 환경 분리" 섹션 뒤에 **R2 CORS 설정** 섹션을 추가하라:

- **왜 필요한지**: 웹하드 파일 업로드가 브라우저에서 R2 presigned URL로 직접 PUT 요청을 보내므로 CORS 필수
- **허용 Origin 목록**:
  - `http://localhost:3000` (개발)
  - `https://yjlaser.com`
  - `https://www.yjlaser.com`
  - `https://yjlaser.net`
  - `https://www.yjlaser.net`
- **허용 Method**: `GET`, `PUT`, `HEAD`, `DELETE`
- **허용 Header**: `Content-Type`, `x-amz-*`
- **Expose Header**: `ETag` (멀티파트 업로드에 필요)
- **MaxAge**: 3600초
- **설정 방법**: `npx tsx scripts/setup-r2-cors.ts` 실행
- **주의사항**: dev (`yjlaser-dev`) 버킷과 prod (`yjlaser`) 버킷 모두 설정 필요

### 2. `docs/WEBHARD_ARCHITECTURE.md` 업데이트

업로드 플로우 설명 부분에 다음을 추가/수정하라:

- 업로드 Step 2가 cross-origin 요청이며 R2 CORS 설정이 필수라는 점 명시
- AWS SDK 체크섬 관련: S3Client에 `requestChecksumCalculation: "WHEN_REQUIRED"` 설정 필요
- "R2 CORS가 미설정되면 업로드가 실패한다"는 트러블슈팅 노트

문서가 매우 긴 경우 관련 섹션만 정확히 찾아서 수정하라. 전체를 다시 쓰지 마라.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/7-upload-cors-fix/index.json`의 phase 0 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 이 phase는 문서만 수정한다. 코드를 수정하지 마라.
- `docs/WEBHARD_ARCHITECTURE.md`는 매우 큰 파일이다. 관련 섹션만 찾아서 수정하라.
- 기존 문서 구조와 스타일을 유지하라. 새로운 섹션은 기존 패턴에 맞춰 작성.
