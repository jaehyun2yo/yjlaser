# Railway 배포 가이드 (webhard-api)

NestJS 백엔드(`webhard-api/`)의 Railway 배포 설정·수동 배포·장애 대응 플레이북. 프론트엔드(Vercel)는 대상 아님.

- Project: `yjlaser-webhard-api` (id `22df0ca8-4975-47f5-b6d1-9ab13d912542`)
- Service: `webhard-api` (id `8e9819d9-9b55-4efd-b7d0-76076d6fe6ea`)
- Environment: `production` (id `82814e22-a20f-47d2-8c6a-ab63d8c2f1c6`)
- 공개 도메인: `https://webhard-api-production.up.railway.app`

---

## 1. 자동배포 조건

| 요건        | 값                                    |
| ----------- | ------------------------------------- |
| repo        | `jaehyun2yo/yjlaser`                  |
| 브랜치      | `master`                              |
| 감시 경로   | `webhard-api/**`                      |
| 빌더        | Dockerfile (`webhard-api/Dockerfile`) |
| 시작 명령   | `node dist/src/main`                  |
| Healthcheck | `GET /api/v1/health` (120s timeout)   |

Dockerfile은 Node 20 Alpine 이미지를 사용하므로 `corepack prepare pnpm@latest`를 쓰지 않는다.
pnpm 11은 Node 22.13+와 `node:sqlite`를 요구하므로 Railway 빌드에서 `pnpm@10.23.0`으로 고정한다.

조건 요약: **master 로 `webhard-api/**` 경로의 파일 변경이 포함된 push 가 오면 자동 빌드·배포**. 그 외 (브랜치, 경로) push 는 트리거 안 됨. 프론트엔드 변경(`src/app/\*\*` 등)은 Vercel 이 담당하며 Railway 와 무관.

---

## 2. 서비스 설정값 (GraphQL 기준)

```graphql
query {
  serviceInstance(serviceId, environmentId) {
    rootDirectory        # "webhard-api"
    watchPatterns        # ["webhard-api/**"]
    builder              # "RAILPACK"  (dockerfilePath 지정 시 자동으로 DOCKERFILE 로 감지)
    dockerfilePath       # "Dockerfile"
    railwayConfigFile    # ""  ← 빈 문자열 필수 (이유는 §5 참조)
    startCommand         # "node dist/src/main"
    healthcheckPath      # "/api/v1/health"
    source { repo }      # "jaehyun2yo/yjlaser"
  }
}
```

### 2-1. 설정 변경 방법

Railway Dashboard 의 Service → Settings 에서 GUI 로 변경 가능. CLI/API 로도 가능:

```bash
TOKEN=$(node -p "require('$HOME/.railway/config.json').user.token")
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation{serviceInstanceUpdate(serviceId:\"8e9819d9-9b55-4efd-b7d0-76076d6fe6ea\",environmentId:\"82814e22-a20f-47d2-8c6a-ab63d8c2f1c6\",input:{rootDirectory:\"webhard-api\",watchPatterns:[\"webhard-api/**\"],dockerfilePath:\"Dockerfile\",railwayConfigFile:\"\",startCommand:\"node dist/src/main\",healthcheckPath:\"/api/v1/health\",healthcheckTimeout:120})}"}'
```

---

## 3. 수동 배포 (`railway up`)

자동배포가 끊긴 상황 / 긴급 hotfix / 로컬 변경 즉시 반영이 필요한 경우.

```bash
# repo root 에서 실행한다. Railway service rootDirectory 가 "webhard-api" 이므로
# webhard-api/ 안에서 실행하면 snapshot 안에 webhard-api/ 경로가 없어 build 가 실패한다.
railway up --detach --service webhard-api --environment production
railway deployment list      # 상태 확인 (BUILDING → DEPLOYING → SUCCESS)
```

`--detach` 없이 실행하면 빌드 로그가 실시간으로 따라붙고 터미널이 blocking. 배포 커밋을 git 에 반영하지 않아도 `railway up` 은 현재 working tree를 업로드하므로 수정된 `webhard-api/**` 코드가 그대로 배포된다. 단, 반드시 repo root에서 실행한다.

잘못된 실행 예:

```bash
cd webhard-api
railway up --detach
```

이 경우 Railway builder가 `snapshot-target-unpack/webhard-api`를 찾지 못해 다음과 같이 실패할 수 있다.

```text
Build Failed: fsutil.NewFS(.../snapshot-target-unpack/webhard-api): lstat .../webhard-api: no such file or directory
```

---

## 4. 배포 상태 확인 CLI

```bash
# 최근 배포 목록 (id, 상태, 시각)
railway deployment list --limit 5

# 최근 배포 전체 메타 (reason, commitHash, configErrors 등)
railway deployment list --limit 1 --json

# 특정 deployment 의 빌드 로그
railway logs --build <deployment-id>

# 특정 deployment 의 런타임 로그
railway logs --deployment <deployment-id>

# 공개 도메인 health
curl https://webhard-api-production.up.railway.app/api/v1/health
```

`deployment list --json` 의 `meta.reason` 값:

- `deploy` — GitHub push 로 자동 트리거
- `redeploy` — 수동 재배포(대시보드 버튼 또는 `serviceInstanceRedeploy` API)

`reason=deploy` 가 보이지 않으면 자동배포 체인이 끊어진 것 — §5 참조.

---

## 5. 장애 대응 플레이북

### 5-1. 자동배포가 트리거되지 않음

**증상**: master 에 push 를 해도 Railway 에 새 deployment 가 생기지 않음. `deployment list` 에서 최근 항목이 모두 `reason: redeploy` 거나 며칠 전 시각.

**점검 순서**:

1. **GitHub App installation 확인**
   ```bash
   TOKEN=$(node -p "require('$HOME/.railway/config.json').user.token")
   curl -s -X POST https://backboard.railway.app/graphql/v2 \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"query":"query{serviceInstance(serviceId:\"8e9819d9-9b55-4efd-b7d0-76076d6fe6ea\",environmentId:\"82814e22-a20f-47d2-8c6a-ab63d8c2f1c6\"){source{repo}}}"}'
   ```
   `source.repo` 가 `null` 이면 Railway 가 repo 에 접근 권한 없음. GitHub App 재설치 필요:
   - https://github.com/apps/railway-app/installations/new
   - 계정: `jaehyun2yo`
   - Repository access: `jaehyun2yo/yjlaser` 포함
2. **serviceConnect 재연결**
   ```bash
   curl ... -d '{"query":"mutation{serviceConnect(id:\"8e9819d9-9b55-4efd-b7d0-76076d6fe6ea\",input:{repo:\"jaehyun2yo/yjlaser\",branch:\"master\"}){id name}}"}'
   ```
   `"User does not have access to the repo"` 에러가 나면 1단계가 아직 반영 안 됨.
3. **watchPatterns / rootDirectory 확인**: `webhard-api/**` 와 `webhard-api` 로 설정되어 있어야 함.
4. **테스트 push**: webhard-api/ 하위에 주석 한 줄 커밋해서 자동 트리거 확인. 빈 commit(`--allow-empty`) 은 watchPattern 에 안 걸리는 경우가 있음.

**사례 (2026-04-21)**: Railway GitHub App installation 이 사라져 `source.repo=null`. 재설치 → serviceConnect → serviceInstanceUpdate 로 복구.

### 5-2. `configErrors: "config file railway.toml does not exist"`

**증상**: deployment 가 즉시 FAILED + `configErrors` 에 railway.toml 미존재 메시지. 빌드 로그 없음 (`Deployment does not have an associated build`).

**원인**: `railwayConfigFile` 설정이 **repo 루트 기준**으로 railway.toml 을 찾는데, 실제 파일은 `webhard-api/railway.toml` 에 위치. rootDirectory 무시되는 지점.

**해결**: `railwayConfigFile` 를 **빈 문자열**로 설정. Railway 가 rootDirectory(=webhard-api) 안에서 railway.toml 을 자동 감지함.

```bash
curl ... -d '{"query":"mutation{serviceInstanceUpdate(...,input:{railwayConfigFile:\"\",rootDirectory:\"webhard-api\",...})}"}'
```

### 5-3. Next.js 가 대신 빌드됨 (webhard-api 대신 프론트)

**증상**: 런타임 로그에 `next start -p 3100` 가 나오고 `/api/v1/*` 경로가 404. deployment meta 에서 `rootDirectory: null`, `builder: RAILPACK`.

**원인**: `rootDirectory` 가 적용되지 않아 Railway 가 repo 루트를 빌드 컨텍스트로 삼고 Railpack 이 Next.js 자동 감지 → 프론트 빌드.

**해결**: `serviceInstanceUpdate` 로 `rootDirectory: "webhard-api"` + `dockerfilePath: "Dockerfile"` 재설정 → `serviceInstanceRedeploy`.

### 5-4. `Cannot find module '/app/dist/main'`

**증상**: 빌드는 SUCCESS, DEPLOYING 에서 FAILED. 런타임 로그에 `Error: Cannot find module '/app/dist/main'`.

**원인**: `webhard-api/scripts/*.ts` 가 `src/` 밖에 존재 → tsc 가 rootDir 를 `webhard-api/` 로 자동 설정 → 빌드 출력이 `dist/src/main.js` (+ `dist/scripts/*.js`). Dockerfile/railway.toml 이 `dist/main.js` 를 기대하면 즉시 크래시.

**해결**: 시작 경로를 `dist/src/main` 으로 일관되게 사용 (현재 설정). 근본 정리(`scripts/` → `src/scripts/`)는 연쇄 변경이 많아 보류.

### 5-5. 빌드는 SUCCESS 인데 `dist/main.js: No such file or directory`

**증상**: `RUN ls dist/main.js && echo "Build OK"` 단계에서 실패.

**원인**: §5-4 와 동일 구조 문제. `ls dist/src/main.js` 로 확인 경로 수정해야 함 (현재 Dockerfile 은 이미 수정됨).

### 5-6. Migration 누락

**증상**: 배포는 SUCCESS 인데 Prisma schema 가 prod DB 와 안 맞아 500 에러 발생.

**원인**: Dockerfile CMD 에 `npx prisma migrate deploy && node dist/src/main` 이 있으나 특정 상황(스냅샷/이전 이미지 재사용 등)에서 migrate 가 실제로 돌지 않거나 실패 migration 이 섞여 있을 수 있음.

**해결**:

```bash
# 현재 pending migration 확인
railway run -- npx prisma migrate status

# 이미 적용된 것으로 마킹할 migration 이 있다면 (ex. RENAME 이 idempotent 실패)
railway run -- npx prisma migrate resolve --applied <migration_name>

# 적용
railway run -- npx prisma migrate deploy
```

### 5-7. `pnpm install` 단계에서 `node:sqlite` 오류

**증상**: Docker build `RUN pnpm install --frozen-lockfile` 단계에서 다음 오류로 실패.

```text
This version of pnpm requires at least Node.js v22.13
Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite
```

**원인**: Dockerfile이 Node 20 이미지를 사용하면서 `corepack prepare pnpm@latest --activate`로 pnpm 11을 설치했다. pnpm 11은 Node 22.13+가 필요하다.

**해결**: Dockerfile의 pnpm 버전을 Node 20 호환 버전으로 고정한다.

```dockerfile
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate
```

---

## 6. prod DB 스크립트 실행

`webhard-api/scripts/*.ts` 는 `pnpm build` 시 `dist/scripts/*.js` 로 컴파일됨. Railway 환경변수로 로컬에서 prod DB 에 연결해 실행 가능:

```bash
cd webhard-api
pnpm build   # dist/scripts/*.js 생성

# 예시: task 18 데이터 마이그레이션
railway run -- node dist/scripts/backfill-initial-revisions.js             # dry-run
railway run -- node dist/scripts/backfill-initial-revisions.js --apply     # 실제 적용
```

`railway run` 은 Railway production 환경변수(DATABASE_URL 등)를 로컬 프로세스에 주입. 실행은 로컬이지만 DB 는 prod.

`tsx scripts/...` 직접 실행은 NestJS decorator metadata 이슈로 실패. 반드시 `pnpm build` 후 `node dist/scripts/...` 형식 사용.

---

## 7. 관련 문서

- `docs/guides/drawing-consistency-migration.md` — task 18 데이터 마이그레이션 가이드
- `docs/guides/production-monitoring.md` — Sentry/로깅/알림
- `webhard-api/Dockerfile` — 빌드·시작 스펙
- `webhard-api/railway.toml` — Railway 빌더·배포 설정
