# Phase 2: Prisma Migrate Baseline

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션)
- `docs/architecture.md` (환경 분리 섹션)
- `/tasks/5-env-separation/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `.env.example` (Phase 1에서 생성됨)
- `webhard-api/.env.example` (Phase 1에서 업데이트됨)
- `.env.local` (Phase 1에서 DATABASE_URL 수정됨)

그리고 아래 파일들을 읽어라:

- `webhard-api/prisma/schema.prisma` — 전체 Prisma 스키마 (datasource, 모든 모델)
- `webhard-api/package.json` — 현재 scripts 섹션
- `webhard-api/Dockerfile` — 배포 시 마이그레이션 실행 방식

## 배경

현재 상태:

- Prisma 스키마는 `webhard-api/prisma/schema.prisma`에 37개 모델이 정의되어 있다
- `prisma db push`로 스키마를 DB에 동기화해왔다 (마이그레이션 파일 없음)
- `webhard-api/prisma/migrations/`에는 `migration_lock.toml`만 존재한다
- Supabase 대시보드에는 12개 SQL 마이그레이션이 있지만, 이는 Prisma 시스템과 별개다
- `_prisma_migrations` 테이블에 1건이 있다 (이전에 시도된 마이그레이션)
- Railway Dockerfile에서 이미 `npx prisma migrate deploy`를 실행하고 있다

목표: 현재 스키마를 baseline 마이그레이션으로 캡처하여, 향후 모든 스키마 변경을 Prisma Migrate로 관리한다.

## 작업 내용

### 1. 기존 \_prisma_migrations 정리

기존 `_prisma_migrations` 테이블의 데이터를 정리해야 할 수 있다. 이 단계는 **수동으로 프로덕션 DB에 적용**해야 하므로, 여기서는 문서화만 한다.

`tasks/5-env-separation/MANUAL_STEPS.md` 파일을 생성하여 아래 내용을 기록하라:

```markdown
# 수동 실행 단계

이 파일의 단계들은 자동 phase 실행 후 수동으로 진행해야 합니다.

## 사전 준비 (Phase 실행 전)

1. Supabase 대시보드에서 개발 프로젝트 생성 (리전: ap-northeast-2)
2. Cloudflare R2에서 `yjlaser-dev` 버킷 생성
3. `.env.local`의 DATABASE_URL/DIRECT_URL을 개발 프로젝트 값으로 교체

## Phase 2 이후: Prisma Migrate Baseline 적용

### 개발 DB (새로 만든 Supabase 프로젝트)

개발 DB는 비어있으므로 마이그레이션을 직접 적용하면 된다:

\`\`\`bash
cd webhard-api
npx prisma migrate deploy
\`\`\`

### 프로덕션 DB (기존 Supabase 프로젝트)

프로덕션 DB에는 이미 스키마가 존재하므로, baseline을 "이미 적용됨"으로 마킹한다:

\`\`\`bash
cd webhard-api

# 기존 \_prisma_migrations 정리 (필요 시)

# Supabase SQL Editor에서:

# TRUNCATE TABLE \_prisma_migrations;

# Baseline 마이그레이션을 "이미 적용됨"으로 마킹

npx prisma migrate resolve --applied 0_init
\`\`\`

## Phase 3 이후: 시드 데이터

개발 DB에 시드 데이터 삽입:

\`\`\`bash
cd webhard-api
npx prisma db seed
\`\`\`
```

### 2. Baseline 마이그레이션 생성

현재 Prisma 스키마에서 전체 SQL을 생성하라:

```bash
cd webhard-api
mkdir -p prisma/migrations/0_init
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql
```

생성된 `migration.sql` 파일을 열어 내용이 있는지 확인하라. CREATE TABLE 문이 포함되어야 한다.

### 3. `webhard-api/package.json` scripts 추가

기존 scripts 섹션에 아래 명령어들을 추가하라:

```json
"migrate:dev": "npx prisma migrate dev",
"migrate:deploy": "npx prisma migrate deploy",
"migrate:status": "npx prisma migrate status",
"migrate:reset": "npx prisma migrate reset",
"db:seed": "npx prisma db seed"
```

### 4. Prisma seed 설정 추가

`webhard-api/package.json`에 prisma seed 설정을 추가하라 (top-level):

```json
"prisma": {
  "seed": "npx tsx prisma/seed.ts"
}
```

`tsx`가 devDependencies에 없으면 설치하라:

```bash
cd webhard-api && pnpm add -D tsx
```

### 5. Dockerfile 확인

`webhard-api/Dockerfile`의 CMD에 이미 `npx prisma migrate deploy`가 포함되어 있는지 확인하라. 현재:

```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
```

이미 올바르게 설정되어 있으므로 변경 불필요.

## Acceptance Criteria

```bash
cd webhard-api && ls prisma/migrations/0_init/migration.sql && npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > /dev/null && pnpm build
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/5-env-separation/index.json`의 phase 2 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- `prisma migrate dev`를 실행하지 마라. 이 커맨드는 DB에 직접 마이그레이션을 적용한다. 이 phase에서는 **파일 생성만** 한다.
- `migration.sql`은 `prisma migrate diff`로 생성한다. 수동으로 SQL을 작성하지 마라.
- `webhard-api/prisma/migrations/migration_lock.toml`은 이미 존재한다. 삭제하지 마라.
- Dockerfile은 이미 올바르게 설정되어 있다. 변경하지 마라.
- 기존 테스트를 깨뜨리지 마라.
