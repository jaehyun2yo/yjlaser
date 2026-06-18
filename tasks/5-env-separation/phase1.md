# Phase 1: 환경 설정 파일 체계 정리

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (Env Vars 섹션 — Phase 0에서 업데이트됨)
- `docs/architecture.md` (환경 분리 섹션 — Phase 0에서 추가됨)
- `/tasks/5-env-separation/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 아래 파일들을 반드시 읽어라:

- `webhard-api/src/main.ts` — NestJS의 dotenv 로드 순서 확인 (line 6-8)
- `webhard-api/src/prisma/prisma.service.ts` — PrismaService의 DATABASE_URL 사용 방식
- `.env.local` — 현재 환경변수 값
- `webhard-api/.env` — 현재 NestJS 환경변수 (삭제 대상)
- `webhard-api/.env.example` — 현재 템플릿
- `.gitignore` — env 파일 제외 패턴 확인

## 배경: DATABASE_URL 불일치 문제

현재 심각한 설정 불일치가 있다:

1. NestJS `main.ts`는 `../../.env.local`을 먼저 로드한다 (line 6)
2. dotenv는 이미 설정된 변수를 덮어쓰지 않는다
3. 루트 `.env.local`의 DATABASE_URL은 **포트 5432** (Session 모드)
4. `webhard-api/.env`의 DATABASE_URL은 **포트 6543** (Transaction 모드) + `statement_cache_size=0`
5. 결과: NestJS가 Session 모드를 사용 → 08P01 에러 간헐 발생 → PrismaService의 retry 로직으로 증상만 억제

이번 phase에서 이 근본 문제를 해결한다.

## 작업 내용

### 1. `.env.example` 생성 (커밋됨)

루트에 `.env.example` 파일을 생성하라. 모든 환경변수의 이름, 설명, 형식을 포함하되 실제 값은 넣지 않는다. `.env.local.clean` 파일의 변수 목록을 참조하되, 구조를 아래와 같이 섹션별로 정리하라:

```
# ============================================
# YJLaser Website — Environment Variables
# ============================================
# 이 파일을 .env.local로 복사한 뒤 값을 채워 사용하세요.
# cp .env.example .env.local

# === Database (Supabase PostgreSQL + Prisma) ===
# Transaction mode (포트 6543) — 런타임 쿼리용
DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true&statement_cache_size=0&connection_limit=10"
# Direct connection (포트 5432) — 마이그레이션 전용
DIRECT_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres"

# === R2 Storage (Cloudflare) ===
R2_ACCOUNT_ID=
R2_ENDPOINT=https://[ACCOUNT_ID].r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=yjlaser-dev
R2_PUBLIC_BASE_URL=

# === App ===
NODE_ENV=development
NESTJS_PORT=4000
NEXT_PUBLIC_WEBHARD_API_URL=http://localhost:4000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000

# === Auth ===
SESSION_SECRET=
ADMIN_EMAIL=
TEST_ADMIN_USERNAME=
TEST_ADMIN_PASSWORD=
TEST_ADMIN_PASSWORD_HASH_B64=

# === SMTP ===
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
DISPLAY_FROM_EMAIL=

# === Sentry (prod only) ===
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
SENTRY_DEBUG=false

# === Push Notifications (VAPID) ===
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=

# === External Services ===
MIGRATION_API_KEY=
INTEGRATION_API_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
SLACK_WEBHOOK_URL=
SYNC_SERVICE_URL=http://localhost:3001

# === Version ===
NEXT_PUBLIC_APP_VERSION=1.0.0
```

### 2. `.env.local` 수정 — DATABASE_URL 수정

현재 `.env.local`을 읽어서 다음 변경을 적용하라:

**a) DATABASE_URL 수정:**

- 기존 값에서 호스트의 포트를 `5432` → `6543`으로 변경
- `pgbouncer=true` 뒤에 `&statement_cache_size=0&connection_limit=10` 추가 (이미 있으면 스킵)
- 결과 형식: `postgresql://...@...pooler.supabase.com:6543/postgres?pgbouncer=true&statement_cache_size=0&connection_limit=10`

**b) DIRECT_URL 추가 (없는 경우):**

- DATABASE_URL에서 포트를 `5432`로, `?` 이후 파라미터를 모두 제거한 값을 사용
- 결과 형식: `postgresql://...@...pooler.supabase.com:5432/postgres`

**c) CORS_ORIGIN 변수명 통일:**

- `CORS_ORIGIN` → 유지 (NestJS main.ts가 CORS_ORIGINS와 CORS_ORIGIN 둘 다 체크)

### 3. `webhard-api/.env` 삭제

`webhard-api/.env` 파일을 삭제하라. NestJS `main.ts`가 이미 `../../.env.local`을 먼저 로드하므로, 이 파일은 불필요하고 혼란을 초래한다.

### 4. `webhard-api/.env.example` 업데이트

기존 내용을 아래로 교체하라:

```
# ============================================
# NestJS Backend (webhard-api)
# ============================================
# 이 디렉토리에 .env 파일을 만들지 마세요.
# NestJS는 루트의 .env.local에서 환경변수를 로드합니다.
# (webhard-api/src/main.ts의 dotenv 설정 참조)
#
# 루트 .env.example을 참조하여 루트 .env.local을 설정하세요.
#
# 필수 변수:
# - DATABASE_URL (Transaction mode, port 6543)
# - DIRECT_URL (Direct connection, port 5432)
# - R2_* (스토리지)
# - SESSION_SECRET
# - CORS_ORIGIN
# - NESTJS_PORT (기본값: 4000)
```

### 5. `.gitignore` 확인

`.gitignore`에 이미 `.env*` 패턴이 있는지 확인하라. 있다면 변경 불필요. `.env.example`이 제외되지 않도록 아래 예외를 추가하라 (없는 경우):

```
# env files
.env*
!.env.example
!webhard-api/.env.example
```

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && cd webhard-api && pnpm build
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/5-env-separation/index.json`의 phase 1 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- `.env.local`의 실제 크레덴셜 값은 변경하지 마라 (포트와 파라미터만 수정).
- `.env.local.clean`은 참조용 파일이므로 건드리지 마라.
- `webhard-api/.env` 삭제 후 NestJS가 루트 `.env.local`에서 필요한 변수를 모두 로드하는지 확인하라. 특히 `DATABASE_URL`, `DIRECT_URL`, `R2_*`, `SESSION_SECRET`, `CORS_ORIGIN`, `NESTJS_PORT`.
- `.env.example` 파일에 실제 비밀 값(비밀번호, API 키, 토큰)을 절대 넣지 마라.
- 프론트엔드/백엔드 빌드가 모두 통과해야 한다.
- 기존 테스트를 깨뜨리지 마라.
