# 중앙 장치 인증 Hosted 개발·운영 배포 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 검증 완료된 중앙 장치 인증 환경 경계를 GitHub에 게시하고, 비용이 발생하지
않는 별도 staging Redis를 사용해 Railway staging과 Vercel Preview를 먼저 검증한 뒤
Railway/Vercel production을 단계적으로 배포한다.

**Architecture:** Vercel Preview는 `stg` Frontend로 Railway staging API만 호출하고,
Vercel Production은 `prd` Frontend로 Railway production API만 호출한다. staging과
production은 DB, Redis, credential/access-token keyring, HMAC을 공유하지 않는다.
배포는 staging 성공 후 production으로 승격하며 migration과 실제 장치 키 작업은
실행하지 않는다.

**Tech Stack:** GitHub CLI, Upstash CLI, Railway CLI, Vercel CLI, Doppler CLI,
PowerShell, Next.js 15, NestJS 11

## Global Constraints

- 대상 브랜치는 `codex/company-device-auth-upstash-compat-20260721`, 구현 커밋은
  `5d0838d8`이다.
- `computeroff`와 세 데스크톱 프로그램 배포는 이 계획에서 제외한다.
- secret 원문을 터미널, 문서, Git, 응답에 출력하지 않는다.
- Upstash는 free plan만 생성하며 유료 전환, 결제수단 등록, auto-upgrade를 하지 않는다.
- production보다 staging을 먼저 배포하고 각 단계의 성공 증거가 없으면 다음 단계로
  넘어가지 않는다.
- Prisma migration, production DB 조회·수정, 실제 장치 등록 코드 발급·승인·폐기·
  재발급은 실행하지 않는다.
- 현재 staging과 production의 장치 인증 Redis가 동일하므로 staging Redis 분리 전
  배포를 중지한다.
- 설정 변경 전후에는 값이 아니라 존재 여부, 기대 환경 일치 여부, 환경 간
  `SAME`/`DIFFERENT`만 출력한다.
- rollback은 직전 성공 deployment를 Railway/Vercel에서 재승격하는 방식으로 한다.

## 확인된 현재 상태

- GitHub origin에는 `5d0838d8`이 아직 push되지 않았다.
- Railway production `webhard-api`는 실행 중이며 health `200`이다.
- Railway staging `webhard-api-staging` 최신 deployment는 health check 실패 후
  중지됐고 공개 health가 `404`다. 기존 로그상 앱은 `localhost:4000`으로 시작했다.
- Railway staging과 Doppler `prd`의 database, keyring, HMAC은 서로 다르다.
- staging, development, production의 장치 인증 Upstash URL/token은 현재 동일하다.
- Vercel Preview는 staging API를 가리키지 않으며
  `NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT`가 없다.
- Vercel Production은 production API를 가리키지만
  `NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT`가 없다.
- Upstash CLI는 설치했지만 account login 정보는 아직 없다.

---

### Task 1: 구현 커밋 GitHub 게시와 CI 확인

**Files:** None

**Interfaces:**

- Consumes: local commit `5d0838d8`
- Produces: origin branch와 GitHub CI 결과

- [ ] **Step 1: push 직전 상태 확인**

Run:

```powershell
git -c safe.directory=C:/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/yjlaser_website/.worktrees/device-auth-upstash-compat-20260721 status
git -c safe.directory=C:/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/yjlaser_website/.worktrees/device-auth-upstash-compat-20260721 log -1 --oneline
```

Expected: tracked 변경 없음, `5d0838d8` 확인. `.serena/`는 untracked 상태로 유지한다.

- [ ] **Step 2: 승인 후 현재 branch push**

Run:

```powershell
git -c safe.directory=C:/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/yjlaser_website/.worktrees/device-auth-upstash-compat-20260721 push origin codex/company-device-auth-upstash-compat-20260721
```

Expected: origin branch가 `5d0838d8`을 포함한다.

- [ ] **Step 3: CI 완료 확인**

Run:

```powershell
$headSha = git rev-parse HEAD
$run = gh run list --repo jaehyun2yo/yjlaser --branch codex/company-device-auth-upstash-compat-20260721 --commit $headSha --limit 1 --json databaseId,headSha,status,conclusion | ConvertFrom-Json
if (-not $run -or $run.headSha -ne $headSha) { throw '새 push의 CI run을 찾지 못했습니다.' }
gh run watch --repo jaehyun2yo/yjlaser $run.databaseId --exit-status
```

Expected: 새 push의 `CI` workflow가 success다. 실패하면 배포하지 않는다.

### Task 2: 무료 staging Upstash Redis 분리

**Files:** None

**Interfaces:**

- Consumes: Upstash account email과 developer API key를 `upstash login`에 직접 입력
- Produces: free database `yjlaser-device-auth-stg`와 Railway staging 전용 REST URL/token

- [ ] **Step 1: Upstash CLI 로그인**

Run:

```powershell
upstash login
```

Expected: 사용자가 terminal prompt에 account email과 developer API key를 입력하고
`~/.config/upstash/config.json`이 생성된다. 값은 대화나 명령 인자에 넣지 않는다.

- [ ] **Step 2: 현재 database 목록을 credential 없이 확인**

Run:

```powershell
$databases = upstash redis list | ConvertFrom-Json
$databases | Select-Object database_name,region,type,auto_upgrade
```

Expected: credential 원문 없이 목록이 출력된다. 동일 이름이 있으면 새로 생성하지 않고
해당 database의 `database_id`를 재사용한다. 동일 이름 database의 `type`이 `free`가
아니거나 `auto_upgrade`가 true면 변경하지 않고 중지한다.

- [ ] **Step 3: free staging database 생성**

Run:

```powershell
$matchingDatabases = @($databases | Where-Object database_name -eq 'yjlaser-device-auth-stg')
if ($matchingDatabases.Count -gt 1) { throw '동일 이름의 Upstash database가 둘 이상입니다.' }
$database = $matchingDatabases | Select-Object -First 1
$databaseCreatedHere = $false
if (-not $database) {
  $configPath = Join-Path $HOME '.config/upstash/config.json'
  $upstashAuth = Get-Content -Raw $configPath | ConvertFrom-Json
  $upstashApiKey = if ($upstashAuth.api_key) { $upstashAuth.api_key } else { $upstashAuth.apiKey }
  if (-not $upstashAuth.email -or -not $upstashApiKey) { throw 'Upstash CLI login 정보가 없습니다.' }
  $basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$($upstashAuth.email):$upstashApiKey"))
  $body = @{
    database_name = 'yjlaser-device-auth-stg'
    platform = 'gcp'
    primary_region = 'asia-northeast1'
    plan = 'free'
    eviction = $false
    tls = $true
  } | ConvertTo-Json
  $database = Invoke-RestMethod `
    -Method Post `
    -Uri 'https://api.upstash.com/v2/redis/database' `
    -Headers @{ Authorization = "Basic $basic" } `
    -ContentType 'application/json' `
    -Body $body
  $databaseCreatedHere = $true
}
if ($database.type -ne 'free' -or $database.auto_upgrade) {
  if ($databaseCreatedHere -and $database.database_id) {
    upstash redis delete --db-id $database.database_id | Out-Null
    $deleteExitCode = $LASTEXITCODE
    $remainingDatabases = upstash redis list | ConvertFrom-Json
    $listExitCode = $LASTEXITCODE
    $databaseStillExists = @($remainingDatabases | Where-Object database_id -eq $database.database_id).Count -gt 0
    if ($deleteExitCode -ne 0 -or $listExitCode -ne 0 -or $databaseStillExists) {
      throw '비무료 Upstash database 삭제를 확인하지 못했습니다. 리소스가 남아 있을 수 있습니다.'
    }
  }
  throw '무료·자동업그레이드 비활성 조건을 충족하지 않습니다.'
}
```

Expected: Developer API 요청에 `plan=free`를 명시하고 생성 결과를 변수에만 보관한다.
이번 단계에서 새로 만든 database의 `type`이 `free`가 아니거나 auto-upgrade가 켜져
있으면 해당 database를 즉시 삭제하고 중지한다. 기존 database가 조건을 어기면
변경·삭제하지 않고 중지한다.

- [ ] **Step 4: Railway staging에 credential 전달**

Run:

```powershell
$details = upstash redis get --db-id $database.database_id | ConvertFrom-Json
if (-not $details.endpoint -or -not $details.rest_token) {
  throw 'Upstash endpoint 또는 REST token을 읽지 못했습니다.'
}
$redisRestUrl = if ($details.endpoint -match '^https?://') {
  $details.endpoint
} elseif ($details.endpoint -match '\.') {
  "https://$($details.endpoint)"
} else {
  "https://$($details.endpoint).upstash.io"
}
$redisRestUrl | railway variable set DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL --stdin --skip-deploys --environment staging --service webhard-api-staging
$details.rest_token | railway variable set DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN --stdin --skip-deploys --environment staging --service webhard-api-staging
```

Expected: raw value 출력 없이 두 variable이 갱신되고 아직 deployment는 시작되지 않는다.
필수 필드가 없으면 값 대신 `$details.PSObject.Properties.Name`만 확인하고 중지한다.

- [ ] **Step 5: 환경 분리 재검증**

Run:

```powershell
$stagingVariables = railway variable list --environment staging --service webhard-api-staging --json | ConvertFrom-Json
$productionSecrets = doppler secrets download --project yjlaser --config prd --no-file --format json --no-fallback | ConvertFrom-Json
$redisKeys = @(
  'DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL',
  'DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN'
)
$redisChecks = foreach ($key in $redisKeys) {
  $stagingValue = $stagingVariables.$key
  $productionValue = $productionSecrets.$key
  [pscustomobject]@{
    key = $key
    stagingPresent = [bool]$stagingValue
    productionPresent = [bool]$productionValue
    relation = if ($stagingValue -and $productionValue -and $stagingValue -ne $productionValue) {
      'DIFFERENT'
    } else {
      'INVALID'
    }
  }
}
$redisChecks
if ($redisChecks.Where({ $_.relation -ne 'DIFFERENT' }).Count -gt 0) {
  throw 'staging/production Redis 분리가 확인되지 않았습니다.'
}
```

Expected: URL과 token 모두 `DIFFERENT`. 하나라도 없거나 동일하면 `INVALID`로
판정하고 배포를 중지한다.

### Task 3: Railway staging 배포와 API smoke

**Files:** None

**Interfaces:**

- Consumes: 분리된 staging DB/Redis/keyring/HMAC, commit `5d0838d8`
- Produces: health `200`, runtime endpoint unauthenticated `401`

- [ ] **Step 1: Railway deploy 명령 확인**

Run:

```powershell
railway up --help
```

Expected: environment와 service를 명시하는 non-interactive deploy 옵션을 확인한다.

- [ ] **Step 2: 승인된 staging service에만 배포**

Run from repository root:

```powershell
$stagingBeforeIds = @(
  (railway deployment list --environment staging --service webhard-api-staging --limit 20 --json |
    ConvertFrom-Json).id
)
railway deployment up webhard-api --path-as-root --environment staging --service webhard-api-staging --detach --yes --json
```

Expected: deployment upload가 시작된다. production service는 변경되지 않는다.

- [ ] **Step 3: deployment 완료 감시**

Run:

```powershell
$deadline = (Get-Date).AddMinutes(20)
$stagingDeployment = $null
do {
  $deployments = @(
    railway deployment list --environment staging --service webhard-api-staging --limit 20 --json |
      ConvertFrom-Json
  )
  $newDeployments = @($deployments | Where-Object { $stagingBeforeIds -notcontains $_.id })
  if ($newDeployments.Count -gt 1) { throw '동시에 시작된 staging deployment가 둘 이상입니다.' }
  if ($newDeployments.Count -eq 1) { $stagingDeployment = $newDeployments[0]; break }
  Start-Sleep -Seconds 5
} while ((Get-Date) -lt $deadline)
if (-not $stagingDeployment) { throw '새 staging deployment ID를 찾지 못했습니다.' }

do {
  $stagingDeployment = @(
    railway deployment list --environment staging --service webhard-api-staging --limit 20 --json |
      ConvertFrom-Json
  ) | Where-Object id -eq $stagingDeployment.id | Select-Object -First 1
  if (-not $stagingDeployment) { throw 'staging deployment 상태를 찾지 못했습니다.' }
  if ($stagingDeployment.status -in @('FAILED','CRASHED','CANCELLED','REMOVED')) {
    throw "staging deployment 실패: $($stagingDeployment.status)"
  }
  if ($stagingDeployment.status -eq 'SUCCESS') { break }
  Start-Sleep -Seconds 10
} while ((Get-Date) -lt $deadline)
if ($stagingDeployment.status -ne 'SUCCESS') { throw 'staging deployment 완료 대기 시간이 초과됐습니다.' }

$stagingDeployment | Select-Object id,status,createdAt
```

Expected: 정확한 새 staging deployment가 `SUCCESS`다. 성공 경로에서는 secret
노출 가능성을 없애기 위해 Railway 원문 로그를 출력하지 않는다. 실패 로그가 필요하면
별도 incident 단계에서 메모리 캡처·redaction 후 확인한다.

- [ ] **Step 4: 읽기 전용 API smoke**

Run:

```powershell
$stagingHealth = Invoke-WebRequest https://webhard-api-staging-staging.up.railway.app/api/v1/health -SkipHttpErrorCheck
$stagingRuntime = Invoke-WebRequest https://webhard-api-staging-staging.up.railway.app/api/v1/integration/devices/runtime-environment -SkipHttpErrorCheck
if ($stagingHealth.StatusCode -ne 200) { throw "staging health 실패: $($stagingHealth.StatusCode)" }
if ($stagingRuntime.StatusCode -ne 401) { throw "staging runtime 인증 경계 실패: $($stagingRuntime.StatusCode)" }
```

Expected: health `200`, 인증 없는 runtime endpoint `401`.

### Task 4: Vercel Preview 환경 결속과 배포

**Files:** None

**Interfaces:**

- Consumes: successful Railway staging URL
- Produces: Preview `stg` build와 staging API 연결

- [ ] **Step 1: Preview variable 변경**

Run with values piped through stdin:

```powershell
'stg' | vercel.cmd env add NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT preview --force --yes
'https://webhard-api-staging-staging.up.railway.app' | vercel.cmd env add NEXT_PUBLIC_WEBHARD_API_URL preview --force --yes
```

Expected: Preview에 environment `stg`와 staging API URL이 설정된다.

- [ ] **Step 2: 값 없는 사전 검증**

Run:

```powershell
vercel.cmd env run --environment preview -- node -e "const result={frontendEnvironment:process.env.NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT==='stg',backendUrl:process.env.NEXT_PUBLIC_WEBHARD_API_URL==='https://webhard-api-staging-staging.up.railway.app'}; console.log(JSON.stringify(result)); if(!result.frontendEnvironment||!result.backendUrl) process.exit(1)"
```

Expected: 두 필드 모두 `true`.

- [ ] **Step 3: Preview deploy**

Run:

```powershell
$previewUrl = (vercel.cmd deploy --yes --no-color | Select-Object -Last 1).Trim()
if ($previewUrl -notmatch '^https://') { throw 'Preview deployment URL을 읽지 못했습니다.' }
```

Expected: Preview deployment URL과 `Ready` 상태를 얻는다.

- [ ] **Step 4: Preview 읽기 전용 smoke**

Run:

```powershell
vercel.cmd inspect $previewUrl --wait --timeout 10m
$previewAdmin = (
  vercel.cmd curl /admin/integration/devices --deployment $previewUrl --yes -- `
    --silent --show-error --output NUL --write-out "%{http_code}__%{redirect_url}" |
    Select-Object -Last 1
).Trim()
if ($previewAdmin -notmatch '^30[2378]__https://[^/]+/(admin/)?login(\?|$)') {
  throw "Preview 관리자 로그인 redirect 실패: $previewAdmin"
}
```

Expected: deployment `Ready`, Vercel Deployment Protection을 안전하게 통과한 비로그인
관리자 경로가 login으로 redirect한다. 원시 bypass token은 출력하지 않는다.

### Task 5: Production 환경 결속과 단계 배포

**Files:** None

**Interfaces:**

- Consumes: Task 1~4의 success 증거
- Produces: Railway/Vercel production에 commit `5d0838d8`과 `prd` 환경 경계

- [ ] **Step 1: production 변경 직전 snapshot**

Run:

```powershell
$previousRailwayProduction = railway deployment list --environment production --service webhard-api --limit 5 --json |
  ConvertFrom-Json |
  Where-Object status -eq 'SUCCESS' |
  Select-Object -First 1
if (-not $previousRailwayProduction) { throw 'Railway production 성공 deployment를 찾지 못했습니다.' }

$commitMatch = [regex]::Match([string]$previousRailwayProduction.meta.cliMessage, '\b[0-9a-f]{7,40}\b')
if (-not $commitMatch.Success) { throw '현재 Railway production의 Git commit을 확인하지 못했습니다.' }
$previousRailwayCommit = (
  git -c safe.directory=C:/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/yjlaser_website/.worktrees/device-auth-upstash-compat-20260721 `
    rev-parse "$($commitMatch.Value)^{commit}"
).Trim()
if (-not $previousRailwayCommit) { throw 'Railway rollback commit이 로컬 Git에 없습니다.' }
$railwayRollbackRoot = Join-Path $env:TEMP "yjlaser-railway-rollback-$($previousRailwayProduction.id)"
if (Test-Path $railwayRollbackRoot) { throw "기존 rollback 경로를 먼저 확인해야 합니다: $railwayRollbackRoot" }
git -c safe.directory=C:/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/yjlaser_website/.worktrees/device-auth-upstash-compat-20260721 `
  worktree add --detach $railwayRollbackRoot $previousRailwayCommit

$previousVercelProduction = vercel.cmd inspect https://www.yjlaser.net --format json | ConvertFrom-Json
if ($previousVercelProduction.readyState -ne 'READY') { throw 'Vercel production이 Ready 상태가 아닙니다.' }
$previousVercelProductionUrl = "https://$($previousVercelProduction.url)"

function Wait-RailwayNewDeployment {
  param(
    [string]$Environment,
    [string]$Service,
    [string[]]$BeforeIds,
    [int]$TimeoutMinutes = 20
  )
  $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
  $deployment = $null
  do {
    $items = @(
      railway deployment list --environment $Environment --service $Service --limit 20 --json |
        ConvertFrom-Json
    )
    $newItems = @($items | Where-Object { $BeforeIds -notcontains $_.id })
    if ($newItems.Count -gt 1) { throw "동시에 시작된 $Environment deployment가 둘 이상입니다." }
    if ($newItems.Count -eq 1) { $deployment = $newItems[0]; break }
    Start-Sleep -Seconds 5
  } while ((Get-Date) -lt $deadline)
  if (-not $deployment) { throw "새 $Environment deployment ID를 찾지 못했습니다." }

  do {
    $deploymentId = $deployment.id
    $deployment = @(
      railway deployment list --environment $Environment --service $Service --limit 20 --json |
        ConvertFrom-Json
    ) | Where-Object id -eq $deploymentId | Select-Object -First 1
    if (-not $deployment) { throw "$Environment deployment 상태를 찾지 못했습니다." }
    if ($deployment.status -in @('FAILED','CRASHED','CANCELLED','REMOVED')) {
      throw "$Environment deployment 실패: $($deployment.status)"
    }
    if ($deployment.status -eq 'SUCCESS') { return $deployment }
    Start-Sleep -Seconds 10
  } while ((Get-Date) -lt $deadline)
  throw "$Environment deployment 완료 대기 시간이 초과됐습니다."
}
```

Expected: Railway와 Vercel의 현재 성공 deployment ID/URL을 메모리에 보관하고,
현재 Railway commit의 rollback worktree를 준비한다. commit을 정확히 식별할 수 없으면
production 배포를 시작하지 않는다. secret 값은 기록하지 않는다.

- [ ] **Step 2: Gate B 직전 환경 결속 재검증**

Run:

```powershell
$stagingVariables = railway variable list --environment staging --service webhard-api-staging --json | ConvertFrom-Json
$productionSecrets = doppler secrets download --project yjlaser --config prd --no-file --format json --no-fallback | ConvertFrom-Json
$productionBoundary = [pscustomobject]@{
  backendEnvironment = $productionSecrets.DEVICE_AUTH_ENVIRONMENT -eq 'prd'
  redisUrlSeparated = (
    $stagingVariables.DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL -and
    $productionSecrets.DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL -and
    $stagingVariables.DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL -ne
      $productionSecrets.DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL
  )
  redisTokenSeparated = (
    $stagingVariables.DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN -and
    $productionSecrets.DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN -and
    $stagingVariables.DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN -ne
      $productionSecrets.DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN
  )
}
$productionBoundary
if ($productionBoundary.PSObject.Properties.Value -contains $false) {
  throw 'production 환경 결속 사전 검증에 실패했습니다.'
}

vercel.cmd env run --environment production -- node -e "const result={backendUrl:process.env.NEXT_PUBLIC_WEBHARD_API_URL==='https://webhard-api-production.up.railway.app'}; console.log(JSON.stringify(result)); if(!result.backendUrl) process.exit(1)"
```

Expected: backend environment는 `prd`, staging/production Redis URL/token은 모두
`DIFFERENT`, Vercel Production backend URL은 Railway production이다. raw secret은
출력하지 않는다.

- [ ] **Step 3: Vercel Production public environment 추가**

Run:

```powershell
'prd' | vercel.cmd env add NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT production --force --yes
vercel.cmd env run --environment production -- node -e "const result={frontendEnvironment:process.env.NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT==='prd',backendUrl:process.env.NEXT_PUBLIC_WEBHARD_API_URL==='https://webhard-api-production.up.railway.app'}; console.log(JSON.stringify(result)); if(!result.frontendEnvironment||!result.backendUrl) process.exit(1)"
```

Expected: Production 환경 식별값이 `prd`로 존재한다.

- [ ] **Step 4: Railway production deploy와 완료 대기**

Run from repository root:

```powershell
$productionBeforeIds = @(
  (railway deployment list --environment production --service webhard-api --limit 20 --json |
    ConvertFrom-Json).id
)
railway deployment up webhard-api --path-as-root --environment production --service webhard-api --detach --yes --json
$productionDeployment = Wait-RailwayNewDeployment `
  -Environment production `
  -Service webhard-api `
  -BeforeIds $productionBeforeIds
$productionDeployment | Select-Object id,status,createdAt
```

Expected: 정확한 새 deployment가 health check를 통과하고 `SUCCESS`가 된다.
성공 경로에서는 Railway 원문 로그를 출력하지 않는다.

- [ ] **Step 5: Railway production backend smoke**

Run:

```powershell
$productionBackendHealth = Invoke-WebRequest https://webhard-api-production.up.railway.app/api/v1/health -SkipHttpErrorCheck
$productionBackendRuntime = Invoke-WebRequest https://webhard-api-production.up.railway.app/api/v1/integration/devices/runtime-environment -SkipHttpErrorCheck
if ($productionBackendHealth.StatusCode -ne 200) {
  throw "production backend health 실패: $($productionBackendHealth.StatusCode)"
}
if ($productionBackendRuntime.StatusCode -ne 401) {
  throw "production backend runtime 인증 경계 실패: $($productionBackendRuntime.StatusCode)"
}
```

Expected: Railway production health `200`, 인증 없는 runtime endpoint `401`.
둘 중 하나라도 다르면 Vercel production을 배포하지 않고 Step 8 rollback을 실행한다.

- [ ] **Step 6: Vercel Production deploy**

Run:

```powershell
$productionUrl = (vercel.cmd deploy --prod --yes --no-color | Select-Object -Last 1).Trim()
if ($productionUrl -notmatch '^https://') { throw 'Production deployment URL을 읽지 못했습니다.' }
$productionVercelDeployment = vercel.cmd inspect $productionUrl --wait --timeout 10m --format json | ConvertFrom-Json
if ($productionVercelDeployment.readyState -ne 'READY') { throw 'Vercel production이 Ready가 아닙니다.' }
$productionAlias = vercel.cmd inspect https://www.yjlaser.net --format json | ConvertFrom-Json
if ($productionAlias.id -ne $productionVercelDeployment.id) {
  throw 'www.yjlaser.net alias가 새 production deployment를 가리키지 않습니다.'
}
```

Expected: deployment가 `Ready`가 되고 `www.yjlaser.net` alias가 새 deployment를 가리킨다.

- [ ] **Step 7: production 읽기 전용 smoke**

Run:

```powershell
$productionHealth = Invoke-WebRequest https://www.yjlaser.net/api/health -SkipHttpErrorCheck
$productionRuntime = Invoke-WebRequest https://www.yjlaser.net/nestapi/integration/devices/runtime-environment -SkipHttpErrorCheck
$productionAdmin = Invoke-WebRequest https://www.yjlaser.net/admin/integration/devices -MaximumRedirection 0 -SkipHttpErrorCheck
if ($productionHealth.StatusCode -ne 200) { throw "production health 실패: $($productionHealth.StatusCode)" }
if ($productionRuntime.StatusCode -ne 401) { throw "production runtime 인증 경계 실패: $($productionRuntime.StatusCode)" }
if (
  $productionAdmin.StatusCode -notin @(302,303,307,308) -or
  [string]$productionAdmin.Headers.Location -notmatch '^(https://www\.yjlaser\.net)?/(admin/)?login(\?|$)'
) {
  throw "production 관리자 로그인 redirect 실패: $($productionAdmin.StatusCode)"
}
```

Expected: health `200`, 인증 없는 runtime endpoint `401`, 관리자 화면은 login redirect.
등록·승인·폐기·재발급 mutation은 호출하지 않는다.

- [ ] **Step 8: 실패 시 CLI rollback과 복구 확인**

Step 4 이후 어느 production smoke에서든 실패하면 Gate B에 포함된 아래 rollback을
즉시 실행한다.

```powershell
$rollbackErrors = [System.Collections.Generic.List[string]]::new()
$railwayRollbackSucceeded = $false
$vercelRollbackSucceeded = $null

try {
  $rollbackBeforeIds = @(
    (railway deployment list --environment production --service webhard-api --limit 20 --json |
      ConvertFrom-Json).id
  )
  $rollbackSource = Join-Path $railwayRollbackRoot 'webhard-api'
  railway deployment up $rollbackSource --path-as-root --environment production --service webhard-api --detach --yes --json
  $railwayRollbackDeployment = Wait-RailwayNewDeployment `
    -Environment production `
    -Service webhard-api `
    -BeforeIds $rollbackBeforeIds
  $restoredHealth = Invoke-WebRequest https://webhard-api-production.up.railway.app/api/v1/health -SkipHttpErrorCheck
  if ($restoredHealth.StatusCode -ne 200) {
    throw 'Railway production rollback health 확인에 실패했습니다.'
  }
  $railwayRollbackSucceeded = $true
} catch {
  $rollbackErrors.Add("Railway rollback 실패: $($_.Exception.Message)")
}

try {
  $currentProductionAlias = vercel.cmd inspect https://www.yjlaser.net --format json | ConvertFrom-Json
  if (-not $currentProductionAlias.id) {
    throw '현재 Vercel production alias를 확인하지 못했습니다.'
  }
  if ($currentProductionAlias.id -ne $previousVercelProduction.id) {
    vercel.cmd rollback $previousVercelProductionUrl --yes
    $restoredAlias = vercel.cmd inspect https://www.yjlaser.net --format json | ConvertFrom-Json
    if ($restoredAlias.id -ne $previousVercelProduction.id) {
      throw 'Vercel production rollback 확인에 실패했습니다.'
    }
  }
  $vercelRollbackSucceeded = $true
} catch {
  $vercelRollbackSucceeded = $false
  $rollbackErrors.Add("Vercel rollback 실패: $($_.Exception.Message)")
}

if ($rollbackErrors.Count -gt 0) {
  throw "production rollback이 완전하지 않습니다: $($rollbackErrors -join '; ')"
}
throw 'production smoke 실패로 직전 Railway/Vercel release를 복원했습니다.'
```

Expected: Railway 새 배포가 health check에서 실패하면 Railway가 기존 성공 배포로
트래픽을 유지하므로 Vercel 배포를 시작하지 않는다. 새 Railway 배포가 `SUCCESS` 후
smoke에서 실패하면 사전에 보존한 이전 commit을 CLI로 다시 올린다. Vercel 배포 후
실패하면 Vercel도 직전 Ready URL로 rollback한다. Railway rollback을 먼저 시도하고
각 플랫폼 복구는 독립된 `try/catch`로 실행하므로 한쪽 실패가 다른 쪽 복구를 막지
않는다. 하나라도 복구 확인에 실패하면 추가 변경을 중지하고 즉시 보고한다.

### Task 6: 증거 문서와 최종 커밋

**Files:**

- Modify: `docs/reports/2026-07-23-device-auth-dev-prd-separation-verification.md`
- Modify: `docs/progress.txt`
- Modify: `docs/changelog/CHANGELOG.md`
- Modify: `docs/features-list.md`
- Modify: this plan

- [ ] **Step 1: deployment ID와 상태 기록**

secret, cookie, DB 식별자, 실제 장치 ID 없이 staging/production deployment 상태,
health status, preview/production URL, 미실행 mutation을 기록한다.

- [ ] **Step 2: 문서 무결성 검사**

Run:

```powershell
git -c safe.directory=C:/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/yjlaser_website/.worktrees/device-auth-upstash-compat-20260721 diff --check
node --test tests/static/device-auth-deployment-contract.test.mjs
```

Expected: exit code `0`, static tests 6/6.

- [ ] **Step 3: 배포 증거 커밋**

Stage only the five documentation files and commit with a Korean message. `.serena/`와
secret 파일은 포함하지 않는다.

- [ ] **Step 4: 성공 후 rollback worktree 정리**

Run only after all staging/production smoke checks and the evidence commit succeed:

```powershell
git -c safe.directory=C:/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/yjlaser_website/.worktrees/device-auth-upstash-compat-20260721 `
  worktree remove $railwayRollbackRoot
```

Expected: 이 계획이 만든 임시 rollback worktree만 제거한다. 실패 조사 중에는
제거하지 않는다.

## Independent Review Gates

1. 실제 변경 전에 fresh reviewer가 service/environment/command, secret 전달 방식,
   stop condition과 rollback을 검토한다.
2. Critical/Important 지적을 반영하고 재검토에서 승인받는다.
3. staging 완료 후 production 직전에 status와 smoke 증거를 다시 확인한다.

## Approval Gates

- Gate A: GitHub push, Upstash free DB 생성(조건 불일치 시 방금 만든 DB 즉시 삭제),
  Railway staging variable 변경·배포, Vercel Preview variable 변경·배포 및
  Deployment Protection bypass 사용.
- Gate B: Task 1~4 성공 후 Railway/Vercel production variable 변경·배포와, 실패 시
  사전 보존한 직전 Railway commit 재배포 및 Vercel rollback.
- Gate C: 실제 장치 등록 코드 발급·승인·폐기·재발급 smoke. 이 계획에서는 승인받지
  않으며 실행하지 않는다.
