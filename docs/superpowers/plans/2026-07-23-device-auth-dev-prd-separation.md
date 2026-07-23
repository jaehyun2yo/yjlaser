# 장치 인증 개발·운영 환경 분리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회사사이트 장치 인증 관리자 화면이 연결된 백엔드의 `dev`·`stg`·`prd` 환경을 명확히 확인하고, 프론트엔드가 기대한 환경과 백엔드 환경이 다르면 발급·승인·폐기·재발급을 모두 차단한다.

**Architecture:** NestJS의 기존 `DEVICE_AUTH_CONFIG`를 단일 진실 원천으로 사용해 관리자 세션으로만 조회 가능한 비밀 없는 환경 식별 응답을 제공한다. Next.js 관리자 화면은 빌드 시 지정한 `NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT`와 이 응답을 비교하고, 일치할 때만 기존 장치 인증 제어면을 렌더링한다. 장치·credential·token·DB 쿼리는 이미 서버의 `DEVICE_AUTH_ENVIRONMENT`로 필터링되므로 이번 변경은 배포 연결 오류를 조기에 차단하는 보강층이다.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Jest/Testing Library, NestJS 11, Prisma 6

## 실행 상태

- 상태: 소스 구현·로컬 검증 완료, 외부 배포 미실행
- 계획 독립 검토: 1차 `ITERATE` 지적 3건 반영 후 `OKAY`
- 구현 후 독립 보안 검토: 요청 시점 환경 결속 누락 1건을 발견해 보완
- 보완 후 독립 재검토: `APPROVED`, finding 0건
- 최종 증거: Frontend 집중 58 tests, Backend 집중 109 tests,
  Frontend 전체 1,177 tests, Frontend/Backend typecheck와 build 통과
- 예외: Backend 전체 suite의 기존 비관련 11 suites / 28 tests 실패는 범위 밖으로
  분리해 검증 보고서에 기록
- 상세 결과:
  `docs/reports/2026-07-23-device-auth-dev-prd-separation-verification.md`

## Global Constraints

- 대상은 `yjlaser_website`의 회사사이트 프론트엔드와 `webhard-api` 장치 인증 모듈뿐이다.
- `computeroff`, 세 데스크톱 프로그램, 고객 파일, 외부웹하드, Popbill, NAS, R2 업무 호출은 변경하거나 테스트하지 않는다.
- 환경 선택은 서버 배포 설정이 결정하며 관리자 요청 본문이나 화면 선택값으로 받지 않는다.
- `dev`, `stg`, `prd`는 각각 별도 DB, 장치 등록, credential keyring, access-token signing keyring, HMAC namespace를 사용한다.
- 환경 식별 응답에는 `environment` 외의 secret, URL, DB 식별자, token, credential 정보를 포함하지 않는다.
- 환경 설정 누락·잘못된 값·프론트/백엔드 불일치는 fail-closed한다.
- 기존 운영 배포·운영 DB·Railway/Vercel/Doppler 설정은 별도 위험 게이트 승인 전 변경하지 않는다.
- 구현은 RED → GREEN → 회귀 테스트 순서로 진행한다.
- 현재 작업 브랜치의 기존 장치 인증 구현을 재작성하지 않고, 환경 결속에 필요한 최소 변경만 추가한다.
- 이 worktree는 절대 경로에 `.worktrees`가 포함되므로 frontend Jest 실행 시 기존
  `testPathIgnorePatterns`를 아래 검증된 값으로 명시적으로 덮어쓴다.

```text
--testPathIgnorePatterns="/node_modules/|/e2e/|/__tests__/helpers/|/__tests__/factories/|/__tests__/mocks/"
```

- Git 검증은 global safe-directory를 변경하지 않고 명령별
  `-c safe.directory=C:/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/yjlaser_website/.worktrees/device-auth-upstash-compat-20260721`
  옵션을 사용한다.

## 현재 확인된 상태

- backend는 `DEVICE_AUTH_ENVIRONMENT`를 `dev | stg | prd`로 엄격히 파싱하고 누락 또는 다른 값을 거부한다.
- 장치 목록·승인·폐기·회전·token 교환은 선택된 서버 환경으로 DB 조건을 제한한다.
- access token은 환경별 issuer/audience/signing keyring을 사용하고 다른 환경 token을 거부한다.
- 관리자 등록 코드 응답과 장치 목록에는 환경 값이 포함되지만, 장치가 하나도 없거나 코드를 발급하기 전에는 현재 연결 환경을 화면에서 확인할 수 없다.
- 현재 프론트엔드는 잘못된 backend URL에 연결돼도 발급 버튼을 누르기 전에는 이를 차단하지 못한다.
- production은 동작 중이므로 이번 구현 단계에서는 배포하지 않고 source·test 결과를 먼저 확정한다.

---

### Task 1: 관리자 전용 장치 인증 환경 식별 API

**Files:**

- Modify: `webhard-api/src/integration/device-auth/device-management.controller.ts`
- Modify: `webhard-api/src/integration/device-auth/device-management.controller.spec.ts`

**Interfaces:**

- Consumes: `DEVICE_AUTH_CONFIG`의 `DeviceAuthConfig.environment`
- Produces: `GET /api/v1/integration/devices/runtime-environment` → `{ readonly environment: 'dev' | 'stg' | 'prd' }`

- [ ] **Step 1: 환경 식별 API의 실패 테스트 작성**

`device-management.controller.spec.ts`에 다음 계약을 추가한다.

```ts
it('returns only the server-selected device-auth environment to an authenticated admin', async () => {
  await request(app.getHttpServer())
    .get('/api/v1/integration/devices/runtime-environment')
    .set('Cookie', adminSessionCookie)
    .expect(200)
    .expect({ environment: 'dev' });
});

it('does not expose the runtime environment without an authenticated admin session', async () => {
  await request(app.getHttpServer())
    .get('/api/v1/integration/devices/runtime-environment')
    .expect(401);
});
```

- [ ] **Step 2: RED 확인**

Run:

```powershell
cd webhard-api
pnpm test -- device-management.controller.spec.ts --runInBand
```

Expected: 새 경로가 없어 `404` 또는 예상 응답 불일치로 실패한다.

- [ ] **Step 3: 최소 API 구현**

`DeviceManagementController`에 `DEVICE_AUTH_CONFIG`를 주입하고 아래 읽기 전용 method를 추가한다.
controller spec에는 `{ provide: DEVICE_AUTH_CONFIG, useValue: { environment: 'dev' } }`를 추가한다.

```ts
@Get('runtime-environment')
public getRuntimeEnvironment(): { readonly environment: DeviceAuthEnvironment } {
  return { environment: this.deviceAuthConfig.environment };
}
```

controller의 기존 class-level `SessionAuthGuard`, `AdminGuard`,
`DeviceEnrollmentAdminSessionSourceGuard`와 `DeviceManagementNoStoreMiddleware`를 그대로 사용한다.

- [ ] **Step 4: GREEN 및 인접 회귀 확인**

Run:

```powershell
cd webhard-api
pnpm test -- device-management.controller.spec.ts device-auth.module.spec.ts --runInBand
```

Expected: 두 suite가 모두 PASS하고 응답에 `environment` 외 필드가 없다.

### Task 2: 프론트엔드 기대 환경 파서와 API 응답 검증

**Files:**

- Create: `src/app/(admin)/admin/integration/devices/_lib/device-auth-environment.ts`
- Create: `src/__tests__/admin/device-auth-environment.test.ts`
- Modify: `src/app/(admin)/admin/integration/devices/_lib/device-enrollment-api.ts`
- Modify: `src/__tests__/admin/device-management-api.test.ts`

**Interfaces:**

- Produces: `parseExpectedDeviceAuthEnvironment(value: unknown): DeviceAuthEnvironment | null`
- Produces: `getDeviceAuthRuntimeEnvironment(options?): Promise<DeviceAuthEnvironment>`
- Consumes: browser proxy `GET /nestapi/integration/devices/runtime-environment`의
  backend `{ environment }` exact-shape response

- [ ] **Step 1: 엄격한 환경 파서 RED 테스트 작성**

```ts
it.each(['dev', 'stg', 'prd'])('accepts %s', (value) => {
  expect(parseExpectedDeviceAuthEnvironment(value)).toBe(value);
});

it.each([undefined, '', 'DEV', 'production', 'dev ', null])('fails closed for %p', (value) => {
  expect(parseExpectedDeviceAuthEnvironment(value)).toBeNull();
});
```

- [ ] **Step 2: runtime-environment 응답 경계 RED 테스트 작성**

```ts
it('accepts the exact runtime environment response', async () => {
  mockFetchJson({ environment: 'dev' });
  await expect(getDeviceAuthRuntimeEnvironment()).resolves.toBe('dev');
});

it.each([{}, { environment: 'production' }, { environment: 'dev', issuer: 'hidden' }])(
  'rejects malformed or expanded runtime environment responses',
  async (body) => {
    mockFetchJson(body);
    await expect(getDeviceAuthRuntimeEnvironment()).rejects.toBeInstanceOf(
      DeviceManagementRequestError
    );
  }
);
```

- [ ] **Step 3: RED 확인**

Run:

```powershell
pnpm test -- --runInBand --testPathIgnorePatterns="/node_modules/|/e2e/|/__tests__/helpers/|/__tests__/factories/|/__tests__/mocks/" --testPathPatterns="device-auth-environment.test.ts|device-management-api.test.ts"
```

Expected: 새 module/export가 없어 실패한다.

- [ ] **Step 4: 최소 parser와 API client 구현**

환경 parser는 exact enum만 허용하고, API client는
`/nestapi/integration/devices/runtime-environment`를 `credentials: 'include'`,
`cache: 'no-store'`로 조회한다. 응답 객체는 `environment` 단일 키만 허용한다.

- [ ] **Step 5: GREEN 확인**

Run:

```powershell
pnpm test -- --runInBand --testPathIgnorePatterns="/node_modules/|/e2e/|/__tests__/helpers/|/__tests__/factories/|/__tests__/mocks/" --testPathPatterns="device-auth-environment.test.ts|device-management-api.test.ts"
```

Expected: 대상 suite가 모두 PASS한다.

### Task 3: 관리자 화면 환경 결속과 불일치 차단

**Files:**

- Create: `src/app/(admin)/admin/integration/devices/_components/DeviceEnvironmentBoundary.tsx`
- Modify: `src/app/(admin)/admin/integration/devices/page.tsx`
- Modify: `src/__tests__/admin/DeviceEnrollmentPage.test.tsx`

**Interfaces:**

- Consumes: `expectedEnvironment: DeviceAuthEnvironment | null`
- Consumes: `getDeviceAuthRuntimeEnvironment()`
- Produces: 환경 일치 시 기존 `DeviceEnrollmentPanel`·`DeviceManagementPanel`, 불일치/누락/조회 실패 시 차단 안내

- [ ] **Step 1: UI 환경 경계 RED 테스트 작성**

최소 사례를 각각 독립 테스트로 추가한다.

```ts
it('shows the development environment and enables controls only when dev matches dev', async () => {
  mockRuntimeEnvironment('dev');
  render(<DeviceEnvironmentBoundary expectedEnvironment="dev" />);
  expect(await screen.findByText('개발 환경 (dev)')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '등록 코드 발급' })).toBeEnabled();
});

it('blocks all device actions when the frontend and backend environments differ', async () => {
  mockRuntimeEnvironment('prd');
  render(<DeviceEnvironmentBoundary expectedEnvironment="dev" />);
  expect(await screen.findByText('환경 연결 불일치')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '등록 코드 발급' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '등록 코드 발급' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '등록 장치 관리' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '승인' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '연동 해제' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '키 재발급' })).not.toBeInTheDocument();
  expect(listManagedDevices).not.toHaveBeenCalled();
  expect(createDeviceEnrollmentCode).not.toHaveBeenCalled();
  expect(approveManagedDevice).not.toHaveBeenCalled();
  expect(revokeManagedDevice).not.toHaveBeenCalled();
  expect(requestManagedDeviceCredentialRotation).not.toHaveBeenCalled();
});

it('blocks all device actions when the expected environment is not configured', async () => {
  render(<DeviceEnvironmentBoundary expectedEnvironment={null} />);
  expect(screen.getByText('환경 설정 누락')).toBeInTheDocument();
  expect(mockGetRuntimeEnvironment).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading', { name: '등록 코드 발급' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '등록 장치 관리' })).not.toBeInTheDocument();
});
```

환경 조회 실패도 같은 방식으로 두 panel과 모든 mutation을 차단한다. 재시도에서 다시
실패하거나 mismatch가 반환되면 계속 차단하고, 동일 환경이 반환된 뒤에만 두 panel이
처음으로 나타나는 테스트를 추가한다.

- [ ] **Step 2: RED 확인**

Run:

```powershell
pnpm test -- --runInBand --testPathIgnorePatterns="/node_modules/|/e2e/|/__tests__/helpers/|/__tests__/factories/|/__tests__/mocks/" --testPathPatterns="DeviceEnrollmentPage.test.tsx"
```

Expected: 새 boundary가 없어 실패한다.

- [ ] **Step 3: 최소 UI 구현**

`DeviceEnvironmentBoundary`는 mount 후 환경 API를 한 번 조회한다.

- loading: 제어면을 렌더링하지 않고 “환경 확인 중” 표시
- match: 환경 badge와 기존 두 panel 렌더링
- mismatch: 기대 환경과 실제 환경을 표시하되 버튼·panel은 렌더링하지 않음
- missing expected config: API 호출 없이 차단
- request failure: “환경 확인 실패”와 재시도 버튼만 제공

`page.tsx`는 다음처럼 빌드 설정을 파싱해 boundary에 전달한다.

```ts
const expectedEnvironment = parseExpectedDeviceAuthEnvironment(
  process.env.NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT
);

<DeviceEnvironmentBoundary expectedEnvironment={expectedEnvironment} />;
```

관리자가 환경을 화면에서 선택하거나 요청 body로 덮어쓰는 기능은 만들지 않는다.

- [ ] **Step 4: GREEN 및 기존 UI 회귀 확인**

Run:

```powershell
pnpm test -- --runInBand --testPathIgnorePatterns="/node_modules/|/e2e/|/__tests__/helpers/|/__tests__/factories/|/__tests__/mocks/" --testPathPatterns="DeviceEnrollmentPage.test.tsx|IntegrationNav.test.tsx"
```

Expected: 환경 경계와 기존 발급·승인·폐기·재발급 UI 테스트가 모두 PASS한다.

### Task 3A: 모든 관리자 장치 작업을 요청 시점 환경에 결속

**Files:**

- Create: `webhard-api/src/integration/device-auth/device-admin-environment.guard.ts`
- Create: `webhard-api/src/integration/device-auth/device-admin-environment.guard.spec.ts`
- Modify: 등록·관리·관리자 키 회전 controller와 관련 spec
- Modify: Frontend 장치 API helper, 두 panel과 관련 test

구현 후 독립 보안 검토에서 화면 진입 시점 확인만으로는 충분하지 않다는 Important
지적이 나왔다. 확인 직후 proxy/backend 대상이 바뀌면 열린 화면이 다른 환경으로
작업할 수 있기 때문이다.

- [x] Frontend의 조회·등록·승인·폐기·재발급·CSRF bootstrap 요청에
  `x-device-auth-environment` exact 값을 추가
- [x] Backend에서 `DEVICE_AUTH_CONFIG.environment`와 매 요청 header를 exact 비교
- [x] 환경 식별 endpoint만 비교에서 제외하고 기존 admin 인증은 유지
- [x] 누락·`prd` mismatch·`DEV` 변형을 generic `409`로 차단
- [x] 등록·관리·키 회전 서비스가 mismatch에서 호출되지 않는 테스트 추가
- [x] Backend 5 suites / 109 tests와 Frontend 4 suites / 58 tests 통과

### Task 4: 배포 계약·운영 문서 동기화

**Files:**

- Modify: `docs/doppler.md`
- Modify: `docs/guides/railway-deploy.md`
- Modify: `docs/features-list.md`
- Modify: `docs/progress.txt`
- Modify: `docs/changelog/CHANGELOG.md`
- Modify: `tests/static/device-auth-deployment-contract.test.mjs`

**Interfaces:**

- Produces: frontend `NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT`과 backend `DEVICE_AUTH_ENVIRONMENT`의 환경별 결속 계약

- [ ] **Step 1: 정적 배포 계약 RED 테스트 작성**

테스트는 비밀값이 아니라 환경 이름과 설정 책임만 검사한다.

```js
test('device-auth deployment contract documents exact frontend/backend environment pairing', () => {
  const guide = readProjectFile('docs/guides/railway-deploy.md');
  assert.match(guide, /NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT/);
  assert.match(guide, /DEVICE_AUTH_ENVIRONMENT/);
  assert.match(guide, /dev.*dev/s);
  assert.match(guide, /stg.*stg/s);
  assert.match(guide, /prd.*prd/s);
});
```

- [ ] **Step 2: RED 확인**

Run:

```powershell
node --test tests/static/device-auth-deployment-contract.test.mjs
```

Expected: 새 환경 결속 문서가 없어 실패한다.

- [ ] **Step 3: 문서 구현**

환경별 표를 다음 계약으로 고정한다.

| Frontend scope    | `NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT` | Backend environment       | `DEVICE_AUTH_ENVIRONMENT` |
| ----------------- | ------------------------------------- | ------------------------- | ------------------------- |
| local development | `dev`                                 | local/Railway development | `dev`                     |
| staging/preview   | `stg`                                 | Railway staging           | `stg`                     |
| production        | `prd`                                 | Railway production        | `prd`                     |

문서에는 다음 stop 조건을 명시한다.

- frontend/backend 환경 불일치
- DB target 또는 Supabase project reference 불일치
- keyring/HMAC namespace 재사용
- production URL을 local/preview frontend에 연결
- secret 값 출력 또는 문서 저장

- [ ] **Step 4: GREEN 및 문서 품질 확인**

Run:

```powershell
node --test tests/static/device-auth-deployment-contract.test.mjs
git -c safe.directory=C:/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/yjlaser_website/.worktrees/device-auth-upstash-compat-20260721 diff --check -- docs tests/static/device-auth-deployment-contract.test.mjs
rg -n "확인 필요|운영 확인 필요|나중에 구현" docs/guides/railway-deploy.md docs/doppler.md
```

Expected: static test PASS, diff 오류 0, placeholder 0.

### Task 5: 전체 소스 검증과 환경 경계 시나리오

**Files:**

- No production code changes expected
- Append evidence: `docs/reports/2026-07-23-device-auth-dev-prd-separation-verification.md`

**Interfaces:**

- Consumes: Task 1~4의 구현 결과
- Produces: 재실행 가능한 테스트·빌드·환경 경계 검증 증거

- [ ] **Step 1: focused 환경 경계 테스트**

Run:

```powershell
cd webhard-api
pnpm test -- device-auth.runtime-config.spec.ts device-access-token.service.spec.ts device-bearer.guard.spec.ts device-management.controller.spec.ts --runInBand
```

Expected: runtime 값 누락·오류·다른 환경 token 거부와 관리자 환경 API가 PASS한다.

- [ ] **Step 2: frontend focused 테스트**

Run:

```powershell
pnpm test -- --runInBand --testPathIgnorePatterns="/node_modules/|/e2e/|/__tests__/helpers/|/__tests__/factories/|/__tests__/mocks/" --testPathPatterns="DeviceEnrollmentPage.test.tsx|device-auth-environment.test.ts|device-management-api.test.ts|IntegrationNav.test.tsx"
```

Expected: dev/prd 표시, 일치 허용, 불일치·누락·조회 실패 차단이 PASS한다.

- [ ] **Step 3: 전체 정적 검증**

Run:

```powershell
npx tsc --noEmit
pnpm lint
pnpm test -- --runInBand --testPathIgnorePatterns="/node_modules/|/e2e/|/__tests__/helpers/|/__tests__/factories/|/__tests__/mocks/"
pnpm build
cd webhard-api
npx tsc --noEmit
pnpm test -- --runInBand
pnpm build
```

Expected: 모든 명령 exit code `0`.

- [ ] **Step 4: 비밀 없는 로컬 개발 화면 component smoke**

실제 credential이나 DB를 사용하지 않고 Task 3의 component test로 다음 화면 상태를 확인한다.

Run:

```powershell
$env:NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT='dev'
pnpm test -- --runInBand --testPathIgnorePatterns="/node_modules/|/e2e/|/__tests__/helpers/|/__tests__/factories/|/__tests__/mocks/" --testPathPatterns="DeviceEnrollmentPage.test.tsx"
Remove-Item Env:NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT
```

Expected:

- backend `dev` 합성 응답에서 `개발 환경 (dev)`와 두 panel 표시
- backend `prd` 합성 응답에서 “환경 연결 불일치”와 제어 버튼 0
- 환경 누락·조회 실패에서 두 panel과 mutation 호출 0
- 실제 등록 코드·credential·DB 호출 0

- [ ] **Step 5: production 읽기 전용 smoke**

운영 변경 없이 `curl.exe`로 다음만 확인한다.

Run:

```powershell
curl.exe -sS -o NUL -w "%{http_code}`n" https://www.yjlaser.net/api/health
curl.exe -sS -D - -o NUL https://www.yjlaser.net/admin/integration/devices
```

Expected:

- health status line `200`
- admin route status `307`
- `Location: /login?next=%2Fadmin%2Fintegration%2Fdevices`
- 운영 발급·승인·폐기·재발급 API 호출 0

- [ ] **Step 6: 검증 보고서 작성**

보고서에는 명령, exit code, suite/test 수, 실패와 수정 내역, 미실행 항목, 남은 위험을 기록한다.
secret, URL query token, cookie, DB reference, 실제 PC 식별자는 기록하지 않는다.

## 별도 후속: 실제 hosted development/preview 적용

Task 1~5의 source 완료 조건에 포함하지 않는다. Railway/Vercel/Doppler의 실제 대상과
비용을 읽기 전용 preflight로 확정한 뒤, exact environment/service/variable 이름,
값을 출력하지 않는 명령, 승인 지점, rollback 명령과 성공 기준을 포함하는 별도 계획서를
작성하고 다시 독립 검토한다. 사용자 명시 승인 전에는 외부 설정·배포·credential lifecycle을
변경하거나 실행하지 않는다.

## Independent Review Gates

1. 구현 전 새 reviewer agent가 이 계획의 실행 가능성, 과도한 범위, 보안 경계, 테스트 누락을 검토한다.
2. Critical/Important 지적은 계획에 반영하고 같은 reviewer에게 재검토한다.
3. 구현 후 다른 fresh reviewer agent가 요구사항 대비 diff, 테스트, 비밀 노출, 환경 우회 가능성을 검토한다.
4. Critical/Important 지적은 수정 후 재검토한다.

## Stop Conditions

- 기존 사용자 변경과 충돌하거나 현재 worktree 밖 파일을 수정해야 하는 경우
- production DB, Railway/Vercel/Doppler, 실제 credential을 변경해야 하는 경우
- 개발과 운영이 같은 DB·keyring·HMAC namespace를 공유하는 증거가 발견된 경우
- 환경 mismatch를 UI 경고만 띄우고 제어면을 계속 노출하게 되는 경우
- 테스트가 실제 고객 데이터나 업무 endpoint를 요구하는 경우

## Completion Evidence

- 새 환경 식별 API가 관리자에게만 exact response를 반환한다.
- 관리자 화면은 `dev`, `stg`, `prd`를 명시하고 mismatch·누락·조회 실패 시 제어면을 렌더링하지 않는다.
- 기존 서버 환경 필터와 다른 환경 token 거부 테스트가 함께 통과한다.
- frontend 전체 test와 frontend/backend typecheck·build가 통과한다.
- backend 전체 test의 비관련 기존 실패는 focused 영향 테스트 통과와 함께 별도
  검증 보고서에 원인·범위를 기록한다.
- 문서와 배포 계약 테스트가 환경별 결속을 고정한다.
- 외부 개발 환경 적용 여부와 production 무영향 여부가 별도로 기록된다.
