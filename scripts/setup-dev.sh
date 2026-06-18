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
