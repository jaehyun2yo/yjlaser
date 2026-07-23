# 중앙 장치 인증 Hosted 개발·운영 배포 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 검증 완료된 중앙 장치 인증 환경 경계를 GitHub에 게시하고, 기존 무료
Upstash Redis 안에서 환경별 namespace를 강제해 Railway staging과 Vercel Preview를
먼저 검증한 뒤 Railway/Vercel production을 단계적으로 배포한다.

**Architecture:** Vercel Preview는 `stg` Frontend로 Railway staging API만 호출하고,
Vercel Production은 `prd` Frontend로 Railway production API만 호출한다. staging과
production은 DB, credential/access-token keyring, audit/token-exchange/rate-limit
HMAC을 공유하지 않는다. 무료 한도 때문에 Upstash URL/token은 공유하되 모든
rate/replay/heartbeat key와 HMAC 입력에 `stg`/`prd`를 포함한다. 따라서 Redis의
장애·quota·REST token blast radius는 공유된다는 제한을 수용한다. 배포는 staging
성공 후 production으로 승격하며 migration과 실제 장치 키 작업은 실행하지 않는다.

**Tech Stack:** GitHub CLI, Upstash CLI, Railway CLI, Vercel CLI, Doppler CLI,
PowerShell, Next.js 15, NestJS 11

## Global Constraints

- 대상 브랜치는 `codex/company-device-auth-upstash-compat-20260721`, 장치 인증 환경
  경계의 기반 구현 커밋은 `5d0838d8`이다. 실제 배포 후보는 Task 1A의 runtime
  attestation 커밋까지 포함한 branch HEAD다.
- `computeroff`와 세 데스크톱 프로그램 배포는 이 계획에서 제외한다.
- secret 원문을 터미널, 문서, Git, 응답에 출력하지 않는다.
- 기존 free database `yj-laser-cache`만 사용하며 새 Upstash resource 생성, 유료 전환,
  결제수단 등록, auto-upgrade를 하지 않는다.
- production보다 staging을 먼저 배포하고 각 단계의 성공 증거가 없으면 다음 단계로
  넘어가지 않는다.
- Prisma migration, production DB 조회·수정, 실제 장치 등록 코드 발급·승인·폐기·
  재발급은 실행하지 않는다.
- staging/production Upstash URL/token은 동일해야 하고, environment 값과 전용 HMAC은
  달라야 한다. Redis 이외의 database, credential/access-token keyring, audit/
  token-exchange/rate-limit HMAC은 환경 간 공유하지 않는다.
- shared Upstash Standard REST token은 `prd` namespace에도 read/write 가능한 공통
  권한이므로 namespace를 접근 제어 경계로 간주하지 않는다. staging 침해, shared
  token 노출, 의도하지 않은 `prd` namespace 변경 증거가 있으면 production 승격을
  중지한다. token 회전과 namespace 무결성 복구는 별도 incident 승인을 받는다.
- 설정 변경 전후에는 값이 아니라 존재 여부, 기대 환경 일치 여부, 환경 간
  `SAME`/`DIFFERENT`만 출력한다.
- rollback은 직전 성공 deployment를 Railway/Vercel에서 재승격하는 방식으로 한다.

## Gate A 실행 전 확인 상태(역사적 기록)

아래 항목은 Gate A/A-1 실행 전 기준이며, 완료 후 상태는 바로 다음 실행 결과가
대체한다.

- GitHub origin은 구현/계획 commit `24de0bd8`까지 포함하며 CI run `29982408095`가
  success다.
- Railway production `webhard-api`는 실행 중이며 health `200`이다.
- Railway staging `webhard-api-staging` 최신 deployment는 health check 실패 후
  중지됐고 공개 health가 `404`다. 기존 로그상 앱은 `localhost:4000`으로 시작했다.
- 강화된 semantic 검사 결과 현재 Railway staging의 database와 credential pepper/
  access-token signing secret이 Doppler `prd`와 겹친다. 이 상태에서는 배포하지 않는다.
- Supabase CLI에서 별도 무료 개발 project `yjlaser-dev`가 `ACTIVE_HEALTHY`로 확인됐고,
  Doppler `dev`의 `DATABASE_URL`/`DIRECT_URL`은 이 project를 가리키며 25개 migration이
  모두 적용돼 있다. Doppler `stg`는 존재하지만 아직 장치 인증/DB secret이 비어 있다.
- staging과 production의 장치 인증 Upstash URL/token은 무료 database
  `yj-laser-cache`를 공유한다.
- Vercel Preview는 staging API를 가리키지 않으며
  `NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT`가 없다.
- Vercel Production은 production API를 가리키지만
  `NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT`가 없다.
- Upstash CLI login은 완료됐다. 현재 계정은 free database 한 개만 허용하며 두 번째
  `plan=free` 생성 요청은 resource 생성 없이 거부됐다.

## Gate A/A-1/B 실행 결과

- GitHub branch HEAD `1d5df97e`까지 push했고 CI run `29985476277`가 success다.
- 기존 무료 개발 Supabase project의 migration 25개가 모두 적용된 상태를 확인했다.
- Doppler/Railway staging을 `stg`로 맞추고 production과 DB 및 모든 key material/HMAC을
  분리했다. 기존 free Upstash URL/token만 의도대로 공유한다.
- Railway staging deployment `5aa3a1eb-fd67-49d7-a506-084aaff7d3a3`은 `SUCCESS`이며
  health `200`, 무인증 runtime endpoint `401`, runtime attestation `stg`를 확인했다.
- Vercel Preview deployment `dpl_8C3UEgf6ziYachT7Ge1aLJS1Kqsa`는 `READY`,
  target `preview`다. Preview public environment는 `stg`/Railway staging API이고
  `/admin/integration/devices`는 `307`로 `/login?next=...`에 연결된다.
- Railway production 첫 upload `97038566-a032-4222-a955-6eb483bcf49c`는 CLI archive
  root와 service rootDirectory가 중첩돼 instance 생성 전에 실패했다. 기존 운영
  instance는 계속 실행됐다.
- clean commit 전체를 archive root로 사용하도록 수정한 Railway production
  `fa25d457-798c-4465-8f0c-d3ac40d6bc02`은 `SUCCESS`이며 health `200`, 무인증
  runtime endpoint `401`, runtime attestation `prd`를 확인했다.
- Vercel Production `dpl_Fcp9d2NmCQfLYomZqyYzbJSTfnyq`는 `READY`, target
  `production`이고 `www.yjlaser.net` alias가 연결됐다. 회사 도메인은 health `200`,
  runtime `401`, 관리자 장치관리 경로 `307` login redirect를 반환한다.
- migration과 실제 장치 키 발급·승인·폐기·재발급은 실행하지 않았다.

---

### Task 1: 구현 커밋 GitHub 게시와 CI 확인

**Files:** None

**Interfaces:**

- Consumes: local commit `5d0838d8`
- Produces: origin branch와 GitHub CI 결과

- [x] **Step 1: push 직전 상태 확인**

Run:

```powershell
git -c safe.directory=C:/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/yjlaser_website/.worktrees/device-auth-upstash-compat-20260721 status
git -c safe.directory=C:/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/yjlaser_website/.worktrees/device-auth-upstash-compat-20260721 log -1 --oneline
```

Expected: tracked 변경 없음, `5d0838d8` 확인. `.serena/`는 untracked 상태로 유지한다.

- [x] **Step 2: 승인 후 현재 branch push**

Run:

```powershell
git -c safe.directory=C:/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/yjlaser_website/.worktrees/device-auth-upstash-compat-20260721 push origin codex/company-device-auth-upstash-compat-20260721
```

Expected: origin branch가 `5d0838d8`을 포함한다.

- [x] **Step 3: CI 완료 확인**

Run:

```powershell
$headSha = git rev-parse HEAD
$run = gh run list --repo jaehyun2yo/yjlaser --branch codex/company-device-auth-upstash-compat-20260721 --commit $headSha --limit 1 --json databaseId,headSha,status,conclusion | ConvertFrom-Json
if (-not $run -or $run.headSha -ne $headSha) { throw '새 push의 CI run을 찾지 못했습니다.' }
gh run watch --repo jaehyun2yo/yjlaser $run.databaseId --exit-status
```

Expected: 새 push의 `CI` workflow가 success다. 실패하면 배포하지 않는다.

### Task 1A: 실제 NestJS runtime의 secret-free attestation

**Files:**

- Modify: `tests/static/device-auth-deployment-contract.test.mjs`
- Modify: `webhard-api/src/main.ts`
- Create: `webhard-api/src/integration/device-auth/device-auth-runtime-attestation.ts`
- Create: `webhard-api/src/integration/device-auth/device-auth-runtime-attestation.spec.ts`

**Interfaces:**

- Consumes: `DEVICE_AUTH_CONFIG`에서 이미 검증된 실제 NestJS runtime environment
- Produces: `device_auth_runtime_attestation` event와 `dev|stg|prd` 식별자만 담은
  Railway-filterable startup log

- [x] **Step 1: 실패하는 배포 계약 테스트 추가**

Run:

```powershell
node --test tests/static/device-auth-deployment-contract.test.mjs
```

Expected: 실제 `DEVICE_AUTH_CONFIG` 조회와 secret-free attestation log가 아직 없어서
새 테스트만 실패한다.

- [x] **Step 2: 최소 startup attestation 구현**

`main.ts`가 `app.get<DeviceAuthConfig>(DEVICE_AUTH_CONFIG)`로 실제 NestJS config를
조회한다. 전용 pure function은 attestation 객체의 key를 `event`, `environment` 두
개로 고정하고, listen 성공 후 이 객체만 JSON log로 남긴다.

```text
event=device_auth_runtime_attestation
environment=dev|stg|prd
```

DB, URL, token, secret, keyring, HMAC, actor/device 정보는 log에 넣지 않는다.

- [x] **Step 3: GREEN과 type check**

Run:

```powershell
pnpm --dir webhard-api exec jest src/integration/device-auth/device-auth-runtime-attestation.spec.ts --runInBand
node --test tests/static/device-auth-deployment-contract.test.mjs
pnpm --dir webhard-api exec tsc --noEmit
```

Expected: attestation unit 3/3, static 7/7와 backend type check가 통과한다.

- [x] **Step 4: attestation 변경만 커밋·push하고 CI 확인**

`.serena/`는 포함하지 않는다. 한국어 commit message로 네 source/test 파일과 이
계획서만 stage하고 push한 뒤, Task 1 Step 3과 같은 방식으로 새 HEAD의 CI success를
확인한다.

### Task 2: 무료 shared Upstash의 환경 namespace 검증

**Files:** None

**Interfaces:**

- Consumes: 기존 free database `yj-laser-cache`, Railway staging variables,
  Doppler `prd` secrets
- Produces: shared Redis 안의 `stg`/`prd` namespace 및 HMAC 분리 검증 결과

- [x] **Step 1: Upstash CLI 로그인**

Run:

```powershell
upstash login
```

Expected: `~/.config/upstash/config.json`이 존재하고 인증이 성공한다. 값은 대화나
명령 인자에 넣지 않는다.

- [x] **Step 2: 현재 database 목록을 credential 없이 확인**

Run:

```powershell
$databases = upstash redis list | ConvertFrom-Json
$database = @($databases | Where-Object database_name -eq 'yj-laser-cache')
if ($database.Count -ne 1) { throw '기존 free Upstash database를 정확히 찾지 못했습니다.' }
$database = $database | Select-Object -First 1
$databaseId = [string]$database.database_id
$database | Select-Object database_name,region,type,auto_upgrade
if ($database.type -ne 'free' -or $database.auto_upgrade) {
  throw '기존 Upstash database가 free·auto-upgrade 비활성 조건을 충족하지 않습니다.'
}
```

Expected: credential 원문 없이 `yj-laser-cache`, `free`, `auto_upgrade=false`만
출력한다. 조건이 다르면 변경하지 않고 중지한다.

- [x] **Step 3: staging secret source와 운영 재사용 교정**

Gate A-1 승인 후 먼저 staging의 잘못된 운영 secret 재사용을 수정한다. 이 단계는
production을 변경하지 않으며 `--skip-deploys`로 변수 저장 중 자동 배포를 막는다.

Run in a dedicated PowerShell process:

```powershell
$developmentSecrets = doppler secrets download --project yjlaser --config dev --no-file --format json --no-fallback |
  ConvertFrom-Json
$existingStaging = railway variable list --environment staging --service webhard-api-staging --json |
  ConvertFrom-Json
$requiredExistingNames = @(
  'DEVICE_AUTH_PREPARED_CREDENTIAL_TTL_MS',
  'DEVICE_AUTH_ACTIVE_CREDENTIAL_TTL_MS',
  'DEVICE_AUTH_AUDIT_LOG_TTL_MS',
  'DEVICE_AUTH_ROTATION_DEADLINE_SECONDS',
  'DEVICE_AUTH_ROTATION_ACK_RECOVERY_SECONDS',
  'DEVICE_AUTH_ROTATION_RUNTIME_ENABLED',
  'DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL',
  'DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN'
)
foreach ($name in $requiredExistingNames) {
  if ([string]::IsNullOrWhiteSpace([string]$existingStaging.$name)) {
    throw "기존 staging 필수 변수 누락: $name"
  }
}

function Get-SupabaseProjectRef([string]$dsn) {
  $uri = [Uri]$dsn
  $username = ($uri.UserInfo -split ':', 2)[0]
  if ($username -match '^postgres\.([a-z0-9]+)$') { return $Matches[1] }
  if ($uri.Host -match '^db\.([a-z0-9]+)\.supabase\.co$') { return $Matches[1] }
  throw 'Supabase project ref를 credential 없이 식별할 수 없습니다.'
}

$developmentDatabaseProjectRefs = @(
  Get-SupabaseProjectRef $developmentSecrets.DATABASE_URL
  Get-SupabaseProjectRef $developmentSecrets.DIRECT_URL
) | Sort-Object -Unique
if ($developmentDatabaseProjectRefs.Count -ne 1) {
  throw 'Doppler dev database URL이 하나의 Supabase project로 수렴하지 않습니다.'
}

doppler run --project yjlaser --config dev --no-fallback -- `
  pnpm --dir webhard-api exec prisma migrate status --schema prisma/schema.prisma
if ($LASTEXITCODE -ne 0) { throw 'yjlaser-dev migration 상태 검증에 실패했습니다.' }

function New-DeviceAuthSecret {
  $bytes = [Security.Cryptography.RandomNumberGenerator]::GetBytes(48)
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

$stagingPepper = New-DeviceAuthSecret
$stagingSigningSecret = New-DeviceAuthSecret
$stagingConfig = [ordered]@{
  DATABASE_URL = [string]$developmentSecrets.DATABASE_URL
  DIRECT_URL = [string]$developmentSecrets.DIRECT_URL
  DEVICE_AUTH_ENVIRONMENT = 'stg'
  DEVICE_AUTH_CREDENTIAL_CURRENT_HASH_KEY_VERSION = '1'
  DEVICE_AUTH_CREDENTIAL_PEPPER_KEYRING_JSON = ConvertTo-Json -Compress -InputObject (
    [ordered]@{ '1' = $stagingPepper }
  )
  DEVICE_AUTH_AUDIT_HMAC_SECRET = New-DeviceAuthSecret
  DEVICE_AUTH_PREPARED_CREDENTIAL_TTL_MS = [string]$existingStaging.DEVICE_AUTH_PREPARED_CREDENTIAL_TTL_MS
  DEVICE_AUTH_ACTIVE_CREDENTIAL_TTL_MS = [string]$existingStaging.DEVICE_AUTH_ACTIVE_CREDENTIAL_TTL_MS
  DEVICE_AUTH_AUDIT_LOG_TTL_MS = [string]$existingStaging.DEVICE_AUTH_AUDIT_LOG_TTL_MS
  DEVICE_AUTH_ACCESS_TOKEN_ISSUER = 'yjlaser-device-auth-stg'
  DEVICE_AUTH_ACCESS_TOKEN_AUDIENCE = 'yjlaser-device-clients-stg'
  DEVICE_AUTH_ACCESS_TOKEN_CURRENT_KID = 'stg-1'
  DEVICE_AUTH_ACCESS_TOKEN_SIGNING_KEYRING_JSON = ConvertTo-Json -Compress -InputObject @(
    [ordered]@{ kid = 'stg-1'; secret = $stagingSigningSecret }
  )
  DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET = New-DeviceAuthSecret
  DEVICE_AUTH_ROTATION_DEADLINE_SECONDS = [string]$existingStaging.DEVICE_AUTH_ROTATION_DEADLINE_SECONDS
  DEVICE_AUTH_ROTATION_ACK_RECOVERY_SECONDS = [string]$existingStaging.DEVICE_AUTH_ROTATION_ACK_RECOVERY_SECONDS
  DEVICE_AUTH_ROTATION_RUNTIME_ENABLED = [string]$existingStaging.DEVICE_AUTH_ROTATION_RUNTIME_ENABLED
  DEVICE_AUTH_BOOTSTRAP_RATE_LIMIT_HMAC_SECRET = New-DeviceAuthSecret
  DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL = [string]$existingStaging.DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL
  DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN = [string]$existingStaging.DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN
}

foreach ($entry in $stagingConfig.GetEnumerator()) {
  $key = [string]$entry.Key
  $value = [string]$entry.Value
  $value | doppler secrets set $key --project yjlaser --config stg --no-interactive --silent
  if ($LASTEXITCODE -ne 0) { throw "Doppler stg variable 저장 실패: $key" }

  $value |
    railway variable set $key --stdin --environment staging --service webhard-api-staging `
      --skip-deploys --json |
    Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Railway staging variable 저장 실패: $key" }
}

Remove-Variable key,value,stagingPepper,stagingSigningSecret,stagingConfig,developmentSecrets `
  -ErrorAction SilentlyContinue
```

Expected: 별도 무료 Supabase `yjlaser-dev` schema가 최신이고, Doppler `stg`와 Railway
staging에 같은 staging 전용 설정이 저장된다. 모든 값은 stdin으로만 전달하며 원문을
출력하지 않는다. `--skip-deploys` 때문에 이 단계만으로 새 deployment가 시작되지 않는다.
중간 실패 시 production은 영향받지 않으며 staging 배포를 시작하지 않고 즉시 중지한다.

- [x] **Step 4: shared Redis와 환경별 secret 경계 검증**

Run:

```powershell
$details = upstash redis get --db-id $databaseId | ConvertFrom-Json
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
$stagingVariables = railway variable list --environment staging --service webhard-api-staging --json | ConvertFrom-Json
$stagingSecrets = doppler secrets download --project yjlaser --config stg --no-file --format json --no-fallback | ConvertFrom-Json
$productionSecrets = doppler secrets download --project yjlaser --config prd --no-file --format json --no-fallback | ConvertFrom-Json

function Get-Sha256Hex([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { throw '비어 있는 secret 또는 identity입니다.' }
  return [Convert]::ToHexString(
    [Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($value))
  )
}

function Get-SupabaseProjectRef([string]$dsn) {
  $uri = [Uri]$dsn
  $username = ($uri.UserInfo -split ':', 2)[0]
  if ($username -match '^postgres\.([a-z0-9]+)$') { return $Matches[1] }
  if ($uri.Host -match '^db\.([a-z0-9]+)\.supabase\.co$') { return $Matches[1] }
  throw 'Supabase project ref를 credential 없이 식별할 수 없습니다.'
}

function Get-PepperFingerprints([string]$json) {
  $parsed = $json | ConvertFrom-Json
  return @(
    $parsed.PSObject.Properties |
      ForEach-Object { Get-Sha256Hex([string]$_.Value) } |
      Sort-Object -Unique
  )
}

function Get-SigningSecretFingerprints([string]$json) {
  $parsed = $json | ConvertFrom-Json
  $entries = if ($parsed -is [array]) { @($parsed) } else { @($parsed) }
  return @(
    $entries |
      ForEach-Object {
        if (-not $_.secret) { throw 'signing keyring secret이 없습니다.' }
        Get-Sha256Hex([string]$_.secret)
      } |
      Sort-Object -Unique
  )
}

function Test-NoFingerprintOverlap([string[]]$left, [string[]]$right) {
  return $left.Count -gt 0 -and
    $right.Count -gt 0 -and
    @($left | Where-Object { $right -contains $_ }).Count -eq 0
}

$stagingParityNames = @(
  'DATABASE_URL',
  'DIRECT_URL',
  'DEVICE_AUTH_ENVIRONMENT',
  'DEVICE_AUTH_CREDENTIAL_CURRENT_HASH_KEY_VERSION',
  'DEVICE_AUTH_CREDENTIAL_PEPPER_KEYRING_JSON',
  'DEVICE_AUTH_AUDIT_HMAC_SECRET',
  'DEVICE_AUTH_ACCESS_TOKEN_ISSUER',
  'DEVICE_AUTH_ACCESS_TOKEN_AUDIENCE',
  'DEVICE_AUTH_ACCESS_TOKEN_CURRENT_KID',
  'DEVICE_AUTH_ACCESS_TOKEN_SIGNING_KEYRING_JSON',
  'DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET',
  'DEVICE_AUTH_BOOTSTRAP_RATE_LIMIT_HMAC_SECRET',
  'DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL',
  'DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN'
)
$stagingParityMatches = @(
  $stagingParityNames | Where-Object {
    (Get-Sha256Hex ([string]$stagingVariables.$_)) -eq
      (Get-Sha256Hex ([string]$stagingSecrets.$_))
  }
)

$stagingDatabaseProjectRefs = @(
  Get-SupabaseProjectRef $stagingVariables.DATABASE_URL
  Get-SupabaseProjectRef $stagingVariables.DIRECT_URL
) | Sort-Object -Unique
$productionDatabaseProjectRefs = @(
  Get-SupabaseProjectRef $productionSecrets.DATABASE_URL
  Get-SupabaseProjectRef $productionSecrets.DIRECT_URL
) | Sort-Object -Unique
$stagingPepperFingerprints = Get-PepperFingerprints(
  $stagingVariables.DEVICE_AUTH_CREDENTIAL_PEPPER_KEYRING_JSON
)
$productionPepperFingerprints = Get-PepperFingerprints(
  $productionSecrets.DEVICE_AUTH_CREDENTIAL_PEPPER_KEYRING_JSON
)
$stagingSigningFingerprints = Get-SigningSecretFingerprints(
  $stagingVariables.DEVICE_AUTH_ACCESS_TOKEN_SIGNING_KEYRING_JSON
)
$productionSigningFingerprints = Get-SigningSecretFingerprints(
  $productionSecrets.DEVICE_AUTH_ACCESS_TOKEN_SIGNING_KEYRING_JSON
)

$sharedBoundary = [pscustomobject]@{
  databaseFree = $database.type -eq 'free' -and -not $database.auto_upgrade
  railwayUsesSingleSecretSource = -not [bool]$stagingVariables.DOPPLER_TOKEN
  dopplerRailwayStagingParity = $stagingParityMatches.Count -eq $stagingParityNames.Count
  stagingEnvironment = $stagingVariables.DEVICE_AUTH_ENVIRONMENT -eq 'stg'
  productionEnvironment = $productionSecrets.DEVICE_AUTH_ENVIRONMENT -eq 'prd'
  databaseUrlsConvergePerEnvironment = (
    $stagingDatabaseProjectRefs.Count -eq 1 -and
    $productionDatabaseProjectRefs.Count -eq 1
  )
  databaseSeparated = (
    $stagingDatabaseProjectRefs.Count -eq 1 -and
    $productionDatabaseProjectRefs.Count -eq 1 -and
    $stagingDatabaseProjectRefs[0] -ne $productionDatabaseProjectRefs[0]
  )
  redisUrlShared = (
    $stagingVariables.DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL -eq $redisRestUrl -and
    $productionSecrets.DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL -eq $redisRestUrl
  )
  redisTokenShared = (
    $stagingVariables.DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN -eq $details.rest_token -and
    $productionSecrets.DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN -eq $details.rest_token
  )
  rateLimitHmacSeparated = (
    $stagingVariables.DEVICE_AUTH_BOOTSTRAP_RATE_LIMIT_HMAC_SECRET -and
    $productionSecrets.DEVICE_AUTH_BOOTSTRAP_RATE_LIMIT_HMAC_SECRET -and
    $stagingVariables.DEVICE_AUTH_BOOTSTRAP_RATE_LIMIT_HMAC_SECRET -ne
      $productionSecrets.DEVICE_AUTH_BOOTSTRAP_RATE_LIMIT_HMAC_SECRET
  )
  credentialPepperMaterialSeparated = (
    Test-NoFingerprintOverlap $stagingPepperFingerprints $productionPepperFingerprints
  )
  accessTokenSigningMaterialSeparated = (
    Test-NoFingerprintOverlap $stagingSigningFingerprints $productionSigningFingerprints
  )
  auditHmacSeparated = (
    $stagingVariables.DEVICE_AUTH_AUDIT_HMAC_SECRET -and
    $productionSecrets.DEVICE_AUTH_AUDIT_HMAC_SECRET -and
    $stagingVariables.DEVICE_AUTH_AUDIT_HMAC_SECRET -ne
      $productionSecrets.DEVICE_AUTH_AUDIT_HMAC_SECRET
  )
  tokenExchangeHmacSeparated = (
    $stagingVariables.DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET -and
    $productionSecrets.DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET -and
    $stagingVariables.DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET -ne
      $productionSecrets.DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET
  )
}
$sharedBoundary
if ($sharedBoundary.PSObject.Properties.Value -contains $false) {
  throw '무료 shared Upstash 환경 경계 검증에 실패했습니다.'
}
```

Expected: Railway staging에는 `DOPPLER_TOKEN`이 없어 Railway variable만 실제 secret
source로 사용하고, Doppler `stg` read-back과 14개 필드의 fingerprint가 모두 같다.
Upstash URL/token은 기존 free database와 정확히 `SAME`, 각 환경의 `DATABASE_URL`과
`DIRECT_URL`은 하나의 Supabase project ref로 수렴하고 환경 간 ref는 `DIFFERENT`,
rate-limit/audit/token-exchange HMAC과 파싱한 credential pepper/access-token signing
key material의 fingerprint 교집합은 0이다. raw ref, DSN, key material은 출력하지 않는다.

- [x] **Step 5: namespace 계약 테스트**

Run:

```powershell
node --test tests/static/device-auth-deployment-contract.test.mjs
pnpm --dir webhard-api exec jest src/integration/device-auth/device-bootstrap-rate-store.spec.ts --runInBand
```

Expected: static 6/6와 rate-store suite가 통과하고 생성 key가
`yjlaser:device-auth:v1:*:stg:` 또는 `yjlaser:device-auth:v1:*:prd:` 형식을 사용한다.

### Task 3: Railway staging 배포와 API smoke

**Files:** None

**Interfaces:**

- Consumes: 분리된 staging DB/Redis/keyring/HMAC, Task 1A가 확정한 branch HEAD
- Produces: health `200`, runtime endpoint unauthenticated `401`

- [x] **Step 1: Railway deploy 명령 확인**

Run:

```powershell
railway up --help
```

Expected: environment와 service를 명시하는 non-interactive deploy 옵션을 확인한다.

- [x] **Step 2: 승인된 staging service에만 배포**

Run from repository root:

```powershell
$stagingBeforeIds = @(
  (railway deployment list --environment staging --service webhard-api-staging --limit 20 --json |
    ConvertFrom-Json).id
)
railway deployment up webhard-api --path-as-root --environment staging --service webhard-api-staging --detach --yes --json
```

Expected: deployment upload가 시작된다. production service는 변경되지 않는다.

- [x] **Step 3: deployment 완료 감시**

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

- [x] **Step 4: 읽기 전용 API smoke**

Run:

```powershell
$stagingHealth = Invoke-WebRequest https://webhard-api-staging-staging.up.railway.app/api/v1/health -SkipHttpErrorCheck
$stagingRuntime = Invoke-WebRequest https://webhard-api-staging-staging.up.railway.app/api/v1/integration/devices/runtime-environment -SkipHttpErrorCheck
if ($stagingHealth.StatusCode -ne 200) { throw "staging health 실패: $($stagingHealth.StatusCode)" }
if ($stagingRuntime.StatusCode -ne 401) { throw "staging runtime 인증 경계 실패: $($stagingRuntime.StatusCode)" }

$stagingAttestationLogs = @(
  railway logs $stagingDeployment.id --environment staging --service webhard-api-staging `
    --lines 5 --filter "device_auth_runtime_attestation" --json |
    ForEach-Object { $_ | ConvertFrom-Json }
)
$stagingAttestations = @(
  $stagingAttestationLogs | Where-Object {
    $_.message -match '"event":"device_auth_runtime_attestation","environment":"stg"'
  }
)
if ($stagingAttestations.Count -ne 1) {
  throw '실제 NestJS staging runtime attestation을 정확히 하나 확인하지 못했습니다.'
}
[pscustomobject]@{ runtimeAttestation = 'stg'; matchingLogs = $stagingAttestations.Count }
```

Expected: health `200`, 인증 없는 runtime endpoint `401`, Railway 인증 채널로 확인한
새 deployment의 실제 NestJS `DEVICE_AUTH_CONFIG.environment` attestation이 `stg`.
필터링된 원문 log도 다시 출력하지 않고 boolean/count 증거만 남긴다.

### Task 4: Vercel Preview 환경 결속과 배포

**Files:** None

**Interfaces:**

- Consumes: successful Railway staging URL
- Produces: Preview `stg` build와 staging API 연결

- [x] **Step 1: Preview variable 변경**

기존 변수는 `env update`로 갱신한다. 변수가 없는 최초 실행에서는 한 번에 하나의
JSON object만 `/v10/projects/{id}/env`에 전달한다. 배열 body는 사용하지 않는다.

```powershell
$projectId = 'prj_7efoODfJBlnGQLH0TwEint5ELSGv'
$scope = 'jaehyun2yos-projects'

function Set-VercelPreviewPublicVariable {
  param(
    [Parameter(Mandatory = $true)][string]$Key,
    [Parameter(Mandatory = $true)][string]$Value
  )

  vercel.cmd env update $Key preview --value $Value --yes --scope $scope
  if ($LASTEXITCODE -eq 0) { return }

  $inputFile = New-TemporaryFile
  try {
    @{
      key = $Key
      value = $Value
      type = 'plain'
      target = @('preview')
    } | ConvertTo-Json -Compress |
      Set-Content -LiteralPath $inputFile.FullName -Encoding utf8NoBOM

    $null = vercel.cmd api "/v10/projects/$projectId/env" `
      --scope $scope --method POST --input $inputFile.FullName --silent
    if ($LASTEXITCODE -ne 0) {
      throw "Vercel Preview 변수 등록 실패: $Key"
    }
  } finally {
    Remove-Item -LiteralPath $inputFile.FullName -Force -ErrorAction SilentlyContinue
  }
}

Set-VercelPreviewPublicVariable `
  -Key 'NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT' `
  -Value 'stg'
Set-VercelPreviewPublicVariable `
  -Key 'NEXT_PUBLIC_WEBHARD_API_URL' `
  -Value 'https://webhard-api-staging-staging.up.railway.app'
```

Expected: Preview에 environment `stg`와 staging API URL이 설정된다.

- [x] **Step 2: 값 없는 사전 검증**

Run:

```powershell
vercel.cmd env run --environment preview -- node -e "const result={frontendEnvironment:process.env.NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT==='stg',backendUrl:process.env.NEXT_PUBLIC_WEBHARD_API_URL==='https://webhard-api-staging-staging.up.railway.app'}; console.log(JSON.stringify(result)); if(!result.frontendEnvironment||!result.backendUrl) process.exit(1)"
```

Expected: 두 필드 모두 `true`.

- [x] **Step 3: Preview deploy**

Run:

```powershell
$previewResult = vercel.cmd deploy --yes --no-color --format json --scope $scope |
  ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($previewResult.id)) {
  throw 'Preview deployment ID를 읽지 못했습니다.'
}
$previewDeploymentId = $previewResult.id
```

Expected: Preview deployment URL과 `Ready` 상태를 얻는다.

- [x] **Step 4: Preview 읽기 전용 smoke**

Run:

```powershell
$previewDeployment = vercel.cmd inspect $previewDeploymentId `
  --wait --timeout 10m --format json --scope $scope |
  ConvertFrom-Json
if ($previewDeployment.readyState -ne 'READY') {
  throw 'Preview deployment가 Ready 상태가 아닙니다.'
}
if ($previewDeployment.target -eq 'production') {
  throw 'Preview deployment가 production target으로 생성됐습니다.'
}
vercel.cmd env run --environment preview -- node -e "const result={frontendEnvironment:process.env.NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT==='stg',backendUrl:process.env.NEXT_PUBLIC_WEBHARD_API_URL==='https://webhard-api-staging-staging.up.railway.app'}; console.log(JSON.stringify(result)); if(!result.frontendEnvironment||!result.backendUrl) process.exit(1)"

$previewAdmin = (
  vercel.cmd curl /admin/integration/devices `
    --deployment $previewDeploymentId --yes --scope $scope -- `
    --silent --show-error --output NUL --write-out "%{http_code}__%{redirect_url}" |
    Select-Object -Last 1
).Trim()
if ($previewAdmin -notmatch '^30[2378]__https://[^/]+/(admin/)?login(\?|$)') {
  throw "Preview 관리자 로그인 redirect 실패: $previewAdmin"
}
```

Expected: deployment `Ready`, target은 production이 아니고 Preview 환경 설정은
`stg`/staging API를 유지한다. Vercel Deployment Protection을 안전하게 통과한
비로그인 관리자 경로가 login으로 redirect한다. 원시 bypass token은 출력하지 않는다.

### Task 5: Production 환경 결속과 단계 배포

**Files:** None

**Interfaces:**

- Consumes: Task 1~4의 success 증거
- Produces: Railway/Vercel production에 Task 1A가 확정한 branch HEAD와 `prd` 환경 경계

- [x] **Step 1: production 변경 직전 snapshot**

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

- [x] **Step 2: Gate B 직전 환경 결속 재검증**

Run:

```powershell
$databases = upstash redis list | ConvertFrom-Json
$database = @($databases | Where-Object database_name -eq 'yj-laser-cache')
if ($database.Count -ne 1) { throw '기존 free Upstash database를 정확히 찾지 못했습니다.' }
$database = $database | Select-Object -First 1
$databaseId = [string]$database.database_id
$details = upstash redis get --db-id $databaseId | ConvertFrom-Json
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

$stagingVariables = railway variable list --environment staging --service webhard-api-staging --json | ConvertFrom-Json
$stagingSecrets = doppler secrets download --project yjlaser --config stg --no-file --format json --no-fallback | ConvertFrom-Json
$productionRailwayVariables = railway variable list --environment production --service webhard-api --json | ConvertFrom-Json
$productionSecrets = doppler secrets download --project yjlaser --config prd --no-file --format json --no-fallback | ConvertFrom-Json

if (-not $productionRailwayVariables.DOPPLER_TOKEN) {
  throw 'Railway production DOPPLER_TOKEN이 없습니다.'
}
$hadLocalDopplerToken = Test-Path Env:DOPPLER_TOKEN
$previousLocalDopplerToken = $env:DOPPLER_TOKEN
try {
  $env:DOPPLER_TOKEN = [string]$productionRailwayVariables.DOPPLER_TOKEN
  $productionTokenSecrets = doppler secrets download --project yjlaser --config prd `
    --no-file --format json --no-fallback |
    ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'Railway production token의 prd 접근 검증에 실패했습니다.' }
} finally {
  if ($hadLocalDopplerToken) {
    $env:DOPPLER_TOKEN = $previousLocalDopplerToken
  } else {
    Remove-Item Env:DOPPLER_TOKEN -ErrorAction SilentlyContinue
  }
}

function Get-Sha256Hex([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { throw '비어 있는 secret 또는 identity입니다.' }
  return [Convert]::ToHexString(
    [Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($value))
  )
}

function Get-SupabaseProjectRef([string]$dsn) {
  $uri = [Uri]$dsn
  $username = ($uri.UserInfo -split ':', 2)[0]
  if ($username -match '^postgres\.([a-z0-9]+)$') { return $Matches[1] }
  if ($uri.Host -match '^db\.([a-z0-9]+)\.supabase\.co$') { return $Matches[1] }
  throw 'Supabase project ref를 credential 없이 식별할 수 없습니다.'
}

function Get-PepperFingerprints([string]$json) {
  $parsed = $json | ConvertFrom-Json
  return @(
    $parsed.PSObject.Properties |
      ForEach-Object { Get-Sha256Hex([string]$_.Value) } |
      Sort-Object -Unique
  )
}

function Get-SigningSecretFingerprints([string]$json) {
  $parsed = $json | ConvertFrom-Json
  $entries = if ($parsed -is [array]) { @($parsed) } else { @($parsed) }
  return @(
    $entries |
      ForEach-Object {
        if (-not $_.secret) { throw 'signing keyring secret이 없습니다.' }
        Get-Sha256Hex([string]$_.secret)
      } |
      Sort-Object -Unique
  )
}

function Test-NoFingerprintOverlap([string[]]$left, [string[]]$right) {
  return $left.Count -gt 0 -and
    $right.Count -gt 0 -and
    @($left | Where-Object { $right -contains $_ }).Count -eq 0
}

$stagingParityNames = @(
  'DATABASE_URL',
  'DIRECT_URL',
  'DEVICE_AUTH_ENVIRONMENT',
  'DEVICE_AUTH_CREDENTIAL_CURRENT_HASH_KEY_VERSION',
  'DEVICE_AUTH_CREDENTIAL_PEPPER_KEYRING_JSON',
  'DEVICE_AUTH_AUDIT_HMAC_SECRET',
  'DEVICE_AUTH_ACCESS_TOKEN_ISSUER',
  'DEVICE_AUTH_ACCESS_TOKEN_AUDIENCE',
  'DEVICE_AUTH_ACCESS_TOKEN_CURRENT_KID',
  'DEVICE_AUTH_ACCESS_TOKEN_SIGNING_KEYRING_JSON',
  'DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET',
  'DEVICE_AUTH_BOOTSTRAP_RATE_LIMIT_HMAC_SECRET',
  'DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL',
  'DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN'
)
$stagingParityMatches = @(
  $stagingParityNames | Where-Object {
    (Get-Sha256Hex ([string]$stagingVariables.$_)) -eq
      (Get-Sha256Hex ([string]$stagingSecrets.$_))
  }
)
$productionTokenParityNames = @(
  'DEVICE_AUTH_ENVIRONMENT',
  'DATABASE_URL',
  'DIRECT_URL',
  'DEVICE_AUTH_CREDENTIAL_PEPPER_KEYRING_JSON',
  'DEVICE_AUTH_ACCESS_TOKEN_SIGNING_KEYRING_JSON',
  'DEVICE_AUTH_AUDIT_HMAC_SECRET',
  'DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET',
  'DEVICE_AUTH_BOOTSTRAP_RATE_LIMIT_HMAC_SECRET'
)
$productionTokenParityMatches = @(
  $productionTokenParityNames | Where-Object {
    (Get-Sha256Hex ([string]$productionTokenSecrets.$_)) -eq
      (Get-Sha256Hex ([string]$productionSecrets.$_))
  }
)

$stagingDatabaseProjectRefs = @(
  Get-SupabaseProjectRef $stagingVariables.DATABASE_URL
  Get-SupabaseProjectRef $stagingVariables.DIRECT_URL
) | Sort-Object -Unique
$productionDatabaseProjectRefs = @(
  Get-SupabaseProjectRef $productionSecrets.DATABASE_URL
  Get-SupabaseProjectRef $productionSecrets.DIRECT_URL
) | Sort-Object -Unique
$stagingPepperFingerprints = Get-PepperFingerprints(
  $stagingVariables.DEVICE_AUTH_CREDENTIAL_PEPPER_KEYRING_JSON
)
$productionPepperFingerprints = Get-PepperFingerprints(
  $productionSecrets.DEVICE_AUTH_CREDENTIAL_PEPPER_KEYRING_JSON
)
$stagingSigningFingerprints = Get-SigningSecretFingerprints(
  $stagingVariables.DEVICE_AUTH_ACCESS_TOKEN_SIGNING_KEYRING_JSON
)
$productionSigningFingerprints = Get-SigningSecretFingerprints(
  $productionSecrets.DEVICE_AUTH_ACCESS_TOKEN_SIGNING_KEYRING_JSON
)

$productionBoundary = [pscustomobject]@{
  databaseFree = $database.type -eq 'free' -and -not $database.auto_upgrade
  railwayStagingUsesSingleSecretSource = -not [bool]$stagingVariables.DOPPLER_TOKEN
  dopplerRailwayStagingParity = $stagingParityMatches.Count -eq $stagingParityNames.Count
  productionDopplerTokenPrdParity = (
    $productionTokenParityMatches.Count -eq $productionTokenParityNames.Count
  )
  stagingEnvironment = $stagingVariables.DEVICE_AUTH_ENVIRONMENT -eq 'stg'
  backendEnvironment = $productionSecrets.DEVICE_AUTH_ENVIRONMENT -eq 'prd'
  databaseUrlsConvergePerEnvironment = (
    $stagingDatabaseProjectRefs.Count -eq 1 -and
    $productionDatabaseProjectRefs.Count -eq 1
  )
  databaseSeparated = (
    $stagingDatabaseProjectRefs.Count -eq 1 -and
    $productionDatabaseProjectRefs.Count -eq 1 -and
    $stagingDatabaseProjectRefs[0] -ne $productionDatabaseProjectRefs[0]
  )
  redisUrlShared = (
    $stagingVariables.DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL -eq $redisRestUrl -and
    $productionSecrets.DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL -eq $redisRestUrl
  )
  redisTokenShared = (
    $stagingVariables.DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN -eq $details.rest_token -and
    $productionSecrets.DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN -eq $details.rest_token
  )
  rateLimitHmacSeparated = (
    $stagingVariables.DEVICE_AUTH_BOOTSTRAP_RATE_LIMIT_HMAC_SECRET -and
    $productionSecrets.DEVICE_AUTH_BOOTSTRAP_RATE_LIMIT_HMAC_SECRET -and
    $stagingVariables.DEVICE_AUTH_BOOTSTRAP_RATE_LIMIT_HMAC_SECRET -ne
      $productionSecrets.DEVICE_AUTH_BOOTSTRAP_RATE_LIMIT_HMAC_SECRET
  )
  credentialPepperMaterialSeparated = (
    Test-NoFingerprintOverlap $stagingPepperFingerprints $productionPepperFingerprints
  )
  accessTokenSigningMaterialSeparated = (
    Test-NoFingerprintOverlap $stagingSigningFingerprints $productionSigningFingerprints
  )
  auditHmacSeparated = (
    $stagingVariables.DEVICE_AUTH_AUDIT_HMAC_SECRET -and
    $productionSecrets.DEVICE_AUTH_AUDIT_HMAC_SECRET -and
    $stagingVariables.DEVICE_AUTH_AUDIT_HMAC_SECRET -ne
      $productionSecrets.DEVICE_AUTH_AUDIT_HMAC_SECRET
  )
  tokenExchangeHmacSeparated = (
    $stagingVariables.DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET -and
    $productionSecrets.DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET -and
    $stagingVariables.DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET -ne
      $productionSecrets.DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET
  )
}
$productionBoundary
if ($productionBoundary.PSObject.Properties.Value -contains $false) {
  throw 'production 환경 결속 사전 검증에 실패했습니다.'
}

vercel.cmd env run --environment production -- node -e "const result={backendUrl:process.env.NEXT_PUBLIC_WEBHARD_API_URL==='https://webhard-api-production.up.railway.app'}; console.log(JSON.stringify(result)); if(!result.backendUrl) process.exit(1)"
```

Expected: Upstash는 free·auto-upgrade 비활성, Railway staging은 Doppler token 없이
Railway/Doppler `stg` 14개 필드가 일치하고, Railway production의 Doppler token으로
읽은 8개 핵심 필드가 Doppler `prd`와 일치한다. backend environment는 `prd`, staging은
`stg`, 환경별 DB URL은 각각 하나의 Supabase project ref로 수렴하고 환경 간 ref와 모든
key material/HMAC은 `DIFFERENT`, Redis URL/token만 의도대로 `SAME`, Vercel Production
backend URL은 Railway production이다. raw secret/ref는 출력하지 않는다. 공유 token
노출 징후, staging 침해 징후 또는 예상하지 못한 `prd` namespace 변경이 하나라도 있으면
Gate B를 승인하지 않고 중지한다.

- [x] **Step 3: Vercel Production public environment 추가**

Run:

```powershell
vercel.cmd env add NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT production `
  --value prd --force --yes --scope jaehyun2yos-projects
vercel.cmd env run --environment production -- node -e "const result={frontendEnvironment:process.env.NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT==='prd',backendUrl:process.env.NEXT_PUBLIC_WEBHARD_API_URL==='https://webhard-api-production.up.railway.app'}; console.log(JSON.stringify(result)); if(!result.frontendEnvironment||!result.backendUrl) process.exit(1)"
```

Expected: Production 환경 식별값이 `prd`로 존재한다.

- [x] **Step 4: Railway production deploy와 완료 대기**

현재 branch HEAD의 clean detached worktree를 만들고 전체 repository를 archive root로
사용한다. service의 `rootDirectory=webhard-api`가 archive 안에서 한 번만 적용돼야 한다.

```powershell
$productionHead = (
  git -c safe.directory=C:/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/yjlaser_website/.worktrees/device-auth-upstash-compat-20260721 `
    rev-parse HEAD
).Trim()
$productionDeployRoot = Join-Path $env:TEMP `
  "yjlaser-production-deploy-$($productionHead.Substring(0,8))"
git -c safe.directory=C:/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/yjlaser_website/.worktrees/device-auth-upstash-compat-20260721 `
  worktree add --detach $productionDeployRoot $productionHead
$productionDeploySafePath = $productionDeployRoot -replace '\\', '/'
if (@(
  git -c "safe.directory=$productionDeploySafePath" `
    -C $productionDeployRoot status --short
).Count -ne 0) {
  throw 'production deploy worktree가 깨끗하지 않습니다.'
}
if (Test-Path (Join-Path $productionDeployRoot '.serena')) {
  throw 'production deploy source에 .serena가 포함됐습니다.'
}

$productionBeforeIds = @(
  (railway deployment list --environment production --service webhard-api --limit 20 --json |
    ConvertFrom-Json).id
)
railway deployment up $productionDeployRoot --path-as-root `
  --environment production --service webhard-api --detach --yes --json `
  --message "중앙 장치 인증 production rollout $($productionHead.Substring(0,8))"
$productionDeployment = Wait-RailwayNewDeployment `
  -Environment production `
  -Service webhard-api `
  -BeforeIds $productionBeforeIds
$productionDeployment | Select-Object id,status,createdAt
```

Expected: 정확한 새 deployment가 health check를 통과하고 `SUCCESS`가 된다.
성공 경로에서는 Railway 원문 로그를 출력하지 않는다.

- [x] **Step 5: Railway production backend smoke**

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
$productionAttestationLogs = @(
  railway logs $productionDeployment.id --environment production --service webhard-api `
    --lines 5 --filter "device_auth_runtime_attestation" --json |
    ForEach-Object { $_ | ConvertFrom-Json }
)
$productionAttestations = @(
  $productionAttestationLogs | Where-Object {
    $_.message -match '"event":"device_auth_runtime_attestation","environment":"prd"'
  }
)
if ($productionAttestations.Count -ne 1) {
  throw '실제 NestJS production runtime attestation을 정확히 하나 확인하지 못했습니다.'
}
[pscustomobject]@{ runtimeAttestation = 'prd'; matchingLogs = $productionAttestations.Count }
```

Expected: Railway production health `200`, 인증 없는 runtime endpoint `401`, Railway
배포 log에서 확인한 실제 NestJS `DEVICE_AUTH_CONFIG.environment`가 `prd`.
둘 중 하나라도 다르면 Vercel production을 배포하지 않고 Step 8 rollback을 실행한다.

- [x] **Step 6: Vercel Production deploy**

Run:

```powershell
New-Item -ItemType Directory -Force `
  (Join-Path $productionDeployRoot '.vercel') | Out-Null
Copy-Item -LiteralPath '.vercel/project.json' `
  -Destination (Join-Path $productionDeployRoot '.vercel/project.json')

$previousProductionAliasId = $previousVercelProduction.id
$null = vercel.cmd deploy --cwd $productionDeployRoot --prod --yes --no-color `
  --scope jaehyun2yos-projects
if ($LASTEXITCODE -ne 0) { throw 'Vercel production deploy 실패' }

$productionVercelDeployment = vercel.cmd inspect https://www.yjlaser.net `
  --format json --scope jaehyun2yos-projects |
  ConvertFrom-Json
if ($productionVercelDeployment.readyState -ne 'READY') {
  throw 'Vercel production이 Ready가 아닙니다.'
}
if ($productionVercelDeployment.id -eq $previousProductionAliasId) {
  throw 'www.yjlaser.net alias가 새 production deployment로 변경되지 않았습니다.'
}
if ($productionVercelDeployment.target -ne 'production') {
  throw '새 Vercel deployment가 production target이 아닙니다.'
}
vercel.cmd env run --environment production -- node -e "const result={frontendEnvironment:process.env.NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT==='prd',backendUrl:process.env.NEXT_PUBLIC_WEBHARD_API_URL==='https://webhard-api-production.up.railway.app'}; console.log(JSON.stringify(result)); if(!result.frontendEnvironment||!result.backendUrl) process.exit(1)"
```

Expected: deployment가 `Ready`와 production target이고 `www.yjlaser.net` alias가 새
deployment를 가리키며 Production public environment가 `prd`/production API를 유지한다.

- [x] **Step 7: production 읽기 전용 smoke**

Run:

```powershell
$productionHealth = Invoke-WebRequest https://www.yjlaser.net/api/health -SkipHttpErrorCheck
$productionRuntime = Invoke-WebRequest https://www.yjlaser.net/nestapi/integration/devices/runtime-environment -SkipHttpErrorCheck
$productionAdmin = curl.exe --silent --show-error --output NUL `
  --write-out "%{http_code} %{redirect_url}" `
  https://www.yjlaser.net/admin/integration/devices
if ($productionHealth.StatusCode -ne 200) { throw "production health 실패: $($productionHealth.StatusCode)" }
if ($productionRuntime.StatusCode -ne 401) { throw "production runtime 인증 경계 실패: $($productionRuntime.StatusCode)" }
if ($productionAdmin -notmatch '^30[2378] https://www\.yjlaser\.net/(admin/)?login(\?|$)') {
  throw "production 관리자 로그인 redirect 실패: $productionAdmin"
}
```

Expected: health `200`, 인증 없는 runtime endpoint `401`, 관리자 화면은 login redirect.
등록·승인·폐기·재발급 mutation은 호출하지 않는다.

- [x] **Step 8: 실패 시 CLI rollback과 복구 확인**

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
  railway deployment up $railwayRollbackRoot --path-as-root `
    --environment production --service webhard-api --detach --yes --json `
    --message '중앙 장치 인증 production rollback'
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
첫 Railway upload 실패는 instance 생성 전에 종료돼 기존 운영 배포가 계속 트래픽을
처리했으므로 rollback mutation은 실행하지 않았다. 수정된 전체 repository root
deploy/rollback 명령은 `--help`로 문법을 검증하고 독립 재검토에서 `OKAY`를 받았다.

### Task 6: 증거 문서와 최종 커밋

**Files:**

- Modify: `docs/reports/2026-07-23-device-auth-dev-prd-separation-verification.md`
- Modify: `docs/progress.txt`
- Modify: `docs/changelog/CHANGELOG.md`
- Modify: `docs/features-list.md`
- Modify: this plan

- [x] **Step 1: deployment ID와 상태 기록**

secret, cookie, DB 식별자, 실제 장치 ID 없이 staging/production deployment 상태,
health status, preview/production URL, 미실행 mutation을 기록한다.

- [x] **Step 2: 문서 무결성 검사**

Run:

```powershell
git -c safe.directory=C:/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/yjlaser_website/.worktrees/device-auth-upstash-compat-20260721 diff --check
node --test tests/static/device-auth-deployment-contract.test.mjs
```

Expected: exit code `0`, static tests 7/7.

- [x] **Step 3: 배포 증거 커밋**

Stage only the five documentation files and commit with a Korean message. `.serena/`와
secret 파일은 포함하지 않는다.

- [x] **Step 4: 성공 후 rollback worktree 정리**

Run only after all staging/production smoke checks and the evidence commit succeed:

```powershell
git -c safe.directory=C:/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/yjlaser_website/.worktrees/device-auth-upstash-compat-20260721 `
  worktree remove $railwayRollbackRoot
$vercelLinkDirectory = Join-Path $productionDeployRoot '.vercel'
if (Test-Path $vercelLinkDirectory) {
  $unexpectedVercelLinkItems = @(
    Get-ChildItem -LiteralPath $vercelLinkDirectory -Force |
      Where-Object Name -notin @('project.json', 'README.txt')
  )
  if ($unexpectedVercelLinkItems.Count -gt 0) {
    throw 'production deploy worktree의 .vercel에 예상하지 못한 파일이 있습니다.'
  }
  foreach ($name in @('project.json', 'README.txt')) {
    $path = Join-Path $vercelLinkDirectory $name
    if (Test-Path $path) {
      Remove-Item -LiteralPath $path -Force
    }
  }
  if (@(Get-ChildItem -LiteralPath $vercelLinkDirectory -Force).Count -ne 0) {
    throw 'production deploy worktree의 .vercel 정리가 완전하지 않습니다.'
  }
  Remove-Item -LiteralPath $vercelLinkDirectory -Force
}
git -c safe.directory=C:/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/yjlaser_website/.worktrees/device-auth-upstash-compat-20260721 `
  worktree remove $productionDeployRoot
```

Expected: 이 계획이 만든 임시 rollback/deploy worktree만 제거한다. 실패 조사 중에는
제거하지 않는다.

## Independent Review Gates

1. 실제 변경 전에 fresh reviewer가 service/environment/command, secret 전달 방식,
   stop condition과 rollback을 검토한다.
2. Critical/Important 지적을 반영하고 재검토에서 승인받는다.
3. staging 완료 후 production 직전에 status와 smoke 증거를 다시 확인한다.
4. shared Upstash Standard REST token은 `stg`/`prd` 양쪽 namespace를 읽고 쓸 수
   있으므로 namespace는 권한 경계가 아니다. staging 침해, shared token 노출 또는
   예상하지 못한 `prd` 변경 징후가 있으면 production hard-stop으로 처리한다. token
   회전과 Redis 무결성 복구는 이 계획의 Gate B가 아닌 별도 incident 승인을 받는다.

## Approval Gates

- Gate A: GitHub push, 기존 free Upstash의 공유 URL/token 및 환경별 namespace/HMAC
  검증, Railway staging 배포, Vercel Preview variable 변경·배포 및 Deployment
  Protection bypass 사용. 새 Upstash resource와 결제 변경은 포함하지 않는다.
- Gate A-1: 강화된 검사로 발견한 현재 staging의 운영 DB/key material 재사용을
  제거한다. Doppler `dev`가 가리키는 기존 무료 `yjlaser-dev` DB를 Doppler `stg`와
  Railway staging에 stdin으로 저장하고, 새 staging 전용 keyring/HMAC을 생성·저장한다.
  Railway는 `--skip-deploys`를 사용하며 production secret/service는 변경하지 않는다.
- Gate B: Task 1~4 성공 후 Railway/Vercel production variable 변경·배포와, 실패 시
  사전 보존한 직전 Railway commit 재배포 및 Vercel rollback. 승인 문구에는 shared
  token 노출·staging 침해·예상하지 못한 `prd` namespace 변경 징후가 없다는 확인을
  포함한다.
- Gate C: 실제 장치 등록 코드 발급·승인·폐기·재발급 smoke. 이 계획에서는 승인받지
  않으며 실행하지 않는다.
