#!/bin/bash
# ============================================================
# YJ Laser 개발환경 셋업 스크립트
# 새 데스크탑에서: git clone → bash setup.sh
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ---- 1. Node.js 확인 ----
if ! command -v node &> /dev/null; then
  error "Node.js가 설치되어 있지 않습니다. https://nodejs.org 에서 v20 LTS 이상을 설치하세요."
fi
info "Node.js $(node -v) 확인됨"

# ---- 2. pnpm 설치 ----
if ! command -v pnpm &> /dev/null; then
  info "pnpm 설치 중..."
  npm install -g pnpm
else
  info "pnpm $(pnpm -v) 확인됨"
fi

# ---- 3. 글로벌 CLI 설치 ----
GLOBAL_TOOLS=("vercel")

for tool in "${GLOBAL_TOOLS[@]}"; do
  if ! command -v "$tool" &> /dev/null; then
    info "$tool 설치 중..."
    pnpm add -g "$tool"
  else
    info "$tool 확인됨"
  fi
done

# gh (GitHub CLI) - 별도 설치 필요
if ! command -v gh &> /dev/null; then
  warn "GitHub CLI(gh)가 없습니다. 설치 방법:"
  warn "  Windows: winget install GitHub.cli"
  warn "  Mac:     brew install gh"
  warn "  Linux:   https://cli.github.com"
fi

# ---- 4. 프로젝트 의존성 설치 ----
info "프론트엔드 의존성 설치 중..."
pnpm install

info "백엔드(webhard-api) 의존성 설치 중..."
cd webhard-api && pnpm install && cd ..

# ---- 5. Prisma 클라이언트 생성 ----
info "Prisma 클라이언트 생성 중..."
cd webhard-api && npx prisma generate && cd ..

# ---- 6. 환경변수 (.env.local) ----
if [ ! -f .env.local ]; then
  warn ".env.local 파일이 없습니다."
  echo ""
  echo "  방법 1) 기존 PC에서 .env.local 파일을 복사"
  echo "  방법 2) Vercel에서 내려받기:"
  echo "          vercel login"
  echo "          vercel link"
  echo "          vercel env pull .env.local"
  echo ""
else
  info ".env.local 확인됨"
fi

# ---- 7. Vercel 연결 확인 ----
if [ ! -d .vercel ]; then
  warn "Vercel 프로젝트가 연결되지 않았습니다."
  warn "  vercel login && vercel link 를 실행하세요."
else
  info "Vercel 프로젝트 연결 확인됨"
fi

# ---- 완료 ----
echo ""
echo "============================================================"
info "셋업 완료!"
echo ""
echo "  pnpm dev          # 프론트엔드 (localhost:3000)"
echo "  pnpm webhard:dev  # 백엔드 (localhost:4000)"
echo "  pnpm dev:all      # 둘 다 동시 실행"
echo "============================================================"
