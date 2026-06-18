# 수동 실행 단계

이 파일의 단계들은 자동 phase 실행 후 수동으로 진행해야 합니다.

## 사전 준비 (Phase 실행 전)

1. Supabase 대시보드에서 개발 프로젝트 생성 (리전: ap-northeast-2)
2. Cloudflare R2에서 `yjlaser-dev` 버킷 생성
3. `.env.local`의 DATABASE_URL/DIRECT_URL을 개발 프로젝트 값으로 교체

## Phase 2 이후: Prisma Migrate Baseline 적용

### 개발 DB (새로 만든 Supabase 프로젝트)

개발 DB는 비어있으므로 마이그레이션을 직접 적용하면 된다:

```bash
cd webhard-api
npx prisma migrate deploy
```

### 프로덕션 DB (기존 Supabase 프로젝트)

프로덕션 DB에는 이미 스키마가 존재하므로, baseline을 "이미 적용됨"으로 마킹한다:

```bash
cd webhard-api

# 기존 _prisma_migrations 정리 (필요 시)
# Supabase SQL Editor에서:
# TRUNCATE TABLE _prisma_migrations;

# Baseline 마이그레이션을 "이미 적용됨"으로 마킹
npx prisma migrate resolve --applied 0_init
```

## Phase 3 이후: 시드 데이터

개발 DB에 시드 데이터 삽입:

```bash
cd webhard-api
npx prisma db seed
```
