FROM node:20-alpine

WORKDIR /app

# Install Doppler CLI
RUN wget -q -t3 'https://packages.doppler.com/public/cli/rsa.8004D9FF50437357.key' -O /etc/apk/keys/cli@doppler-8004D9FF50437357.rsa.pub && \
    echo 'https://packages.doppler.com/public/cli/alpine/any-version/main' | tee -a /etc/apk/repositories && \
    apk add --no-cache doppler

# Install pnpm
# pnpm 11 requires Node.js 22.13+ and fails on the Node 20 image with missing node:sqlite.
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN pnpm build

# Verify build output
# scripts/*.ts 가 src/ 밖에 있어 tsc rootDir 가 webhard-api/ 로 자동 설정되므로
# 출력 경로는 dist/src/main.js (main 앱) + dist/scripts/*.js (CLI 스크립트).
RUN ls dist/src/main.js && echo "Build OK"

# Set environment
ENV NODE_ENV=production

# Start the application
# DOPPLER_TOKEN이 설정되어 있으면 Doppler에서 시크릿을 주입, 없으면 기존 환경변수 사용
CMD ["sh", "-c", "if [ -n \"$DOPPLER_TOKEN\" ]; then doppler run -- sh -c 'npx prisma migrate deploy && node dist/src/main'; else npx prisma migrate deploy && node dist/src/main; fi"]
