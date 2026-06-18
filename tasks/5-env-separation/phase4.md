# Phase 4: 개발 환경 셋업 스크립트

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션, Commands 섹션)
- `docs/architecture.md` (환경 분리 섹션)
- `/tasks/5-env-separation/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `.env.example` (Phase 1에서 생성)
- `webhard-api/package.json` (Phase 2에서 scripts 추가)
- `webhard-api/prisma/seed.ts` (Phase 3에서 생성)
- `webhard-api/prisma/migrations/0_init/migration.sql` (Phase 2에서 생성)
- `tasks/5-env-separation/MANUAL_STEPS.md` (Phase 2에서 생성)

## 작업 내용

### 1. `scripts/setup-dev.sh` 생성

개발 환경을 한 번에 초기화하는 bash 스크립트를 생성하라.

```bash
#!/usr/bin/env bash
set -euo pipefail

# ============================================
# YJLaser — 개발 환경 셋업 스크립트
# ============================================

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "[DRY-RUN] 실제 실행 없이 단계만 표시합니다."
fi

# 색상
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "${GREEN}[STEP]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

# ---- 0. 사전 체크 ----
step "사전 조건 확인..."

command -v node >/dev/null 2>&1 || fail "Node.js가 설치되어 있지 않습니다."
command -v pnpm >/dev/null 2>&1 || fail "pnpm이 설치되어 있지 않습니다."

# ---- 1. .env.local 확인 ----
step ".env.local 확인..."

if [[ ! -f .env.local ]]; then
  warn ".env.local이 없습니다."
  echo ""
  echo "  다음 단계를 수행하세요:"
  echo "  1. cp .env.example .env.local"
  echo "  2. .env.local에 개발 Supabase DB URL과 R2 크레덴셜을 설정"
  echo "  3. 이 스크립트를 다시 실행"
  echo ""
  echo "  개발 Supabase 프로젝트가 없다면:"
  echo "  → https://supabase.com/dashboard 에서 새 프로젝트 생성 (리전: ap-northeast-2)"
  echo ""
  exit 1
fi

# DATABASE_URL 존재 여부 확인
if ! grep -q "DATABASE_URL" .env.local; then
  fail ".env.local에 DATABASE_URL이 설정되지 않았습니다."
fi

# Transaction 모드 (포트 6543) 확인
if ! grep -q "6543" .env.local; then
  warn "DATABASE_URL이 Transaction 모드(포트 6543)가 아닌 것 같습니다."
  warn ".env.example을 참조하여 올바른 형식으로 설정하세요."
fi

step ".env.local 확인 완료!"

# ---- 2. 의존성 설치 ----
step "의존성 설치..."

if [[ "$DRY_RUN" == true ]]; then
  echo "  pnpm install"
  echo "  cd webhard-api && pnpm install"
else
  pnpm install
  cd webhard-api && pnpm install && cd ..
fi

# ---- 3. Prisma 클라이언트 생성 ----
step "Prisma 클라이언트 생성..."

if [[ "$DRY_RUN" == true ]]; then
  echo "  cd webhard-api && npx prisma generate"
else
  cd webhard-api && npx prisma generate && cd ..
fi

# ---- 4. DB 마이그레이션 ----
step "DB 마이그레이션 적용..."

if [[ "$DRY_RUN" == true ]]; then
  echo "  cd webhard-api && npx prisma migrate deploy"
else
  cd webhard-api && npx prisma migrate deploy && cd ..
fi

# ---- 5. 시드 데이터 ----
step "시드 데이터 삽입..."

if [[ "$DRY_RUN" == true ]]; then
  echo "  cd webhard-api && npx prisma db seed"
else
  cd webhard-api && npx prisma db seed && cd ..
fi

# ---- 완료 ----
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  개발 환경 셋업 완료!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "  개발 서버 시작:"
echo "    pnpm dev:all    # Next.js + NestJS 동시 실행"
echo ""
echo "  개별 실행:"
echo "    pnpm dev         # Next.js (localhost:3000)"
echo "    pnpm webhard:dev # NestJS  (localhost:4000)"
echo ""
```

**핵심 구현 원칙:**

- `set -euo pipefail`: 에러 시 즉시 중단
- `--dry-run` 플래그: 실제 실행 없이 단계만 표시
- `.env.local` 없으면 가이드 메시지 출력 후 종료 (강제 실행하지 않음)
- 각 단계에 진행상황 표시

스크립트에 실행 권한을 부여하라:

```bash
chmod +x scripts/setup-dev.sh
```

### 2. `CLAUDE.md` Commands 섹션 업데이트

기존 Commands 섹션에 아래를 추가하라:

```
# Development Setup
bash scripts/setup-dev.sh         # 개발 환경 초기 셋업
bash scripts/setup-dev.sh --dry-run  # 드라이런 (실행 없이 단계 확인)
```

그리고 기존 NestJS backend 커맨드에 추가:

```
# NestJS backend (webhard-api/)
pnpm webhard:dev      # NestJS dev (:4000, watch)
pnpm webhard:build    # Build backend
pnpm webhard:prisma   # Prisma client generate
cd webhard-api && npx prisma migrate dev --name <name>  # 마이그레이션 생성
cd webhard-api && npx prisma db seed                     # 시드 데이터
pnpm dev:all          # Both frontend + backend
```

### 3. 루트 `package.json`에 셋업 스크립트 추가

루트 `package.json`의 scripts에 추가하라:

```json
"setup:dev": "bash scripts/setup-dev.sh"
```

## Acceptance Criteria

```bash
bash scripts/setup-dev.sh --dry-run && pnpm build && cd webhard-api && pnpm build
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/5-env-separation/index.json`의 phase 4 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- `setup-dev.sh`에서 실제로 `prisma migrate deploy`나 `prisma db seed`를 실행하지 마라 (AC에서는 `--dry-run`만 사용).
- 스크립트는 bash 호환으로 작성하라 (Windows Git Bash에서도 동작해야 함).
- 스크립트 내에서 `cd` 후에는 반드시 `cd ..`로 복귀하라.
- `.env.local`에 직접 값을 쓰는 로직은 넣지 마라 — 사용자가 직접 설정하도록 안내만 한다.
- CLAUDE.md 수정 시 200줄 제한을 초과하지 마라.
- 기존 테스트를 깨뜨리지 마라.
