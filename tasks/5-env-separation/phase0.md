# Phase 0: 문서 업데이트

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/architecture.md` (프로젝트 간 연동, 데이터 흐름)
- `docs/workflow.md` (업무 워크플로우)
- `CLAUDE.md` (프로젝트 컨벤션, Env Vars 섹션)
- `webhard-api/src/main.ts` (NestJS env 로드 순서 확인)
- `webhard-api/prisma/schema.prisma` (datasource 설정)

## 작업 내용

### 1. `docs/architecture.md` 업데이트

"배포 환경" 섹션 아래에 **"환경 분리 (Dev / Prod)"** 섹션을 추가하라:

```
## 환경 분리 (Dev / Prod)

개발 환경과 프로덕션 환경은 완전히 분리되어 있다.

### 구성

| 자원 | 개발 (Development) | 프로덕션 (Production) |
|------|-------------------|---------------------|
| DB | Supabase 개발 프로젝트 | Supabase 프로덕션 프로젝트 (`ibsbcuumkdhwesrpaqeb`) |
| R2 스토리지 | `yjlaser-dev` 버킷 | `yjlaser` 버킷 |
| Next.js | localhost:3000 | Vercel (yjlaser.net) |
| NestJS | localhost:4000 | Railway |

### 환경 설정 파일

- `.env.example` — 전체 변수 목록 + 설명 (커밋됨, 값 없음)
- `.env.local` — 로컬 개발 값 (gitignore, 개발 DB/R2 사용)
- Vercel/Railway 대시보드 — 프로덕션 값

NestJS는 루트 `.env.local`에서 환경변수를 로드한다 (`webhard-api/.env`는 사용하지 않음).

### DB 연결 모드

Supabase Pooler를 통해 연결한다:
- `DATABASE_URL`: Transaction 모드 (포트 6543) + `pgbouncer=true&statement_cache_size=0`
- `DIRECT_URL`: Direct 연결 (포트 5432) — 마이그레이션 전용

### 스키마 관리

Prisma Migrate로 관리한다:
- 개발: `npx prisma migrate dev --name {이름}`
- 프로덕션: Railway 배포 시 `npx prisma migrate deploy` 자동 실행
```

### 2. `CLAUDE.md` 업데이트

**Env Vars** 섹션을 아래와 같이 교체하라:

기존:

```
## Env Vars

Shared `.env.local`:
```

변경 후:

```
## Env Vars

All env vars are in root `.env.local` (shared by Next.js and NestJS). NestJS loads `../../.env.local` first (see `webhard-api/src/main.ts`). `webhard-api/.env` is NOT used — do not create it.

Dev/Prod separation:
- Dev: `.env.local` points to dev Supabase + `yjlaser-dev` R2 bucket
- Prod: Vercel/Railway dashboards have production values
```

변수 목록은 기존 내용을 유지하되, `DATABASE_URL` 설명에 "(Transaction mode, port 6543)"을 추가하고, `DIRECT_URL` 항목을 추가하라:

```
- `DATABASE_URL` — PostgreSQL via Supabase Pooler (Transaction mode, port 6543, pgbouncer)
- `DIRECT_URL` — PostgreSQL direct connection (port 5432, for migrations only)
```

### 3. `docs/testing.md` 업데이트

"실행 커맨드" 섹션의 Backend 부분에 시드/마이그레이션 커맨드를 추가하라:

```
### Backend (NestJS)

cd webhard-api && pnpm test             # 전체 Jest 테스트
cd webhard-api && pnpm build            # 빌드 검증
cd webhard-api && npx prisma migrate dev --name {name}  # 마이그레이션 생성
cd webhard-api && npx prisma db seed    # 시드 데이터 삽입
```

## Acceptance Criteria

```bash
pnpm build
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/5-env-separation/index.json`의 phase 0 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 문서만 수정한다. 코드를 변경하지 마라.
- 기존 문서의 다른 섹션은 건드리지 마라.
- `docs/architecture.md`의 기존 "배포 환경" 테이블은 유지하고, 그 아래에 새 섹션을 추가하라.
- CLAUDE.md의 200줄 제한을 초과하지 마라. 간결하게 작성.
