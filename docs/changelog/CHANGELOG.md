# Changelog — YJ Laser

## [Unreleased]

### 2026-07-21 — central-device-auth-admin-rotation-control

**Scope**: 회사사이트 관리자 장치 인증 화면의 원격 credential 재발급 요청.

**수정**:

- `standard` 권한의 활성 장치에만 `키 재발급` 작업을 표시하고 표시명 확인 모달을 거쳐 중앙
  `POST /integration/devices/:id/credential-rotations`를 호출한다.
- 응답은 rotation ID, 장치 ID, 상태, 완료 기한, 선택 credential version의 정확한 공개 필드만
  수락한다. refresh credential이나 알 수 없는 필드가 섞이면 UI에 전달하지 않고 실패 처리한다.
- 요청 성공 시 장치가 다음 인증에서 키를 교체한다는 점과 완료 기한을 표시한다. 등록 대기·폐기·
  `safe_canary` 장치에는 재발급 작업을 노출하지 않는다.

**검증 및 경계**:

- 관리자 장치 API/UI TDD는 RED 3건을 확인한 뒤 집중 2 suites / 28 tests와 관련 전체 4 suites /
  30 tests, 대상 ESLint, root TypeScript를 통과했다. correctness/security 재검토는 P0/P1 0이다.
- 실제 credential 원문은 브라우저 상태·문구·로그에 노출하지 않는다. 물리 PC가 다음 인증에서
  rotation prepare/ack를 완료하는 검증은 데스크톱 배포 단계에서 수행한다.

### 2026-07-21 — runtime-doppler-entrypoint

**Scope**: 회사사이트 Webhard API의 Railway/Docker runtime secret 주입 시작 경계.

**수정**:

- Docker CMD와 Railway startCommand를 단일 `/app/docker-entrypoint.sh`에 결속했다.
- `DOPPLER_TOKEN`이 있으면 `doppler run`으로 runtime secret을 주입하고, 없으면 직접 Node를
  실행한다. 두 분기 모두 `exec`를 사용하고 startup migration은 실행하지 않는다.
- Windows checkout의 CRLF를 image build에서 정규화하고 entrypoint 실행 권한을 부여한다.
  기존 build 전용 4096 MiB heap과 runtime `NODE_OPTIONS` 부재는 유지한다.

**검증 및 경계**:

- 정적 배포 계약은 RED 3/5에서 GREEN 5/5로 전환됐고, review-fix mutation RED 4/5에서
  복원 GREEN 5/5를 확인했다. shell/LF, token 유/무 PATH stub probe, TypeScript, Nest build,
  compatibility collector, Prettier/diff/secret scan을 통과했으며 fresh spec/quality re-review는
  모두 Critical/Important/Minor 0/0/0으로 승인됐다. source CI는 5/5 success이며 no-cache
  Docker image의 CMD/755/LF/runtime `NODE_OPTIONS` 부재, offline token 유/무 분기와 built
  compatibility collector도 통과했다.
- 운영 배포, secret/environment 변경, DB 연결, migration 실행은 수행하지 않았다.

### 2026-07-21 — docker-build-heap-boundary

**Scope**: 회사사이트 Webhard API Docker build 단계의 V8 heap OOM 방지와 runtime 환경 경계.

**수정**:

- NestJS build RUN에만 process-scoped `NODE_OPTIONS=--max-old-space-size=4096`을 적용했다. global `ENV`, runtime CMD, startup migration은 변경하지 않았다.
- 정적 배포 계약은 유일한 `pnpm build`가 4096 MiB 이상 heap을 받고, `NODE_OPTIONS`가 runtime CMD/ENV로 전파되지 않으며 `node dist/src/main` startup command가 유지됨을 검사한다.

**검증 및 경계**:

- contract TDD는 RED 3/4에서 GREEN 4/4로 전환됐고, backend TypeScript, Nest build, source compatibility collector 및 Prettier를 통과했다.
- Docker retry/rebuild, image/registry/sign, CI 재실행, deploy, migration, DB, secret/environment/server 작업은 수행하지 않았다.

### 2026-07-21 — ci-gate-closure

**Scope**: 회사사이트 root CI lint/test gate의 플랫폼 독립성 및 정적 검사 정합성.

**수정**:

- secret fallback static gate가 GitHub Ubuntu runner에 없는 `rg` 실행 파일에 의존하지 않도록 Node `fs`의 정렬 순회로 바꿨다. 기존 source root와 검사 제외 규칙은 유지한다.
- 장치 인증 test/collector의 35개 ESLint 오류를 정적 import, 정확한 타입, 명확한 지역 변수명으로 해소했다. built artifact runtime probe에만 좁은 `createRequire(__filename)`을 사용한다.

**검증 및 경계**:

- root lint error-only 0/0, secret gate 1/5, 영향 Nest 11/220, root/backend TypeScript, collector runtime probe, Prettier, root Jest 158 suites / 1,149 tests를 통과했다.
- 기존 lint warning 1,031건은 범위 밖으로 남겼다. 실제 GitHub CI 재실행, 배포, migration, DB/secret/environment/server 작업은 수행하지 않았다.

### 2026-07-21 — root-lockfile-consistency

**Scope**: 회사사이트 root pnpm lockfile와 CI frozen-install 정합성.

**수정**:

- root `pnpm-lock.yaml`을 package manifest의 10개 `pnpm.overrides` 및 기존 `nodemailer ^9.0.1` 선언에 맞춰 재생성했다.

**검증 및 경계**:

- exact pnpm 9 frozen lockfile-only 검증, scripts-off frozen install, TypeScript, root Jest 158 suites / 1,149 tests를 통과했다.
- root lint는 이번 lockfile 변경과 무관한 기존 35 errors / 1,031 warnings로 실패한다. 실제 GitHub CI 재실행, 배포, migration, DB/secret/environment/server 작업은 수행하지 않았다.

### 2026-07-21 — device-auth-deployment-contract

**Scope**: 회사사이트 장치 rotation의 CI, container startup, PostgreSQL enum migration 배포 경계.

**수정**:

- CI가 `main`과 `codex/**` push, `main` 대상 PR을 수신하도록 고치고, Node 내장 배포 계약 test를 test job에 연결했다.
- Webhard API container는 시작 시 migration을 실행하지 않고 `node dist/src/main`만 실행한다. migration deploy는 명시적인 one-off `pnpm migrate:deploy` script로 남는다.
- `expired`/`revoked` enum 값은 후속 constraint migration보다 앞선 enum 전용 Prisma migration에서 추가했다.

**검증 및 경계**:

- RED 0/3에서 GREEN 3/3까지 계약을 확인했고 persistence 18/18, rotation compatibility 25/25, TypeScript, Nest build, compatibility collector, placeholder-only Prisma validate와 diff check를 통과했다.
- 실제 PostgreSQL migration apply, Docker build, GitHub CI run, deploy는 수행하지 않았다.

### 2026-07-20 — central-device-auth-rotation-compatibility-source-evidence

**Scope**: 중앙 rotation/endpoint policy의 source-only contract lock과 no-secret 호환 증적.

**수정**:

- deterministic source/build/schema hash와 exact rotation enum/5개 nullable-column 호환성을 확인하는
  read-only collector를 추가했다. runtime flag가 꺼져 있으면 실제 raw middleware가 5개 rotation HTTP
  target을 body parser보다 먼저 404/no-store로 종료하고 controller/service/Prisma write에 도달하지
  않는지 source와 built output에서 확인한다. token rotation directive suppression은 별도 service gate로
  확인한다.
- 중앙 contract는 rotation/ACK 응답 유실 복구, 승인 route 14개, legacy 분리와
  `device_rotation_incompatible` 409/no-store/fail-closed 경계를 잠갔다.

**검증 및 경계**:

- 중앙 source 53 suites / 905 tests, review-fix 영향 7 suites / 195 tests, collector 1 suite / 16 tests,
  TypeScript, Nest build,
  placeholder-only Prisma validate와 중앙 fixture verifier `--require-copies 0`을 통과했다.
- source-only 재리뷰는 correctness/security 모두 Critical/Important 0으로 승인됐다. current dist는 final
  no-emit TypeScript incremental 파일을 포함한 1103 files이며 동일 built hash와 actual probe가 연속 2회
  재현됐다. 최종 evidence는 clean build 뒤 probe/hash를 완료하고 이후 build output을 변경하지 않는
  순서로 수집한다.
- Docker client는 존재하지만 daemon pipe와 prior rollback image digest가 없어 image/deploy는 No-Go다.
  실제 DB/migration, secret, PC/장치, desktop copy, image build/publish/sign, 배포는 수행하지 않았다.

### 2026-07-20 — central-device-auth-token-bearer-source-boundary

**Scope**: 중앙 장치 token 교환과 bearer 전용 heartbeat/safe-canary의 clean RC 소스 경계.

**수정**:

- cookie/static key/session/recovery/CSRF와 분리된 `/integration/device-auth/token`을 추가했다. 응답
  유실은 동일 현재 credential·candidate·request ID로만 복구하며, public 응답은 access token과
  서버 권위의 최소 필드만 반환한다.
- `/integration/devices/heartbeat`와 `/integration/devices/canary`를 정확히 하나의 device bearer
  전용 경로로 추가했다. guard는 매 요청마다 현재 환경의 active/revoke 상태, program/profile,
  credential version, 활성 credential 및 폐기된 exchange를 확인하고 권한을 서버에서 유도한다.
- heartbeat는 `{}` 또는 선택 `appVersion`만 받고 검증된 장치별 6회/60초 quota 뒤
  `lastHeartbeatAt`과 선택 version만 갱신한다. canary는 DB write나 업무 service 호출이 없는
  contract check다. `safe_canary`에는 rotation·동기화·발송·DXF·nesting 업무를 허용하지 않는다.

**검증 및 경계**:

- source-only auth Jest 34 suites / 549 tests, TypeScript, Nest build, placeholder DSN Prisma schema
  validate와 JS/Python canonical fixture 검증(`--require-copies 0`)을 통과했다. 실제 DB/Redis/proxy,
  migration, secret, PC, artifact, deploy는 다루지 않았다.
- 소스의 다음-request 폐기 검사는 새 `DeviceBearerGuard` heartbeat/canary에만 적용된다. legacy
  static-key 업무 호출과 실제 PC 즉시 폐기는 아직 보장하지 않는다. rotation prepare/ack/admin,
  업무 endpoint policy, 세 데스크톱 vault/client, DEV/STG, 서명 artifact와 production pilot이 남았다.

### 2026-07-20 — central-device-auth-admin-control-source-boundary

**Scope**: 회사사이트 중앙 장치 인증의 관리자 목록·승인·폐기 제어 plane과 관리자 UI 소스 경계.

**수정**:

- admin session 전용 장치 목록과 admin session+CSRF 전용 등록 승인·폐기 controller/화면을
  추가했다. 대상은 외부웹하드동기화프로그램, 관리프로그램, 레이저네스팅프로그램뿐이며
  `computeroff`는 제외한다.
- 목록은 최소 장치 요약만 반환하고, 승인/폐기는 raw credential·hash·actor·PC 식별 메타데이터를
  반환하지 않는다. 관리자 action은 빈 body만 허용하며, API key/recovery key/Authorization 혼용을
  값 유무와 중복에 관계없이 거부하고 장치 목록/승인/폐기 세 경로에 `no-store` cache policy를 적용한다.
- 폐기 소스 transaction은 장치 상태, 준비/활성 refresh credential, 요청/준비 rotation을 함께
  종료하도록 구현했다. 이 entry 시점에는 token endpoint와 per-request bearer guard가 없었다. 현재는
  heartbeat/canary 보호 경로 소스에 guard가 구현되었지만, legacy static-key 업무 호출이나 실제 PC의
  원격 업무 중지를 즉시 차단하지는 않는다.

**검증 및 경계**:

- `webhard-api` 장치 인증 source Jest 21 suites / 303 tests, TypeScript, Nest build, Prisma schema
  validate를 통과했다. 관리자 UI Jest 4 suites / 32 tests, TypeScript, Prettier를 통과했고, canonical
  fixture JS/Python 검증은 아직 데스크톱 전환 사본이 없으므로 `--require-copies 0` 범위에서 통과했다.
- 실제 DB migration, secret, PC 등록·승인·폐기, key 재발급, endpoint 배포는 실행하지 않았다.

### 2026-07-20 — central-device-auth-bootstrap-source-boundary

**Scope**: 회사사이트 중앙 장치 인증의 관리자 등록코드·공개 bootstrap 소스 경계.

**수정**:

- admin session 전용 등록코드 발급 화면과 CSRF 준비 경로를 추가했다. 대상은 외부웹하드동기화,
  관리프로그램, 레이저네스팅프로그램뿐이며 `computeroff`는 제외한다.
- 공개 enroll/status는 4 KiB non-inflating parser, metadata CSRF 예외, ambient credential 차단,
  exact payload shape, 전용 Upstash `EVAL` rate/replay store를 사용하도록 소스에 구현했다.
- raw 등록코드·attempt·refresh credential은 응답/오류/로그/Redis key에 남기지 않고, Redis key는
  DEV/STG/PRD 분리 HMAC 식별자만 사용한다.

**검증 및 경계**:

- clean RC source Jest와 TypeScript 검증을 실행했다. 실제 Upstash, secret, DB migration,
  public deployment, PC 등록·승인·폐기·재발급은 실행하지 않았다.
- Railway/edge proxy chain, trusted client identity, WAF abuse 제어가 별도 운영 승인 gate다.

### 2026-07-20 — integration-programs-legacy-heartbeat-boundary

**Scope**: legacy 프로그램 heartbeat의 API key 최소권한과 PC 메타데이터 최소수집.

**수정**:

- `POST /api/v1/integration/programs/heartbeat`는 `event/write` 또는 legacy `all` API key만 허용하고, admin/company/worker session을 쓰기 principal에서 제외한다.
- `GET /api/v1/integration/programs`는 admin session 또는 `operation/read`/legacy `all` API key만 허용한다.
- legacy wire의 `hostname`/`metadata` DTO 수신 호환은 유지하지만 새 heartbeat upsert에 저장하지 않고, 목록은 명시적으로 선택한 안전 필드만 반환한다. 기존 DB 값의 삭제·정리는 수행하지 않는다.

**검증**:

- clean RC source test 3 suites / 19 tests 통과 (`programs.service`, `programs-access.guard`, `programs.controller`).
- 실제 DB, migration, seed, API 배포, API key 발급·폐기, PC 호출은 실행하지 않았다.

### 2026-07-09 — integration-bank-notification-test-filter

**Scope**: IBK 은행 알림 테스트 마커의 운영 저장 차단과 기존 테스트 row 정리.

**수정**:

- `POST /api/v1/integration/bank-notifications`는 `CODEX-PROD-*`, `CODEX-DEV-*`, `CODEX-TEST-*` 테스트 마커가 포함된 payload를 저장하지 않고 `ignored_test_notification`으로 응답한다.
- 테스트 마커 payload 수신 시 기존 테스트 마커 row를 정리하되, 로그에는 event id hash와 삭제 건수만 남긴다.
- `DELETE /api/v1/integration/bank-notifications/test-notifications`를 추가해 `bank-notification/manage` 권한으로 기존 테스트 마커 row를 정리할 수 있게 했다.

**검증**:

- `webhard-api: pnpm test -- bank-notifications.service.spec.ts bank-notifications.controller.spec.ts --runInBand` 통과 — 2 suites / 21 tests.
- `webhard-api: npx tsc --noEmit --pretty false` 통과.
- Railway production 배포 `460efe4a-bd93-47ab-ad34-c0ef6240ea06` 성공.
- 운영 DB 테스트 마커 row dry-run 4건 확인 후 4건 삭제, 재조회 0건 확인.

### 2026-07-08 — integration-bank-notification-parsed-fields

**Scope**: IBK 알림 트래커 앱이 보낸 파싱 필드를 회사사이트가 저장하고 관리프로그램 조회 응답으로 반환.

**수정**:

- `POST /api/v1/integration/bank-notifications`가 `parsed_direction`, `parsed_category`, `parsed_amount_won`, `parsed_counterparty`를 DTO에서 허용한다.
- 서버는 파싱 필드를 `raw_payload`에 보존하고, `GET /api/v1/integration/bank-notifications` 응답에도 top-level 필드로 반환한다.
- 운영 실기기 테스트용 `bank_notification_collector` API key를 새로 발급해 휴대폰 앱에 설정했다. 키 원문은 출력/커밋하지 않았다.

**검증**:

- `webhard-api: pnpm test -- bank-notifications.service.spec.ts bank-notifications.controller.spec.ts --runInBand` 통과 — 2 suites / 18 tests.
- `webhard-api: npx tsc --noEmit --pretty false` 통과.
- Railway production 배포 `65c5b853-80a7-4d27-b530-a7399a316167` 성공.
- 배포 후 실기기 업로드와 운영 DB 조회로 `parsed_direction=DEPOSIT`, `parsed_category=입금`, `parsed_amount_won=789000`, `parsed_counterparty=주식회사마루크리에` 저장 확인.

### 2026-07-07 — integration-bank-notification-tracking

**Scope**: IBK 은행 알림 트래커 앱 → 회사사이트 → 관리프로그램 은행 알림 조회 계약 정렬.

**수정**:

- `POST /api/v1/integration/bank-notifications`가 `source_app=bank_tracker` 기반 권장 최소 payload도 수락하도록 DTO와 service 정규화를 보강했다.
- Android 전용 `source_package`, `notification_key`, `raw_payload`가 없으면 서버가 안전한 기본값으로 저장하되, 관리프로그램 파서 필드(`event_id`, `raw_title`, `raw_text`, `raw_big_text`, `posted_at`, `status`)는 그대로 반환한다.
- 같은 `event_id` 중복 업로드는 payload hash가 달라도 새 row를 만들지 않고 기존 row id를 `duplicate`로 반환한다.
- Android 앱 업로드 payload에 `source_app=bank_tracker`를 추가하고, 로컬 device id는 전송 시점에 `dev-*` 해시 형태로 변환한다. Android notification key 원문은 top-level payload와 `raw_payload`에서 제외한다.
- 수집 로그는 기존처럼 event id hash, source package, 결과, 처리 시간만 남기며 알림 원문/계좌번호/입금자명/API key는 남기지 않는다.

**검증**:

- `webhard-api: pnpm test -- bank-notifications.service.spec.ts bank-notifications.controller.spec.ts --runInBand` 통과 — 2 suites / 18 tests.
- `ibk_notification_tracker_app: .\gradlew.bat testDebugUnitTest --tests net.yjlaser.ibktracker.net.YjlaserApiClientTest` 통과 — 3 tests.

### 2026-06-30 — external-webhard-service-permission-defense

**Scope**: 외부웹하드 동기화 업로드 endpoint의 integration 권한 방어 보강.

**수정**:

- route guard뿐 아니라 `FilesService`의 presigned-url, batch upload, confirm, batch confirm entrypoint에서도 integration principal의 `file/register` 권한을 확인한다.
- 권한 없는 integration principal은 service 직접 호출에서도 업로드 URL 발급과 파일 metadata 등록이 모두 403으로 차단된다.
- `file/register` 권한이 있는 integration batch confirm도 단건 confirm과 동일하게 폴더 `companyId`를 상속한다.
- 동기화 API key seed와 `scripts/manage-api-keys.ts create-sync`가 더 이상 legacy `sync` + `read/write/sync` 권한을 만들지 않고, `external_webhard_sync` + `file/register`/`event/write`를 저장한다.
- 개발 DB의 기존 `sync-production`/`sync-dev` key metadata를 새 권한으로 보정하고, dev 서버를 재시작해 API key 5분 cache를 비웠다.
- 기존 admin/company 정책, company 사용자의 타 업체 폴더 차단, Google Drive folder readiness / `driveFileId` 검증은 유지했다.

**검증**:

- `webhard-api: pnpm test -- src/files/__tests__/files.service.spec.ts --runInBand -t "upload registration integration permissions"` (`NODE_OPTIONS=--max-old-space-size=8192`) 통과 — 4 tests.
- `webhard-api: pnpm test -- src/files/__tests__/files.service.spec.ts src/auth/guards/company-access.guard.spec.ts --runInBand -t "upload registration integration permissions|C6|C7|C8|requires file/register"` (`NODE_OPTIONS=--max-old-space-size=8192`) 통과 — 8 tests.
- `webhard-api: pnpm test -- src/files/__tests__/files.service.spec.ts src/files/__tests__/files.controller.spec.ts src/auth/guards/company-access.guard.spec.ts src/integration/auth/api-key.guard.spec.ts src/integration/auth/api-key.scope.spec.ts --runInBand` (`NODE_OPTIONS=--max-old-space-size=8192`) 통과 — 5 suites / 122 tests.
- `webhard-api: pnpm test -- src/integration/auth/integration-permissions.spec.ts src/integration/auth/api-key.service.spec.ts src/integration/auth/api-key.guard.spec.ts --runInBand` (`NODE_OPTIONS=--max-old-space-size=8192`) 통과 — 3 suites / 18 tests.
- `webhard-api: npx tsc --noEmit --pretty false` (`NODE_OPTIONS=--max-old-space-size=8192`) 통과.
- 개발 DB metadata 확인: `sync-production`/`sync-dev`가 `file/register` 권한을 보유. API key 원문/해시는 출력하지 않음.
- 개발서버 확인: `localhost:4000` 재기동 후 integration principal의 `/folders/children` 요청 로그 확인.
- `git diff --check` 통과.

### 2026-06-29 — external-webhard-confirm-integration-access

**Scope**: 외부웹하드 동기화 프로그램의 Google Drive 업로드 confirm 403 수정.

**수정**:

- `/files/presigned-url`, `/files/batch/upload`, `/files/confirm`, `/files/batch/confirm`에 integration `file/register` 권한 요구를 명시했다.
- upload/register 전용 폴더 접근 검증에서 integration principal을 허용해, presigned-url routing으로 반환된 업체 Google Drive 폴더 `folderId`를 confirm에 그대로 사용할 수 있게 했다.
- 일반 company session의 타 업체 폴더 confirm 차단과 Drive folder readiness / `driveFileId` 검증은 유지했다.

**검증**:

- `webhard-api: pnpm test -- src/files/__tests__/files.service.spec.ts src/auth/guards/company-access.guard.spec.ts --runInBand -t "C6|C7|C8|requires file/register"` (`NODE_OPTIONS=--max-old-space-size=8192`) 통과 — 4 tests.
- `webhard-api: pnpm test -- src/files/__tests__/files.service.spec.ts src/files/__tests__/files.controller.spec.ts src/auth/guards/company-access.guard.spec.ts src/integration/auth/api-key.guard.spec.ts src/integration/auth/api-key.scope.spec.ts --runInBand` (`NODE_OPTIONS=--max-old-space-size=8192`) 통과 — 5 suites / 117 tests.
- `webhard-api: npx tsc --noEmit --pretty false` (`NODE_OPTIONS=--max-old-space-size=8192`) 통과.
- `git diff --check` 통과.

### 2026-06-25 — main-merge-home-v1-restore

**Scope**: main 통합 준비와 공개 홈 화면 기존 V1 디자인 복원.

**수정**:

- `origin/main` 기준 임시 통합 브랜치에서 `codex/ui-driven-e2e-suite` 변경을 병합하고 문서 충돌을 해결했다.
- `/` 홈 화면을 `SpringSummerHome`에서 기존 `HomePageV1Backup` 구성으로 되돌렸다.
- 홈 헤더를 기존 V1 공개 내비게이션과 section theme 기반 contrast 동작으로 복원했다.
- `/test` 라우트의 Spring/Summer `HeroSection` 직접 참조를 제거하고 현재 홈으로 redirect하도록 변경했다.
- 홈 라우트/헤더 테스트를 V1 홈 기준으로 갱신했다.

**검증**:

- `pnpm test -- --testPathPatterns="src/__tests__/home/HomePageRoute.test.tsx|src/__tests__/components/HomeHeaderTheme.test.tsx" --runInBand` 통과 — 2 suites / 2 tests.
- `git diff --check` 통과.
- `npx tsc --noEmit --pretty false` 통과.
- `cd webhard-api && npx tsc --noEmit --pretty false` 통과.
- `webhard-api: pnpm test -- src/integration/events/events.dto.spec.ts src/integration/events/events.transaction.spec.ts src/integration/events/events.failure.spec.ts --runInBand` (`NODE_OPTIONS=--max-old-space-size=8192`) 통과 — 3 suites / 25 tests.
- `webhard-api: pnpm test -- src/integration/orders/order-timeline-read.spec.ts src/integration/orders/order-timeline.spec.ts src/integration/orders/__tests__/orders.service.spec.ts --runInBand` (`NODE_OPTIONS=--max-old-space-size=8192`) 통과 — 3 suites / 36 tests.
- `webhard-api: pnpm test -- src/integration/operations/operations-read.spec.ts --runInBand` (`NODE_OPTIONS=--max-old-space-size=8192`) 통과 — 1 suite / 9 tests.
- `pnpm test:e2e:ui -- --list` 통과 — Chromium 27 tests 인식.
- `pnpm exec playwright test e2e/ui-operational-workflow-v2.spec.ts --project=chromium --list` 통과 — Chromium 3 tests 인식.

### 2026-06-24 — operational-contact-identity-read-model

**Scope**: 운영 데이터 연동 v2 ODATA2-010의 legacy Order/JobEvent read model 정렬.

**수정**:

- worker event envelope에 `contact_id`, `inquiry_number`, `work_number` 계약을 추가했다.
- `JobEvent`/`JobFailure`에 Contact UUID, 문의번호, 현장번호 nullable 컬럼과 조회 인덱스를 추가하는 additive migration을 `webhard-api/prisma/migrations/20260624180000_add_job_event_contact_identity/`에 작성했다. 실제 운영 DB 적용은 backup/승인 gate 전까지 실행하지 않는다.
- order timeline의 `contact_id`를 Contact UUID로 고정하고 legacy numeric `Order.contactId`는 `legacy_order_contact_id`로만 보존한다. `order_id` 없이 Contact identity만 있는 `JobEvent`만 fallback으로 포함하고, 다른 `order_id`가 있는 이벤트는 섞지 않는다.
- `OrdersService.updateOrderStatus`가 더 이상 `String(Order.contactId)`로 Contact를 업데이트하지 않고 `inquiryNumber` 우선, `workNumber` fallback 순서로 Contact UUID를 찾아 동기화한다. 중복 Contact는 Order mutation 전에 차단한다.
- Order process-stage API도 status/timeline과 같은 duplicate-safe Contact resolver를 사용한다.
- operations failure read model이 raw payload 없이 Contact identity를 반환한다.

**검증**:

- `cd webhard-api && pnpm test -- src/integration/events/events.dto.spec.ts src/integration/events/events.transaction.spec.ts src/integration/events/events.failure.spec.ts --runInBand` 통과 — 25 passed.
- `cd webhard-api && pnpm test -- src/integration/orders/order-timeline-read.spec.ts src/integration/orders/order-timeline.spec.ts src/integration/orders/__tests__/orders.service.spec.ts --runInBand` 통과 — 36 passed.
- `cd webhard-api && pnpm test -- src/integration/operations/operations-read.spec.ts --runInBand` 통과 — 9 passed.

### 2026-06-24 — operational-trace-logging

**Scope**: 운영 데이터 연동 v2 ODATA2-009의 회사사이트 integration file register 로그 계약 정리.

**수정**:

- `IntegrationFilesService.registerFile`의 문자열 로그를 공통 `formatLogEvent` JSON 이벤트로 전환했다.
- file register start/success/failure, `duration_ms`, source worker, storage provider, count, duplicate 여부를 기록한다.
- idempotency key, 파일 경로, 원본 파일명, drive file id는 raw 로그에 남기지 않고 hash/존재 여부만 남긴다.

**검증**:

- `cd webhard-api && npx jest src/integration/files/file-register.logging.spec.ts --runInBand` 통과 — 3 passed.
- `cd webhard-api && $env:NODE_OPTIONS='--max-old-space-size=8192'; npx tsc --noEmit --pretty false` 통과.
- 변경 파일 대상 `rg -n "password|token|secret|presigned|Authorization" ...` 무히트.

### 2026-06-24 — operational-backfill-dry-run

**Scope**: 운영 데이터 연동 v2의 기존 데이터 백필 전 count-only dry-run 도구 추가.

**수정**:

- `scripts/operational-backfill-dry-run.ts`를 추가해 Contact/WebhardFolder/WebhardFile/외부웹하드 매핑 후보를 aggregate count로만 집계한다.
- 출력 계약은 업체명, 문의번호, 작업번호, 폴더명, 파일명 같은 row 값을 포함하지 않도록 테스트로 고정했다.
- remote/unknown `DATABASE_URL`은 `ALLOW_REMOTE_OPERATIONAL_BACKFILL_DRY_RUN=true` 승인 플래그 없이는 실행하지 않는다.
- remote guard는 숫자형 loopback IP만 local로 인정하며, `127.*` 형태의 DNS hostname은 remote/unknown으로 차단한다.
- 외부웹하드 매핑 후보는 approved alias 2건 이상, stale approved alias, 정규화 업체명 후보 2건 이상을 stop count로 집계하고 기본 text 출력에도 표시한다.
- `WebhardFile.contactId`, `WebhardFile.workNumber`가 현재 Prisma schema에 없어 파일 단위 직접 identity 집계가 불가능한 gap을 보고서에 남긴다.

**검증**:

- `cd webhard-api && npx jest src/integration/operational-backfill-dry-run.spec.ts --runInBand` 통과 — 2 passed.
- `cd webhard-api && npx tsc --noEmit --pretty false` 통과.
- `cd webhard-api && npx tsx scripts/operational-backfill-dry-run.ts --dry-run --json` 실행 시 remote/unknown DB safety guard가 승인 없이 차단함.

### 2026-06-24 — operational-workflow-v2-e2e-rehearsal

**Scope**: 운영 데이터 연동 v2의 기존 워크프로세스와 개발 워크프로세스를 Contact 중심 E2E로 검증.

**수정**:

- `e2e/ui-operational-workflow-v2.spec.ts`를 추가해 Supabase direct table access 없이 NestJS API fixture만으로 운영 리허설을 실행한다.
- 등록 업체 문의 생성 후 `drawing_confirmed -> laser -> cutting` 단계 전환과 업체 대시보드 노출을 검증했다.
- 미등록 외부웹하드 업로드, 업체 폴더 매핑, 과거 Contact 노출, 매핑 이후 신규 업로드 라우팅을 같은 E2E에서 검증했다.
- 등록 업체 `companyName`으로 생성되는 Contact가 생성 시점에 `companyId`를 연결하도록 보강했다.
- R2-backed 폴더 아래 lazy `문의/` 및 문의 폴더 생성 시 Google Drive mutation API를 호출하지 않고 R2 메타데이터를 유지하도록 보강했다.
- 기존 server-to-server `permissions: ["all"]` API key를 권한 wildcard로 명시 지원해 Next server dashboard의 `job/read` 호출 호환을 복구했다.
- API key 검증은 저장된 권한만 사용하도록 해 기존 event-only key가 새 기본 권한으로 자동 승격되지 않게 했다.
- integration Contact stage writer는 `management_program`의 `drawing_confirmed -> laser`, `nesting_program`의 `laser -> cutting`만 허용하도록 제한했다.
- 운영 리허설 E2E는 기본적으로 loopback URL에서만 실행되며, cleanup은 실패를 수집하면서 계속 진행하도록 보강했다.
- Contact 생성 시 업체명 매칭은 미삭제·active·승인 업체 1건일 때만 자동 연결하고, 중복 후보면 자동 연결과 폴더 sync를 중단한다.
- 중복 업체 후보에서는 `resolveCompanyRoot` fallback과 post-create file sync도 중단해 같은 이름의 폴더로 잘못 수렴하지 않게 했다.
- integration stage update는 `expectedCurrentStage` 조건부 업데이트로 동시 변경 시 stage 역전이를 중단한다.
- `laser_cutting` 즉시 완료 특수 branch도 `expectedCurrentStage` 조건부 업데이트를 적용해 동시 변경을 덮어쓰지 않게 했다.
- R2 문의 루트 아래 `완료` 폴더 lazy 생성도 R2 메타데이터를 유지하고 Google Drive mutation API를 호출하지 않게 했다.
- legacy `/integration/laser-completions`도 `nesting_program` + `contact/process-stage:write` 권한으로 제한하고 공유 Contact stage writer를 사용하도록 보강했다.
- 이미 완료된 `laser_cutting` retry는 이벤트와 타임라인을 중복 발행하지 않는 no-op으로 처리한다.
- 이미 목표 stage로 바뀐 `expectedCurrentStage` retry도 이벤트와 타임라인을 중복 발행하지 않는 no-op으로 처리한다.
- legacy laser completion 요청의 `message`는 공유 Contact stage writer를 거쳐 완료 timeline note에 유지된다.

**검증**:

- `cd webhard-api && npx jest src/contacts/contacts.service.spec.ts --runInBand` 통과 — 80 passed.
- `cd webhard-api && npx jest src/folders/_lib/resolve-company-root.util.spec.ts --runInBand` 통과 — 5 passed.
- `cd webhard-api && $env:NODE_OPTIONS='--max-old-space-size=8192'; npx jest src/folders/folders.service.spec.ts --runInBand --testNamePattern="P1-1b|P1-3b|E4b"` 통과.
- `cd webhard-api && npx jest src/integration/contacts/contact-stage.controller.spec.ts src/integration/auth/api-key.service.spec.ts src/integration/auth/integration-permissions.spec.ts src/integration/auth/api-key.guard.spec.ts --runInBand` 통과 — 27 passed.
- `cd webhard-api && $env:NODE_OPTIONS='--max-old-space-size=8192'; npx jest src/integration/laser-completions/laser-completions.controller.spec.ts src/integration/laser-completions/laser-completions.service.spec.ts --runInBand` 통과 — 12 passed.
- `cd webhard-api && npx tsc --noEmit --pretty false` 통과.
- `pnpm exec playwright test e2e/ui-operational-workflow-v2.spec.ts --project=chromium --workers=1` 통과 — 3 passed.
- `pnpm exec prettier --check ...` 및 `git diff --check` 통과.

### 2026-06-24 — operational-contact-stage-integration

**Scope**: 외부 프로그램 API key가 Contact 공정 단계를 운영 원장 기준으로 전환할 수 있는 integration 전용 경로와 전용 권한 추가.

**수정**:

- `PATCH /api/v1/integration/contacts/:id/process-stage`를 추가해 `contact/process-stage:write` 권한 API key만 Contact 공정 단계를 변경하도록 했다.
- 기존 admin/worker 전용 `/contacts/:id/process-stage` 권한은 넓히지 않고, integration 라우트에서만 `system` actor로 `ContactsService.updateProcessStage`를 호출한다.
- `management_program`과 `nesting_program` 기본 권한에 `contact/process-stage:write`를 추가하고, 외부웹하드 동기화 key와 admin session은 integration 전용 Contact stage route를 사용할 수 없도록 차단했다.
- `ApiKeyService`가 생성 시 programType 기본 권한을 저장하도록 했다. 검증 시점에는 저장된 권한만 사용해 기존 key의 권한 자동 승격을 막는다.
- Contact processStage allowlist와 required 검증을 service/DTO 경계에 추가해 비정상/누락/null stage를 DB 업데이트 전에 거부한다.
- Contact identity lookup(`/contacts/by-work-number`, `/contacts/by-inquiry-number`)은 `job/read` 권한 API key만 접근하도록 제한했다.
- Contact 목록/단건/업체별 목록/중복 조회/집계/최근 ID/하위문의/작업자 노트/timeline read 라우트도 `job/read`를 요구하도록 제한해 `file/register` key가 문의 데이터를 읽지 못하게 했다.
- 업체 세션이 운영 identity lookup, 업체별 목록, 중복 조회 NestJS 라우트를 직접 호출해 다른 업체 문의를 조회하지 못하도록 controller 경계에서 차단했다.
- 관리자 server key 호환을 위해 `admin_dashboard` 기본 권한에 `job/read`를 추가했다.
- API key 목록 응답의 `permissions`는 저장된 권한을 표시하고, `stored_permissions`도 하위 호환 필드로 유지한다.
- integration Contact stage route가 관리프로그램의 `drawing_confirmed -> laser`와 레이저네스팅프로그램의 `laser -> cutting`을 모두 처리하는 범용 공정 writer임을 테스트로 고정했다.

**검증**:

- `cd webhard-api && pnpm test -- contact-stage.controller contacts-identity.controller contacts.controller api-key.scope integration-permissions api-key.service contacts.service` 통과 — 146 passed. Jest worker graceful-exit warning 있음.
- `cd webhard-api && npx tsc --noEmit --pretty false` 통과.
- `cd webhard-api && pnpm exec prettier --check src/contacts/contacts.controller.ts src/contacts/contacts.controller.spec.ts src/contacts/contacts-identity.controller.spec.ts src/integration/auth/integration-permissions.ts src/integration/auth/integration-permissions.spec.ts` 통과.

### 2026-06-19 — ui-driven-e2e-suite-stabilization

**Scope**: 실제 브라우저 UI 조작 기반 E2E 묶음의 실패 원인을 수정하고 전체 통과를 확인.

**수정**:

- 업체등록 사업자등록증 Drive 업로드 시 관리자 전용 폴더 `folderKind`가 DB 길이 제한을 넘지 않도록 `admin_private_co`를 사용하고 legacy kind 조회를 유지했다.
- 로그인/업체등록/문의 폼/작업자 PIN 입력이 hydration 및 빠른 연속 입력에도 안정적으로 동작하도록 보강했다.
- 관리자 작업자 추가 버튼은 client-ready 전 클릭을 막고, 웹하드 새 폴더/업로드/휴지통 UI는 실제 화면 조작 가능한 컨트롤을 사용하도록 정리했다.
- 작업자 납품관리 탭, 업체등록 반복 실행 데이터, 모바일 관리자 nav overflow, 전체 UI E2E timeout 조건을 정리했다.

**검증**:

- `npx tsc --noEmit --pretty false` 통과.
- `pnpm --dir webhard-api test -- companies.service.spec.ts --runInBand` 통과 — 8 passed.
- `pnpm test:e2e:ui -- --reporter=line` 통과 — 27 passed.

### 2026-06-19 — codex-testing-workflow-policy

**Scope**: Codex 개발 워크플로우에 테스트 전략과 AI 브라우저 QA 적용 기준 추가.

**수정**:

- `AGENTS.md`에 테스트 층 선택, test-first 우선 대상, AI 브라우저 QA와 회귀 테스트의 역할 분리를 추가했다.
- `docs/workflows/codex-development-workflow.md`에 YJ Laser 전용 테스트 맵을 추가했다.
- 권한, `companyId` 소유권, 웹하드 visibility, 업로드/다운로드, Google Drive/R2 metadata 변경은 unit/integration/API 테스트를 우선하고, 실제 사용자 흐름은 E2E UI 또는 AI browser QA로 검증하도록 정리했다.

**검증**:

- `git diff --check -- AGENTS.md docs/workflows/codex-development-workflow.md docs/changelog/CHANGELOG.md` 통과.
- 링크/명령/역할 분리 자체 검토.

### 2026-06-23 — central-log-db-persistence

**Scope**: YJLaser 공통 중앙 로그 수집 API의 운영 DB 영속 저장소 추가.

**수정**:

- `log_events` Prisma model과 migration을 추가해 HMAC 인증된 로그 이벤트를 PostgreSQL에 저장할 수 있게 했다.
- `LogEventRepository` 구현을 Prisma-backed repository로 확장하고, 테스트 환경과 `LOG_EVENT_PERSISTENCE=memory`에서는 기존 in-memory repository를 유지한다.
- 중복 판정은 원본 client/key를 저장하지 않고 `client_id_hash + event_id` unique key와 server-calculated `payload_hash`로 처리한다.
- channel별 retention 만료일을 `retention_expires_at`에 저장한다.

**검증**:

- `cd webhard-api && pnpm test -- src/integration/log-events/repositories/prisma-log-event.repository.spec.ts --runInBand` 통과: 3 passed.
- `cd webhard-api && pnpm test -- src/integration/log-events --runInBand` 통과: 31 passed.
- `cd webhard-api && $env:DATABASE_URL='postgresql://user:pass@localhost:5432/yjlaser_validate'; $env:DIRECT_URL='postgresql://user:pass@localhost:5432/yjlaser_validate'; npx prisma validate` 통과.
- `cd webhard-api && npx tsc --noEmit --pretty false` 통과.

### 2026-06-18 — contact-drive-file-migration

**Scope**: 포트폴리오를 제외한 문의/납품/업체 등록 파일의 신규 업로드를 Google Drive 저장소로 전환.

**수정**:

- 공개 문의 첨부, 도면, 참고사진은 Contact 생성 후 해당 업체의 문의 폴더를 보장하고 Drive에 업로드한 뒤 `WebhardFile.storageProvider=GOOGLE_DRIVE`로 등록한다.
- 도면 수정 업로드 URL과 수정요청 첨부 파일을 Drive 문의 폴더 기준으로 전환하고, Drive 다운로드는 Next/NestJS stream proxy로 처리한다.
- Worker 납품증빙은 납품완료 처리와 같은 요청에서 각 문의 Drive 폴더에 저장하고, 일부 실패 시 성공 건수와 실패 건수를 분리해 표시한다.
- 사업자등록증 신규 업로드/수정은 `/외부웹하드/관리자전용/{업체명}` Drive 폴더에 저장하고, 업체 일반 세션의 웹하드 가시성 밖에 둔다.
- 기존 R2 객체 삭제 전 검토용 `webhard-api/scripts/dry-run-non-portfolio-r2-delete.ts`와 `npm run r2:dry-run-delete` 명령을 추가했다.
- 포트폴리오 이미지 처리 경로는 기존 R2 업로드를 유지한다.

**검증**:

- `cd webhard-api && npx tsc --noEmit --pretty false` 통과.
- `npx tsc --noEmit --pretty false` 통과.
- `npx jest src/__tests__/api/contact-route-auth.test.ts --runInBand` 통과.
- `npx jest src/__tests__/actions/contacts-timeline.test.ts --runInBand` 통과.
- `cd webhard-api && npx jest src/contacts/contacts.controller.spec.ts --runInBand` 통과.
- `cd webhard-api && npx jest src/contacts/contacts.service.spec.ts --runInBand` 통과.
- `cd webhard-api && npx tsx scripts/dry-run-non-portfolio-r2-delete.ts --help` 통과.

### 2026-06-17 — homepage-springsummer-editorial-redesign

**Scope**: 공개 홈 화면을 Spring/Summer design.md 레퍼런스 기반 에디토리얼 랜딩으로 재구성.

**수정**:

- 홈 화면을 Sage Paper 배경, Plum Ink 대형 display typography, Paper White 이미지 카드, 얇은 Stone/Ash border 중심의 공통 디자인으로 재구성했다.
- 기존 YJ Laser 로고를 유지한 전용 홈 헤더를 추가하고, 홈 화면에서는 기존 공통 Header/Footer/FloatingButtons를 숨기도록 분리했다.
- 영상 카드, 프로젝트 가로 캐러셀, 클라이언트 그리드, About/Contact, 언더라인 뉴스레터 입력을 Spring/Summer 레퍼런스의 간결한 편집 레이아웃으로 정리했다.
- 프리로더, 스크롤 reveal, 캐러셀 버튼, 모바일 전체 메뉴, 뉴스레터 입력 상호작용을 추가했다.
- 레퍼런스 사이트의 display computed style과 맞춰 큰 제목 계열을 `Grotesk, Impact, sans-serif` / `400` 스택으로 조정했다.
- Next 개발 오버레이 표시가 디자인 QA 캡처를 가리지 않도록 dev indicator를 비활성화했다.

**검증**:

- `npx tsc --noEmit` 통과.
- `git diff --check` 통과.
- 데스크톱 1280x720, 모바일 390x844에서 로컬 브라우저 캡처 및 상호작용 QA 통과.

### 2026-06-11 — webhard-ops-faster-feedback

**Scope**: 웹하드 업로드 confirm, 파일 삭제, 파일 이동의 사용자 응답 지연 후처리 제거.

**수정**:

- Google Drive/R2 `confirmUpload`와 `batchConfirmUpload`의 file uploaded 알림 생성을 응답 후 fire-and-forget 처리로 변경했다.
- `batchConfirmUpload`의 자동 문의 보조 폴더 조회와 hook 실행을 응답 후 백그라운드 작업으로 이동했다.
- 파일 이동/삭제 Server Action의 활동 로그 저장을 사용자 응답 경로에서 분리하고, 실패 시 sanitized warn 로그만 남기게 했다.
- 파일 이동/삭제 server-side client가 HTTP 200 응답 안의 `success=false`, `failed`, `errors`도 실패로 해석하도록 보강했다.
- 파일 batch delete의 authorized file 재필터를 `Set` 기반으로 바꿔 대량 작업의 불필요한 O(n²) 비용을 제거했다.

**검증**:

- `cd webhard-api && pnpm test -- src/files/__tests__/files.service.spec.ts --runInBand` 통과: 62 passed.
- `cd webhard-api && npx tsc --noEmit` 통과.
- `npx tsc --noEmit` 통과.
- `git diff --check` 통과.
- `cd webhard-api && $env:RUN_PERF_TESTS='1'; $env:NODE_OPTIONS='--max-old-space-size=8192'; pnpm test:e2e -- performance.e2e-spec.ts --runInBand` 통과: 6 passed, 100 file batch move 152.44ms, 100 file batch delete 98.30ms.

### 2026-06-11 — webhard-storage-trash-usage

**Scope**: 웹하드 저장공간 표시와 API에 휴지통 사용량 반영.

**수정**:

- `GET /api/v1/storage`가 활성 파일 용량 `active`, 휴지통 파일 용량 `trash`, 전체 사용량 `current=active+trash`를 반환한다.
- 휴지통 파일은 실제 Google Drive/R2 저장공간을 차지하므로 전체 사용률 계산에 포함한다.
- 웹하드 좌측 하단 저장공간 UI에 활성 파일 용량과 휴지통 용량을 별도로 표시하고, 진행바에서도 구분한다.
- API/기능 스펙 문서에 저장공간 계산 계약을 갱신했다.

**검증**:

- `cd webhard-api && pnpm test -- src/storage/__tests__/storage.service.spec.ts --runInBand` 통과: 18 passed.
- `cd webhard-api && npx tsc --noEmit` 통과.
- `npx tsc --noEmit` 통과.
- `git diff --check` 통과.

### 2026-06-11 — webhard-drive-proof-batch-operations

**Scope**: Google Drive 기반 웹하드 업로드 confirm, 파일 batch move, 파일 batch delete의 실제 처리시간 개선.

**수정**:

- Google Drive upload proxy가 Drive PUT 성공 응답에서 `driveUploadProof`를 발급한다.
- upload confirm/batch-confirm은 유효한 proof가 있으면 confirm-time Drive metadata GET을 생략하고 storage file id와 parent digest를 검증한다.
- proof가 없거나 구버전 client인 경우 기존 Drive API metadata 검증으로 fail-closed fallback한다.
- Google Drive provider에 multipart batch 기반 `moveFiles`/`trashFiles`를 추가해 Drive-backed batch move/delete의 파일별 HTTP 왕복을 줄였다.
- 업로드 proxy, batch confirm, Drive batch move/trash에 elapsedMs, 성공/실패 수, proof 사용 수를 sanitized 로그로 남긴다.

**검증**:

- `pnpm test -- --runTestsByPath src/__tests__/lib/utils/uploadQueue-security.test.ts --runInBand` 통과: 5 passed.
- `cd webhard-api && pnpm test -- src/storage/__tests__/google-drive-storage.provider.spec.ts src/files/__tests__/files.service.spec.ts src/storage/__tests__/storage.service.spec.ts --runInBand` 통과: 79 passed.
- `cd webhard-api && npx tsc --noEmit` 통과.
- `npx tsc --noEmit` 통과.
- `cd webhard-api && $env:RUN_PERF_TESTS='1'; $env:NODE_OPTIONS='--max-old-space-size=8192'; pnpm test:e2e -- performance.e2e-spec.ts --runInBand` 통과: 6 passed, 100 file batch move 177.58ms, 100 file batch delete 102.30ms.

**잔여 확인**:

- `cd webhard-api && $env:NODE_OPTIONS='--max-old-space-size=8192'; pnpm test:e2e -- files-crud.e2e-spec.ts folders-crud.e2e-spec.ts storage.e2e-spec.ts --runInBand`는 33 passed, 6 failed, 4 skipped였다. files-crud/storage는 통과했지만, folders-crud의 `POST /folders`가 Google Drive token acquisition `Unexpected Gaxios Error`로 500 실패했다. 로컬 Google Drive 인증 환경 복구 후 재실행이 필요하다.

### 2026-06-11 — webhard-folder-delete-optimistic-path-scope

**Scope**: 웹하드 삭제/이동 체감 개선과 폴더 batch delete 하위 폴더 조회 범위 축소.

**수정**:

- `useFileOperations`의 파일 삭제/이동은 현재 폴더 cache에서 대상 파일을 먼저 제거하고 실패 시 rollback한다.
- folder batch delete는 전체 폴더 parent map 대신 선택 폴더의 `path` prefix 하위만 조회한다.
- `path=null` 레거시 선택 폴더는 기존 parent BFS fallback을 유지한다.
- Drive-backed folder batch delete는 선택 Drive folder trash를 제한 병렬로 실행하고 실패/DB 불일치 repair 로그를 남긴다.

**검증**:

- `cd webhard-api && npx tsc --noEmit` 통과.
- `cd webhard-api && pnpm test -- src/folders/folders.service.spec.ts --runInBand` 통과: 62 passed.
- `npx tsc --noEmit` 통과.
- `cd webhard-api && $env:RUN_PERF_TESTS='1'; $env:NODE_OPTIONS='--max-old-space-size=8192'; pnpm test:e2e -- performance.e2e-spec.ts --runInBand` 통과: 6 passed.

### 2026-06-11 — webhard-drive-batch-session-move-optimization

**Scope**: Google Drive 기반 웹하드 batch upload session 생성과 batch file move의 반복 외부/DB 조회 제거.

**수정**:

- batch upload session 생성 중 같은 요청 안에서 폴더 권한 확인, 외부웹하드 routing, Drive target 조회를 request-local cache로 공유한다.
- Drive-backed batch upload session은 `generateDriveIds(count)`로 Drive file id를 한 번에 발급하고 각 resumable upload session에 주입한다.
- batch file move는 source folder의 `driveFolderId`를 한 번에 조회해 `moveDriveFile.fromParentStorageFolderId`로 넘기고, provider의 per-file Drive metadata 조회 fallback을 피한다.
- 같은 폴더 batch upload와 Drive-backed batch move 성능 계약을 단위 테스트로 고정했다.

**검증**:

- `cd webhard-api && npx tsc --noEmit` 통과.
- `cd webhard-api && pnpm test -- src/files/__tests__/files.service.spec.ts --runInBand` 통과: 60 passed.
- `cd webhard-api && $env:RUN_PERF_TESTS='1'; $env:NODE_OPTIONS='--max-old-space-size=8192'; pnpm test:e2e -- performance.e2e-spec.ts --runInBand` 통과: 6 passed.

**잔여 확인**:

- 최신 backend source 서버 재기동 후 실제 Google Drive session/move 시간을 다시 측정해야 한다.
- 즉시 완료형 UX는 별도 비동기 작업 큐와 진행 상태 UI 설계가 필요하다.

### 2026-06-11 — webhard-folder-tree-query-dedupe

**Scope**: 웹하드 폴더 진입 시 `FolderTree`가 만드는 중복 ancestors/children 요청 제거와 Drive-backed 작업 추가 측정.

**측정**:

- 폴더 진입 요청 수가 개선 전 9회(`/files` 1, `/folders` 1, `/folders/children` 2, `/ancestors` 5)에서 개선 후 4회(`/files` 1, `/folders` 1, `/folders/children` 1, `/ancestors` 1)로 줄었다.
- 개선 후 초기 진입 API는 `/settings`, `/storage`, `/files`, `/folders`, `/folders/children`, `/badge-counts` 6회로 유지된다.
- 직접 NestJS API 기준 5개 32KB 파일 측정: upload session 4576ms, Google Drive proxy PUT 1663ms, batch confirm 911ms, batch move 2846ms, batch delete 1075ms.

**수정**:

- `FolderTree`의 children 조회를 `queryClient.fetchQuery(queryKeys.webhard.folders.children(parentId))`로 바꿔 메인 폴더 query와 같은 캐시/진행 중 요청을 공유한다.
- 선택 폴더 ancestors 조회도 `queryKeys.webhard.folders.ancestors(selectedFolderId)`를 사용해 breadcrumb/트리 확장 요청이 중복되지 않게 했다.
- children/ancestors 실패 응답은 빈 데이터로 캐시하지 않고 오류로 처리한다.

**검증**:

- `http://localhost:3101/webhard` source dev 서버 인증 측정: 폴더 진입 API 9회 → 4회.
- `codex-perf-*` 테스트 폴더로 5개 파일 업로드, 이동, 삭제, 폴더 cleanup까지 성공.

**잔여 확인**:

- Next dev 서버의 upload route는 `.next` webpack cache `EPERM` 이후 404가 재현되어, 업로드/이동/삭제 시간은 직접 NestJS API로 분리 측정했다.
- 직접 측정한 `localhost:4000`은 현재 실행 중인 built Nest 서버 기준이며, 최신 backend source 최적화는 성능 E2E/단위 테스트 결과로 함께 판단한다.

### 2026-06-11 — webhard-folder-entry-prefetch-trim

**Scope**: 웹하드 폴더 진입 시 발생할 수 있는 불필요한 파일 목록 prefetch 제거와 폴더 업로드 완료 UX 개선.

**수정**:

- `useWebhardFoldersQuery`가 children 조회 직후 하위 폴더 5개의 파일 목록을 자동 prefetch하던 동작을 제거했다.
- 폴더 파일 목록 선조회는 사용자가 실제로 폴더에 hover하거나 진입하는 기존 경로로 제한한다.
- 폴더 업로드 완료 후 파일/폴더/뱃지 cache invalidation을 background 처리해 후속 refetch가 완료 UX를 막지 않게 했다.
- children 조회 후 `/api/webhard/files` 자동 prefetch가 발생하지 않는 회귀 테스트를 추가했다.

**검증**:

- `pnpm test -- --runTestsByPath src/app/webhard/__tests__/webhard-folder-query-performance.test.tsx --runInBand` 통과: 1 passed.
- `pnpm test -- --runTestsByPath src/app/webhard/__tests__/audit07-folder-loading.test.ts src/app/webhard/__tests__/webhard-folder-query-performance.test.tsx src/app/webhard/__tests__/webhard-infinite-loading.test.tsx --runInBand` 통과: 5 passed.
- `npx tsc --noEmit` 통과.
- `http://localhost:3101/webhard` dev 서버 수동 측정: 초기 진입 2441ms, 웹하드 API 6회, `/api/webhard/files` 1회.

**잔여 확인**:

- 루트 화면에 폴더 fixture가 없어 폴더 내부 진입 네트워크 재측정은 이번 측정에서 제외했다.

### 2026-06-11 — webhard-performance-measurement-optimization

**Scope**: 웹하드 폴더 접속, 파일 업로드, 파일/폴더 이동, 삭제 흐름의 성능 측정과 1차 병목 개선.

**측정**:

- Chromium E2E 기준 5파일 업로드 28.1초, 5파일 업로드 후 일괄 삭제 23.2초, 폴더 생성 10.8초, 하위 폴더 포함 삭제 15.0초, 폴더 진입 7.9초, 최초 로딩 4.5초를 기준선으로 기록했다.
- 로그상 목록성 `/files` 응답은 보통 90~270ms였지만, 폴더 진입 시 folders/children/ancestors/files/badge-counts 계열 요청이 병렬·중복으로 발생해 체감 대기 시간이 커지는 구조를 확인했다.
- Google Drive 업로드는 batch upload session 1.6~1.8초, batch-complete 2.5~3.3초가 주요 병목이었다.

**수정**:

- `batchConfirmUpload`에서 Drive metadata 확인을 제한 병렬 처리하고, 같은 폴더의 Drive readiness 조회를 캐시한다.
- 업로드 성공 후 파일/폴더/배지 refetch 완료를 기다린 뒤 업로드 상태를 해제하던 UI 흐름을 background invalidation으로 바꿔 체감 완료 시간을 줄였다.
- 폴더 이동에서 이미 조회한 target parent metadata를 재사용하고, Drive-backed 폴더가 아닌 경우 불필요한 Drive parent 조회를 생략한다.
- 성능 테스트 fixture는 R2 provider와 materialized `path`를 명시해 운영 경로와 같은 조건에서 측정한다.

**검증**:

- `cd webhard-api && $env:RUN_PERF_TESTS='1'; $env:NODE_OPTIONS='--max-old-space-size=8192'; pnpm test:e2e -- performance.e2e-spec.ts --runInBand` 통과: 6 passed.
- `cd webhard-api && npx tsc --noEmit` 통과.
- `npx tsc --noEmit` 통과.
- `cd webhard-api && pnpm test -- src/files/__tests__/files.service.spec.ts --runInBand` 통과: 58 passed.
- `cd webhard-api && pnpm test -- src/folders/folders.service.spec.ts --runInBand` 통과: 61 passed.

**잔여 확인**:

- 수정 소스를 반영한 브라우저 E2E 재측정은 로컬 Next/Nest 서버 rebuild/restart 후 다시 실행해야 한다.
- Google Drive 삭제/이동은 외부 API 성공을 기다리는 fail-closed 계약을 유지한다. 즉시 성공 UX는 별도 비동기 작업 큐와 진행 상태 설계가 필요하다.

### 2026-06-10 — google-drive-webhard-security-performance

**Scope**: Google Drive 웹하드 보안·정합성·고성능 운영 보강.

**수정**:

- 관리자 `GET /api/v1/storage/webhard-consistency` 응답에 `lastCheckedAt`, `quotaBackoffCount`, 최근 sanitized `storage_repair` 이벤트를 추가했다.
- Drive API 샘플 검증 중 404는 `drive_api_404`, 403/429는 `drive_quota_or_backoff` repair 이벤트로 남긴다.
- `POST /api/v1/storage/drive-change-webhook`을 추가해 Google Drive change notification을 token/channel 검증 후 reconciliation queue에 넣는다.
- `StorageReconciliationService`를 추가해 백그라운드에서 bounded limit로 최근 Drive-backed folder/file을 점진 검증하고 404/429/기타 오류를 repair 로그로 남긴다.
- `/files`, `/files/search`, `/folders` 일반 목록 fast path가 Drive API mutation/download 경로를 호출하지 않는 회귀 테스트를 추가했다.

**검증**:

- `cd webhard-api && pnpm test -- storage/__tests__/webhard-consistency.spec.ts storage/__tests__/storage-reconciliation.service.spec.ts files/__tests__/files.service.spec.ts folders/folders.service.spec.ts --runInBand`는 storage 2개 suite 통과 후 files/folders 대형 suite 로딩 중 Node heap OOM으로 중단.
- `cd webhard-api && pnpm test -- files/__tests__/files.service.spec.ts --runInBand --testNamePattern="DB-only fast path"` 통과: 2 passed.
- `cd webhard-api && pnpm test -- folders/folders.service.spec.ts --runInBand --testNamePattern="DB-only fast path"` 통과: 1 passed.
- `cd webhard-api && npx tsc --noEmit` 통과.

### 2026-06-04 — google-drive-webhard-e2e-qa

**Scope**: Google Drive 웹하드 E2E 자동 검증과 공유/ZIP 회귀 수정.

**수정**:

- Google Drive 웹하드 사용자 QA용 Chromium E2E를 추가해 업체 생성/승인, Drive provisioning, 권한 격리, 폴더/파일 조작, 실제 Drive 업로드, 공유 링크, ZIP, 휴지통, 업체 삭제/복구, 최종 정합성 진단을 자동 검증한다.
- 공유 링크 생성 라우트가 NestJS DTO와 맞지 않아 500이 나던 문제를 수정했고, company 사용자의 `company_id` 조작과 직접 Nest `webhardFileId` 위조는 세션 업체와 DB 파일 소유권 검증으로 차단했다.
- `share-links` API key 허용 범위를 token validate/download stream 전용으로 좁혀 raw 목록/생성 API와 직접 파일 다운로드 API의 API key-only 접근을 차단했다.
- 공유 링크 Drive 다운로드는 전용 `POST /api/v1/share-links/download/stream` 경로에서 토큰 검증과 storage stream을 함께 처리하도록 바꿨다.
- 공유 링크 `maxDownloads`는 조건부 atomic increment로 처리해 병렬 다운로드가 제한 횟수를 초과하지 못하게 했다.
- ZIP 다운로드가 CommonJS 환경의 `archiver` import 문제로 실패하던 문제를 수정했다.
- 사용자 QA 체크리스트에 Codex가 E2E로 통과시킨 항목과 남은 수동 확인 항목을 표시했다.

**검증**:

- `npx playwright test e2e/google-drive-webhard-user-qa.spec.ts --project=chromium --reporter=list` 통과: 1 passed.
- `npx tsc --noEmit` 통과.
- `cd webhard-api && npx tsc --noEmit` 통과.
- `cd webhard-api && npx tsx scripts/audit-google-drive-webhard-consistency.ts` 통과: Drive id 누락 0, 업체 active root 중복 0.
- `cd webhard-api && pnpm test -- share-links.service.spec.ts` 통과: 12 passed.
- `git diff --check` 통과.

### 2026-06-02 — google-drive-webhard-consistency

**Scope**: Google Drive 웹하드 metadata 정합성 강제.

**수정**:

- `storageProvider=GOOGLE_DRIVE` folder/file row가 각각 `driveFolderId`/`driveFileId` 없이 저장되지 않도록 DB CHECK constraint를 추가했다.
- 업체별 active root folder가 하나만 존재하도록 partial unique index를 추가했다.
- 개발 DB의 Drive id 없는 Google Drive folder/file fixture row를 정리하고, dry-run/apply 가능한 `scripts/audit-google-drive-webhard-consistency.ts`를 추가했다.
- 기본 seed에서 legacy webhard DB fixture를 제외하고, 옵션 실행 시에도 legacy fixture는 `R2` provider로 명시한다.
- 폴더/파일 생성 경로에서 Drive 객체 생성/검증 실패 시 DB-only Google Drive row를 만들지 않도록 보강했다.
- 웹하드 목록/트리/검색 API가 invalid Google Drive row를 정상 목록으로 내려주지 않도록 방어 필터를 추가했다.
- 관리자 진단용 `GET /api/v1/storage/webhard-consistency`를 추가해 Drive id 누락, 업체 root 중복, Drive API 404 샘플을 확인할 수 있게 했다.

**검증**:

- `cd webhard-api && npx prisma migrate deploy` 통과.
- `cd webhard-api && npx tsx scripts/audit-google-drive-webhard-consistency.ts --apply` 후 invalid folder/file/root duplicate count 0 확인.
- 실제 DB constraint 확인: `GOOGLE_DRIVE + null driveFolderId` 차단, `GOOGLE_DRIVE + null driveFileId` 차단, `R2 + null driveFolderId` 허용 후 삭제.
- `cd webhard-api && npx tsc --noEmit` 통과.
- `cd webhard-api && pnpm test -- folders.service.spec.ts --runInBand` 통과: 60 passed.
- `cd webhard-api && pnpm test -- contacts.service.spec.ts --runInBand` 통과: 67 passed.
- `cd webhard-api && pnpm test -- drawing-revision.service.spec.ts --runInBand` 통과: 26 passed.
- `cd webhard-api && pnpm test -- files.service.spec.ts --runInBand` 통과: 73 passed.
- `cd webhard-api && pnpm test -- webhard-consistency.spec.ts --runInBand` 통과: 3 passed.

### 2026-06-02 — company-delete-webhard-trash

**Scope**: 업체 삭제/복구와 매칭 웹하드 업체 폴더 휴지통 이동.

**수정**:

- 업체 soft delete 메타와 웹하드 폴더 삭제 주체 컬럼/migration을 추가했다.
- 관리자 웹하드에서 업체 루트 폴더 직접 삭제를 차단하고 업체 상세 페이지로 이동하도록 했다.
- 업체 상세 페이지에 삭제 대기/복구 액션을 추가하고, 삭제 시 매칭 웹하드 루트 폴더와 하위 파일/폴더를 휴지통으로 이동한다.
- 업체 복구는 30일 이내에만 가능하며 업체 삭제 마커가 있는 웹하드 항목만 복구한다.
- 업체 매칭 루트 폴더 삭제 차단 안내를 브라우저 기본 alert에서 공통 모달로 바꾸고, 매칭 폴더명/업체명을 표시한다.
- 선택 삭제에 매칭 업체 루트 폴더와 일반 항목이 함께 있으면 매칭 폴더를 제외하고 나머지만 삭제할 수 있게 했다.
- 업체 삭제/복구 시 매칭 루트 폴더의 Google Drive id가 없거나 Drive 폴더가 이미 없어 404가 나는 경우에는 storage repair 로그를 남기고 DB 업체 삭제/복구와 웹하드 휴지통 이동/복구를 계속 진행한다.
- 휴지통 보관 기간과 UI 안내를 30일로 맞췄다.

**검증**:

- `cd webhard-api && npx prisma generate` 통과.
- `cd webhard-api && npx tsc --noEmit` 통과.
- `npx tsc --noEmit` 통과.
- `cd webhard-api && $env:NODE_OPTIONS='--max-old-space-size=8192'; pnpm test -- folders.service.spec.ts --runInBand` 통과: 59 passed.
- `cd webhard-api && $env:NODE_OPTIONS='--max-old-space-size=8192'; pnpm test -- companies.service.spec.ts --runInBand` 통과: 7 passed.
- `cd webhard-api && $env:NODE_OPTIONS='--max-old-space-size=8192'; pnpm test -- trash.service.spec.ts --runInBand` 통과: 19 passed.
- `pnpm test -- --runTestsByPath src/__tests__/actions/companies.test.ts --runInBand` 통과: 7 passed.
- `pnpm test -- --runTestsByPath src/app/webhard/components/__tests__/CompanyRootFolderDeleteBlockedModal.test.tsx --runInBand` 통과: 3 passed.
- `git diff --check` 통과.

### 2026-05-29 — google-drive-webhard-storage

**Scope**: 자체 웹하드 저장소를 Google Shared Drive 기반 provider로 전환.

**수정**:

- Google Drive API 의존성, Prisma storage/provisioning 필드, migration을 추가했다.
- NestJS storage provider 경계를 추가해 신규 웹하드 파일/폴더가 Google Drive id를 저장하도록 했다.
- 업체 승인/활성화 시 Drive 업체 루트와 템플릿 폴더를 만들고, 실패 시 retry 가능한 provisioning 상태와 storage repair event를 남긴다.
- 웹하드 업로드, confirm, batch upload, 다운로드 stream, ZIP, 휴지통, 공유 링크, 백업, 파일/폴더 rename/move/delete 경로를 provider-aware로 전환했다.
- 문의/도면 revision/납품 증빙의 웹하드 등록 시 Drive 폴더가 준비되어 있으면 원본 업로드를 Drive로 복사해 등록한다.
- 개발 초기화를 위한 `webhard-api/scripts/reset-webhard-for-google-drive.ts`를 추가했다.

**검증**:

- `cd webhard-api && npx tsc --noEmit` 통과.
- `npx tsc --noEmit` 통과.

### 2026-05-28 — r3f-packaging-hero-test

**Scope**: `/test` R3F 패키지 히어로 프로토타입 시각 개선.

**수정**:

- 절차형 Three.js 박스 모델을 제거하고 첨부 GLB를 `public/models/c-type-box.glb`로 배치해 C형 제품 박스로 교체했다.
- GLB의 8개 Blender animation clip을 스크롤 progress에 맞춰 `AnimationMixer.setTime()`으로 scrub하도록 연결했다.
- GLB 안의 제품 라벨, 바코드, 접힘선, 잠금 슬롯, tuck tab, side dust flap을 사용하고, material clone에 kraft 판지/진한 접힘선 색을 입힌다.
- 스크롤 전개 중 모델 root를 Y축으로 360도 회전시키고, 전개 완료 시 화면 축에 맞게 정렬되도록 카메라/모델 yaw를 보정했다.
- GLB animation 마지막 프레임에서 패널이 겹쳐 보이는 문제를 피하기 위해 열린 상태가 유지되는 clip 구간까지만 scrub하도록 조정했다.
- Canvas shadow, contact shadow, directional/hemisphere/fill light, 판지 grain/bump texture를 추가해 박스 재질감과 그림자를 보강했다.
- 스크롤 전개 구간을 늘려 휠 입력 대비 박스 전개가 더 천천히 진행되도록 조정했다.

**검증**:

- `npx tsc --noEmit` 통과.
- Playwright fresh context에서 `/test` closed/mid/open 상태 Canvas 렌더, GLB 200 로드, desktop/mobile progress 0→1, header/footer 미노출, body text 없음, sticky 유지, browser error 없음 확인.

### 2026-05-27 — e2e-admin-api-warning-cleanup

**Scope**: E2E 중 반복되던 admin API 경고 정리.

**수정**:

- `GET /api/v1/notifications*`에서 `userId`가 없는 admin 전체 알림 조회가 optional parse 단계에서 400을 내지 않도록 보정했다.
- active session heartbeat/list/count/delete NestJS 호출이 API key principal 대신 session cookie 인증을 사용하도록 수정했다.
- NestJS sessions endpoint에서 API key principal을 heartbeat/delete에서 차단하고, admin/company 세션이 자기 세션만 갱신·삭제하도록 보강했다.
- webhard folder template/config NestJS 호출이 API key principal 대신 admin session cookie 인증을 사용하도록 수정했다.
- NestJS folder template 조회·수정 endpoint에 AdminGuard를 추가해 글로벌 템플릿을 관리자 전용으로 고정했다.
- sessions endpoint 문서의 인증 계약을 조회는 `Admin session`, heartbeat/delete는 `Admin/company session`으로 정정했다.

**검증**:

- `pnpm test -- --runTestsByPath src/__tests__/lib/api/nestjs-domain-clients.test.ts --runInBand` 통과: 8 passed.
- `cd webhard-api && pnpm test -- notifications.controller.spec.ts --runInBand` 통과: 3 passed.
- `npx tsc --noEmit` 통과.
- `cd webhard-api && npx tsc --noEmit` 통과.
- `pnpm exec playwright test e2e/laser-only-company.spec.ts --project=chromium --grep '웹하드 관리 페이지에 "레이저가공 업체 관리" 섹션이 표시된다|백업 현황 섹션에 데이터가 표시된다' --reporter=line` 통과: 2 passed.
- E2E 로그에서 기존 `notifications` numeric-string 400, `sessions/upsert` 403, `folders/config` 403 패턴 매칭 없음.

### 2026-05-27 — webhard-e2e-upload-delete-hardening

**Scope**: 웹하드 E2E 업로드/삭제/이름변경 검증 경로 안정화.

**수정**:

- 업로드 완료 helper가 batch-complete의 HTTP status뿐 아니라 `success:false`와 `failed > 0`을 실패로 검증하도록 보강했다.
- 업로드 직후 현재 폴더 API에서 실제 fileId를 확인하고, reload 없이 현재 뷰의 `[data-file-id]` 행까지 검증하도록 했다.
- 삭제/파일명 변경 helper가 reload fallback 없이 API persisted state와 live DOM state를 모두 확인하도록 조정했다.
- 중복 폴더 E2E에서 실패를 숨기던 항상 참 조건을 제거하고 API folder count 검증을 추가했다.
- `POST /api/webhard/upload/batch-complete` Next route가 NestJS의 partial metadata failure를 502로 노출하도록 수정했다.

**검증**:

- `pnpm exec playwright test --reporter=list` 통과: 594 passed, 168 skipped.
- `npx tsc --noEmit` 통과.
- `pnpm test -- --runTestsByPath src/__tests__/api/webhard-upload-batch-complete-route.test.ts` 통과: 4 passed.
- 독립 리뷰 에이전트 재검수 GO: 남은 Critical/Important findings 없음.

### 2026-05-25 — full-remediation-security-performance-design

**Scope**: 보안, 성능, 디자인, 유지보수 전수 개선 GOAL 실행.

**수정**:

- 인증/권한 경계 테스트를 보강해 forged session, API key principal, worker ACL, mutation route side effect를 차단하도록 고정했다.
- 웹하드 일반 폴더 파일 목록에 50개 단위 pagination/infinite loading을 적용하고, 75개 이상 파일 append 회귀 테스트를 추가했다.
- 폴더 업로드의 파일 바이트 전송을 Server Action buffer 경로에서 browser direct-to-R2 배치 업로드로 전환했다.
- 폴더 업로드 배치 처리에서 folderId 그룹을 제한된 병렬 실행으로 처리하고, `uploadFilesBatch` 파일 매칭을 Map 기반 O(n) 처리로 보정했다.
- 최신 도면 조회는 공정 단계 후보를 단일 ranked query로 조회해 반복 `findFirst` hot path를 제거했다.
- 웹하드 폴더 업로드 모달에 dialog role, Escape close, Tab focus loop, 명명된 close button 계약 테스트를 추가했다.
- 변경 라인 기준 정적 게이트를 추가해 신규 상대 import, raw React Query key, explicit `any` 유입을 차단한다.
- 디자인 정적 게이트 위반 raw brand hex와 literal class interpolation을 토큰 기반 클래스/템플릿으로 정리했다.
- 최종 프로젝트 표준/독립 리뷰 피드백을 반영해 integration API key principal의 generic company folder listing 접근은 차단하되, 외부웹하드 동기화용 presigned/confirm/mark-downloaded/folder initialize endpoint는 명시 메타데이터로 허용하도록 분리했다.
- Integration API key가 `POST /files/mark-downloaded`에서 `markAll=true`로 전체 파일 다운로드 상태를 변경하지 못하도록 service-level guard와 회귀 테스트를 추가했다.
- realtime gateway cookie parser가 URL-encoded session cookie를 검증하도록 수정했다.

**검증**:

- `pnpm test -- --runInBand` 통과: 137개 suite 통과, 2개 skipped, 1052개 테스트 통과, 6개 skipped.
- `pnpm --dir webhard-api test -- --runInBand` 통과: 73개 suite 통과, 933개 테스트 통과, 1개 skipped.
- `npx tsc --noEmit` 통과.
- `cd webhard-api && npx tsc --noEmit` 통과.
- `pnpm audit --prod --audit-level high` 통과. `pnpm --dir webhard-api audit --prod --audit-level high` 통과; backend Moderate Nest SSE advisory 1건은 non-reachable 예외로 `docs/security/dependency-audit-2026-05-25.md`에 문서화.
- `git diff --check` 통과.

### 2026-05-25 — home-process-step-number-removal

**Scope**: 홈 제작 과정 섹션 숫자 표시 제거.

**수정**:

- 제작 과정 카드 좌측 이미지 영역의 원형 숫자 배지를 제거했다.
- 제작 과정 제목 위 `STEP n` 라벨을 제거해 각 스텝에서 숫자가 노출되지 않도록 했다.

**검증**: `git diff --check` 통과. frontend `npx tsc --noEmit` 통과. Playwright `/` 제작 과정 섹션 `STEP 숫자` 라벨 미노출 확인.

### 2026-05-22 — chatbot-system-spec

**Scope**: 챗봇 상담 시스템 구현 준비 문서 추가.

**문서**:

- 공개 `챗봇 상담` 버튼을 실제 상담 시스템으로 확장하기 위한 feature spec을 추가했다.
- 공개 FAQ, 견적 준비, 웹하드 이용 문의, 상담원 인계 흐름을 정의했다.
- public/company/admin 역할별 접근 범위, Next.js↔NestJS API 경계, 세션/메시지/인계 데이터 모델 초안을 정리했다.
- LLM/RAG 도입 시 source visibility, prompt injection 방어, 개인정보/토큰/presigned URL 노출 금지, 운영 지표와 테스트 계약을 명시했다.

**검증**: 문서-only 변경. `git diff --check` 예정.

### 2026-05-22 — webhard-storage-usage-live

**Scope**: 웹하드 저장 공간 사용량 실시간 반영.

**수정**:

- 관리자 저장 공간 사용량이 업체 파일을 포함하지 못하고 `0 B`로 보일 수 있던 백엔드 집계 원인을 수정했다.
- 관리자 전체 사용량은 모든 `company_storage.used_bytes` 합계를 사용하고, `company_storage` 조회 실패 시 전체 활성 `webhard_files` 크기 합계로 fallback한다.
- 파일 업로드/삭제/복원 및 웹하드 파일 realtime 이벤트 후 저장 공간 React Query 캐시를 active refetch 하도록 연결했다.
- 저장 공간 표시 컴포넌트에 window focus refetch와 30초 polling fallback을 추가했다.

**검증**: frontend queryKeys Jest 통과. backend storage Jest 통과. frontend/backend `npx tsc --noEmit` 통과. `git diff --check` 통과.

### 2026-05-22 — worker-booking-schedule-menu

**Scope**: Worker 대시보드 예약 일정 메뉴 추가.

**개선**:

- Worker 대시보드 헤더에 `메뉴` 드롭다운을 추가해 방문 예약 일정을 확인할 수 있게 했다.
- `/api/worker/bookings` read-only 경로를 추가해 worker 세션 검증 후 오늘부터 14일간의 예약만 조회한다.
- 예약 메뉴는 일자별로 시간대, 업체명, 연결 문의명/문의번호, 상태를 표시하고 새로고침 버튼으로 재조회할 수 있다.
- 관리자 예약 API를 Worker 화면에서 직접 호출하지 않도록 권한 경계를 분리했다.

**검증**: frontend `npx tsc --noEmit` 통과. Playwright Worker 대시보드 메뉴 오픈 확인. `git diff --check` 통과.

### 2026-05-22 — company-login-remember-auto

**Scope**: 업체/관리자 로그인 편의 옵션 추가.

**개선**:

- 로그인 화면에 `아이디 저장`과 `자동로그인` 체크박스를 추가했다.
- `아이디 저장`은 비밀번호나 토큰 없이 아이디 문자열만 브라우저 `localStorage`에 저장하고 다음 방문 시 복원한다.
- `자동로그인` 선택 시 로그인 성공 세션 쿠키 만료 시간을 30일로 연장한다.
- 자동로그인을 선택하지 않은 로그인은 기존 4시간 세션 만료 정책을 유지한다.

**검증**: frontend auth Jest 통과. frontend `npx tsc --noEmit` 통과. Playwright `/login` 체크박스 렌더링 확인. `git diff --check` 통과.

### 2026-05-22 — worker-urgent-timeline-audit

**Scope**: Worker 긴급 배치/해제 이력 기록.

**개선**:

- Worker/Admin 긴급 토글 시 현재 세션 actor를 기준으로 타임라인 `urgent_toggle` 이력을 남긴다.
- 긴급 배치/해제 모두 `contacts` 상태 변경과 타임라인 기록을 같은 트랜잭션에서 처리한다.
- Worker/Admin 타임라인에 `긴급 처리 — 작업자명`, `긴급 해제 — 작업자명`과 기록 시각을 표시한다.
- Worker 대시보드에서 긴급 토글 직후 열린 카드 타임라인을 즉시 refetch한다.
- 기존 긴급 문의에 `urgent_toggle` 이력이 없으면 `urgent_at` 기준 긴급 처리 fallback 이력을 표시한다.

**검증**: frontend `ContactTimeline` Jest 통과. backend `contacts`/`contact-timeline` Jest 통과. frontend/backend `npx tsc --noEmit` 통과. Playwright Worker 카드 확장 확인. `git diff --check` 통과.

### 2026-05-22 — worker-search-delivered-results

**Scope**: Worker 대시보드 통합 검색 납품완료 결과 포함.

**UI 개선**:

- Worker 대시보드 검색 결과에 납품 완료 문의도 포함한다.
- 납품 완료 검색 후보는 완료 목록 원본을 합친 뒤 대시보드 통합 검색식으로 다시 필터링해, 서버 검색 조건에 없는 파일명으로도 검색된다.
- 납품 완료 결과 클릭 후 완료 탭으로 이동했을 때도 완료 목록 원본을 로컬 검색식으로 필터링해 파일명 검색 대상 카드가 유지된다.
- 완료 탭 검색 결과에 URL `highlight` 대상이 없으면 납품완료 단건을 보강 조회해 렌더 목록에 포함하고, DOM 렌더 후 스크롤을 재시도해 클릭 직후 이동/강조 실패를 방지한다.
- 납품 완료 검색 결과로 이동한 대상 카드는 brand ring, 왼쪽 bar, 배경색, shadow로 명확히 강조한다.
- 납품 완료 결과는 드롭다운 scope 태그를 `납품완료`로 표시한다.
- 납품 완료 결과 선택 시 `/worker/delivery?tab=completed&highlight=...&search=...`로 이동하고 완료 탭에서 대상 카드를 검색·스크롤·강조한다.

**검증**: frontend `npx tsc --noEmit` 통과. `git diff --check` 통과.

### 2026-05-22 — worker-search-keyboard-infinite-results

**Scope**: Worker 대시보드 통합 검색 드롭다운 조작 개선.

**UI 개선**:

- 검색 결과 드롭다운에서 `ArrowDown`/`ArrowUp`으로 결과 항목을 선택하고 `Enter`로 이동할 수 있게 했다.
- `Escape` 입력 시 검색어와 드롭다운을 닫는다.
- 검색 결과 목록은 처음 12개만 렌더하고 드롭다운 스크롤 하단 접근 시 다음 묶음을 추가 렌더링한다.

**검증**: frontend `npx tsc --noEmit` 통과. `git diff --check` 통과.

### 2026-05-22 — worker-timeline-skeleton-shimmer-polish

**Scope**: Worker 문의 카드 타임라인 로딩 스켈레톤 애니메이션 보강.

**UI 개선**:

- Worker 문의 카드 확장 타임라인 스켈레톤에 전용 빠른 shimmer highlight를 적용했다.
- 타임라인 로딩 컨테이너에 은은한 pulse를 더해 로딩 중 반짝이며 움직이는 느낌을 명확히 했다.

**검증**: frontend `ContactTimeline` Jest 통과. frontend `npx tsc --noEmit` 통과. `git diff --check` 통과.

### 2026-05-21 — worker-dashboard-clock-layout-polish

**Scope**: Worker 대시보드 헤더 시계 레이아웃 조정.

**UI 개선**:

- 헤더 중앙 시계를 날짜와 시간 두 줄로 분리했다.
- 날짜는 요일까지 포함해 위쪽의 큰 볼드 텍스트로, 시간은 아래쪽의 작은 보조 텍스트로 표시한다.

**검증**: frontend `npx tsc --noEmit` 통과. `git diff --check` 통과.

### 2026-05-21 — worker-global-search-jump

**Scope**: Worker 대시보드 통합 검색 결과 드롭다운과 대상 이동 강조.

**UI 개선**:

- Worker 대시보드 검색 입력 아래에 애니메이션 검색 결과 드롭다운을 표시한다.
- 검색 결과는 현재 탭에 한정하지 않고 사무실 작업, 현장 작업, 납품관리 대기 건을 함께 보여준다.
- 사무실/현장 결과를 클릭하면 해당 탭과 공정 필터로 이동하고 대상 문의 카드를 스크롤·강조한다.
- 납품관리 결과를 클릭하면 `/worker/delivery?tab=pending&highlight=...`로 이동해 납품 대기 카드가 스크롤·강조된다.

**검증**: frontend `npx tsc --noEmit` 통과. `git diff --check` 통과.

### 2026-05-21 — worker-expanded-card-shimmer-loading

**Scope**: Worker 납품/문의 확장 영역 shimmer 스켈레톤 로딩.

**UI 개선**:

- 공용 `Skeleton` 컴포넌트를 좌우로 흐르는 shimmer 애니메이션으로 변경했다.
- Worker 문의 카드 확장 타임라인 스켈레톤이 shimmer 애니메이션을 사용한다.
- 납품 완료 목록 로딩은 회전 아이콘 대신 카드형 shimmer 스켈레톤을 표시한다.
- 납품 완료 카드 확장 패널은 타임라인과 납품 증빙 이미지가 모두 준비되기 전까지 전체 스켈레톤을 유지하고, 준비 후 실제 콘텐츠를 함께 표시한다.

**검증**: frontend `ContactTimeline`, `DownloadButton` Jest 통과. frontend `npx tsc --noEmit` 통과.

### 2026-05-21 — worker-contact-list-infinite-render

**Scope**: Worker 대시보드 문의 카드 리스트 무한 스크롤형 렌더링.

**UI 개선**:

- Worker 대시보드의 사무실/현장 문의 카드 리스트는 최초 20개만 렌더하고, 하단 접근 시 20개씩 추가 렌더링한다.
- 탭, 공정 필터, 검색어 변경 시 현재 조건의 첫 묶음부터 다시 렌더한다.
- 새 문의 알림 클릭 대상 카드가 아직 렌더되지 않은 위치에 있으면 해당 카드까지 먼저 렌더한 뒤 스크롤한다.

**검증**: frontend `npx tsc --noEmit` 통과.

### 2026-05-21 — worker-timeline-file-row-download-ux

**Scope**: Worker 타임라인 도면 파일 행 다운로드 UX 정리.

**UI 개선**:

- 타임라인 도면 파일 행의 별도 `다운로드` 텍스트 버튼을 제거했다.
- 파일 행 전체가 다운로드 컨트롤로 동작하며, 파일명 뒤에는 다운로드 아이콘 1개만 표시한다.

**검증**: frontend `ContactTimeline`, `DownloadButton` Jest 통과. frontend `npx tsc --noEmit` 통과.

### 2026-05-21 — worker-dashboard-refresh-fab-removal

**Scope**: Worker 대시보드 우하단 새로고침 floating 버튼 제거.

**UI 개선**:

- Worker 대시보드 우하단에 고정 표시되던 원형 `새로고침` 버튼을 제거했다.

**검증**: frontend `npx tsc --noEmit` 통과.

### 2026-05-21 — worker-dashboard-live-clock

**Scope**: Worker 대시보드 헤더 현재 날짜/시각 표시.

**UI 개선**:

- Worker 대시보드 상단 헤더 중앙에 현재 날짜와 시각을 `26년 M월 D일 오전/오후 H시 m분` 형식으로 표시한다.
- 헤더 시각은 분 경계에 맞춰 자동 갱신하며, 작은 화면에서는 헤더 액션과 겹치지 않도록 숨긴다.

**검증**: frontend `formatWorkerContactMeta` Jest 통과. frontend `npx tsc --noEmit` 통과.

### 2026-05-21 — worker-login-failure-help-placement

**Scope**: Worker 로그인 실패 안내 위치/노출 조건 조정.

**UI 개선**:

- Worker 로그인 화면의 관리자 문의 안내는 최초 진입 시 숨기고, 로그인 실패 후에만 표시한다.
- 실패 안내는 `이름과 PIN을 입력해주세요` 문구 바로 아래, 작업자 이름 입력 영역 위에 표시해 실패 원인과 관리자 문의 안내를 함께 읽을 수 있게 했다.

**검증**: frontend `WorkerLoginPage` Jest 통과.

### 2026-05-21 — worker-new-contact-notification-read-state

**Scope**: Worker 새 문의 알림 읽음 상태와 드롭다운 렌더링 개선.

**UI 개선**:

- Worker 새 문의 알림에 `readAt` 읽음 상태를 저장한다. 카드 클릭, 카드 액션 클릭, 작업상태 변경, 알림 항목 클릭 시 해당 문의의 빨간 새 문의 표시를 제거한다.
- 알림 드롭다운 항목 클릭 시 드롭다운을 닫지 않고 대상 문의로 이동하며, 해당 항목은 읽음 처리되어 빨간 점을 숨기고 밝은 회색 텍스트로 표시한다.
- 읽음 처리된 항목은 즉시 위치를 바꾸지 않고, 새 문의 드롭다운을 닫을 때 미확인 알림을 위로, 확인된 알림을 아래로 재정렬한다.
- 읽은 지 3일이 지난 알림은 페이지 로드 또는 새 문의 드롭다운 close 시점에 제거한다. 미확인 알림은 3일이 지나도 제거하지 않는다.
- `모두 확인`은 알림을 삭제하지 않고 읽음 처리하며, `비우기`만 알림 목록을 제거한다.
- 새 문의 알림 목록은 처음 12개만 렌더하고 스크롤 하단 접근 시 다음 묶음을 추가 렌더링한다.

**검증**: frontend `workerNotifications`, `WorkerNewContactNotifications`, `OfficeContactCard`, `StaffContactCard` Jest 통과.

### 2026-05-21 — timeline-revision-download-filename-fix

**Scope**: Worker/공통 타임라인 도면 수정 파일 다운로드명 보정.

**버그 수정**:

- 타임라인 도면 수정 파일 다운로드가 presigned R2 URL을 직접 열어 브라우저가 `download` 파일명을 무시하고 R2 원본 파일명을 저장하던 문제를 수정했다. API가 반환한 `문의번호 - 업체명 - 파일명`을 실제 저장명으로 강제하기 위해 `DownloadButton`의 API 다운로드 경로를 blob 다운로드로 전환했다.
- Worker 세션으로 타임라인 도면 수정 파일을 받을 때도 `[F번호]` prefix가 제거되고 `현장번호 - 업체명 - 파일명` 형식으로 내려가는 route 회귀 테스트를 추가했다.

**검증**: frontend `DownloadButton`, `ContactTimeline`, `drawing-revisions-route-auth` Jest 통과. frontend `npx tsc --noEmit` 통과.

### 2026-05-21 — worker-memo-api-csrf-fix

**Scope**: Worker 메모/이슈 보고 제출 및 worker mutation API 회귀 보정.

**버그 수정**:

- Worker 로그인은 `erp-session`과 함께 `csrf-token`도 발급한다. 기존 로그인 세션처럼 `csrf-token`이 없는 상태에서도 worker Server Action과 worker route proxy가 NestJS로 상태 변경 요청을 보낼 때 upstream 요청용 `csrf-token` cookie/header 쌍을 생성해 `CSRF token missing` 403을 방지한다.
- Worker mutation API 전반 테스트에서 발견된 `drawing-revisions-route-auth` 회귀 테스트 mock을 최신 다운로드명 보정 계약에 맞춰 갱신했다.
- Worker 메모/이슈 보고 제출 경로(`addWorkerNote`)가 검증된 worker session 이름으로 저장되고, 클라이언트가 전달한 `workerName`을 신뢰하지 않는 회귀 테스트를 추가했다.
- Worker 메모/이슈 보고 목록의 `worker_notes` 내부 항목도 `created_by`/`created_at` snake_case로 반환해 모달에서 작업자명 대신 빈 값과 `Invalid Date`가 노출되던 문제를 수정했다.

**검증**: frontend worker/API/action/lib-api Jest 통과. backend `contacts.controller.spec.ts`, `contacts.service.spec.ts` 통과. backend `npx tsc --noEmit` 통과.

### 2026-05-21 — worker-card-filename-weight-adjustment

**Scope**: Worker 문의 카드 파일명 표시 두께 조정.

**UI 개선**:

- Worker 문의 카드의 `업체명 - 파일명` 라인에서 업체명만 굵게 표시하고 파일명과 구분자는 보통 두께로 표시한다.

**검증**: frontend `contactDownloadFilename`, `OfficeContactCard`, `StaffContactCard` Jest 통과.

### 2026-05-21 — worker-drawing-upload-cookie-scope-fix

**Scope**: Worker 도면 업로드 403 회귀 보정.

**버그 수정**:

- Worker 도면 업로드 프록시(`/api/worker/drawing-revisions`, `/api/worker/drawing-revisions/upload-urls`)가 검증된 worker session을 확인한 뒤에도 브라우저의 전체 Cookie 헤더를 NestJS로 전달해, 같은 브라우저에 남아 있는 `admin-session`/`company-session` 때문에 NestJS가 `Verified worker session required` 403을 반환할 수 있던 문제를 수정했다.
- Worker 파일 목록/다운로드 프록시까지 같은 공통 header helper를 사용하도록 정리해 NestJS에는 `erp-session`/`csrf-token`만 전달한다.

**검증**: frontend `worker-auth-boundary` Jest 통과.

### 2026-05-21 — worker-card-download-and-webform-webhard-sync

**Scope**: Worker 문의 카드 표시명/다운로드명 분리와 공개 문의 업로드 파일 웹하드 정착 보정.

**버그 수정**:

- Worker 최신 도면 다운로드에서 Next.js route가 이미 `문의번호 - 업체명 - 파일명`을 내려준 뒤 클라이언트가 다시 같은 prefix를 붙여 `문의번호 - 업체명 - 문의번호 - 업체명 - 파일명`처럼 중복되던 문제를 수정했다. 다운로드명 formatter는 기존 `[O]`/`[F]`, 전체 다운로드 prefix, 짧은 `O-001`/`F-001` prefix까지 제거한 뒤 한 번만 조립한다.
- Worker 문의 카드 표시명은 실제 웹하드 파일명을 변경하지 않고 화면에서만 `업체명 - 파일명`으로 정리한다. 카드에는 문의번호/작업번호 prefix와 패키지명 prefix를 넣지 않는다.
- 공개 문의 폼에서 업로드한 도면, 일반 첨부, 참고 사진을 Contact 생성 후 해당 문의 폴더의 `WebhardFile`로 등록한다. 기존 R2 object key와 WebhardFile 표시명은 재작성하지 않고, 누락된 metadata만 생성해 자체웹하드 문의 폴더에서 파일이 보이게 했다.

**검증**: frontend `contactDownloadFilename`, `downloadFiles`, `OfficeContactCard` Jest 통과. backend `contacts.service.spec.ts` 통과. frontend/backend `npx tsc --noEmit`, `git diff --check` 통과.

### 2026-05-21 — worker-dashboard-download-auth-fix

**Scope**: Worker 공정/완료 mutation 403 회귀와 관리자/Worker 문의 파일 다운로드명 보정.

**버그 수정**:

- Worker Server Action이 검증된 `erp-session`을 확인한 뒤 NestJS worker mutation을 호출하더라도, 같은 브라우저에 `admin-session` 또는 `company-session` 쿠키가 함께 남아 있으면 NestJS가 admin/company 세션을 먼저 채택해 `actorType='worker'` 요청을 403 `Verified worker session required`로 거부할 수 있었다. Worker actor mutation 호출은 NestJS로 전달하는 쿠키를 `erp-session`/`csrf-token`으로 제한해 worker 세션이 정확히 해석되도록 했다.
- Worker 긴급 토글, 작업자 노트 추가/삭제, 단계 완료 토글도 actor 정보를 NestJS client에 전달해 같은 쿠키 제한 경로를 사용한다.
- Worker와 관리자 문의 카드 다운로드 파일명은 `문의번호 - 업체명 - 파일명` 형식으로 저장된다. 기존 `[O]`/`[F]` 번호 prefix와 이미 붙은 동일 다운로드 prefix는 제거해 중복 파일명을 방지한다.
- 관리자 문의 카드의 최신 리비전 다운로드 route도 contact metadata를 조회해 문의번호와 업체명을 포함한 파일명을 만들 수 있게 했다.

**검증**: frontend `nestjs-core-client`, `nestjs-worker-actor-client`, `downloadFiles`, `contactDownloadFilename` Jest 통과. frontend `npx tsc --noEmit` 통과.

### 2026-05-20 — public-design-review-round2

**Scope**: gstack 디자인 리뷰 2차 지적사항 중 공개 화면, 로그인 게이트, Worker 로그인 UI 개선.

**UI 개선**:

- 홈 모바일 hero에서 박스 와이어프레임을 텍스트 뒤가 아니라 하단 배경으로 낮추고 불투명도/크기를 줄여 H1과 CTA가 먼저 읽히게 했다.
- 홈 dark scroll 구간의 `BoxNetSection` 높이를 줄이고 모바일 정보 패널을 하단 compact 구성으로 바꾸며, `ProcessSection`/`InquirySection`을 정적 정보 섹션으로 정리해 검은 빈 화면 체류를 줄였다.
- 홈 `대표 제작 유형` 카드는 동일 placeholder 아이콘 대신 유형별 구조 도면 예시, 구조 설명, 용도 설명을 제공한다. 실제 포트폴리오가 아니라 상담 가능한 제작 유형임을 계속 명시한다.
- `/portfolio` 데이터 0건 상태에서는 `전체 (0)` 필터를 숨기고, 대표 제작 유형 보기와 제작 상담 CTA를 함께 제공한다.
- `/notice` 데이터 0건 상태에 운영 안내, 문의 가능 시간 안내, 제작 문의 CTA를 추가했다.
- `/about` 소개 본문의 데스크톱 문단 폭을 줄여 장문 가독성을 개선했다.
- `/contact` 모바일 stepper를 현재 단계 중심 compact 표시로 바꾸고 모바일 폼 외곽 card의 border/shadow 부담을 줄였다.
- `/admin`, `/company/dashboard`, `/webhard` 비인증 접근은 `/login?next=...`로 목적지를 전달하며, 로그인 화면은 관리자 대시보드/업체 대시보드/웹하드 접근 문구를 목적지별로 표시한다. 로그인 실패/차단/승인대기/서버오류 후에도 허용된 목적지 문맥을 유지한다.
- Worker 로그인 이름 입력에 고정 label `작업자 이름`을 추가하고, PIN 실패/잠금/관리자 문의 안내가 들어갈 help 영역을 추가했다.

**검증**: frontend `npx tsc --noEmit` 통과.

### 2026-05-20 — public-design-review-round1

**Scope**: gstack 디자인 리뷰 1차 지적사항 중 공개 화면 전환/신뢰 저하 요소 수정.

**UI 개선**:

- 모바일 `/contact` 진입 시 폼 상단을 가리던 작은 화면 경고 토스트를 제거했다.
- 공개 화면 모바일 플로팅 CTA를 단일 `상담` 버튼으로 축약하고, 펼쳤을 때 `문의하기`/`업체등록`/`챗봇 상담`을 선택하게 해 본문과 빈 상태 메시지를 가리지 않도록 했다.
- 홈의 placeholder 패키지 카드는 실제 포트폴리오처럼 보이지 않도록 `대표 제작 유형` 섹션으로 문구를 바꾸고, 실제 포트폴리오가 없을 때 CTA는 `/contact` 상담으로 보낸다.
- `/portfolio` 빈 상태는 단순 “없음”이 아니라 실제 작업 사례 준비 중 안내와 제작 상담 CTA를 제공한다.
- 홈의 긴 스크롤형 검은 섹션과 전환 그라데이션 높이를 줄여 정적 화면에서 렌더링 누락처럼 보이는 공백을 완화했다.
- 홈 CTA 연락처를 footer와 같은 `02-2264-8070`으로 통일했다.
- React Query Devtools와 react-grab/Claude Code 브라우저 스크립트는 각각 명시 env가 있을 때만 개발 환경에서 표시되거나 주입되도록 바꿨다.

**검증**: frontend `npx tsc --noEmit` 통과.

### 2026-05-19 — worker-auth-boundary-hardening

**Scope**: Worker 인증 경계를 검증된 worker session과 actor 권한 중심으로 보강.

**보안 수정**:

- `/api/erp/session`은 더 이상 `workerId`/`workerName`만으로 `erp-session`을 발급하지 않는다. 이름/PIN을 NestJS `POST /api/v1/erp/workers/pin-login`에서 검증한 성공 응답으로만 httpOnly signed cookie를 만든다.
- `/api/worker/files`, `/api/worker/files/:id/download`, `/api/worker/drawing-revisions`, `/api/worker/drawing-revisions/upload-urls`는 `getErpWorkerSession()` 검증 실패 시 backend API key 호출 전에 401로 종료한다.
- Worker 파일 목록/다운로드와 도면 등록/업로드 URL 프록시는 검증된 `erp-session`을 NestJS로 전달하며, 더 이상 `X-API-Key`로 worker 요청을 승격하지 않는다. 상태 변경이 있는 도면/업로드 URL 호출은 CSRF token도 함께 전달한다.
- `/api/socket-auth`는 `erp-session` 쿠키 존재가 아니라 검증된 worker session에서만 worker socket token을 발급한다.
- Worker-facing Server Action은 검증된 worker session 또는 admin session이 없으면 `serverGetContacts`/mutation backend API 호출 전에 실패한다. Actor mutation client는 worker/admin actor일 때 NestJS session cookie 경로를 사용하고, Worker note 생성자는 요청 body의 `workerName` 대신 세션 actor 이름으로 고정한다.
- NestJS Files read endpoint와 Contacts worker mutation endpoint는 `erp-session`을 명시 허용한 route에서만 worker session을 받아들이고, API key 요청이 `actorType=worker`를 위조하면 거부한다. 검증된 worker session 요청은 DTO의 `actorName` 대신 세션 worker 이름으로 actor를 확정한다. Company drawing revision 생성/upload URL 경로는 기존 수정요청 첨부 흐름이 깨지지 않도록 company session 소유권 검증 후 `company` actor로만 허용한다.
- Worker dashboard/delivery/office/tasks route에 server-side guard를 추가하고, Worker React Query hook은 hydration + worker session 확인 전 실행되지 않는다.
- NestJS `ContactsGateway`는 검증 실패 `erp-session` fallback worker room join을 제거하고, socket token role이 admin/worker가 아니면 room에 join하지 않는다.
- Worker login의 PIN localStorage 자동 로그인 저장을 제거하고 `/api/erp/session` 중심 로그인으로 바꿨다.
- `/api/debug/backend-health`는 production에서 404로 닫고, 비운영에서도 `requireAdmin()` 통과 후에만 실행한다. 응답에서 API key prefix 노출도 제거했다.

**검증**: frontend `worker-auth-boundary`, `contacts-timeline`, `process-board-auth`, `nestjs-worker-actor-client` Jest 통과. backend `contacts.gateway.spec.ts`, `contacts.controller.spec.ts` 통과. frontend/backend `npx tsc --noEmit` 통과.

### 2026-05-19 — notification-query-key-invalidation

**Scope**: 알림 React Query cache key 계약 보정.

**버그 수정**:

- `queryKeys.notifications.count()`와 `queryKeys.notifications.list()`가 필터 없는 prefix key를 반환하도록 수정했다. 알림 실시간 이벤트가 전체 count/list query를 무효화할 때 카테고리별 count와 필터별 list cache까지 함께 갱신된다.
- `count('all')`은 전체 count prefix로 유지하고, 실제 카테고리(`webhard`, `integration`, `work-management`)만 별도 key segment로 분리한다.

**검증**: `queryKeys`, `useNotifications`, admin API/auth/worker middleware/webhard frontend stability/useContactTimeline 관련 frontend Jest 7개 suite / 85개 테스트 통과.

### 2026-05-18 — dashboard-webhard-security-audit-fixes

**Scope**: 관리자/업체 대시보드와 웹하드 전수조사 후속 보안/동작 수정.

**보안 / 버그 수정**:

- contacts Next.js 라우트에 admin/company 세션 및 업체 소유권 검증을 추가했다. company session은 자기 업체 문의만 읽기/다운로드/타임라인/웹하드 정보/도면 URL을 조회할 수 있고, 삭제/status/restore/ack/merge/admin drawing revision 생성은 admin 전용으로 제한된다.
- Company session의 `/api/contacts/:id/timeline` 조회는 NestJS에 browser session cookie로 전달해 backend company-facing 타임라인 필터(`isPublic=false` 제외, note 마스킹)를 유지한다.
- `/api/contacts/by-company`는 company session에서 query `companyName`을 신뢰하지 않고 세션 업체명으로만 조회한다.
- `/api/contacts/cleanup`은 `CLEANUP_API_KEY` Bearer 호출 또는 admin session만 실행할 수 있다.
- `/api/contacts/:id/revision-request`는 문의 소유권을 먼저 확인한 뒤 formData/R2 업로드를 시작해 권한 없는 요청이 orphan object를 만들지 않게 했다.
- `/api/bookings`와 `/api/bookings/:id`에 인증과 업체 소유권 검증을 추가했다. company session은 자기 업체 예약만 조회/생성/수정/취소할 수 있고, 연결 문의 `contactId`도 같은 업체 소유인지 확인한다.
- `/api/drawing-revisions/:revisionId/download`는 revision 소유 업체와 공개 여부를 확인한 뒤 presigned URL을 발급한다. company session은 자기 업체의 공개 revision만 다운로드할 수 있고, ERP worker 다운로드는 유지된다.
- `/api/drawing-revisions/:revisionId/visibility`는 admin session 전용으로 제한했다.
- 업체 예약 변경 정원 비교는 하드코딩 `2` 대신 NestJS `maxCapacity` 응답을 사용한다.
- 업체 웹하드 접근 정보 조회 실패 또는 null 응답은 웹하드 본문 렌더링 대신 fail-closed 안내 화면으로 처리한다.
- 관리자 백업 프록시는 `MIGRATION_API_KEY`를 강제 사용하지 않고 검증된 admin cookie를 NestJS에 전달해 Backup API의 admin-session/backup-scope 계약과 맞춘다. NestJS가 내려주는 `Set-Cookie`도 보존해 CSRF cookie bootstrap을 유지한다.
- 예약 목록/예약 가능 조회 실패가 빈 목록이나 빈 slotCounts로 흡수되지 않도록 오류를 전파한다.
- 웹하드 메인 헤더 `className` 템플릿 오타와 `FilePreviewTooltip` 토큰 공백 누락을 수정했다.
- Jest 기본 ignore에 `/.worktrees/`를 추가해 넓은 테스트 패턴이 중복 React 사본을 탐색하지 않게 했다.

**검증**: frontend `contact-route-auth`, `contacts-timeline`, `bookings-route-auth`, `drawing-revisions-route-auth`, `backup-proxy-route`, `bookings-available-route` 및 관리자/업체/웹하드 타깃 Jest 26개 suite/124개 테스트 통과. backend `drawing-revision.service.spec.ts`, `contacts.controller.spec.ts` 30개 테스트 통과. frontend/backend `npx tsc --noEmit`, `git diff --check` 통과.

### 2026-05-18 — company-dashboard-action-buttons

**Scope**: 업체 대시보드 예약/문의 카드 액션 버튼 스타일 통일.

**UI 개선**:

- 업체 대시보드 `예약 일정` 카드와 `문의 진행상황` 문의 카드의 `예약변경`, `예약취소` 버튼을 `웹하드`, `메모`와 같은 `CardActionButton` 기반 공통 스타일로 통일했다.
- 예약 관련 버튼만 회색 별도 스타일로 보이던 차이를 제거해 카드 하단 액션 그룹의 높이, 배경, 보더, 그림자가 동일하게 표시된다.

**검증**: `DashboardButtons`, `BookingSection`, `ContactCardToggle` Jest 7개와 frontend `npx tsc --noEmit`, `git diff --check` 통과.

### 2026-05-18 — company-dashboard-delivery-proof-image

**Scope**: 업체 대시보드 납품완료 사진 조회 보정.

**버그 수정**:

- 업체 대시보드 문의 카드가 납품 증빙 사진을 raw R2 URL로 직접 렌더링하던 문제를 수정했다.
- 업체 화면도 기존 `DeliveryProofImage`를 사용해 `/api/contacts/:id/delivery-proof`에서 권한 검증 후 presigned URL을 받아 사진을 표시한다.
- 납품 증빙 사진은 기존 backend 계약대로 해당 문의 폴더에 `납품완료_YYYYMMDD_HHmmss.ext` 웹하드 파일로 저장된다.

**검증**: 업체 대시보드/문의 제출 관련 frontend Jest 55개, `ContactsService` Jest 60개, `BookingsService` Jest 21개, frontend/backend `npx tsc --noEmit`, `git diff --check` 통과.

### 2026-05-18 — company-dashboard-inquiry-title-display

**Scope**: 업체 대시보드 예약/문의 카드 제목 표시 보정.

**버그 수정 / UI 개선**:

- NestJS `/bookings` 목록/단건 조회 응답이 `contact_id`로 연결된 문의 요약(`contacts`)을 함께 반환하도록 보강했다. 업체 대시보드 예약 일정 카드가 더 이상 연결 문의를 `문의명 없음`으로 표시하지 않는다.
- 업체 대시보드 문의 진행상황과 예약 일정의 문의 제목은 저장된 `inquiry_title`을 변경하지 않고, 화면 표시 시에만 앞쪽 업체명 접두사를 제거해 패키지명 중심으로 보여준다.

**검증**: `BookingsService` Jest 21개, 업체 대시보드 제목 formatter/문의 카드 Jest 8개, frontend/backend `npx tsc --noEmit`, `git diff --check` 통과.

### 2026-05-18 — contact-submit-loading-state

**Scope**: 공개 문의 폼 최종 제출 버튼 로딩 상태 추가.

**UI / UX 개선**:

- `/contact` 마지막 단계의 `문의하기` 버튼을 `ContactSubmitButton` 컴포넌트로 분리했다.
- 제출이 시작되면 버튼이 비활성화되고 `aria-busy="true"`, 회전 spinner, `전송중...` 라벨을 표시해 사용자가 중복 클릭하지 않고 진행 상태를 볼 수 있게 했다.
- 버튼은 디자인 시스템 `Button` 컴포넌트와 brand token을 사용한다.

**검증**: `ContactSubmitButton` Jest 2개 추가. 문의 제출/방문 슬롯/데이터 처리 관련 Jest 47개와 frontend `npx tsc --noEmit` 통과.

### 2026-05-18 — visit-booking-submit-payload-fix

**Scope**: 공개 문의 제출 후 방문 예약 자동 생성 실패 수정.

**버그 수정 / 계약 보강**:

- `submitContact` server action 이 문의 저장용 snake_case 필드(`visit_date`, `visit_time_slot`, `company_name`, `contact_id`, `created_by`)를 그대로 `POST /api/v1/bookings`에 전달하던 문제를 수정했다.
- 방문 예약 생성 호출은 NestJS `CreateBookingDto` 계약에 맞춰 `visitDate`, `visitTimeSlot`, `companyName`, `contactId`, `createdBy` camelCase body를 전송한다.
- `serverCreateBooking` 입력 타입을 `CreateBookingPayload`로 좁혀 같은 snake_case payload 회귀가 타입 체크에서 드러나도록 했다.

**검증**: `src/__tests__/actions/contacts-booking.test.ts` 회귀 테스트 추가. 문의 제출/방문 슬롯/데이터 처리 관련 Jest 45개와 frontend `npx tsc --noEmit` 통과.

### 2026-05-18 — company-account-recovery-email

**Scope**: 거래처 아이디 찾기 이메일 안내형 전환과 비밀번호 reset-link 보안 보강.

**기능 / 보안 보강**:

- `/api/auth/find-id`가 더 이상 업체 목록 조회로 아이디/마스킹 아이디를 브라우저에 반환하지 않고, NestJS `POST /api/v1/auth/find-id/request`로 위임해 등록 이메일로 아이디 안내 메일을 예약한다.
- 계정 복구 NestJS endpoint는 `X-Account-Recovery-Key` 전용 guard 뒤에 두고, 기존 외부 프로그램 API key나 `MIGRATION_API_KEY`로 호출할 수 없게 했다.
- 아이디/비밀번호 찾기 request 경로에 계정 복구 전용 IP/fingerprint rate limit을 추가했다. production에서 Upstash 또는 `ACCOUNT_RECOVERY_RATE_LIMIT_SECRET`이 없으면 fail closed 한다.
- post-lookup 계정/email 발송 제한은 메일 발송만 억제하고 generic `200` 응답을 유지해 계정 존재 여부가 드러나지 않게 했다.
- password reset request는 raw username 로그를 남기지 않고, 메일 발송은 `AccountRecoveryMailDispatcher`가 fire-and-forget으로 처리한다.
- reset link를 `/reset-password#token=...` fragment 방식으로 발급하고, `/reset-password` 폼은 mount 직후 fragment 또는 legacy query token을 memory state에 보관한 뒤 주소창 token을 제거한다. page metadata에는 `no-referrer`를 적용했다.
- development localhost/loopback에서 비밀번호 찾기를 요청하면 reset link base URL은 현재 Next.js dev origin을 사용한다. production에서는 request origin을 무시하고 `NEXT_PUBLIC_SITE_URL`/`FRONTEND_URL` 설정 URL을 사용한다.
- Sentry event URL/query_string/breadcrumb redaction과 계정 복구 메일 실패 로그 분류 코드를 추가해 reset token, recipient email, SMTP 원문 오류가 telemetry/log metadata에 남지 않도록 했다.
- 개발 환경의 localhost/loopback 호출에서는 `ACCOUNT_RECOVERY_API_KEY`가 없어도 Next.js와 NestJS가 dev-only 기본 recovery key를 공유해 로컬 E2E가 가능하다. staging/test/production 또는 non-loopback 호출에서는 공개 dev key를 허용하지 않는다.
- production에서 key가 없으면 NestJS로 무키 계정복구 POST를 보내지 않고 `503` 설정 오류로 조기 차단해 `CSRF token missing` 응답이 브라우저에 노출되지 않게 했다.
- `password_reset_tokens` 테이블이 없는 DB에 연결된 경우 reset token 저장 실패를 generic success로 흡수해 500과 계정 존재 여부 노출을 막는다. 실제 reset link 메일 발송은 `20260506090000_add_password_reset_tokens` migration 적용 후 가능하다.

**검증**: frontend account recovery/monitoring Jest 24개, backend auth/csrf/mail Jest 31개, frontend/backend `npx tsc --noEmit`, `git diff --check` 통과. `prisma migrate deploy`로 `20260506090000_add_password_reset_tokens`, `20260518120000_add_nesting_tasks` 적용 후 Prisma status가 up to date이고 두 테이블 존재를 확인. Playwright browser smoke로 dev env의 `ACCOUNT_RECOVERY_API_KEY` 누락 상태에서 `/login?view=find-id` 제출 시 generic success `200`을 받고 `CSRF token missing`/`Account recovery API key is missing`이 노출되지 않음을 확인. `/login?view=find-password` 제출도 generic success `200`을 반환함을 확인.

### 2026-05-18 — integration-nesting-tasks

**Scope**: 레이저네스팅프로그램 작업 큐 조회/상태/결과 보고 API 추가.

**기능 / 계약 보강**:

- `nesting_tasks` 테이블과 Prisma 모델을 추가했다. 주문 FK는 cascade 삭제이고, pending 큐 조회를 위해 `(status, priority, created_at)` index를 둔다.
- `GET /api/v1/integration/nesting-tasks/pending?limit=10`을 추가했다. pending 작업을 priority/createdAt 순으로 조회하고 `task_id`, `order_id`, `dxf_file_urls`, `sheet_width`, `sheet_height`, `options` 등 레이저네스팅프로그램 계약 필드로 반환한다.
- `PATCH /api/v1/integration/nesting-tasks/:taskId/status`를 추가했다. 상태는 `pending -> in_progress -> completed/failed` 전이를 검증하고, 같은 상태 재보고는 멱등 처리한다. 업데이트는 현재 status를 조건에 포함해 동시 워커 충돌을 409로 반환한다.
- `POST /api/v1/integration/nesting-tasks/:taskId/result`를 추가했다. `total_sheets`, `total_usage_rate`, `unplaced_count`와 결과 보고 시각을 저장한다.
- 모든 endpoint는 기존 Integration API와 동일하게 `ApiKeyGuard`를 사용한다.

**검증**: `webhard-api` nesting-tasks Jest 8개, integration Jest 136개, `npx tsc --noEmit`, `npx prisma validate` 통과.

### 2026-05-15 — admin-dashboard-notifications

**Scope**: 관리자 대시보드 알림 시스템과 대시보드 컴팩트 개편.

**기능 / 계약 보강**:

- 관리자 알림을 `웹하드`, `통합관리`, `작업관리` 카테고리로 분류해 조회할 수 있도록 NestJS/Next.js 알림 API와 React Query 훅에 `category` 필터를 추가했다.
- 웹하드 파일 업로드, 방문 예약 생성/변경/취소, 신규 업체 가입/승인/상태 변경, 신규 문의, 작업자 메모/이슈/요청, 긴급 지정 경로가 관리자 `notifications` 레코드를 생성한다.
- 업체 등록 승인 대기 알림은 `company_approval_pending` 타입과 “업체 승인 필요” 제목으로 통합관리 알림에 노출한다.
- 관리자 상단 알림 센터에 카테고리 탭을 추가하고, 관리자 대시보드에도 최근 알림 패널과 카테고리별 unread 요약을 배치했다.
- 대시보드 통계 카드를 더 컴팩트한 4열 카드로 조정하고, 하단 바로가기 섹션은 제거했다.
- 통합관리 하위의 기존 대시보드, 재고관리, 납품관리, 현장작업 admin 화면과 탭을 제거하고, `/admin/integration` 기본 진입과 상단 관리자 통합관리 링크는 업체관리로 바로 이동하게 했다.

**검증**: frontend 알림 훅/대시보드 알림/통합관리 nav Jest 9개, backend companies/notifications 및 기존 notifications/files/bookings/contacts Jest 통과.

### 2026-05-15 — public-homepage-v1-restore

**Scope**: 공개 홈 화면 v1 복원.

**기능 / 디자인 변경**:

- `/` 홈 화면을 `HomePageV2`에서 보존되어 있던 `HomePageV1Backup` 구성으로 되돌렸다.
- v1 홈은 기존 `HeroBoxSection`, `BoxNetSection`, `ProcessSection`, `PortfolioSection`, `InquirySection` 흐름을 다시 사용한다.
- Vercel preview/build-time에서 NestJS API 호출을 피하는 현재 SSG 정책은 유지하고, 홈 포트폴리오 영역은 기존 placeholder fallback을 사용하도록 빈 `portfolioItems`를 전달한다.

**검증**: `HomePageRoute` Jest 회귀 테스트 추가, home Jest 6개, frontend `npx tsc --noEmit`, `git diff --check`, localhost HTML/Playwright screenshot 확인 통과.

### 2026-05-14 — public-homepage-v2-structure-hero

**Scope**: 공개 홈 화면 v2 히어로 전환.

**기능 / 디자인 변경**:

- `/` 홈 화면을 새 v2 구성으로 교체했다. 기존 홈 구성은 `HomePageV1Backup`과 기존 `HeroBoxSection`으로 보존했다.
- 히어로 배경을 밝은 아이보리 계열(`bg-stone-50`)로 바꾸고, 배경 뒤 대형 영문 카피를 `Shape It Right`로 적용했다.
- 중앙 비주얼은 3D 박스 Canvas 대신 `public/images/box-shapes/*` 도안 이미지 에셋 슬라이드로 구성했다.
- 히어로 하단 한국어 카피, 슬라이드명/설명, 인디케이터, CTA 버튼은 제거했다. 도안은 자동 슬라이드와 좌우 화살표로만 전환한다.
- `Shape It Right` 타이포와 도안 이미지는 inline critical style + 원본 로컬 이미지 src로 고정해, CSS/HMR 상태가 흔들려도 기본 `h1` 텍스트처럼 붕괴하지 않게 했다.
- 히어로 슬라이드 도안과 뒷배경 그리드는 마우스 위치에 따라 3D tilt로 움직이도록 했고, `Shape It Right` 글자는 움직이지 않게 고정했다.
- 홈페이지 접속 시 1.5초 퍼센트 로딩 오버레이를 표시한 뒤 히어로 도안 영역이 opacity/translate/scale 전환으로 자연스럽게 들어오게 했다.
- HomeHeader는 현재 섹션의 `data-header-theme`를 스크롤/리사이즈 시점에 읽어 밝은 배경에서는 어두운 글자, 어두운 배경에서는 밝은 글자로 실시간 전환한다.
- v2 후속 밴드는 `data-header-theme="dark"`와 충분한 높이를 갖게 해 헤더 반전이 실제 스크롤에서 확인되도록 했다.

**검증**: `HeroPackageStructureSection` Jest 4개, `HomePageV2` Jest 1개, `HomeHeader` Jest 1개, frontend `npx tsc --noEmit`, `git diff --check`, Playwright desktop/mobile screenshot 및 히어로 내부 하단 UI 제거/헤더 계산 스타일/로딩/3D tilt 확인 통과.

### 2026-05-13 — task-board-remaining-work

**Scope**: task-board의 남은 release/worker/webhard/operations 문서 작업과 Worker PIN brute-force, 외부웹하드 미분류 알림 dedupe 마무리.

**기능 / 운영 보강**:

- Worker PIN 로그인 rate limit을 `worker_access_logs` 기반으로 마무리했다. 동일 IP 최근 5분 실패 5회 이상이면 worker 조회 전 차단하고, 응답에 `reason='rate_limited'`와 `retry_after_seconds`를 포함한다.
- 잘못된 PIN과 IP whitelist 차단 응답에도 각각 `invalid_credentials`, `ip_blocked` reason을 추가했다.
- 외부웹하드 AutoContact 미분류 경로의 `webhard_classify_failed` admin notification은 같은 `folderPath` 기준 최근 1시간 중복을 막는다. `new_contact` 알림은 유지한다.
- `docs/release-readiness.md`에 로컬 배포 경로 확인 결과와 추가 pending deploy 항목을 반영했다.
- release QA runbook, 운영 모니터링 루틴, Worker hardening roadmap, 청구서 시스템 기획, 공개 회사사이트 시각 감사 문서를 추가했다.
- 2026-05-14에 Railway production `webhard-api` deployment `aa505252-66fb-4ee5-b87f-8013aa2ad0a3`로 backend 변경을 배포했다. 첫 수동 배포 실패 원인은 `webhard-api` 하위에서 `railway up`을 실행한 rootDirectory mismatch였고, repo root에서 재실행해 해결했다.

**검증**: Worker PIN brute-force/whitelist + AutoContactService Jest 79개, backend `npx tsc --noEmit`, `pnpm build`, Railway migration status, production health, `git diff --check` 통과.

### 2026-05-13 — worker-notification-contact-highlight

**Scope**: Worker 새 문의 알림 클릭 후 대상 문의 카드 강조 표시.

**기능 / 계약 보강**:

- Worker 새 문의 알림을 클릭하면 기존처럼 대상 탭/필터로 이동하고 해당 문의 카드로 스크롤한 뒤, 카드 루트에 `border-brand`/`ring-brand`/`bg-brand-light` 강조 표시를 잠시 적용한다.
- 강조 상태는 알림 클릭으로만 설정되며 일정 시간 뒤 자동 해제된다. 알림 목록에 남아 있는 문의 카드의 `bg-error` 빨간점 표시 계약은 유지한다.
- `OfficeContactCard`와 `StaffContactCard`가 공통 `isNotificationHighlighted` prop으로 강조 표시를 렌더하도록 맞췄다.
- Worker 카드에서 사무실번호 또는 현장번호 하나만 있는 경우 `260513-F-001`처럼 번호만 표시하고 앞뒤 `/` 구분자를 숨긴다.
- 생성시간은 Worker 카드 오른쪽 버튼 그룹의 다운로드 아이콘 왼쪽에 배치하고 `26년 5월 12일 오전 10시 57분` 형식으로 표시해 사용자가 바로 확인할 수 있게 했다.
- Worker 카드의 기존 flex 헤더 구조는 유지하면서 오른쪽 생성시간/아이콘/펼치기 표시의 중심선을 가운데 제목 줄에 맞췄다.
- 같은 Worker 카드 파일의 기존 brand hex 버튼 클래스를 디자인 시스템 토큰으로 교체했다.

**검증**: Worker 알림 유틸/드롭다운/Office 카드/Staff 카드 Jest 35개, frontend `npx tsc --noEmit`, `git diff --check` 통과.

### 2026-05-12 — railway-webhard-pnpm-node20-fix

**Scope**: Railway `webhard-api` Docker build 실패 보정.

**버그 수정 / 운영 보강**:

- `webhard-api/Dockerfile`의 `corepack prepare pnpm@latest --activate`를 `pnpm@10.23.0`으로 고정했다.
- Railway Node 20 이미지에서 pnpm 11이 설치되어 `node:sqlite` 내장 모듈 오류로 `pnpm install --frozen-lockfile` 단계가 실패하던 원인을 제거했다.
- `docs/guides/railway-deploy.md`에 pnpm 11/Node 20 호환성 장애 대응 항목을 추가했다.

**검증**: `webhard-api` `npx pnpm@10.23.0 --version`, `npx tsc --noEmit`, `git diff --check` 통과. 로컬 Docker Desktop 데몬이 꺼져 있어 `docker build`는 미실행.

### 2026-05-12 — worker-new-contact-realtime-notifications

**Scope**: Worker 새 문의 알림, 외부웹하드 자동문의 실시간 이벤트, batch 자동문의 생성 속도 개선.

**기능 / 계약 보강**:

- Worker 대시보드 헤더의 `납품관리` 왼쪽에 새 문의 알림 드롭다운을 추가했다.
- `contact:created` 이벤트를 수신하면 알림 목록에 즉시 추가하고 Worker process board 쿼리를 바로 무효화해 새 문의가 새로고침 없이 반영되도록 했다.
- 알림 항목 클릭 시 문의의 `source`/`inquiry_type`/`process_stage`에 따라 사무실/현장 탭과 하위 필터를 선택하고 해당 문의 카드로 스크롤한다. 미확인 알림은 빨간 애니메이션 점으로 표시한다.
- 새 문의 알림 목록은 브라우저 storage에 보존되어 새로고침 후에도 유지된다. 알림 항목 클릭 또는 `모두 확인`은 확인한 알림을 제거하고, `비우기`는 전체 목록을 초기화한다.
- 새 문의 알림에 남아 있는 문의 카드는 동일한 `bg-error` 빨간점을 표시한다. 기존 미분류/접수 카드의 빨간점도 같은 색 토큰을 사용한다.
- 새 문의 알림 드롭다운의 내부 여백과 viewport collision 여백을 키워 모바일/작은 화면에서 상하좌우 간격을 넓혔다.
- 외부웹하드 AutoContact 신규 생성 경로가 일반 문의 생성과 동일하게 admin/worker 룸에 `contact:created` 이벤트를 발행한다.
- `FilesService.batchTriggerAutoContact`는 폴더 경로와 업체명 해석을 캐시하고 서로 다른 파일의 자동문의 생성을 제한 병렬로 시작한다. 동일 업체+파일명 그룹은 중복 문의 방지를 위해 순차 처리한다.

**검증**: Worker 알림 유틸/컴포넌트 Jest, AutoContactService + FilesService batch 자동문의 Jest, frontend/backend `tsc --noEmit` 통과.

### 2026-05-12 — worker-inquiry-download-latest-number

**Scope**: Worker 문의 카드 다운로드 버튼의 최신 도면 선택과 다운로드 파일명 작업번호 prefix 보정.

**버그 수정 / 계약 보강**:

- Worker 문의 카드의 다운로드 버튼이 현재 공정 기준 리비전이 아니라 마지막으로 업로드된 DrawingRevision을 다운로드하도록 `latest-drawing-url` 경로를 보정했다.
- DrawingRevision이 없을 때는 기존 원본 도면(`contact.drawingFileUrl`) fallback을 유지하되, fallback 파일명도 동일한 작업번호 prefix 규칙을 적용한다.
- 다운로드/WebhardFile 파일명 prefix는 `workNumber`가 있으면 공정 단계와 무관하게 현장작업번호(F)를 우선 사용하고, 없을 때만 사무실작업번호(O)를 사용한다.
- 이미 `[O]` 또는 `[F]` prefix가 붙은 파일명은 기존 prefix를 제거한 뒤 선택된 작업번호 하나만 붙여 `[F] [O] 파일명` 같은 중복 prefix가 생기지 않게 했다.

**검증**: Worker download filename Jest, Worker 카드 Jest, ContactsController latest drawing URL Jest, inquiry filename util Jest, DrawingRevision/ContactsService 다운로드 prefix Jest, AutoContactService prefix Jest, frontend/backend `tsc --noEmit`, `git diff --check` 통과.

### 2026-05-12 — integration-laser-completions

**Scope**: 레이저네스팅프로그램이 `workNumber`만으로 레이저 전용 문의를 완료 처리하는 외부 연동 API 추가.

**기능 / 계약 보강**:

- `POST /api/v1/integration/laser-completions`를 추가했다. 요청 `workNumbers`는 trim 후 중복 제거하고, 각 항목을 독립 처리한다.
- Contact 없음은 `not_found`, `inquiryType != laser_cutting`은 `not_laser_only`, 이미 `status=completed` + `processStage=null`은 `already_completed`로 반환한다.
- 레이저 전용 문의는 기존 `completeLaserOnlyContact`를 재사용해 `status=completed`, `processStage=null`, 타임라인, socket/event emit, 문의 폴더 완료 이동 정책을 유지한다.
- 항목별 내부 실패는 `failed`로 기록하고 나머지 항목 처리를 계속한다. `message`는 완료 타임라인 note로 전달된다.
- 새 endpoint는 기존 외부 연동 API와 동일하게 `ApiKeyGuard` 인증을 사용한다.

**검증**: `webhard-api` laser-completions service/controller Jest 통과.

### 2026-05-12 — delivery-proof-webhard-dashboard

**Scope**: Worker 납품완료 증빙 사진 저장 위치와 업체 대시보드 표시 보정.

**버그 수정 / 계약 보강**:

- Worker 납품완료 사진 업로드 결과가 Contact URL에만 남고 문의 폴더 WebhardFile로 등록되지 않던 경로를 보정했다.
- `batch-start-delivery`가 증빙 파일 메타데이터를 받아 납품 완료 시각(KST) 기준 `납품완료_YYYYMMDD_HHmmss.ext` 이름으로 해당 문의 폴더에 WebhardFile을 생성한다.
- 납품 완료 후 문의 폴더를 `문의/완료/` 하위로 정규화하고, 생성된 증빙 파일에 `file:created` realtime 이벤트를 발행한다.
- 업체 대시보드 Contact 타입과 revalidate 경로에 납품증빙 필드를 포함해 납품 완료 카드에서 증빙 사진이 표시되도록 했다.

**검증**: ContactsService 납품증빙 웹하드 동기화 Jest, delivery proof server action Jest, 업체 대시보드 카드 증빙 사진 Jest 통과.

### 2026-05-11 — worker-inquiry-webhard-feedback

**Scope**: Worker 추가 도면 업로드 후 타임라인/웹하드 즉시 반영, 문의 폴더명 번호 전용 정책, Worker/업체 문의 카드 웹하드 이동, Worker 문의 카드 메타 표시와 완료 폴더 위치 보정.

**버그 수정 / 계약 보강**:

- Worker 타임라인 조회 server action의 60초 revalidate 캐시를 제거해 추가 도면 업로드 직후 refetch가 새 DrawingRevision을 즉시 받도록 했다.
- `WorkerDrawingUpload` 성공 후 contact timeline/detail/list, process board, webhard files/folders/badge/new-files 캐시를 함께 무효화한다.
- `DrawingRevisionService.syncRevisionToWebhard`가 추가 도면 WebhardFile 생성 직후 대상 폴더에 `file:created` realtime 이벤트를 emit한다.
- 문의 폴더명은 업체명/문의명/파일명 없이 번호만 사용한다. 실제 폴더명은 `{O}`, `{F}`, `{O}_{F}`이고, Worker 카드와 웹하드 목록/트리/검색/브레드크럼 UI는 `O /`, `/ F`, `O / F`로 표시한다.
- Worker 카드의 생성 시간은 상단 공정/문의번호 줄에서 제거하고 웹하드 경로 줄 옆에 `생성시간 : ...`으로 표시한다. 경로가 남은 폭을 모두 차지하지 않게 해 생성 시간이 카드 오른쪽 끝으로 밀리지 않는다.
- 납품 완료 시 문의 폴더는 업체 루트 `완료/`가 아니라 `문의/완료/` 하위로 이동한다. `문의/완료/`가 없으면 lazy 생성하고, 기존 루트 `완료/` 하위 legacy 문의 폴더도 `문의/완료/`로 재배치한다.
- Worker 카드의 파일 저장 위치와 컨텍스트 메뉴 `웹하드에서 열기`는 Contact의 최초 업로드 폴더가 아니라 최신 DrawingRevision 파일의 현재 `folderId/path`를 우선 사용한다. 문의 폴더가 확보되면 `contact.webhardFolderId`도 inquiry 폴더 id로 동기화한다.
- 업체 대시보드 문의 카드에 `웹하드` 버튼을 추가했다. 버튼은 메모 버튼 왼쪽에 배치되며, Contact DTO의 `webhard_folder_id`/`webhard_file_id`로 `/webhard?folderId=...&fileId=...` 경로를 연다.
- 업체 대시보드가 사용하는 `/contacts/by-company` 응답도 Worker 목록과 동일하게 최신 DrawingRevision 파일의 현재 `folderId/path`를 우선 사용한다. 최신 파일 연결이 비어 있으면 `contactId + folderKind='inquiry'` 폴더를 우선해, 기존 `Contact.webhardFolderId`가 업체 루트로 남은 문의도 버튼 클릭 시 해당 문의 폴더로 이동한다.

**검증**: Worker upload/card/timeline action Jest, 업체 대시보드 웹하드 버튼 Jest, ContactsService by-company 문의 폴더 응답 Jest, inquiry filename/folders/drawing revision/contact-folder/files/migration Jest, frontend/backend `tsc --noEmit`, `git diff --check` 통과.

### 2026-05-11 — webhard-root-company-auto-contact

**Scope**: 테스트업체처럼 파일은 웹하드 업체 루트까지 들어왔지만 자동 문의가 생성되지 않던 backend 경로 보정.

**버그 수정 / 계약 보강**:

- `FilesService.resolveCompanyFolder`가 `parentId=null`인 최상위 폴더를 항상 업체가 아니라고 판단하던 분기를 보정했다.
- 최상위 폴더명이 등록 업체명 또는 승인된 `CompanyFolderAlias`와 매칭되면 AutoContact의 `companyName`으로 전달한다.
- `외부웹하드`, 올리기/내리기 전용, 의뢰/완료 등 구조 폴더는 기존처럼 자동 문의 대상에서 제외한다.
- 문의 생성 후 원본 도면을 문의 폴더로 이동하는 `ContactFolderSyncService`/`FoldersService.relocateContactFiles` 계약과, 문의 추가 도면 업로드를 해당 문의 폴더에 WebhardFile로 등록하는 `DrawingRevisionService` 계약을 함께 재검증했다.

**검증**: backend files service Jest, AutoContact/ContactFolderSync/Folders/DrawingRevision 관련 Jest, backend `tsc --noEmit` 통과.

### 2026-05-11 — webhard-forwarded-cookie-bytestring-fix

**Scope**: 서버 액션/프록시가 NestJS API로 쿠키를 전달할 때 한글 쿠키 값 때문에 `fetch` 헤더 생성이 실패하던 문제 보정.

**버그 수정 / 계약 보강**:

- `nestjsFetch`가 `next/headers`의 쿠키를 `Cookie` 헤더로 재조립할 때 한글 등 non-ASCII 값을 percent-encoding해 Node `fetch`의 ByteString 검증을 통과하도록 했다.
- 웹하드 프록시도 요청 원본 쿠키를 전달하기 전에 동일한 Cookie 헤더 sanitizing을 적용한다.
- CSRF 토큰 추출은 원본 쿠키 문자열에서 수행해 기존 double-submit cookie 계약을 유지한다.
- 폴더 삭제처럼 server action이 NestJS API를 호출하는 경로에서 `Cannot convert argument to a ByteString...` 오류가 삭제 요청 전 단계에서 발생하지 않도록 회귀 테스트를 추가했다.

**검증**: `nestjsFetch` Cookie ByteString Jest, webhard proxy header Jest, webhard selection/main contract Jest, design static gate 통과.

### 2026-05-11 — webhard-click-selection-open-contract

**Scope**: 웹하드 메인 목록의 파일/폴더 클릭 동작을 단일 클릭 선택, 더블클릭 실행으로 통일.

**버그 수정 / 계약 보강**:

- 메인 목록 폴더의 단일 클릭은 더 이상 폴더로 진입하지 않고 폴더 선택만 수행한다.
- 메인 목록 폴더의 더블클릭은 기존 폴더 진입 동작을 수행한다.
- 파일은 기존처럼 단일 클릭 선택, 더블클릭 다운로드 동작을 유지한다.
- 이미 파일/폴더가 선택된 상태에서 다른 파일이나 폴더를 단일 클릭하면 기존 선택을 교체하지 않고 선택에 추가한다.
- 폴더 선택 전용 `selectFolder` store action을 추가해 폴더 단일 선택 시 파일 선택과 마지막 파일 클릭 인덱스를 정리한다.

**검증**: webhard selection store/FolderItem/main contract Jest, design static gate, frontend `tsc --noEmit` 통과.

### 2026-05-11 — webhard-session-expired-login-redirect

**Scope**: 장시간 미사용으로 웹하드 세션이 만료된 상태에서 기존 화면이 빈 폴더처럼 보이던 UX 보정.

**버그 수정 / 계약 보강**:

- 웹하드 파일/폴더 목록 API가 401/419를 반환하면 일반 빈 목록으로 처리하지 않고 `/login`으로 리다이렉트한다.
- `fetchWebhardFiles`와 웹하드 폴더/새파일 쿼리는 인증 만료 응답을 `WebhardApiError`로 보존하고, 인증 오류에 대해서는 React Query retry를 반복하지 않는다.
- 기존 `업로드된 파일이 없습니다` 문구는 실제 인증된 빈 폴더일 때만 표시된다.

**검증**: webhard auth error/empty state Jest, webhard main contract Jest, design static gate, frontend `tsc --noEmit` 통과.

### 2026-05-11 — webhard-folder-metadata-sort-badge-followup

**Scope**: 웹하드 QA 후속 피드백으로 확인된 폴더 이동 후 뱃지 합산, 폴더 목록 메타데이터, 파일/폴더 정렬, 뱃지 숫자 정렬 보정.

**버그 수정 / 계약 보강**:

- 폴더 drag/drop 이동 성공 및 폴더 realtime 이벤트가 `queryKeys.webhard.badgeCounts()` active cache까지 무효화하도록 보정했다. 하위 미다운로드 파일이 있는 폴더를 다른 폴더로 옮기면 대상/상위 폴더 뱃지가 서버 집계 기준으로 다시 합산된다.
- `GET /folders`와 `GET /folders/children` 응답에 `latest_file_created_at`, `latest_file_uploader_display_name`을 추가했다. 값은 해당 폴더와 모든 하위 폴더 파일 중 최신 파일 기준이며, 파일이 없으면 프론트 표시 날짜는 폴더 `created_at`으로 fallback한다.
- 메인 목록의 폴더 행도 업로드날짜/업로더 컬럼을 표시하고, 파일명/업로드날짜/업로더 정렬을 파일과 폴더에 동일하게 적용한다.
- 폴더 행의 업로드날짜/업로더 텍스트는 파일 행의 메타 텍스트 스타일과 동일한 크기/색상으로 렌더링한다.
- 숫자 뱃지는 한 자리 원형에서도 고정 폭/높이와 `padding: 0`을 사용해 숫자가 원 중앙에 오도록 보정했다.

**검증**: frontend 웹하드 contract/cache/sort/FolderItem/Badge Jest, backend folders service Jest, frontend/backend `tsc --noEmit` 통과.

### 2026-05-11 — webhard-qa-badge-rename-hover-followup

**Scope**: 웹하드 QA 3차 피드백으로 확인된 뱃지 parent propagation, hover preview, DXF preview download, rename rollback, 업체 폴더 이동 권한 보정.

**버그 수정 / 계약 보강**:

- 미다운로드 뱃지 `folderCounts` 전파가 업체 scoped 조회에서 legacy `companyId=null` bridge folder를 통과하도록 보정했다. 직접 file count는 세션/요청 `companyId`로 제한하고, 폴더 parent propagation만 동일 업체 폴더와 legacy null 폴더를 함께 사용한다.
- 파일 hover preview를 제거했다. 미리보기는 우클릭 메뉴의 "미리보기" 액션에서만 열리고, DXF preview modal 안에는 "원본 크기" 옆 다운로드 버튼을 추가했다.
- 파일 rename API가 `name`과 `originalName`을 함께 갱신하도록 보정해 refetch/realtime 이후 파일명이 원래 값으로 되돌아가지 않게 했다.
- 업체 사용자의 폴더 이동을 프론트와 백엔드 모두에서 차단했다. 업체 화면은 폴더 drag/drop과 폴더 context menu를 열지 않고, API는 company session의 `PATCH /folders/:id/move`를 403으로 거부한다.

**검증**: frontend 웹하드 contract/file item/DXF modal Jest, backend badge/files/folders service Jest, frontend/backend `tsc --noEmit` 통과.

### 2026-05-11 — webhard-qa-permission-download-rename-followup

**Scope**: 웹하드 QA 2차 피드백으로 확인된 업체 폴더 가시성, 권한 메뉴, 다운로드/미리보기 분리, rename, 폴더 이동 오류 보정.

**버그 수정 / 계약 보강**:

- 관리자가 업체 폴더 아래 child folder를 만들 때 `companyId`를 명시하지 않아도 부모 폴더의 `companyId`를 상속한다. 이미 생성된 legacy `companyId=null` child도 업체 부모 아래에서는 조회 가능하게 해 새로고침 후에도 업체 사용자에게 보이도록 했다.
- 업체 사용자는 폴더 우클릭 메뉴를 열 수 없고, 파일/상단/행 삭제 버튼도 보이지 않는다. 업체 파일 메뉴는 다운로드, 이름 수정, 이동, 공유 링크 생성, 미리보기만 노출한다.
- 파일 더블클릭과 다운로드 메뉴는 다운로드만 수행한다. DXF 미리보기는 우클릭 메뉴의 별도 "미리보기" 액션으로 분리했다.
- 파일 rename 프론트 payload를 backend 계약인 `{ name }`으로 수정했다.
- 폴더 rename/move descendant path SQL에서 `left(text, bigint)`가 발생하지 않도록 index parameter를 `integer`로 cast했다.

**검증**: 관련 웹하드 component/contract/rename/API route/static gate Jest, backend folder path/folders service Jest, frontend/backend `tsc --noEmit` 통과.

### 2026-05-11 — webhard-dev-rate-limit-bypass

**Scope**: 로컬/테스트 개발 환경의 웹하드 API rate limit 비활성화.

**운영 계약 보정**:

- `checkWebhardRateLimit()`는 `NODE_ENV !== 'production'`이면 Upstash 설정이 있어도 요청을 통과시킨다. 개발 중 업로드 후 `/files/badge-counts` refetch가 IP당 100회/분 제한에 걸려 429를 만드는 상태를 막는다.
- 프로덕션에서는 기존 웹하드 rate limit을 유지한다.
- Upstash `reset` 값은 이미 Unix timestamp(ms)이므로 `lockedUntil`에 그대로 사용한다. 이중으로 `Date.now()`를 더해 2082년 같은 비정상 잠금 시각이 찍히던 계산을 바로잡았다.

**검증**: `webhard-rate-limit.test.ts`, 기존 `rateLimit.test.ts` 통과. `npx tsc --noEmit`은 현재 별도 웹하드 테스트 타입 오류(`canOpenWebhardFolderContextMenu` export, `WebhardContextMenu` props mismatch)로 실패.

### 2026-05-11 — webhard-qa-interaction-fixes

**Scope**: 웹하드 QA 피드백으로 확인된 렌더링, 실시간 이동, 권한 안내, DXF 프리뷰, 폴더 조작 UX 보정.

**버그 수정 / 계약 보강**:

- 메인 웹하드 목록은 파일과 폴더 children query가 모두 준비된 뒤 한 번에 렌더링한다. 파일만 먼저 보이고 폴더가 뒤늦게 나타나는 상태를 loading gate 계약으로 막았다.
- 파일 batch move는 출발 폴더와 대상 폴더 모두에 `file:moved` realtime event를 emit해 다른 페이지의 목록도 새로고침 없이 갱신되게 했다.
- 업체 사용자는 파일/폴더 삭제 API를 호출하기 전에 "관리자에게 삭제 요청해주세요" 안내를 받는다. 폴더 생성은 관리자만 가능하며 업체 화면에서는 생성 진입점을 막는다.
- `/api/webhard/preview-dxf` Next route를 추가해 DXF 미리보기/더블클릭 경로가 404로 끝나지 않게 했다.
- 다운로드 프록시는 한글 파일명의 `Content-Disposition`을 ByteString 안전 값으로 변환해 `NextResponse` 헤더 생성 오류를 방지한다.
- 메인 영역 폴더에 드래그 이동과 우클릭 메뉴(이름변경/삭제)를 추가했다.

**검증**: 웹하드 main contract/API route/proxy header Jest, `WebhardFolderItem`/`WebhardContextMenu` 단위 테스트, backend files/folders service Jest, frontend/backend `tsc --noEmit`, 디자인 static gate 통과.

### 2026-05-10 — design-system-changed-file-static-gate

**Scope**: 관리자/웹하드/스타일 우선 범위의 디자인시스템 static gate 추가.

**품질 게이트**:

- `src/__tests__/lib/styles/static-gate.test.ts`를 추가해 changed/untracked 파일 중 `src/app/webhard`, `src/app/(admin)`, `src/lib/styles` 범위에 `dark:` 또는 raw brand hex가 남으면 실패하게 했다.
- 기존 전체 코드의 legacy `dark:`/raw brand hex는 즉시 0건 목표로 삼지 않고 `design-system.md` baseline debt로 문서화했다.
- 현재 수정된 웹하드 파일(`FolderTree`, `WebhardMain`, `WebhardSidebar`)의 raw brand hex와 prompt `dark:` 클래스를 semantic token으로 치환했다.

**검증**: `static-gate.test.ts`, `tokens|styles` Jest, frontend `tsc --noEmit`, static `rg`, local browser smoke 통과. Full-scope `rg`는 legacy baseline debt를 계속 출력한다.

### 2026-05-10 — contact-form-submission-split

**Scope**: 공개 문의 `ContactForm`의 제출 payload/검증/단계 경계를 분리.

**구조 개선**:

- `contactSubmission` helper가 최종 제출 `FormData` 작성, reference file 첫 번째 drawing 승격, stale reference 차단, portfolio reference payload 생성을 소유한다.
- 방문 수령, 택배/퀵 수령, 납품업체 필수값 최종 검증을 `validateContactSubmitState` 계약으로 고정했다.
- `useContactSubmitAction` hook을 통해 `submitContact` server action 호출 경계를 분리했다.
- company info, file upload, visit booking, estimate method 단계 wrapper와 `CONTACT_FORM_SECTIONS` 순서 계약을 추가했다.

**검증**: `audit17-contact-submission.test.ts`, 루트 contact 관련 Jest(`.worktrees` 제외), frontend `tsc --noEmit` 통과. playbook의 넓은 `contact|ContactForm` 패턴은 기존 `.worktrees/task-25-webhard-fix` 중복 React 테스트까지 실행되어 invalid hook call로 실패하므로 루트 테스트에 `--testPathIgnorePatterns=".worktrees"`를 적용했다.

### 2026-05-10 — webhard-backend-use-case-service-split

**Scope**: 거대한 웹하드 backend service에서 경로 갱신과 배지 집계 use-case를 전용 서비스로 분리.

**구조 개선**:

- `FolderPathService`를 추가해 folder materialized path 계산, root row path update, descendant slash-boundary prefix 치환을 소유하게 했다.
- `BadgeCountsService`를 추가해 미다운로드 total count, folder별 direct count, parent propagation, company scope filtering을 소유하게 했다.
- `FoldersService.computeFolderPath`/`updateDescendantPaths`와 `FilesService.getBadgeCounts` 공개 메서드는 유지하고 내부 위임만 바꿔 controller 및 기존 테스트 계약을 보존했다.
- `FoldersModule`/`FilesModule` provider/export에 신규 use-case 서비스를 등록했다.

**검증**: `folder-path.service.spec.ts`, `badge-counts.service.spec.ts`, `folders.service.spec.ts`, `files.service.spec.ts`, backend `tsc --noEmit` 통과.

### 2026-05-10 — nestjs-server-client-domain-split

**Scope**: `src/lib/api/nestjs-server-client.ts`를 compatibility barrel로 축소하고 NestJS server client를 도메인별 파일로 분리.

**구조 개선**:

- 공통 `nestjsFetch`와 cookie/API key/auth/cache/retry 계약을 `src/lib/api/nestjs/core.client.ts`로 이동했다.
- 웹하드, 문의/도면, 업체, 운영성 API helper를 각각 `webhard.client.ts`, `contacts.client.ts`, `companies.client.ts`, `operations.client.ts`로 분리했다.
- 기존 import 경로 `@/lib/api/nestjs-server-client`는 동일 public export를 재수출해 호출부 migration 없이 유지한다.
- 대표 도메인 함수의 endpoint/method/body/auth/cache/error shape를 테스트로 고정했다.

**검증**: `nestjs-domain-clients.test.ts`, `api|client|nestjs-server-client` Jest, frontend `tsc --noEmit` 통과.

### 2026-05-10 — webhard-main-query-hook-split

**Scope**: `WebhardMain.tsx`의 서버 데이터 조회와 업로드 후 문의 연결 프롬프트를 훅 단위로 분리하고 공개 동작을 고정.

**구조 개선**:

- 파일 목록/새 파일 무한 스크롤 조회를 `useWebhardFilesQuery`로 분리했다. 일반 파일 목록, 새 파일 목록, folder page query key는 기존 `queryKeys.webhard.*` 계약을 유지한다.
- 폴더 children/breadcrumb/하위 폴더 prefetch를 `useWebhardFoldersQuery`로 분리했다.
- 업로드 완료 후 문의 연결 프롬프트와 업체명 조회를 `useWebhardUploadPrompt`로 분리했다.
- `webhardMainContracts`에 drag payload, context menu selected-count, virtual list threshold(`> 50`) 정책을 명시하고 테스트로 고정했다.

**검증**: `audit14-webhard-main-contracts.test.ts`, `src/app/webhard` Jest, frontend `tsc --noEmit` 통과.

### 2026-05-10 — webhard-frontend-stability-gates

**Scope**: 웹하드 프론트의 raw React Query key, 중복 local virtual list, reload 기반 복구, silent catch 제거.

**프론트 안정화**:

- 웹하드 production code에서 raw `webhard` React Query key literal을 제거하고 `queryKeys.webhard.*` factory로 통일했다.
- 실제 화면에서 쓰지 않는 `src/app/webhard/components/VirtualFileList.tsx`를 삭제하고, 웹하드 화면은 `VirtualizedFileList`를 단일 활성 리스트로 유지한다. 공용 `src/lib/webhard-ui/components/VirtualFileList.tsx`는 라이브러리 export로 남긴다.
- ErrorBoundary/WebhardErrorBoundary/offline/socket reconnect 흐름에서 `window.location.reload()`를 제거했다. 웹하드는 query invalidation + boundary reset, socket은 명시 재연결로 복구한다.
- 업체명 조회 실패 silent catch를 logger context가 남는 warn 경로로 전환했다.

**검증**: `webhard-frontend-stability.test.ts`, `queryKeys.test.ts`, `src/app/webhard` Jest, frontend `tsc --noEmit`, static `rg` 3종 no matches.

### 2026-05-10 — webhard-folder-path-prefix-update

**Scope**: 폴더 rename/move 시 descendant materialized path 갱신을 재귀 SELECT/UPDATE에서 transaction 내 set-based prefix 치환으로 전환.

**성능/정합성 변경**:

- `renameFolder`와 `moveFolder`는 루트 폴더 갱신과 descendant path prefix 치환을 같은 transaction에서 수행한다.
- descendant 갱신은 `left(path, oldPath.length) = oldPath`와 slash-boundary 조건을 함께 적용해 `/상위/기존` 이동 시 `/상위/기존형제` 같은 sibling branch를 오염시키지 않는다.
- prefix 치환 실패 시 cache invalidation과 realtime event emit을 실행하지 않아 클라이언트가 실패한 상태를 성공으로 관측하지 않는다.
- 문의 폴더 rename/완료 이동 helper도 동일한 prefix 치환 helper를 사용한다. R2 object key인 `WebhardFile.path`는 기존 정책대로 변경하지 않는다.

**검증**: `folders.service.spec.ts`, backend `tsc --noEmit` 통과.

### 2026-05-10 — external-webhard-candidate-bulk-counts

**Scope**: 외부웹하드 미매칭 후보와 빈 husk 후보 계산의 root별 반복 쿼리 제거.

**성능/계약 변경**:

- `GET /folders/external-unmatched`는 외부 subtree 관계를 한 번에 조회하고, 파일/Contact count를 bulk groupBy로 계산한다. 외부 root 수만큼 `count` 쿼리가 선형 증가하지 않는다.
- `GET /folders/external-husk`는 depth=2 root의 직접 자식/직접 파일 존재 여부를 bulk 조회한다. 후보 기준은 기존과 동일하게 전체 subtree가 아니라 직접 자식 0 + 직접 파일 0이다.
- 기존 `contactCount`/`fileCount` 응답 의미는 유지한다. 미매칭 후보의 count는 전체 subtree 누적이고, husk 후보 여부는 cleanup 실행 전 lightweight 직접 조건으로만 판단한다.

**검증**: `folders.service.cleanup-husk.spec.ts`, `folders.service.spec.ts`, backend `tsc --noEmit` 통과.

### 2026-05-10 — webhard-badge-scope-invalidation

**Scope**: 웹하드 미다운로드 배지 집계와 React Query 캐시 범위를 admin/company 및 folderCounts 옵션별로 분리.

**버그 수정 / 계약 보강**:

- `GET /files/badge-counts?companyId=` 관리자 조회가 파일 count뿐 아니라 폴더 트리 전파 계산도 같은 `companyId`로 제한한다.
- 프론트 배지 쿼리 키가 `companyId`와 `includeFolderCounts`를 포함해 admin/company 화면의 배지 캐시가 섞이지 않도록 했다.
- 다운로드 확인/업로드/삭제/이동 후 배지는 `queryKeys.webhard.badgeCounts()` prefix invalidation으로 active scoped 캐시를 갱신하고, 조상 폴더를 모르는 부분 optimistic 보정은 제거했다.
- 배치 다운로드 후 `mark-downloaded` 실패를 조용히 무시하지 않고 UI 캐시를 서버 상태로 되돌린 뒤 오류를 표시한다.

**검증**: `files.service.spec.ts`, `folders.service.spec.ts`, `queryKeys.test.ts`, `src/app/webhard` Jest, backend/frontend `tsc --noEmit` 통과.

### 2026-05-10 — webhard-lazy-folder-loading

**Scope**: `/folders` 기본 조회와 웹하드 화면 폴더 탐색을 전체 트리 조회에서 root/children lazy loading 계약으로 전환.

**성능/계약 변경**:

- `GET /folders`는 `parentId` 미지정 시 루트 폴더만 반환하고, `parentId` 지정 시 해당 폴더의 직계 자식만 반환한다.
- 전체 폴더 목록이 필요한 호환 경로는 `includeAll=true`를 명시하고, 명시 전체 트리 조회는 `/folders/tree`를 사용한다.
- `WebhardMain`은 현재 폴더의 children만 조회하고, breadcrumb는 `/folders/:id/ancestors`의 `ancestors + current` 응답으로 구성한다.
- sidebar 폴더 트리는 root를 먼저 조회한 뒤 펼친 parent의 children만 불러오며, `has_children`으로 미로드 하위 폴더 표시를 유지한다.

**검증**: `folders.service.spec.ts`, `audit07-folder-loading.test.ts` 통과.

### 2026-05-10 — webhard-performance-fixtures

**Scope**: 웹하드 성능 개선 PR을 위한 대량 fixture 기반과 opt-in 성능 테스트 게이트 추가.

**테스트 기반**:

- `buildWebhardFolderTreeFixture`, `buildWebhardFileFixture`로 deterministic 10k folders / 100k files fixture 생성 기반 추가.
- `RUN_PERF_TESTS=1` opt-in gate로 heavy fixture 테스트를 기본 CI에서 제외.
- `buildWebhardFixtureCleanupWhere`는 `perf-` prefix만 허용해 cleanup 범위를 안전하게 제한.

**검증**: `folders.service.spec.ts`, `files.service.spec.ts`, `$env:RUN_PERF_TESTS='1'; pnpm test -- folders --runInBand`, backend `tsc --noEmit` 통과.

### 2026-05-10 — webhard-pipeline-observability

**Scope**: 웹하드 업로드 라우팅과 자동문의 생성 흐름의 실패/skip reason을 관리자 backlog로 조회 가능하게 보강.

**신규 동작 / 진단 보강**:

- **Pipeline event 저장**: 라우팅 실패와 자동문의 skip을 `sync_logs.metadata.auditKind='webhard_pipeline'` 이벤트로 구조화한다. DB migration 없이 기존 `sync_logs`를 재사용한다.
- **관리자 backlog 조회**: `GET /integration/sync-logs/pipeline-backlog`가 최근 `routing_failed`, `auto_contact_excluded_folder`, `company_folder_unresolved` 항목을 sanitized shape로 반환한다.
- **관리자 대시보드 표시**: `/admin/integration` 대시보드에서 최근 웹하드 파이프라인 backlog를 표시한다.
- **민감정보 차단**: trace/context 저장 및 응답에서 presigned URL, token, raw API key, secret, password, authorization, cookie 계열 필드를 제외한다.

**검증**: `sync-log`, `files.service.spec.ts`, `auto-contact.service.spec.ts`, `integration-pipeline-backlog-api.test.ts`, backend/frontend `tsc --noEmit` 통과.

### 2026-05-10 — webhard-monitoring-storage-scope

**Scope**: 관리자 웹하드 성능 화면의 24시간 활동 집계와 업체 저장공간 breakdown 권한 범위를 실제 백엔드 계약에 맞게 보정.

**버그 수정 / 계약 보강**:

- **ActivityLogs 날짜 필터 적용**: `GET /activity-logs`가 `startDate`, `endDate` query를 받아 `createdAt` range로 필터링한다. 잘못된 날짜 문자열은 400으로 거부한다.
- **성능 route 24시간 집계 보강**: `/api/webhard/performance`가 ActivityLogs에 24시간 `startDate`를 전달하고, 응답에 오래된 로그가 섞여도 집계에서 제외한다.
- **Storage breakdown 업체 격리**: 업체 사용자의 `/storage/breakdown`은 자기 `companyId` 파일만 집계하며 `companyId=null` 관리자/null 파일을 포함하지 않는다. 관리자는 기존처럼 전체 breakdown을 본다.

**검증**: `activity-logs` controller/service 테스트, `storage.service.spec.ts`, `webhard-performance-route.test.ts` 추가 및 targeted Jest 통과.

### 2026-05-10 — backup-api-permission-scope

**Scope**: NestJS 백업 API가 프론트 프록시에 의존하지 않고 자체적으로 관리자/백업 권한 경계를 보장하도록 수정.

**보안 변경**:

- **BackupAdminGuard 추가**: `BackupController`에 `ApiKeyGuard` 뒤에서 동작하는 백업 전용 guard를 적용. API key 인증이 `userType='admin'`을 주입하더라도 `apiKeyInfo`가 있으면 세션 관리자와 별도로 판정한다.
- **백업 스코프 분리**: `backup:read`, `backup:write`, `backup:execute` 권한을 endpoint별로 명시. API key-only 요청은 해당 스코프가 없으면 거부하고, company session은 백업 API 전체에서 거부한다.
- **NAS 경로 브라우징 보호**: `GET /backup/browse-directories`는 파일시스템 경로 정보를 노출할 수 있으므로 `backup:write` 또는 admin session으로 제한한다.

**검증**: `backup.controller.spec.ts`에 `PUT /backup/settings`, `POST /backup/execute` 권한 매트릭스 테스트 추가. `pnpm test -- backup --runInBand`, `npx tsc --noEmit` 통과.

### 2026-05-08 — webhard-unclassified-file-relocate

**Scope**: 웹하드 자동 생성 미분류 문의를 관리자/작업자가 칼선의뢰 또는 목형의뢰로 분류할 때, 문의 폴더만 생성되고 원본 파일이 남아 있던 문제를 수정.

**버그 수정**:

- **자동 문의 원본 파일 이동 후보 보강**: `relocateContactFiles` 가 기존 `DrawingRevision.webhardFileIds` 와 `companyId + inquiryNumber` 매칭에 더해 `Contact.drawingFileUrl` 에서 추출한 R2 key(`webhard_files.path`) 를 이동 후보로 포함한다.
- **기존 미분류 문의 회복**: 과거 자동 생성 시 `DrawingRevision.webhardFileIds` 가 비어 있고 파일에 문의번호가 태깅되지 않은 Contact 도, 분류 시점에 원본 웹하드 파일을 생성된 `문의/` 하위 문의 폴더로 이동한다.

**검증**: `folders.service.spec.ts` 에 원본 파일 경로 fallback 회귀 테스트 추가. `folders.service.spec.ts`, `contact-folder-sync.service.spec.ts`, `contacts.service.spec.ts`, backend `tsc --noEmit` 통과.

### 2026-05-08 — company-pending-login-message

**Scope**: 업체 등록 후 관리자 승인 전 로그인 시 잘못된 계정/비밀번호 오류로 보이던 안내를 승인 대기 안내로 수정.

**버그 수정**:

- **로그인 분기 순서 보정**: 등록 직후 업체는 `status='pending'`, `is_approved=false` 이므로 `status !== 'active'` 검사가 먼저 실행되면 일반 `invalid` 오류로 리다이렉트됐다. `is_approved=false` 검사를 먼저 수행해 `/login?error=pending_approval` 로 보낸다.
- **사용자 안내 문구 변경**: `pending_approval` 메시지를 "관리자 승인 대기 중입니다. 관리자에게 문의해주세요."로 표시한다.

**검증**: `src/__tests__/actions/auth-login.test.ts` 회귀 테스트 추가 및 targeted Jest 통과.

### 2026-05-08 — external-batch-auto-contact-observability

**Scope**: 외부웹하드 동기화 배치 업로드 후 파일은 업체 폴더에 저장되지만 자동 문의 생성이 조용히 누락될 수 있는 경로를 보정하고, 업로드/문의 생성 서버 로그를 추가.

**버그 수정 / 진단 보강**:

- **`batchConfirmUpload` 라우팅 후 AutoContact 메타데이터 보정**: 외부웹하드 husk folderId 가 업체 folderId 로 redirect 된 경우, 자동문의 배치 훅에 routed folder metadata 를 추가 조회해 전달한다. 기존에는 원본 folderMap 만 넘겨 routed folderId 를 찾지 못하면 배치 훅 내부에서 skip 될 수 있었다.
- **자동 생성 Contact `companyId` 저장**: `AutoContactService.createNewContact` 가 매칭된 Company id 또는 confirm 단계에서 전달된 companyId 를 `Contact.companyId` 에 함께 기록한다. 미가입 업체는 기존처럼 `companyId` 를 비워 둔다.
- **서버 로그 추가**: presigned URL 발급, 단일/배치 confirm 저장, AutoContact 훅 queue/dispatch/skip, 자동문의 detect/classify/company resolve/create/folder sync 단계에 파일명·folderId·companyId·분류 결과 로그를 남긴다. presigned URL/token 은 로그에 남기지 않는다.

**검증**: `files.service.spec.ts` 에 BC3 회귀 테스트 추가, `auto-contact.service.spec.ts` alias 매칭 companyId 저장 검증 추가.

### 2026-05-06 — company-password-reset-link

**Scope**: 거래처 비밀번호 찾기 흐름을 임시 비밀번호 즉시 변경 방식에서 reset-link 확정 방식으로 전환.

**신규 동작 / 보안 변경**:

- **Next.js `POST /api/auth/find-password`**: 임시 비밀번호 생성, local hash, `serverUpdateCompany`, `tempPassword` 응답을 제거. username/email 검증 후 NestJS `POST /api/v1/auth/password-reset/request` 로만 위임.
- **NestJS password reset API**: `POST /auth/password-reset/request` 는 계정 정보 일치 시 30분 TTL reset token 을 발급하고, `POST /auth/password-reset/confirm` 은 미사용·미만료 token 을 transaction 안에서 1회 사용 처리한 뒤 `companies.password_hash` 를 갱신.
- **DB**: `password_reset_tokens` 테이블 추가. raw token 은 저장하지 않고 SHA-256 hash 만 저장하며, 발급 시 기존 미사용 토큰은 무효화한다.
- **메일**: `MailService.sendPasswordResetLink` 추가. reset link 메일은 필수 전송으로 처리하며 SMTP 미설정/전송 실패 시 token 을 무효화하고 503 을 반환한다.
- **UI**: 로그인 모달 문구를 "재설정 링크"로 변경하고 `/reset-password?token=...` 페이지를 추가. 클라이언트/서버 모두 동일한 비밀번호 정책(8자 이상, 문자군 3종 이상)을 검증한다.

**불변 규칙**: API 응답과 로그에 raw token, reset link, 임시 비밀번호를 남기지 않는다. 기존 비밀번호는 reset link confirm 성공 전까지 유지한다.

**검증**: backend `password-reset.service.spec.ts`, `webhard-api` typecheck, Prisma schema validate 통과. frontend targeted typecheck 통과. frontend Jest/full root typecheck 는 기존 OneDrive ACL/Jest setup 환경 문제로 별도 이슈.

### 2026-04-30 — laser-only-folder-lifecycle (task 29)

**Scope**: laser_only 업체(대성목형 케이스)에서 외부웹하드 sync 누적 파일이 매핑 등록 후 정식 업체 폴더로 실제 이전되지 않고, contact 가 husk 를 계속 가리키며, 작업자 "레이저완료" 시 inquiry 폴더가 `완료/` 로 이동하지 않던 4가지 결함 통합 수정.

**버그 수정 / 신규 동작**:

- **Phase 1 — `runCascadeBackfill` 외부 root lookup 3-step fallback** (`webhard-api/src/companies/folder-alias.service.ts`): 기존 `path = '/외부웹하드/${folderName}'` 정확 매칭만 → 1차 path 매칭 → 2차 외부웹하드 root 자식 name 일치 (`folderName.trim()`) → 3차 `normalizeCompanyName` 정규화 매칭 fallback. 폴더명 변형(공백·괄호 차이)으로 silent skip 되던 매핑이 정상 migrate 되도록. depth=2 (`parentId = externalParent.id`) 보장으로 false-match 차단. 3차 `findMany` 에 `orderBy: { createdAt: 'asc' }` 로 다중 후보 결정성 확보.
- **Phase 2 — `ensureInquiryFolder` 가 contact.webhardFolderId 갱신** (`webhard-api/src/folders/folders.service.ts`): inquiry 폴더 ensure 직후 `syncContactWebhardFolderId` private 헬퍼로 갱신. 외부웹하드(`/외부웹하드/` prefix) 또는 null 가리킴 시만 정식 inquiry 폴더 id 로 갱신. 이미 정식 트리 가리키면 no-op (멱등). WORKER 페이지 "웹하드에서 열기" / 카드 path 표시가 실제 위치 반영.
- **Phase 3 — `completeLaserOnlyContact` 가 완료 폴더 이동 호출** (`webhard-api/src/contacts/contacts.service.ts`): 일반 delivery 와 동일하게 `moveInquiryFolderToCompleted(id)` 호출 추가. Best Effort try/catch + `logger.warn` (일반 delivery 와 동일 레벨로 운영 alert 룰 일관). 작업자 "레이저완료" 시 inquiry 폴더가 업체 루트 `완료/` 로 자동 이동.

**테스트**:

- E1~E5 (`runCascadeBackfill` 3-step fallback): path 매칭 / name fallback / 정규화 fallback / 모두 실패 / 외부웹하드 parent 미존재.
- F1~F4 (`ensureInquiryFolder` webhardFolderId 갱신): 외부 husk → 갱신 / 이미 정식 → no-op / null → 갱신 / 정식 외 폴더 → no-op.
- H1~H3 (`completeLaserOnlyContact`): 호출 검증 / Best Effort + warn 로깅 / no-op 케이스.

**불변 규칙**: R2 객체 키 불변 (모든 Phase). task 27 husk 정책 (husk 유지 + 신규 sync routing) 그대로. 일반 목형 문의 delivery 흐름 무영향.

**회복**: 배포 후 admin UI 의 외부웹하드 폴더 매핑 → [재마이그레이션] 1번 클릭. 외부 husk 자식 폴더/파일이 정식 업체 폴더로 이전 + inquiry 폴더 일괄 생성 + contact path 갱신.

**운영 진단 도구 (2026-05-01 추가)**:

- `webhard-api/scripts/task29-verify.ts` — laser_only 업체 root/husk/contact webhardFolderId 분포 read-only 진단. `--company`, `--verbose`, `--json` 옵션. 운영 DB 동등 잔재 확인 시 그대로 재사용 가능.
- `webhard-api/scripts/task29-phase2-trigger.ts` — Phase 2 syncContactWebhardFolderId 운영 mutation 시뮬레이션. dev DB 검증에서 husk → 정식 갱신 ALL PASS 4/4 확인.
- 실행: `ts-node` 권장 (tsx swc 는 emitDecoratorMetadata 미지원). 예: `npx ts-node --transpile-only=false scripts/task29-verify.ts --verbose`.

**Phase 4 의사결정 routine**: `claude.ai/code/routines/trig_01KiLTNeqQg3Bg9g2A2SwLfA` (2026-05-15 09:00 KST 1회 실행). 운영 모니터링 + Phase 4 GO/NO-GO 결정 + spec 갱신 자동화.

---

### 2026-04-30 — confirm-routing-consistency (task 28)

**Scope**: task 26 Phase 1.5 의 `tryRouteExternalUpload` 가 presigned-url 만 routing 하고 confirm 은 안 해서 R2 path / DB folder_id split-brain 발생. 두 confirm endpoint 에 동일 routing 적용.

**버그 수정**:

- **`confirmUpload`** (`webhard-api/src/files/files.service.ts:356`): dto.folderId 로 `tryRouteExternalUpload` 호출 → routed folderId/companyId 로 WebhardFile.create. 실패 시 try/catch + warn 로그 + 원본 fallback.
- **`batchConfirmUpload`** (`webhard-api/src/files/files.service.ts:444`): per-file routing 캐시 (Map<folderId, routed>) → 배치 내 동일 folderId 1회만 lookup. 실패 시 per-file fallback + warn 로그 (file index 포함).
- **emitToFolder / emitToFolderBatched / propagateUpdatedAt**: effective folderId 기준으로 자동 그룹화 (data.folderId 가 routed 값이라 별도 변경 불필요).

**테스트**:

- C1~C5 (`confirmUpload routing`): happy path / non-external pass-through / null folderId / routing throw fallback / emit folderId 일관성
- BC1, BC2 (`batchConfirmUpload routing`): 일부 file 만 routed / 1건 throw 시 per-file fallback

**불변 규칙**: task 25 F1~F5 (companyId 상속), task 26 R1~R5 (presigned-url routing), task 27 husk 정책 모두 그대로.

**회복**: 배포 후 admin UI 의 [재마이그레이션] 1번 클릭. 추가 SQL 불필요.

---

### 2026-04-30 — external-husk-cleanup-ui (task 27 Phase C)

**Scope**: task 27 Phase B 의 husk 유지 정책에 운영자 정리 경로를 분리. admin UI 패널에서 후보 조회 + 명시 정리.

**신규 동작**:

- **`GET /api/v1/folders/external-husk`** (AdminGuard): 정리 가능한 husk 후보 (depth=2 + companyId IS NULL + 자식·파일 0).
- **`DELETE /api/v1/folders/external-husk/:rootId`** (AdminGuard): 단일 husk cascade soft-delete. 안전 가드 (자식·파일 0 + companyId IS NULL + depth=2) 위반 시 400/422.
- **ExternalHusksPanel**: `/admin/integration/companies` 의 5번째 패널. 빈 husk 목록 + [정리] 버튼.

**테스트**:

- H1-H7: `getEmptyExternalHusks` (후보 필터) + `cleanupEmptyExternalHusk` (5가지 거절 케이스 + 1 정상 케이스).

**불변 규칙**:

- `cascadeBackfill` 응답 shape 무변경 (호환).
- companyVisibilityFilter (task 25) 그대로 — 회사 사용자에게 husk 노출 안 됨.

---

### 2026-04-30 — external-husk-policy (task 27 Phase B)

**Scope**: task 26 의 cascade soft-delete 가 task 26 Phase 1.5 routing 의 진입을 막는 회귀 정리. 외부 폴더 row 를 husk 로 유지하여 신규 동기화가 routing 으로 회사 폴더에 직행할 수 있게 함.

**버그 수정**:

- **migrate cascade soft-delete 제거** (`webhard-api/src/contacts/contact-folder-sync.service.ts:480-496`): step 7 (외부 폴더 cascade 삭제) 제거. 외부 폴더 row 를 husk 로 유지. 근거 — `tryRouteExternalUpload` 가 deletedAt=null folder 만 lookup. cascade delete 가 Electron sync 의 `ensureFolderPath` 호출을 막아 POST /files/presigned-url 실패 회귀 발생.

**API 변경 (호환)**:

- `POST /companies/folder-aliases` 응답 `backfill.deletedExternalFolders` 는 호환을 위해 유지하되 **항상 0**. 외부 husk 정리는 admin 명시 액션 (Phase C 도입 예정) 으로 분리.

**테스트**:

- M5 (`migrateExternalFolderTreeToCompany` cascade delete 검증) → husk 유지 검증으로 갱신.
- A8-1, A8-3, E2E-1 의 `deletedExternalFolders` 기대값 N>0 → 0 동기화.

**불변 규칙**: task 26 본문 그대로. R2 key 불변, 단일 진입점, alias 1건당 1 tx, 멱등성.

---

### 2026-04-30 — folder-alias hardening (task 26 follow-up)

**Scope**: task 25 시점 (`migrateExternalFolderTreeToCompany` 추가 전) 에 등록된 stuck alias (예: `대성목형(2265-1295)` 2026-04-27 등록건) 의 외부 폴더 트리가 회복되지 않는 문제 + admin UI 의 CSRF 토큰 누락으로 인한 silent 403 회귀 정리.

**버그 수정**:

- **CSRF 헤더 누락 → 403** (`src/app/(admin)/admin/integration/companies/_lib/folder-alias-api.ts` + `external-unmatched-api.ts`): `apiFetch` 헬퍼가 `x-csrf-token` 헤더를 부착하지 않아 매뉴얼 매핑 등록 / 승인 / 거절 / 삭제 모두 silent 403. webhard-api 는 글로벌 `CsrfGuard` 가 등록되어 있어 세션 기반 POST/PATCH/DELETE 는 모두 csrf 토큰 필수. `getCsrfToken()` 헬퍼 추가 + 모든 mutation 에 자동 부착. 신규 client fetch 헬퍼 작성 시 동일 패턴 강제.
- **`runCascadeBackfill` 외부 root lookup false-match 가능성**: 변경 전 `path: { startsWith: '/외부웹하드/' }` + `name: folderName` 매칭은 외부웹하드 트리 깊은 경로에 동명 폴더가 있으면 root 가 아닌 폴더를 잡아 `migrateExternalFolderTreeToCompany` 의 segments.length !== 2 검증에서 throw. 변경 후 `path: '/외부웹하드/{folderName}'` depth=2 정확 매칭으로 false-match 차단.

**API 변경**:

- **`POST /companies/folder-aliases` 응답 `backfill`** 에 `externalRootFound: boolean` 필드 추가. `false` 면 외부 root 미존재 (이름 불일치 또는 이미 정리됨) → migrate skip + 카운트 0. 운영자 UI 진단 신호로 사용.

**UI 추가**:

- **등록된 매핑 패널 [재마이그레이션] 버튼** (`RegisteredAliasesPanel.tsx`): 이미 approved 인 alias 에 대해 `createApprovedAlias` 를 재호출 (idempotent upsert + 무조건 cascade) → 폴더 트리 이전을 다시 시도. task 25 시점 stuck alias 회복 경로. 응답 토스트가 `externalRootFound=false` 면 "외부 폴더 트리를 찾지 못했습니다 — DB 폴더명과 정확히 일치 확인 필요" 가이드 표시.
- **매뉴얼 매핑 폼 토스트 분기** (`ManualMappingForm.tsx`): `externalRootFound=false` 일 때 success → error 색상 + 진단 메시지로 자동 전환.

**테스트 (24 → 25)**:

- E2E-3 신규: depth=2 정확 매칭 — 외부웹하드 깊은 경로 동명 폴더가 root 후보로 잡히지 않음을 검증.
- A8-1, A8-3, E2E-1 갱신: lookup 쿼리 (`path: '/외부웹하드/{folderName}'`) + `externalRootFound` 응답 검증.

**불변 규칙**: task 26 본문 그대로. R2 key 불변, 단일 진입점, alias 1건당 1 tx, 멱등성 모두 유지.

---

### 2026-04-29 — external-folder-migration (task 26)

**Scope**: 외부웹하드 동기화 흐름의 두 가지 잔존 문제 정리 — (a) alias 승인 시 폴더 트리는 그대로 외부웹하드에 남아있던 문제 → 폴더 트리 통째 이전 + cascade soft delete, (b) 신규 동기화도 항상 외부웹하드 경로 경유 → 서버 측 routing 으로 처음부터 업체 폴더 PUT, (c) admin UI 분리 → `/admin/integration/companies` 통합 + 매뉴얼 매핑 폼 + 미매칭 폴더 목록.

**신규 동작**:

- **폴더 트리 통째 이전 (`migrateExternalFolderTreeToCompany`)**: alias 승인 시 `relocateAfterAliasApproved` (contact 단위) 직후 chained call. 외부 root 의 모든 하위 폴더·파일을 가입 업체 폴더로 옮긴다. template 세그먼트 (`칼선의뢰` / `목형의뢰` / `문의` / `완료`) 는 업체 동명 template 폴더로 자식 병합, `folderKind='inquiry'` 는 업체 루트 하위 `문의/` 로 이동, 그 외 임의 폴더는 업체 루트 직하로 이동 (충돌 시 `(1)`/`(2)` 자동 rename). 이동 후 비워진 외부 폴더는 cascade soft delete. R2 key (`WebhardFile.path`) 는 절대 변경하지 않음 — `companyId` / `folderId` 만 갱신.
- **신규 동기화 routing (`getUploadPresignedUrl`)**: `/외부웹하드/{X}/...` 하위 folderId 요청 시 X 가 가입 업체와 매칭되면 업체 폴더로 routing. 응답에 `folderId` (routing 결과) + `redirected: boolean` 필드 추가. Electron client 가 응답 folderId 를 `confirm` 호출에 사용하면 R2 PUT 자체가 처음부터 업체 경로로 박힘. 응답 필드는 옵셔널 → 구버전 client 호환.
- **미분류 Contact 강제 통합**: 기존 `relocateAfterAliasApproved` 는 `inquiryType=null` Contact 를 skip 했으나, task 26 이후 미분류 Contact 도 `companyId/companyName` 갱신. 폴더 정착은 후속 `migrateExternalFolderTreeToCompany` 가 외부 폴더 트리 이동 시 `{업체}/{원본 폴더명}/` 으로 정착시킴 (운영자가 분류 작업할 때 한눈에 보기 위함).
- **신규 endpoint `GET /api/v1/folders/external-unmatched`**: admin UI 매뉴얼 매핑 폼 후보 — 외부웹하드 직하 (depth=2) + `companyId IS NULL` + approved alias 없음 폴더 목록. 각 폴더의 contact / file 카운트는 BFS 누적. `AdminGuard` — API key 호출 차단.
- **`POST /api/v1/companies/folder-aliases` 응답 보강**: `backfill` 객체에 `movedFolders / movedFiles / deletedExternalFolders / conflicts` 필드 추가 (외부 root 미존재 시 모두 0). 기존 `relocated / skipped` 무변경 — 옵셔널 추가만.
- **admin UI 통합 (`/admin/integration/companies`)**: 별도 `/admin/integration/folder-aliases` 탭 제거, 6개월 redirect 페이지 도입 (2026-10 별도 task 로 삭제). 업체관리 페이지 하위에 `<FolderMappingSection>` 4 패널 (Pending / Unmatched / ManualMappingForm / Registered). 미매칭 폴더 행 클릭 → 매뉴얼 폼의 `folderName` 자동 채움.

**불변 규칙**:

- **R2 key 정책 그대로**: 폴더 이동·rename 시 `WebhardFile.path` (R2 object key) 는 변경하지 않음. routing 발동 시 새 PUT 의 key 만 업체 경로로. 즉 R2 key 는 PUT 시점의 폴더 위치를 반영하며 이후 폴더 이동에 영향받지 않는다 (drawing-workflow.md §W.1 그대로).
- **단일 진입점**: alias 승인 → `runCascadeBackfill` (folder-alias.service) → `relocateAfterAliasApproved` (contact 단위) → `migrateExternalFolderTreeToCompany` (폴더 트리 이전) chained. 외부 호출자가 직접 `migrateExternalFolderTreeToCompany` / `ensureInquiryFolder` / `relocateContactFiles` 호출 금지.
- **alias 1건당 1 tx**: createApprovedAlias / approve 의 단일 `prisma.$transaction` 안에서 alias upsert + relocate + migrate 모두 실행. 한 단계 throw 시 모두 롤백.
- **멱등성**: `Contact.companyId IS NULL` 필터 + 외부 root soft delete 후 재조회 시 null → 두 번째 호출 시 카운트 모두 0.

**테스트 (715→718 + spec 추가)**:

- M1-M9: `migrateExternalFolderTreeToCompany` (template merge / inquiry move / 충돌 rename / 미분류 강제 이동 / cascade delete / 멱등 / 검증 / R2 key 불변 / Contact tree 갱신)
- A8-1~3 + E2E-1~2: `folder-alias.service` chained migration (createApprovedAlias / approve 양쪽 + 멱등 시나리오)
- R1-R5: `getUploadPresignedUrl` routing (성공 / 실패 fallback / lazy create / 비외부 skip / 예외 흡수)
- F1-F2: `getExternalUnmatchedFolders` (반환 조건 / contact·file 카운트 BFS)

**Electron client (별도 PR)**: `외부웹하드동기화프로그램` repo 의 `yjlaser-uploader.ts` 의 `confirm body.folderId` 를 응답값으로 교체 + 빌드/자동 업데이트는 본 yjlaser_website PR 범위 밖. 서버 응답 필드가 옵셔널이므로 구버전 client backward-compatible.

**참조**: [spec — backend](specs/features/external-folder-migration.md), [spec — UI](specs/features/admin-folder-mapping-ui.md), [plan](superpowers/plans/2026-04-29-task-26-external-folder-migration.md).

---

### 2026-04-28 — webhard-visibility-and-external-inquiry-fix (task 25)

**Scope**: 운영자 보고로 동시에 드러난 3건 일괄 정리 — admin 업로드 가시성 회복 + 외부 폴더명 alias 매핑(매뉴얼) + 미가입 업체 외부 sync 시 문의 폴더 자동화 회귀 가드. 세 건 모두 웹하드 ↔ 외부 동기화 흐름의 동일 코드 경로에 영향.

**Bug Fix**:

- **Bug 1 — admin 업로드 회사 가시성 회복**: admin 이 업체 폴더에 업로드한 파일이 업체 사용자에게 보이지 않던 문제. `FilesService.{getUploadPresignedUrl, confirmUpload, batchConfirmUpload}` 가 admin 업로드 시 폴더의 `companyId` 를 자동 상속하도록 정정 (admin 이 `dto.companyId` 명시 시 명시값 우선). 1회 백필 마이그레이션 (`backfill_webhard_files_company_id`, idempotent — `company_id IS NULL` 조건 UPDATE) 으로 누락된 기존 row 도 폴더 소유자 `companyId` 로 회복.
- **Bug 2 — 폴더명 alias 매뉴얼 매핑 endpoint**: 외부웹하드 폴더명과 가입 업체명이 정규화 후에도 매칭 안 되는 케이스 (`대성목형(2265-1295)` vs `대성목형` 등) 를 위한 admin 수동 매핑 endpoint `POST /api/v1/companies/folder-aliases` 도입. `cascadeBackfill: true` (default) 면 `ContactFolderSyncService.relocateAfterAliasApproved` 가 즉시 미통합 contact 를 가입 업체 폴더로 일괄 이동. 멱등 — 동일 `(folderName, companyId)` 재호출 시 alias 변경 없이 backfill 만 멱등 추가 실행.
- **Bug 3 — 미가입 업체 외부 sync 시 문의 폴더 자동화 회귀 가드**: 미가입 업체가 외부웹하드 sync 로 분류 확정될 때 `외부웹하드/{미가입업체}/문의/{title-O번호}/` 가 자동 생성되는 흐름 (현재 동작 가능, U1-U5/U5b 회귀 가드만 추가). `getFolderTree` 차단 강화 — 기존 `name in EXTERNAL_WEBHARD_FOLDERS` 만으론 root 만 차단되고 하위 폴더가 회사 사용자에게 누수됨. 새 `companyVisibilityFilter` helper (`getFolderTree` + `getChildFolders` 공유) — name 매칭 + path startsWith OR 로 root + 모든 하위 차단. admin 분기 무영향.

**Refactor**:

- `verifyFolderAccess` 시그너처 변경 — `Promise<{ id, companyId }>` 반환. 단일 폴더 path 의 N+1 회귀 방지.
- `batchConfirmUpload` + `batchTriggerAutoContact` 의 `folderInfoMap` 일원화 → 폴더 1회 fetch 후 양 메서드가 결과 재활용. batch N+1 제거.

**신규 API**:

- `POST /api/v1/companies/folder-aliases` (`AdminSessionGuard`) — admin 수동 매핑 + 즉시 승인 endpoint. 외부 X-API-Key 호출 차단 (PR review 에서 발견된 AdminGuard 우회 가능성 — `ApiKeyGuard` 가 외부 키에 `userType: 'admin'` 부여 — 본 endpoint 만 즉시 차단, 시스템 전반은 task 25-fu3 으로 분리). body `{ folderName, companyId, cascadeBackfill?: boolean (default true) }`. 응답 `{ alias, backfill?: { relocated, skipped } }`. 기존 `POST :id/approve` 와의 차이: pending row 없이 바로 approved row 생성 (운영자의 명시적 의도 매핑이므로 default cascadeBackfill=true).

**불변 규칙**:

- 단일 진입점 보존 — 새 endpoint 도 `ContactFolderSyncService.relocateAfterAliasApproved` 만 호출, 내부 `ensureInquiryFolder` / `relocateContactFiles` 직접 호출 금지.
- 백필 멱등성 — `company_id IS NULL` 조건 UPDATE 로 두 번 실행해도 동일 결과.
- 명시값 우선 — Bug 1 의 companyId 상속은 admin 이 `dto.companyId` 미명시일 때만 발동.

**검증**:

- 단위: F1-F4 (`confirmUpload` 폴더 cid 상속 매트릭스) + F5 (`batchConfirmUpload` 매트릭스 + folderAccessMap 1회 fetch) + F6 (`getUploadPresignedUrl` 명시 cid 우선) + A1-A6 (`createApprovedAlias` 단위) + U1-U5/U5b (`auto-contact` + `contact-folder-sync` + `folders` 회귀 가드).
- service-level integration: F7 (admin 업로드 → 회사 가시성) + A7 (대성목형(2265-1295) 즉시 적용 시뮬레이션) + E2E-1 (Bug 2+3 통합).
- 운영 1회 적용: 대성목형(2265-1295) → companyId=4 alias + cascadeBackfill (별도 commit 없음, 운영 스크립트만 untracked).

**영향 파일**:

- 백엔드 수정: `webhard-api/src/files/files.service.ts` (companyId 상속 + verifyFolderAccess 시그너처), `webhard-api/src/folders/folders.service.ts` (`companyVisibilityFilter` helper + `getFolderTree`/`getChildFolders` 공유), `webhard-api/src/integration/orders/auto-contact.service.ts` (`batchTriggerAutoContact` folderInfoMap 일원화), `webhard-api/src/companies/companies.controller.ts` (`POST /folder-aliases` 추가), `webhard-api/src/companies/folder-alias.service.ts` (`createApprovedAlias` 추가), `webhard-api/src/companies/dto/folder-alias.dto.ts` (`CreateFolderAliasDto` 추가).
- 백엔드 신규: `webhard-api/prisma/migrations/{TS}_backfill_webhard_files_company_id/migration.sql`.
- 테스트 신규/수정: `webhard-api/src/files/files.service.spec.ts` (F1-F8), `webhard-api/src/companies/folder-alias.service.spec.ts` (A1-A7), `webhard-api/src/integration/orders/__tests__/auto-contact.service.spec.ts` (U1/U2/U4 + E2E-1), `webhard-api/src/contacts/contact-folder-sync.service.spec.ts` (U3), `webhard-api/src/folders/folders.service.spec.ts` (U5/U5b).
- 운영 스크립트 (untracked, no commit): `webhard-api/scripts/task-25-apply-daeseong-alias.ts`, `webhard-api/scripts/task-25-backfill-files-companyid.ts`, `webhard-api/scripts/task-25-verify-daeseong.ts`.
- 문서: `docs/specs/features/webhard-visibility-and-external-inquiry-fix.md` (신규 — task 25 정책 + 테스트 케이스 + 변경 이력), `docs/specs/features/external-sync-company-folder.md` (운영 절차 cross-link), `docs/specs/features/contact-webhard-folder.md` (cross-link), `docs/specs/api/endpoints/integration.md` (`POST /folder-aliases` 명세 + companyName 정규화 정책 갱신), `docs/specs/api/nestjs-endpoints.md` (Companies 표 갱신), `docs/features-list.md`, 본 CHANGELOG.

**호환성**: Prisma schema 변경 없음 (기존 `CompanyFolderAlias` 모델 재사용). 기존 `POST /folder-aliases/:id/approve` 동작 무변경. 새 `POST /folder-aliases` 는 추가 endpoint — 기존 호출자는 영향 없음.

**관련 spec**: [docs/specs/features/webhard-visibility-and-external-inquiry-fix.md](../specs/features/webhard-visibility-and-external-inquiry-fix.md).

### 2026-04-27 — external-sync-company-folder (task 24)

- **변경**: 외부웹하드 동기화 파일을 가입 업체 매칭 시 `{업체}/문의/{패키지명-문의번호}/` 로 직접 통합. 기존 `외부웹하드/{원본업체}/...` 누적 분리 해소.
- **신규 매칭 단계**: `matchCompanyInfo` 가 0차 `CompanyFolderAlias status='approved'` 를 우선 매칭. 1차/2차는 task 23 의 2단계 매칭(insensitive equals + isApproved 우선) 그대로. 3차에서 정규화 매칭 후보를 모두 `pending` 으로 자동 등록 (admin 승인 큐). pending alias 의 status 는 후속 동기화에서 변경되지 않음 (`update: {}`).
- **신규 모델**: `CompanyFolderAlias` (`folder_name`, `company_id`, `status: pending|approved|rejected`, `approved_by`, `approved_at`). unique [folder_name, company_id]. onDelete: Cascade.
- **신규 API**: `GET/POST/PATCH/DELETE /api/v1/companies/folder-aliases` (`AdminGuard`). 승인 시 `cascadeBackfill?: boolean` — true 면 해당 folder_name 의 외부 미통합 Contact 일괄 통합 (응답 `backfill: { relocated, skipped }`). 승인 자체는 멱등 (이미 approved 면 부작용 없이 `{ alias }` 만 반환).
- **신규 admin UI**: `/admin/integration/folder-aliases` — `PendingAliasesPanel` (승인/거절 + cascadeBackfill 토글) + `RegisteredAliasesPanel` (등록된 alias + 삭제). `IntegrationNav` 에 "폴더 별칭" 탭(`FolderSearch` 아이콘) 1개 추가.
- **신규 hook**: `ContactFolderSyncService.relocateAfterAliasApproved(folderName, companyId, client?)` — 외부 미통합 Contact 일괄 통합. 단일 진입점 정책 유지 (외부에서 ensureInquiryFolder 직접 호출 금지). 반환 `{ relocated, skipped }`.
- **불변 규칙**: 정규화 매칭 후보가 있어도 admin 승인 전까지 폴더명 원본 fallback 동작 유지 (Q3 일관성). admin 의 reject 결정을 다음 동기화가 무효화하지 않도록 upsert 시 `update: {}` 로 status 보존.
- **영향 파일**: `webhard-api/prisma/schema.prisma`, `webhard-api/src/integration/orders/auto-contact.service.ts`, `webhard-api/src/contacts/contact-folder-sync.service.ts`, `webhard-api/src/companies/folder-alias.service.ts` (신규), `webhard-api/src/companies/companies.controller.ts`, `webhard-api/src/companies/companies.module.ts`, `webhard-api/src/companies/dto/folder-alias.dto.ts` (신규), `src/app/(admin)/admin/integration/folder-aliases/page.tsx` (신규), `src/app/(admin)/admin/integration/folder-aliases/_components/PendingAliasesPanel.tsx` (신규), `src/app/(admin)/admin/integration/folder-aliases/_components/RegisteredAliasesPanel.tsx` (신규), `src/app/(admin)/admin/integration/folder-aliases/_lib/api.ts` (신규), `src/lib/react-query/queryKeys.ts`, `src/app/(admin)/admin/integration/_components/IntegrationNav.tsx` 외 다수.
- **검증**: A1~A7 (matchCompanyInfo 3단계), B1~B8 (folder-alias.service), C1~C3 (relocateAfterAliasApproved), D1~D2 (admin UI), E2E 시나리오 3개 (외부 동기화 → admin 승인 → 폴더 통합 / reject 멱등성 / 미승인 fallback).

### 2026-04-24 — qa-contact-worker-v1 (task 23)

**Scope**: QA 테스트에서 제보된 6 가지 이슈 일괄 해소. (1) 공개 폼 도면 업로드 확장자 단일 상수화, (2) 방문 예약 슬롯 UX + admin 승인/취소/수정 UI, (3) Worker 페이지 Contact 분류 + 카드 표시 + 정보 보기, (4) 사무실→현장 전환 silent fail 제거, (5) 외부웹하드 자동 Contact 대시보드 노출 정상화, (6) 외부웹하드 동기화 Contact 폴더 정책 통합. Phase 0 문서 동기화 후 Phase 1~8 구현, Phase 9 통합 검증.

**Changes**:

- **이슈 1 — 공개 폼 도면 업로드 확장자 단일 상수화**
  - 신규 `src/lib/utils/file-upload-policy.ts` — `DRAWING_UPLOAD_ALLOWED_EXTENSIONS` 단일 상수 + `DRAWING_UPLOAD_ACCEPT_ATTR` / `REFERENCE_UPLOAD_ALLOWED_EXTENSIONS` / `REFERENCE_UPLOAD_ACCEPT_ATTR`.
  - 허용 확장자: `.pdf, .dxf, .ai, .dwg, .jpg, .jpeg, .png, .gif, .zip, .rar` (공개 폼에서 누락되었던 `.ai` 포함).
  - 공개 폼 (`ContactForm.tsx`, `ContactCardToggle.tsx`) · Worker (`WorkerDrawingUpload.tsx`) · Company (`CompanyDrawingUpload.tsx`) 4 곳이 모두 단일 상수 import. 각 UI 내부 하드코딩 배열 제거.
- **이슈 2 — 방문 예약 슬롯 UX + admin 관리**
  - `bookings.service.ts::getAvailableSlots` 응답에 `maxCapacity: VisitBookingConstants.MAX_CAPACITY` 필드 추가. Next.js 프록시 (`src/app/api/bookings/available/route.ts`) 가 그대로 전파.
  - 신규 컴포넌트 `BookingSlotList`: 로딩 중 `bookingLoading && !slot` 일 때 `animate-pulse` 스켈레톤 + disabled. `isAvailable` 기본값을 `?? false` 로 변경 (기존 `?? true` 회귀 방지).
  - `UpdateBookingDto` + `CreateBookingDto` 에 `@IsIn(BOOKING_STATUS_VALUES)` enum 검증 (`pending` / `confirmed` / `cancelled`). 전역 `ValidationPipe (whitelist + forbidNonWhitelisted)` 를 통해 자동 적용.
  - Admin `BookingsCalendar.tsx` (경로: `src/app/(admin)/admin/bookings/`, `_components/` 아님) 예약 카드에 **승인 / 취소 / 수정** 버튼 3 종 추가. `BookingEditModal` 신규 — 일자 / 시간 / 메모 수정 후 PATCH.
  - Admin 세션 검증 게이트: 신규 `src/app/api/admin/bookings/[id]/route.ts` — `requireAdmin()` 통과 후 `INTEGRATION_API_KEY` 로 NestJS 호출. Worker / Company 가 `/api/v1/bookings/:id` 를 직접 호출하지 못하도록 차단.
- **이슈 3 — Worker 페이지 Contact 분류 + 카드 + 정보 보기**
  - `contacts.service.ts::findAll` `workCategory` 필터 재정의: `office` 는 `source='website'` Contact 를 `inquiryType` 무관하게 `processStage ∈ (null, 'drawing', 'sample')` 에서 포함. `unclassified` 는 `source='webhard' AND inquiryType=null` 만 (외부웹하드 자유 폴더 전용).
  - `OfficeContactCard` 타이틀 3 단 표시: `업체명 - inquiry_title ?? '미입력' - drawing_file_name ?? '파일 없음'`.
  - `WorkerContextMenu` 에 "정보 보기" 항목 추가 (웹하드에서 열기 바로 아래). 신규 `src/components/contact/ContactInfoModal.tsx` — `ContactDetailView` 를 `readOnly` 모드로 래핑한 공용 모달 (Admin / Worker 공유).
- **이슈 4 — 사무실→현장 전환 silent fail 제거**
  - `ContactsService.updateProcessStage`: `isOfficeToField` 전환이면 `workNumber` 신규 발급 여부와 무관하게 `$transaction` 내에서 `ContactFolderSyncService.onProcessStageChanged` 호출. `issueWorkNumber=false` 케이스에서 rename 을 skip 하던 기존 버그 수정.
  - `onProcessStageChanged` 에서 `nextStage='drawing_confirmed'` 시 (a) `inquiryNumber` / `workNumber` 모두 null 이면 `INQUIRY_NUMBER_REQUIRED` 422 throw, (b) `ensureInquiryFolder` null 반환이면 `FOLDER_CREATION_FAILED` 422 throw. `$transaction` 롤백으로 전환 자체 취소.
  - 신규 `src/lib/utils/stage-transition-errors.ts::mapStageTransitionError` — Worker `OfficeAdvanceButton` + Admin `update-process-stage-button` 양쪽이 동일 매핑 사용. 에러 title + 한글 message 분리 (기술 용어를 사용자에게 노출하지 않음). 공용 `ErrorModal` 을 추가하지 않고 기존 alert / Modal 패턴 재사용.
- **이슈 5 — 외부웹하드 자동 Contact 대시보드 노출 정상화**
  - `AutoContactService.createNewContact`: `resolvedCompanyName = companyInfo?.companyName ?? dto.companyName`. `matchCompanyInfo` 매칭 성공 시 Company 정규 업체명을 `Contact.companyName` + `inquiryTitle` 에 저장 (기존 폴더명 원본 저장 제거). 매칭 실패 시 폴더명 원본 fallback.
  - `ContactsService.findByCompany`: `companyName` 조회를 `{ equals: query.companyName, mode: 'insensitive' }` 로 전환. 레거시 대소문자/공백 변종 Contact 도 조회 포함.
- **이슈 6 — Contact 웹하드 폴더 생성 훅 통합**
  - 신규 `webhard-api/src/contacts/contact-folder-sync.service.ts::ContactFolderSyncService` — 3 메서드 (`onContactCreated` / `onInquiryTypeClassified` / `onProcessStageChanged`) 로 Contact 상태 변화에 따른 폴더 생성/rename/파일 이동의 단일 진입점 구축. `FoldersService` 를 주입받아 얇게 orchestration.
  - `ContactsService.create` · `updateInquiryType` · `updateProcessStage` · `AutoContactService.createNewContact` 4 호출처가 새 훅 경유. 각 메서드에 산재하던 `ensureInquiryFolder + relocateContactFiles` 조합 코드 제거.
  - `buildInquiryFolderName` 시그니처 확장 — `BuildInquiryFolderNameInput { inquiryNumber, workNumber, packageLabel?, filenameFallback? }`. `packageLabel` (inquiry*title) > `filenameFallback` (첫 번째 첨부 파일명 stem) > 현행 `문의-{O}*{F}`순. 신규`slugifyPackageLabel` 헬퍼 (NFKC + 금지문자 제거 + 최대 50 자).

**Breaking**: 없음.

- API 응답 shape — `BookingAvailability` 에 `maxCapacity` 필드 **추가** (기존 `slotCounts` 유지).
- `updateProcessStage` 실패 응답이 500 → 422 로 변경되어 `{ code, message }` payload 를 포함. 프론트는 기존 `success: false` 처리 경로 유지하면서 `mapStageTransitionError` 로 사용자 메시지 세분화.
- Prisma schema 변경 없음.

**Tests**:

- `webhard-api/src/common/inquiry-filename.util.spec.ts` — `buildInquiryFolderName` packageLabel / filenameFallback / slug 엣지 추가.
- `webhard-api/src/contacts/contact-folder-sync.service.spec.ts` 신규 — 3 메서드 × 정상/실패/drawing_confirmed throw 시나리오.
- `webhard-api/src/contacts/contacts.service.spec.ts` — `findByCompany` insensitive 회귀, `workCategory='office'` 공개 폼 포함 케이스.
- `webhard-api/src/integration/orders/auto-contact.service.spec.ts` — `resolvedCompanyName` 정규형 저장 / fallback 분기.
- `webhard-api/src/bookings/bookings.service.spec.ts` — `getAvailableSlots` `maxCapacity` 응답 + `UpdateBookingDto` enum 거부.
- `webhard-api/src/folders/folders.service.spec.ts` — `ensureInquiryFolder` packageLabel 우선 / filenameFallback 회귀.
- `src/__tests__/contact/booking-slot-list.test.tsx` — 로딩 스켈레톤 + `isAvailable ?? false` 기본값 회귀.
- `src/__tests__/contact/contact-info-modal.test.tsx` — 모달 오픈 + `ContactDetailView` readOnly 렌더.
- `src/__tests__/utils/stage-transition-errors.test.ts` — `INQUIRY_NUMBER_REQUIRED` / `FOLDER_CREATION_FAILED` 매핑.
- `src/__tests__/utils/file-upload-policy.test.ts` — `.ai` 포함 + accept 문자열 조립.

**영향 파일**

- 백엔드 신규: `webhard-api/src/contacts/contact-folder-sync.service.ts`.
- 백엔드 수정: `webhard-api/src/contacts/contacts.service.ts`, `webhard-api/src/contacts/contacts.module.ts`, `webhard-api/src/common/inquiry-filename.util.ts`, `webhard-api/src/folders/folders.service.ts`, `webhard-api/src/integration/orders/auto-contact.service.ts`, `webhard-api/src/bookings/bookings.service.ts`, `webhard-api/src/bookings/constants.ts`, `webhard-api/src/bookings/dto/update-booking.dto.ts`, `webhard-api/src/bookings/dto/create-booking.dto.ts`.
- 프론트 신규: `src/lib/utils/file-upload-policy.ts`, `src/lib/utils/stage-transition-errors.ts`, `src/components/contact/ContactInfoModal.tsx`, `src/app/contact/_components/BookingSlotList.tsx`, `src/app/(admin)/admin/bookings/_components/BookingEditModal.tsx`, `src/app/api/admin/bookings/[id]/route.ts`.
- 프론트 수정: `src/app/contact/ContactForm.tsx`, `src/app/contact/_components/ContactCardToggle.tsx`, `src/app/worker/_components/WorkerDrawingUpload.tsx`, `src/app/worker/_components/OfficeContactCard.tsx`, `src/app/worker/_components/WorkerContextMenu.tsx`, `src/app/worker/_components/OfficeAdvanceButton.tsx`, `src/app/worker/dashboard/page.tsx`, `src/app/company/orders/_components/CompanyDrawingUpload.tsx`, `src/app/(admin)/admin/contacts/[id]/update-process-stage-button.tsx`, `src/app/(admin)/admin/bookings/BookingsCalendar.tsx`, `src/app/api/bookings/available/route.ts`, `src/app/actions/contacts.ts`.
- 문서: `docs/specs/features/contact-file-upload.md` (신규), `docs/specs/features/contact-webhard-folder.md` (신규), `docs/specs/features/visit-booking-admin.md` (신규), `docs/specs/features/worker-contact-classification.md` (신규), `docs/specs/features/drawing-workflow.md` §W.1, `docs/specs/api/endpoints/webhard.md`, `docs/specs/api/endpoints/integration.md`, `docs/거래처-웹하드-폴더-안내.md`, `docs/specs/db/prisma-tables.md` (visit_bookings status enum 명시), 본 CHANGELOG, `docs/features-list.md`.

**호환성**

- Prisma 스키마 변경 없음 — `VisitBooking.status` 는 여전히 `String?` 이나 DTO 레이어에서 `pending` / `confirmed` / `cancelled` 로 제한. 기존 row 는 그대로 조회 가능.
- `DRAWING_UPLOAD_*` 상수 — 기존 하드코딩 배열 사용 코드는 모두 단일 상수로 마이그레이션됨. 이후 업로드 UI 추가 시 `file-upload-policy.ts` 를 import 하는 규칙이 단일 소스.
- `ContactFolderSyncService` 는 `forwardRef` 로 `FoldersService` 와 양방향 의존. 외부 모듈에서 직접 `ensureInquiryFolder` 를 호출하는 기존 코드는 단계적으로 훅 경유로 전환.

**Follow-ups (task 24 이후 후보)**:

- `AutoContactService` 매칭 실패 시 fallback 으로 저장된 폴더명 원본 Contact 를 정규 업체명으로 일괄 업데이트하는 backfill 스크립트 (findByCompany insensitive 로도 여전히 누락되는 "대성목형" vs "대성목형(주)" 케이스).
- `VisitBooking.status` Prisma schema enum 변환 (현재는 `String?`, enum 마이그레이션은 별도 task).
- `BookingEditModal` 에서 관리자 메모 이력 추적 (현재는 현재 값만 덮어쓰기).
- 업로드 확장자 정책을 서버 DTO (`class-validator`) 와도 공유해 클라이언트-서버 단일 소스 (현재는 `DANGEROUS_EXTENSIONS` 블랙리스트만).
- task 20~22 phase 5 followups (§3.1 기존 파일 정리 마이그레이션 / §3.4 F 번호 rename 시 파일명 prefix 재계산 / §3.5 완료 폴더 운영 / §3.6 webhardWarning 복구 UI / §3.7 기존 루트 파일 v1 링크 Admin UI).

### 2026-04-24 — chore: 개발 환경 로그인 Rate Limit 우회

**Scope**: 로컬 개발 중 반복 로그인 시도로 "너무 많은 로그인 시도로 인해 일시적으로 차단되었습니다" 메시지가 떠 작업이 막히는 불편 제거.

**Changes**:

- `src/lib/auth/rateLimit.ts`: `checkUpstashRateLimit`에 `process.env.NODE_ENV !== 'production'` early-return 추가. 개발 환경에서는 IP·횟수 무관하게 `{ allowed: true, remainingAttempts: Number.MAX_SAFE_INTEGER }` 반환. 프로덕션은 기존 5회/15분 제한 그대로 유지.

**영향 범위**: 두 진입점 (`recordLoginAttempt`, `recordLoginAttemptFromHeaders`) 모두 `checkUpstashRateLimit`을 거치므로 한 곳 수정으로 충분. 워커 PIN brute-force 보호 (`webhard-api/src/erp/workers` 의 `PinRateLimiter`) 와 웹하드 API rate limit (`checkWebhardRateLimit`) 은 별도 모듈이라 영향 없음.

**Breaking**: 없음. 프로덕션 동작 변경 없음.

### 2026-04-24 — contact-webhard-navigate (task 22)

**Scope**: `relocateContactFiles` 의 company 탐색 정책을 `ensureInquiryFolder` 와 동일한 3단계 fallback 으로 통일하여 LGU+ 가상업체(Company row 미등록) 도면의 자동 이동 구멍 해소 + Admin · Worker 문의카드 우클릭 컨텍스트 메뉴에 "웹하드에서 열기" 항목 신설 (폴더 이동 + 파일 하이라이트).

**Changes**:

- 신규 유틸 `resolveCompanyRoot(client, companyName)` (`webhard-api/src/folders/_lib/resolve-company-root.util.ts`): Company row 매칭 → `webhard_folders.name` 완전 일치 fallback (task 20) → 정규화 매칭 fallback (task 21) 의 3단계 탐색을 단일 진입점으로 제공. 반환 `{ rootFolderId, companyId, reasonCode? }`. `ensureInquiryFolder` 와 `relocateContactFiles` 가 이 유틸을 공유한다.
- `FoldersService.ensureInquiryFolder` (`webhard-api/src/folders/folders.service.ts`): 인라인 3단계 탐색을 `resolveCompanyRoot` 호출로 단순화. `NO_COMPANY_ROOT` 시 `initializeCompanyFolders` 후 재시도 — 기존 동작 동일.
- `FoldersService.relocateContactFiles` (`webhard-api/src/folders/folders.service.ts`): 과거 `if (!company) return { movedIds: [] }` silent bail-out 제거. `resolveCompanyRoot` 로 rootFolder 확보 실패 시 `logger.warn({ reason_code, ... })` 기록. `companyId === null` (fallback 매칭 성공) 인 가상업체도 `revisionFileIds` 경로로 파일을 식별해 정상 이동한다. `companyId + inquiryNumber` OR 절은 companyId 가 있을 때만 포함.
- `ContactsService.findAll` / `findOne` / `getChildren` (`webhard-api/src/contacts/contacts.service.ts`): 응답 DTO 에 `webhard_file_id: string | null` 필드 추가. 값은 해당 Contact 의 최신 DrawingRevision 의 첫 번째 `webhardFileIds`. `findAll` 은 N+1 회피용 batch 쿼리, `findOne` 은 별도 findFirst, `getChildren` 은 include 된 drawingRevisions 재활용.
- `src/lib/types/contact.ts`: `Contact` 인터페이스에 `webhard_file_id?: string | null` 동기화 (snake_case — 기존 DTO 컨벤션 준수).
- 신규 유틸 `buildWebhardUrl(folderId, fileId?)` (`src/lib/utils/webhard-url.ts`): `/webhard?folderId=...&fileId=...` URL 생성기. folderId 가 falsy 면 null 반환 (호출처 disabled 판단용). 빈 문자열/null fileId 는 쿼리에서 제외.
- 신규 훅 `useWebhardFileIdHighlight(selectedFolderId, files)` (`src/app/webhard/hooks/useWebhardFileIdHighlight.ts`): URL 의 `fileId` 쿼리 감지 + 현재 폴더 리스트에 포함 시 `useWebhardHighlightStore.setHighlight(id, 'file')` 호출, 3초 후 자동 clear. folderId 없으면 noop. `useRef` 로 동일 fileId 중복 호출 방지.
- `src/app/webhard/components/WebhardMain.tsx`: `files = useMemo(...)` 직후 `useWebhardFileIdHighlight(selectedFolderId, files)` 한 줄 호출.
- `src/app/(admin)/admin/contacts/_components/ContactContextMenu.tsx`: 메뉴 최상단에 "웹하드에서 열기" 항목 추가 (`FolderOpen` 아이콘, `<hr>` 구분선, `router.push` same-tab 이동). disabled 조건 `!contact.webhard_folder_id`, disabled 시 `title="웹하드 폴더 미생성"`. `webhard_file_id` 가 null 이어도 menu 활성화 — URL 에서 `fileId` 만 생략.
- `src/app/worker/_components/WorkerContextMenu.tsx`: 동일 "웹하드에서 열기" 항목 추가. props 에 `webhardFolderId?`, `webhardFileId?` 추가. 기존 hard-coded 스타일 패턴 유지. 재분류 · 긴급 · 분할 항목은 변경 없음.
- `src/app/worker/dashboard/page.tsx`: `contextMenuContact.webhard_folder_id` / `.webhard_file_id` 를 `WorkerContextMenu` 에 전달.

**Breaking**: 없음. Prisma 스키마 변경 없음, API 응답 계약 불변 (optional 필드 `webhard_file_id` 추가만, 기존 소비처 영향 없음). `relocateContactFiles` 반환 타입 (`{ movedIds: string[] }`) 변경 없음.

**Tests**:

- `webhard-api/src/folders/_lib/resolve-company-root.util.spec.ts` 신규 4 케이스 — Company 등록 / name 완전 일치 fallback / 정규화 매칭 fallback / 전체 실패 시나리오로 3단계 탐색 순서·호출 횟수 검증.
- `webhard-api/src/folders/folders.service.spec.ts` `relocateContactFiles` describe 에 #5~#7 추가 — Company 미등록 가상업체 + webhardFileIds 이동 (핵심 regression), 정상 Company 합집합 이동, 빈 orClauses 엣지.
- `webhard-api/src/contacts/contacts.service.spec.ts` `findOne` describe 신규 3 케이스 — `webhard_file_id` 필드 채움/null 분기. 공용 `PrismaMock` 에 `drawingRevision.findFirst` 추가.
- `src/__tests__/webhard/webhard-main-fileid.test.tsx` 신규 — `useWebhardFileIdHighlight` 훅을 `renderHook` 으로 검증 (folderId+fileId 호출 / folderId 없는 단독 fileId noop).
- `src/__tests__/lib/webhard-url.test.ts` 신규 4 케이스 — falsy folderId / folderId-only / folderId+fileId / 빈 문자열 fileId.
- `src/__tests__/contacts/context-menu-webhard-link.test.tsx` 신규 2 케이스 — router.push 호출 + disabled 상태.
- 전 backend suite 36 suites / 590 tests 통과 (Phase 2 종료 시점 baseline +1 suite, +10 tests). frontend Jest suite 전체 통과.

**영향 파일**

- 백엔드: `webhard-api/src/folders/_lib/resolve-company-root.util.ts` (신규), `webhard-api/src/folders/folders.service.ts`, `webhard-api/src/contacts/contacts.service.ts`.
- 프론트: `src/lib/utils/webhard-url.ts` (신규), `src/app/webhard/hooks/useWebhardFileIdHighlight.ts` (신규), `src/app/webhard/hooks/index.ts`, `src/app/webhard/components/WebhardMain.tsx`, `src/app/(admin)/admin/contacts/_components/ContactContextMenu.tsx`, `src/app/worker/_components/WorkerContextMenu.tsx`, `src/app/worker/dashboard/page.tsx`, `src/lib/types/contact.ts`.
- 테스트: `webhard-api/src/folders/_lib/resolve-company-root.util.spec.ts`, `webhard-api/src/folders/folders.service.spec.ts`, `webhard-api/src/contacts/contacts.service.spec.ts`, `src/__tests__/webhard/webhard-main-fileid.test.tsx`, `src/__tests__/lib/webhard-url.test.ts`, `src/__tests__/contacts/context-menu-webhard-link.test.tsx`.
- 문서: `docs/specs/features/drawing-workflow.md` §W.1, `docs/specs/features/inquiry-classification-ux.md` §2.2.1, `docs/specs/features/worker-portal.md` Completion Criteria, `docs/specs/api/endpoints/webhard.md` URL 규약 + Contact 응답 DTO 확장, 본 CHANGELOG, `docs/features-list.md`.

**호환성**

- API 응답 shape 변경 없음 — `webhard_file_id` 는 optional 추가 필드이며 기존 소비처 영향 없음.
- Prisma 스키마 변경 없음 — 기존 `DrawingRevision.webhardFileIds` 재활용.
- `relocateContactFiles` silent bail-out 제거는 **개선**(기존엔 가상업체 도면이 조용히 이동 실패 → 이제는 fallback 로 정상 이동 또는 `reason_code` 경고 로그). 반환 shape 불변.

**Follow-ups (task 23 이후 후보)**

- 관리프로그램 DXF 경로 (Contact 생성 경로 4) 의 문의 폴더 연결 — 현재 폴더 연결 없음 유지 상태.
- Admin 재시도 UI — `relocateContactFiles` 가 `NO_FALLBACK_MATCH` / `NO_COMPANY_ROOT` 로 실패한 Contact 목록을 보고 수동 재시도.
- task 20 phase 5 followups 에 기재된 §3.1 기존 파일 정리 마이그레이션 / §3.4 F 번호 rename 시 파일명 prefix 재계산 / §3.5 완료 폴더 운영 / §3.6 webhardWarning 복구 UI / §3.7 기존 루트 파일 v1 링크 Admin UI.

### 2026-04-22 — webhard-folder-policy-unify (task 20)

**Scope**: Contact 생성 5 경로 (웹폼·웹하드 단건 감지·웹하드 배치 감지·split, 공통 `createNewContact`) 의 웹하드 폴더 생성 룰 통합. DXF 경로 (4) 는 task 21 으로 분리.

**Changes**:

- 폴더 구조: 업체 루트 하위에 중간 `문의/` 폴더 삽입. 모든 `문의-{O}` 폴더가 이 아래 배치.
- `ensureInquiryRootFolder(companyId, tx?)` 헬퍼 신규 — 중간 `문의` 폴더 lazy 보장 (`folderKind='template'`, `name='문의'`).
- `DEFAULT_FOLDER_TEMPLATE` 에 `문의` 추가 — 신규 업체 eager 생성.
- `ContactsService.create` 트랜잭션 내부에 `ensureInquiryFolder + relocateContactFiles` 통합 (fire-and-forget 제거, strict 롤백).
- `ContactsService.registerFilesToWebhard` **완전 삭제** — W.3 레거시 제거 (약 152 줄).
- `AutoContactService.createNewContact` 끝단에 분류 확정 시 폴더·파일 정착 훅 추가 (미분류 원위치 유지, best-effort try/catch+warn). `FoldersService` DI 주입.
- `ContactsService.splitContact` 자식별 `ensureInquiryFolder` 호출 (독립 동급 `문의-{O}-{i}`, 자식 inquiryType 있을 때만).
- `ensureInquiryFolder` parent 가 업체 루트 → `inquiryRoot.id` 로 변경. `moveInquiryFolderToCompleted` 의 reparent 대상은 업체 루트 하위 `완료/` 로 유지 — 로직 변경 없음.

**Breaking**: 기존 업체 루트 직하 `문의-{O}` 폴더 (task 19 이후 생성) 와 새 `문의/문의-{O}` 구조가 혼재 가능 — task 21 마이그레이션 스크립트에서 정리 예정.

**Tests**: `folders.service.spec.ts` P1-1~P1-5, `contacts.service.spec.ts` P2-1~P2-6 + split P4-1~P4-4, `auto-contact.service.spec.ts` P3-1~P3-5 신규 추가. 기존 E1~E6 + RFW1/RFW2 는 parent 기대값·naming 이 새 구조로 갱신.

**영향 파일**

- 백엔드: `webhard-api/src/folders/folders.service.ts`, `webhard-api/src/contacts/contacts.service.ts`, `webhard-api/src/contacts/drawing-revision.service.ts` (주석만), `webhard-api/src/integration/orders/auto-contact.service.ts`.
- 테스트: `webhard-api/src/folders/folders.service.spec.ts`, `webhard-api/src/contacts/contacts.service.spec.ts`, `webhard-api/src/integration/orders/__tests__/auto-contact.service.spec.ts`, `webhard-api/src/integration/orders/auto-contact.service.spec.ts`.
- 문서: `docs/specs/features/drawing-workflow.md` §W.1/§W.3, `docs/followups/19-webhard-folder-policy-status.md`, `docs/specs/db/prisma-tables.md`, 본 CHANGELOG.

**호환성**

- 기존 파일은 건드리지 않음 — 새 Contact 부터만 새 구조 적용 (task 19 정책 계승).
- API 응답 shape 변경 없음 — `POST /api/v1/contacts` 는 이전과 동일하게 Contact 반환 (폴더 생성은 부작용).
- Prisma 스키마 변경 없음.

**Follow-ups (task 21 이후 후보)**: §3.1 기존 파일 정리 마이그레이션 / §3.2 dxf방·외부 폴더 정책 / §3.4 F 번호 rename 시 파일명 prefix 재계산 / §3.5 완료 폴더 운영 (월별·복귀·권한) / §3.6 webhardWarning 복구 UI / §3.7 기존 루트 파일 v1 링크 Admin UI / 경로 4 (관리프로그램 DXF) 폴더 연결.

### 2026-04-23 — webhard-inquiry-folder-gap-fix (task 21)

**Scope**: task 20 (webhard-folder-policy-unify) 후속. 외부웹하드 동기화 → 자체웹하드 auto-contact 경로 및 공개폼 외부업체 케이스에서 발생하던 **문의 폴더 미생성 3개 구멍** (미분류 / 공개폼 `!company` / 업체명 기호 차이) 해결.

**Changes**:

- `buildInquiryFolderName` (`webhard-api/src/common/inquiry-filename.util.ts`): `inquiryNumber` 만 있어도 `문의-{O}` 반환. `inquiryNumber` 없으면 null (F-만-발급은 반환하지 않음) — 미분류 상태 폴더 생성 지원.
- `FoldersService.ensureInquiryFolder` (`webhard-api/src/folders/folders.service.ts`): 업체 루트 fallback 2단계화 — Company 매칭 실패 시 `webhard_folders.name` 완전 일치 fallback (task 20, 9be443cc) 이 먼저, 그것도 실패하면 `normalizeCompanyName` 정규화 매칭 fallback (task 21) 이 `folderKind in ('generic', 'root')` 대상 폴더를 스캔. 우선순위: `companyId desc, createdAt asc`.
- 신규 util `normalizeCompanyName` (`webhard-api/src/folders/_lib/company-name-match.util.ts`): NFKC 정규화 + 소문자화 + `[^a-z0-9가-힣]` 전 제거. 순수 함수.
- `FoldersService.ensureInquiryFolder`: null 반환 시 `logger.warn({ reason_code, contactId, companyName, inquiryNumber, message })` 기록 — reason_code 는 `NO_INQUIRY_NUMBER` / `NO_COMPANY_ROOT` / `NO_FALLBACK_MATCH` / `FOLDER_CREATE_FAILED`. 마지막 최외곽 try/catch 로 `webhardFolder.create` / `ensureInquiryRootFolder` 예외를 흡수해 `FOLDER_CREATE_FAILED` 로 기록하고 null 반환 (Contact 롤백 방지). `FOLDER_CREATE_FAILED` 로그는 추가로 `error` 필드 포함.
- `ContactsService.create` (`webhard-api/src/contacts/contacts.service.ts`): `!company` 분기에서 `webhard_company_mismatch` 알림을 **먼저** 발송한 뒤, `created.inquiryType` 이 확정되어 있으면 best-effort `ensureInquiryFolder` + `relocateContactFiles` 시도. 예외는 try/catch 로 흡수 — Contact INSERT 는 롤백되지 않는다. `if (company)` 분기는 변경 없음 (strict).
- `AutoContactService.createNewContact` (`webhard-api/src/integration/orders/auto-contact.service.ts`): 끝단의 `if (finalInquiryType)` 가드 제거. `ensureInquiryFolder` 는 `finalInquiryType` 과 무관하게 항상 시도 — 미분류 상태에서도 `문의-{O}` 폴더 즉시 생성. `relocateContactFiles` 는 `folder && finalInquiryType` 조건에서만 실행 (미분류 파일 이동 방지). 최외곽 try/catch 는 방어용으로 유지. `detectAndCreate` 는 createNewContact 를 호출하므로 자동 적용.

**Breaking**: 없음. Prisma 스키마 변경 없음, API 응답 구조 변경 없음, public 함수 시그니처 변경 없음.

**Tests**:

- `folders.service.spec.ts` — task 21 신규 P1-4 / P1-5b / P1-6 / P1-7 / P1-8 / P1-9 (완전 일치 fallback / 정규화 매칭 fallback / reason_code 4종 / FOLDER_CREATE_FAILED try/catch). 기존 P1-1 ~ P1-7 회귀 유지.
- `company-name-match.util.spec.ts` — 신규 5종 (NFKC / 대소문자 / 공백 / 특수문자 / 빈 문자열).
- `common/inquiry-filename.util.spec.ts` — `buildInquiryFolderName` 의 O-만·O+F·F-만(null)·양쪽 없음 분기 회귀 갱신 (F-만 → null).
- `migrate-webhard-inquiry-folders.spec.ts` M2 — buildInquiryFolderName 정책 변경 반영 (F-만 케이스 `no-number` status).
- `contacts.service.spec.ts` — task 21 신규 `task21-P2-1` ~ `task21-P2-6` (fallback 호출 / 매칭 성공 / 매칭 실패 / 알림 순서 / 예외 흡수 / company 분기 회귀).
- `integration/orders/__tests__/auto-contact.service.spec.ts` — task 21 신규 P3-6 ~ P3-10 (미분류 호출 / folder 반환 + relocate 생략 / 분류 확정 회귀 / best-effort throw + logger.warn / null + 미분류 조합). 기존 P3-3 / P3-5 어서션은 신규 동작에 맞춰 조정.
- 전 backend test suite 35 suites / 580 tests 통과 (Phase 3 종료 시점).

**Follow-ups (task 22 이후 후보)**:

- 관리프로그램 DXF 파일 업로드 클라이언트 구현 (`yjlaser_api_client/client.py` 에 `upload_dxf_match` 메서드 추가) — 서버 `POST /integration/dxf-match/upload` 는 이미 구현됨.
- 기존 업체 루트 직하 `문의-{O}` 폴더를 `문의/문의-{O}` 로 옮기는 마이그레이션 스크립트.
- Admin 재시도 UI (webhardWarning 복구 플로우).
- `POST /integration/contacts/auto` (`OrdersService.createAutoContact`) 신규 문의 생성 경로의 폴더 연결 (필요 시).
- task 20 phase 5 followups 에 기재된 §3.1, §3.2, §3.4, §3.5, §3.6, §3.7.

### 2026-04-21 — worker-drawing-upload (task 19)

**Worker 도면 업로드 UX 개선 + 웹하드 폴더 정책 재설계**

**사용자 영향 버그 수정 (6건)**

1. Worker 도면 업로드 모달에 드래그드랍 지원 추가.
2. 모달 오픈 시 뒤 영역 클릭·body 스크롤 잠금 (BaseModal 기반 재작성).
3. 본인 업로드 직후 타임라인 즉시 반영 (refetchQueries + staleTime 30s).
4. 문의 폴더 자동 생성 및 두 번째 도면 저장 문제 해결 (ensureInquiryFolder 재설계).
5. 타 사용자 업로드 시 펼쳐진 카드 실시간 반영 (카드 레벨 소켓 구독).
6. 5 번 버그와 동일 원인 — staleTime + enabled 조합 해결로 완전 해소.

**아키텍처 변경**

- 웹하드 폴더 구조: `{업체}/{칼선의뢰|목형의뢰}/문의-{번호}/` → `{업체}/문의-{O}_{F}/` 단순화.
  - 기존 template (칼선의뢰, 목형의뢰) 은 거래처 원본 업로드 수신 경로로 유지.
  - F 번호 추가 발급 시 폴더명 자동 rename (`renameInquiryFolderForContact`). `WebhardFolder.id` · R2 key 유지.
  - 납품 완료(`processStage='delivery'`) 시 `{업체}/완료/문의-{O}_{F}/` 로 이동 (`moveInquiryFolderToCompleted`, Best Effort + lazy 생성).
  - `ensureInquiryFolder(contactId)`: 단일 진입점 재설계 — inquiryType 분기 폐기, contactId 기준 findFirst 로 1:1 보장.
- `syncRevisionToWebhard` 에러 전파: `.catch(() => [])` 무음 삼킴 제거 후 응답에 `webhardWarning?: { code, message }` 필드 추가. code: `NO_INQUIRY_NUMBER` / `FOLDER_CREATE_FAILED` / `RELOCATE_FAILED` / `UNKNOWN`. 프론트는 성공 모달 메시지에 경고 append.
- 원본 도면 + Worker revision 모두 동일 `문의-{번호}/` 폴더로 `relocateContactFiles` 일괄 이동. R2 key 유지 — 기존 presigned URL 계속 유효.

**영향 파일**

- 백엔드: `webhard-api/src/folders/folders.service.ts`, `webhard-api/src/contacts/{contacts.service,contacts.controller,drawing-revision.service}.ts`, `webhard-api/src/contacts/types/webhard-sync-warning.ts` (신규), `webhard-api/src/integration/drawing-revisions/drawing-revisions.controller.ts`, `webhard-api/src/common/inquiry-filename.util.ts`, `webhard-api/src/contacts/dxf-match.service.ts`.
- 프론트: `src/app/worker/_components/WorkerDrawingUpload.tsx`, `src/app/worker/_components/useTimelineRealtime.ts` (신규), `src/app/worker/_components/{StaffContactCard,OfficeContactCard}.tsx`, `src/components/modals/BaseModal.tsx` (subtitle + scroll lock), `src/lib/hooks/useContactTimeline.ts`.
- 테스트: `folders.service.spec.ts` · `contacts.service.spec.ts` · `drawing-revision.service.spec.ts` 확장 + `WorkerDrawingUpload.test.tsx` · `useTimelineRealtime.test.tsx` (신규).

**호환성**

- 기존 rootFolder / template 에 저장된 파일은 건드리지 않음. 새 문의부터 새 구조 적용.
- 응답 성공 컨트랙트 유지 — `webhardWarning` 은 optional 추가 필드 (기존 소비처 영향 없음).
- DB 스키마 변경 없음 — task 18 에서 추가한 `webhard_folders` 컬럼(`contactId`, `inquiryNumber`, `workNumber`, `folderKind`) 재사용.

### 2026-04-20 — drawing-consistency (task 18)

- 파일명 규칙 통일: `[260420-F-004] 원본명.DXF` 포맷. O/F 선택 기준은 revision.processStage → contact.processStage → inquiryType fallback.
- 폴더 구조 통일: `{업체명}/{칼선의뢰|목형의뢰}/문의-{O}_{F}/`. F 추가 발급 시 rename.
- `createInitialRevision` 트랜잭션화 (fire-and-forget 제거). 실패 시 Contact 생성 롤백.
- 백필 스크립트 2종: `backfill-initial-revisions.ts` (원본 v1 복구), `migrate-webhard-inquiry-folders.ts` (폴더·파일명 일괄 정리). 기본 dry-run, --apply 명시 시만 실행.
- 관리자 상세 페이지 타임라인 실시간 반영: `ContactTimelineRealtime` 클라이언트 래퍼 도입, 8개 이벤트 구독.
- Prisma schema: `WebhardFolder` 에 `inquiryNumber`, `workNumber`, `contactId`, `folderKind` 4 컬럼 추가.
- 다운로드 실패 개선: R2 key 추출 시 `decodeURIComponent` 적용. companyName/classify 실패 시 관리자 Notification + Sentry 경고.
- Breaking change 없음. 기존 API 응답 shape 유지.

### 2026-04-20 — contact-feedback-pack (task 17)

- **변경**: 미분류 분류 CTA 의 `ring-2 ring-orange-300 animate-pulse` 제거. 2버튼 간격 `gap-1 → gap-2`. 시각 소음 완화.
- **변경**: 통합 타임라인 정렬 `DESC → ASC` (오래된 → 최신 순).
- **변경**: 타임라인 분류 이벤트에 작업자명(`actorName`) 상시 노출.
- **신규**: `GET /api/contacts/:id/latest-drawing/download` 엔드포인트. Worker 카드 및 Admin 첨부파일 도면 다운로드가 최신 `DrawingRevision` 파일을 받도록 전환.
- **버그 수정**: `GET /api/drawing-revisions/:id/download` 에 ERP worker 세션 허용. 작업자 타임라인 다운로드 401 해소.
- **변경**: `contact:drawing_revision_added` 등 소켓 이벤트로 펼쳐진 타임라인 실시간 갱신.
- **변경**: 긴급(`is_urgent`) 표시 통일 — Worker 카드 붉은 배경 제거, Admin/Worker 공용 `[Siren + "긴급"]` 붉은 배지 overlay. 카드 배경/border 일반과 동일.
- **영향 파일**: `src/components/contacts/InquiryClassifyButtons.tsx`, `src/app/(admin)/admin/contacts/_components/{InquiryTypeBadge,ContactCardHeader,ContactDetailView}.tsx`, `src/components/ContactTimeline.tsx`, `src/app/worker/_components/{OfficeContactCard,StaffContactCard}.tsx`, `src/app/worker/_lib/downloadFiles.ts`, `src/app/api/contacts/[id]/latest-drawing/download/route.ts` (신규), `src/app/api/drawing-revisions/[revisionId]/download/route.ts`, `src/lib/api/nestjs-server-client.ts`, `src/app/(admin)/admin/contacts/_lib/hooks.ts`, `src/app/worker/dashboard/page.tsx`, `webhard-api/src/contacts/{contact-timeline.service,contacts.controller}.ts`, `webhard-api/prisma/seed.ts`, `e2e/contact-feedback-pack.spec.ts` (신규).

### 2026-04-09 — perf: Worker 대시보드 프로덕션 성능 최적화 (commit 2e683d95)

> spec-code-sync 사후 등재 (2026-04-27). 코드 변경은 2026-04-09 커밋 시점에 적용 완료.

**Scope**: Worker 대시보드 프로덕션 환경(Vercel→Railway, 100~300ms/요청) 누적 지연 해소. `nestjsFetch` ISR 캐시 인프라 + 읽기 Server Action 캐시 정책 + 낙관적 업데이트 + 선택적 invalidation + 타임라인 React Query 전환.

**Changes**:

- **nestjsFetch 캐시 옵션 추가** — `NestJSRequestOptions` 에 `cache?: RequestCache`, `revalidate?: number`, `tags?: string[]` 추가. ISR 분기: `revalidate !== undefined` 시 `next.revalidate` 사용, 아니면 `cache ?? 'no-store'` (하위호환). `serverGetContacts`, `serverGetContactTimeline` 등 server 래퍼에 `cacheOptions?: { revalidate?: number; tags?: string[] }` 파라미터 확장.
- **읽기 Server Action ISR 캐시 적용** — `getProcessBoardContacts` `revalidate: 0` (실시간 우선, 후속 결정), `getWorkCategoryCounts` 30초, `getContactTimeline` 60초. 쓰기 API (`updateProcessStage`, `startDelivery`, `serverCreateContact` 등) 는 `cache: 'no-store'` 유지.
- **선택적 invalidation** — 기존 `queryKeys.processBoard.all` 전체 재조회 → `queryKeys.processBoard.board({ workCategory: 'field' | 'office' | 'unclassified' })` 활성 카테고리만 invalidate. `drawing_confirmed` 이관 (office → field 카테고리 전환) 시 양쪽 모두 invalidate.
- **낙관적 업데이트 + 롤백** — `StaffAdvanceButton` (작업완료 / 납품시작 / 레이저완료) 와 `OfficeAdvanceButton` (도면작업 / 샘플제작 / 도면확정) 양쪽 `queryClient.setQueryData` 로 즉시 UI 반영. mutation 실패 시 이전 데이터 복원. `OfficeAdvanceButton` 의 카테고리 전환은 office/unclassified 캐시에서 제거 + field 캐시에 추가하는 양방향 처리.
- **타임라인 훅 React Query 전환** — `useContactTimeline` 을 `useState + useEffect` → `useQuery` (queryKey `queryKeys.contacts.timeline(contactId)`, `staleTime: 30s`, `gcTime: 10분`, `enabled: expanded`). SSR `initialData` + `externalExpanded` + `usePrefetchTimeline` (hover/touch 프리페치) 헬퍼 추가. 반환 인터페이스 `{ expanded, toggle, entries, isLoading }` 유지 (Worker / Admin 공용 호환).
- **Socket.IO Worker 룸 추가** — `webhard-api/src/contacts/contacts.gateway.ts` 에 Worker 클라이언트 join 룸 추가. 기존 Worker 실시간 이벤트 미수신 회귀 해소.

**Breaking**: 없음.

- API 응답 shape 변경 없음.
- `nestjsFetch` 옵션 미지정 시 `'no-store'` 동작 그대로 — 기존 호출부 회귀 없음.

**영향 파일**

- `src/lib/api/nestjs-server-client.ts`
- `src/app/actions/process-board.ts`
- `src/app/actions/contacts.ts`
- `src/app/worker/_components/StaffAdvanceButton.tsx`
- `src/app/worker/_components/OfficeAdvanceButton.tsx`
- `src/app/worker/dashboard/page.tsx`
- `src/lib/hooks/useContactTimeline.ts`
- `webhard-api/src/contacts/contacts.gateway.ts`

**호환성**

- `nestjsFetch` 기본 동작 유지 (옵션 미지정 → `'no-store'`). 기존 호출부 무수정.
- `useContactTimeline` 반환 인터페이스 변경 없음 — Worker / Admin 양쪽 호출처 무수정.
- 소켓 이벤트 invalidation 기존대로 유지 — 두 브라우저 동시 변경 시 데이터 일관성 유지.

**참조**

- 계획 문서: `.omc/plans/done/worker-performance-optimization.md` (5단계 상세).

## [Unreleased] — 2026-04-20 — classify-cta 리팩토링 (task 16)

### 변경

- 미분류 문의의 분류 CTA 를 Admin/Worker 공용으로 재배치.
  - 왼쪽 유형 영역은 단일 "미분류" 주황 뱃지(`InquiryTypeBadge mode='label-only'`).
  - 오른쪽 액션 영역에 공용 `[칼선의뢰][목형의뢰]` 2버튼(`InquiryClassifyButtons`) 신규 렌더.
  - Worker `OfficeAdvanceButton` 의 "분류 필요" disabled fallback 제거 — 미분류 카드에서는 advance 버튼 자체가 렌더되지 않음.
- Worker 카드(`OfficeContactCard`, `StaffContactCard`) 생성시간을 세 번째 줄(webhard_folder_path 옆) → 첫 번째 줄(inquiry_number/work_number 다음) 로 이동.

### 신규

- 공용 훅 `useClassifyInquiryType` (`src/lib/hooks/useClassifyInquiryType.ts`): optimistic update + rollback + alert 까지 담당.
- 공용 컴포넌트 `InquiryClassifyButtons` (`src/components/contacts/InquiryClassifyButtons.tsx`): Admin(md) / Worker(sm) 양쪽에서 동일 분류 버튼.

### 버그 수정

- `Contact.id` 타입을 `number` → `string` 으로 정정 (런타임은 Postgres UUID). 기존 `useContactTimeline` 내부 `Number(contactId)` 가 `NaN` 을 유발해 `/contacts/NaN/timeline` 이 빈 배열로 반환되던 치명적 버그 해결 — 카드 펼침 시 타임라인 기록이 실제로 렌더된다.
- 위 정정에 맞춰 Admin/Worker 공통 caller(18+ 파일) 와 `Booking.contact_id` FK 도 string 으로 통일. Booking.id / Order.id 등 Contact 외 엔티티의 int id 는 유지.

### 내부

- API/DB 계약 변경 없음. `PATCH /api/contacts/[id]/inquiry-type` 과 timeline 엔드포인트 모두 재사용.
- 신규 테스트 3종: `useContactTimeline.test.ts`, `useClassifyInquiryType.test.tsx`, `InquiryClassifyButtons.test.tsx`.
- 기존 테스트의 id 리터럴(`1`, `42`, `77`, `99`) 을 UUID 형식 문자열로 교체.

## [Unreleased] — 2026-04-17 — inquiry-classification-ux

### Changed

- 미분류 문의 카드 UX 개선: 기존 "미분류" 드롭다운 배지 → 인라인 `[칼선의뢰] [목형의뢰]` 2버튼 (1-click 분류).
  - Admin `ContactCard`(웹하드 자동생성 문의) + Worker `OfficeContactCard`에 공통 반영. `StaffContactCard`는 이미 분류된 문의만 표시하므로 영향 없음.
  - pulse 애니메이션(`animate-pulse ring-2 ring-orange-300`)은 두 버튼 모두 유지해 주의 환기 일관성 확보.
- 분류된 카드 재분류 경로 추가: 우클릭(데스크톱) / long-press 500ms(모바일) 컨텍스트 메뉴.
  - Admin: `ContactContextMenu` 신규 (`_components/ContactContextMenu.tsx`).
  - Worker: `WorkerContextMenu`에 재분류 섹션 확장 (메뉴 상단, 구분선 아래에 기존 긴급/분할 항목 유지).
- 재분류 시 `status !== 'received'` 이면 `window.confirm` 경고 — "재분류 시 공정 상태도 함께 변경됩니다.\n(칼선의뢰 → 도면작업 | 목형의뢰 → 컨펌)\n진행하시겠습니까?". 미분류 → 첫 분류는 경고 없이 즉시 진행.

### Added

- Worker `OfficeContactCard` / `StaffContactCard` 에 문의 생성시간 표시 (포맷: `3/23 오전 9시 3분`).
  - `webhard_folder_path` 옆 또는 `webhard_folder_path` 가 없을 때 단독 라인. 긴급 카드에서는 `text-white/60`, 일반 카드에서는 `text-gray-400`.
- `formatCreatedAt` 유틸을 `src/app/(admin)/admin/contacts/_lib/utils.ts` 로 추출해 Admin `ContactCardHeader` + Worker 카드가 공통 import.
- StaffContactCard 생성시간 렌더링 Jest 테스트 3건 추가.

### 내부

- API/DB 스키마 변경 없음. `PATCH /api/contacts/[id]/inquiry-type` 재사용. 재분류에 따른 status/process_stage 매핑은 기존 `InquiryTypeBadge.statusMap` + NestJS `ContactsService.updateInquiryType` 로직 그대로.
- `WorkerContextMenu` props 확장: `currentInquiryType`, `canReclassify`, `onReclassify`.
- `OfficeContactCard` / `StaffContactCard` props 확장: `onContextMenu?: (contactId, x, y) => void`.
- 불변 규칙: 미분류 카드에서는 컨텍스트 메뉴 열리지 않음 (인라인 버튼과 중복 방지).

## 2026-04-17 — timeline-reliability

### 기능 개선

- 통합 타임라인 API에 **fallback 응답** 추가. `contact_status_history`/`drawing_revisions`이
  모두 비어있을 때, `contacts` 테이블에서 최소 이벤트(`created` + 조건부 `drawing_revision initial`)를
  파생해 응답한다. 과거 fire-and-forget 실패분이 UI에서 "타임라인 기록이 없습니다."로
  표시되던 문제 완화.
- `AutoContactService.createNewContact`를 Prisma 트랜잭션화. Contact 생성 + `recordChange('created')` +
  `createInitialRevision`이 원자적으로 보장되며, 하나라도 실패하면 Contact 자체가 롤백된다.
- `ContactTimelineService.recordChange`를 throw 동작으로 전환 (내부 warning 삼킴 제거).
  `Prisma.TransactionClient` 주입 지원.
- `DrawingRevisionService.createInitialRevision`/`createRevision`에 `tx` 파라미터 지원.

### 버그 수정

- 레이저 가공 등 특정 문의에서 타임라인이 비어 보이던 회귀 원인(fire-and-forget `.catch()`로
  조용히 실패 삼킴) 해소.

### 내부

- `TimelineItemDto`에 `fallback?: boolean` 옵셔널 필드 추가 (UI 구분용).
- `src/lib/types/contact.ts` 동기화.
- 실제 PostgreSQL 기반 신규 테스트 14건 추가.

## 2026-04-17 — drawing-timeline-unify

### 기능 개발

- 문의 상세 화면의 "타임라인"과 "도면 이력" 두 섹션을 **통합 타임라인** 단일 섹션으로 합침. 공정/유형 변경과 도면 수정을 시간순으로 인터리브하여 렌더.
- 모든 도면 업로드 경로(관리자/거래처/Worker/stage_change/DXF 매칭)에서 WebhardFile이 자동 생성되도록 개선. 저장 위치는 `{거래처루트}/문의-{workNumber}/` 하위로 통일. 파일명 프리픽스(`{workNumber} {originalName}`) 유지.
- DrawingRevision에 `webhardFileIds String[]` 필드 추가 (Prisma 마이그레이션: `drawing_revisions_webhard_link`).
- 통합 타임라인에서 도면 다운로드 인라인 지원 (파일 1개=단일 버튼, 다수=펼침 리스트).
- 기존 문의 생성 시 최초 파일이 v1 DrawingRevision으로 자동 등록되어 통합 타임라인에 자연스럽게 포함됨 (기존 `createInitialRevision` 유지).
- 거래처 포털 통합 타임라인 노출 — 서버 필터로 `isPublic=true` drawing_revision만 전송, 관리자 메타(note, admin actorName)는 마스킹.

### 버그 수정

- 타임라인 항목의 `NaN/NaN 오후 NaN:NaN` 깨진 날짜 포맷 수정. 백엔드 응답을 `createdAt` (camelCase, ISO 8601) 로 통일.
- 문의 상세 페이지의 "도면 수정 이력" Section 중복 렌더 제거.
- DrawingRevisionService.createRevision의 `timelineService.recordChange('drawing_revision')` 호출 제거 (통합 API가 DrawingRevision을 직접 읽으므로 ContactStatusHistory 중복 기록 불필요).
- 웹하드 사이드바/검색 드롭다운/검색 모달 배경 투명 문제 해결. 원인: `globals.css`의 `@theme` + `@theme inline` 충돌로 `bg-card`/`bg-muted`/`bg-background` 유틸 생성 실패. 매핑을 `@theme` 블록으로 통합하고 `@theme inline` 블록 제거.

### 내부

- `DrawingRevisionTimeline` 컴포넌트 및 `useDrawingRevisions` 훅 제거 (통합 타임라인으로 대체).
- `queryKeys.contacts.drawingRevisions` 키 제거.
- E2E 테스트 추가: 타임라인 권한 필터 + 웹하드 배경 투명 회귀 방지.

## 2026-04-16 — Design System Overhaul

### Added

- CSS variable-based design token system (`globals.css` `:root` / `.dark`)
  - Brand colors: `--brand`, `--brand-hover`, `--brand-light`, `--brand-foreground`
  - Status colors: success, warning, error, info (each with base, light, foreground variants)
  - Spacing scale: `--space-1` through `--space-12`
  - Shadow scale: `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-xl`
- Semantic color tokens in `colors.ts`: TEXT (19), BG (20), BORDER (10), DIVIDE (4), RING (1)
- UI component library (CVA + Radix UI) under `@/components/ui/`:
  - Form: Button, Input, Textarea, Select, Checkbox, Switch
  - Display: Card, Badge, Alert, Modal, Table, Tabs, Dropdown, Tooltip, Skeleton, IconButton

### Changed

- Color constants (`TEXT_COLOR`, `BG_COLOR`, `BORDER_COLOR`) — added ~54 new semantic keys backed by CSS variables
- All migrated components use CSS variable-based automatic dark mode (no manual `dark:` classes)
- Typography constants no longer include hardcoded colors
- All `[#ED6C00]` brand hex references in new code replaced with `brand` token
- Migrated all pages to new design system (shared layouts, admin, company, webhard, public, worker)
- Style modules (buttons, layout, navigation, themes, webhard) updated to use semantic tokens

### Deprecated

- Legacy color keys (TEXT_DEPRECATED, BG_DEPRECATED, BORDER_DEPRECATED) preserved for backward compatibility
- String-based style constants (BUTTON_STYLES, INPUT_STYLES) — use UI components for new code

## 2026-04-16 — 도면 워크플로우 통합 관리

### 추가

- 상태별 최신 도면 조회 API (`GET /contacts/:id/latest-drawing`)
- 거래처 포탈 도면 업로드 (문의 상세 + 웹하드 연결)
- Worker 포탈 도면 업로드
- DXF 자동 매칭 Integration API (`POST /integration/dxf-match/upload`)
- 관리자 수동 문의 연결 (도면 이동)
- 도면 타임라인 단계별 그룹핑 UI
- 문의 카드 최신 도면 원클릭 다운로드
- 웹하드 파일명에 문의번호 자동 프리픽스

### 변경

- DrawingRevision reason에 revision_request 추가
- Worker 도면 업로드 권한 추가 (기존 admin 전용 → admin + worker + company)
- 수정요청 파일 첨부 시 DrawingRevision 자동 생성

## 2026-04-16 - 업체 연결/백업 버그 수정

### Fixed

- 레이저가공 업체 관리에서 업체 연결 시 기존 문의의 companyName이 업데이트되지 않아 업체 대시보드에서 조회되지 않던 문제 수정
- 웹하드 관리 > 백업현황 데이터가 로드되지 않던 문제 수정 (BackupController 인증 방식 SessionAuth → ApiKey 변경 + Next.js 프록시 route 추가)

### Added

- linkCompany 시 기존 Contact의 companyName 일괄 동기화 + ContactStatusHistory 이력 기록
- `/api/admin/backup/[...path]` 프록시 API route (허용 경로 화이트리스트 적용)
- E2E 테스트: 업체 연결 후 문의 동기화 검증, 백업 설정 페이지 로드 검증

## 2026-04-16 - 업체등록 폼 UX 개선

### 개선

- 업체등록 폼 UX 개선: 검증 실패 시 폼 데이터 보존, 필드별 에러 메시지 표시
- 클라이언트 실시간 검증 추가 (onBlur/onChange)
- 이메일 형식 검증, 사업자등록번호 형식 검증 추가
- NestJS 연결 실패 시 명확한 에러 메시지 표시

## 2026-04-15 - 레이저 전용 업체 문의 공정 단축

### 추가

- 레이저가공 완료 시 칼작업/오시작업 스킵, 바로 완료 처리
  - 업체 대시보드: 3단계 프로그레스 바 (접수 → 레이저가공 → 완료)
  - 관리자 공정보드: 레이저 전용 문의 완료 옵션 추가
  - 작업자 앱: 레이저가공 완료 버튼 추가

### API

- `POST /api/v1/contacts/:id/complete-laser` — 레이저 전용 문의 즉시 완료

## 2026-04-15 - 웹하드 파일 업로드 CORS 수정

### 수정

- 웹하드 파일 업로드 CORS 오류 수정
  - R2 버킷 CORS 설정 스크립트 추가 (`scripts/setup-r2-cors.ts`)
  - AWS SDK v3 체크섬 비활성화 (`requestChecksumCalculation: "WHEN_REQUIRED"`)
  - 영향 범위: `webhard-api/src/storage/storage.service.ts`, `src/lib/r2/client.ts`

## 2026-04-15 - 레이저가공 전용 업체 문의 기능

### 추가

- 레이저가공 전용 업체 매핑 시스템 (LaserOnlyMapping 테이블)
  - 업체 미등록 상태에서도 폴더명으로 레이저가공 매핑 가능
  - 추후 업체 등록 시 수동 연결 기능
- 웹하드 관리 페이지 `/admin/integration/webhard`에 "레이저가공 업체 관리" 섹션
- 문의 카드에 "레이저가공" 회색 뱃지 표시
- 거래처 대시보드에서 레이저가공 문의 확인 가능
- Contact/Order 통합 설계 문서 작성

### 변경

- AutoContactService: LaserOnlyMapping 1차 체크 + Company.laserOnly 하위호환 2차 체크
- InquiryTypeBadge: laser_cutting 유형 뱃지 추가
- ContactStatus 타입에 'completed' 추가
- InquiryType 타입에 'laser_cutting' 추가

### API

- GET /api/v1/companies/laser-only-mappings — 매핑 목록 조회
- POST /api/v1/companies/laser-only-mappings — 매핑 추가
- DELETE /api/v1/companies/laser-only-mappings/:id — 매핑 삭제
- PATCH /api/v1/companies/laser-only-mappings/:id/link — 업체 연결

## 2026-04-14

### Infrastructure

- feat: 개발/프로덕션 환경 분리
  - Supabase 개발 프로젝트 분리 (기존 단일 DB → dev/prod 분리)
  - Cloudflare R2 개발 버킷 분리 (`yjlaser-dev`)
  - 환경 설정 파일 체계 정리 (`.env.example` 추가, `webhard-api/.env` 통합)
  - DATABASE_URL을 Transaction 모드(포트 6543)로 통일 (08P01 에러 근본 수정)
  - Prisma Migrate 전환 (`db push` → `migrate dev/deploy`)
  - 개발용 시드 데이터 스크립트 추가
  - 개발 환경 원커맨드 셋업 (`scripts/setup-dev.sh`)

### Added

- feat: 웹하드 관리 > 문의 자동생성 제외 폴더 설정 기능 추가

### Fixed

- 분할 문의 작업완료 시 다른 탭/사용자에게 실시간 반영되지 않던 문제 수정
- 분할 문의 타임라인이 부모 문의에 기록되지 않던 문제 수정

### Added

- 분할 하위 문의 작업완료 시 확인 모달 추가

## 2026-04-13

### feat: 문의 분할 기능

- 한 문의에 여러 도면이 합쳐진 경우, 개별 하위 문의로 분할 가능
  - Contact 테이블에 분할 관련 필드 추가 (parent_contact_id, split_index, split_count, stage_completed)
  - 분할 API (POST /contacts/:id/split)
  - 하위번호 자동 생성 (O-001-1, O-001-2 형식)
  - 그룹 진행 방식: 개별 단계 완료 체크 → 모두 완료 시 일괄 다음 단계 이동
  - 목록 그룹핑 UI (원본 헤더 + 들여쓰기 + 접기/펼치기)
  - 거래처 포탈: 하위 문의 개별 노출

### fix: 백업 시스템 버그 수정 + 비동기 처리

- periodDays → retentionDays 필드명 통일 (프론트엔드-백엔드 불일치 해결)
- backup_logs 테이블 마이그레이션 추가
- 백업 실행을 비동기 처리로 변경 (즉시 응답 + 백그라운드 실행)
- 진행률 추적 API 추가 (GET /backup/status)
- 프론트엔드: 토스트 메시지로 실행 결과 피드백 개선
- 프론트엔드: 백업 진행률 실시간 표시
- 프론트엔드: 이력 테이블 필드명 불일치 수정 (errorMessage → error)

## [Unreleased] - 2026-04-13

### Added

- 도면 수정 히스토리 기능: 공정 단계별 도면 변경 이력 추적
  - DrawingRevision 테이블 추가
  - 공정 단계 변경 시 도면 업로드 모달
  - 도면 수정 타임라인 UI
  - 외부 프로그램용 Integration API
  - 거래처 공개 설정

## [미출시]

### 추가

- 납품 관리 V2: 2단계 분리 (시작→완료) + 탭 기반 통합 UI
  - 납품 시작(delivering) → 납품 완료(delivered) 2단계 플로우
  - `/worker/delivery`에 대기/납품 중/완료 3개 탭 통합
  - 신규 API: `POST /api/v1/contacts/batch-complete-delivery`
  - Contact 모델에 `deliveryCompleteImage` 필드 (완료 사진)
  - DeliveryPhotoCapture: start/complete 모드별 사진 촬영
  - `/worker/delivered` → `/worker/delivery?tab=completed` 리다이렉트

### 수정

- 업체 등록 Critical 버그: snake_case→camelCase 키 불일치로 NestJS 400 에러 → DB 저장 실패 수정
- 관리자 문의카드 첨부파일 다운로드: presigned URL 직접 링크 → blob 다운로드 패턴 (Worker와 통일)
- 관리자 보드 납품 완료 건이 미분류/사무실/현장 카테고리에 표시되던 문제 수정

### 변경

- 업체 등록: redirect() → return 패턴으로 변경 — 성공 시 모달 표시, 실패 시 입력값 유지
- 업체 등록: 팩스 견적서 방법 선택 시 팩스번호 필수 검증 추가 (강조 + 스크롤)
- 관리자 보드: 소켓 연결 상태 표시 (연결/연결중/끊김 인디케이터)

---

## [이전]

### 추가

- WebhardConfigService 단위 테스트 33개 (캐시, 시딩, 매칭, 검증 로직)
- NestJS API 문서 전면 업데이트 — 외부 프로그램 연동용 (기존 54개 → 91개 엔드포인트)
  - `endpoints/integration.md` 신규: Integration API 41개 엔드포인트 상세 문서 (Request/Response 스키마 포함)
  - `endpoints/webhard.md` 신규: Webhard API 50개 엔드포인트 상세 문서 (업로드 플로우 다이어그램 포함)
  - `nestjs-endpoints.md` 인덱스 재구성: 외부 프로그램별 API 매핑, 인증 패턴, 공통 규약
  - 기존 문서 불일치 14건 수정 (PUT→PATCH, 경로 변경, 인증 방식)

### 수정

- 보안: 11개 NestJS 컨트롤러에 인증 가드 추가 (기존에 인증 없이 노출되어 있었음)
- 보안: password_hash가 모든 업체 API 응답에 포함되던 문제 수정
- 보안: Config 엔드포인트에 AdminGuard 추가 (거래처 사용자 접근 차단)
- 보안: 알림 네비게이션 link 허용 경로 검증 추가
- 버그: classifyByFolderPath 부분 문자열 매칭 → 정확한 세그먼트 매칭으로 변경
- 코드 품질: dark: 클래스 → styles.ts 상수 교체 (contacts 섹션)

### 변경

- batchConfirmUpload 폴더 조회를 배치 쿼리로 최적화 (N+1 방지)
- WebhardConfigService JSON 값에 런타임 타입 검증 추가
- UpdateExcludedFoldersDto @ArrayMinSize(1) 제거 (빈 목록 허용)
- Server Action 중복 'use server' 선언 제거

---

- 웹하드 관리 페이지: 통합관리 > 웹하드관리 탭 신규 생성 — 폴더→작업상태 매핑, 제외폴더, 기본폴더 설정
- 웹하드 자동문의: 하드코딩 매핑을 DB 설정 기반으로 전환 — 관리자가 UI에서 변경 가능
- migration/sync API: 외부웹하드 동기화프로그램용 API 라우트 11개 구현 (Prisma 직접 접근)
- 웹하드 폴더: 이동/이름변경 API 추가 (NestJS 엔드포인트)
- Contact 파일 다운로드: presigned URL API 도입 (보안 강화 — 시간 제한 URL)

### 변경

- 전체 프로젝트: console.log/error/warn → logger 교체 (32개 파일, 프로젝트 규칙 준수)

### 수정

- 관리자 작업관리: 미분류 선택 시 실시간 변경 안되던 버그 수정 (캐시 refetchType 변경)
- 관리자 작업관리: 사무실/현장작업 상태 변경 시 실시간 이동 안되던 버그 수정 (processBoard invalidation 추가)
- 관리자 작업관리: 웹하드에서 보기 404 에러 수정 (URL 경로 수정)
- 관리자 작업관리: 파일 다운로드 NoSuchKey 에러 수정 (R2 key 추출 로직 추가)
- 미분류 드롭다운 UI 짤림 수정 (overflow-hidden → overflow-visible)

### 변경

- 배지 UI 공통 디자인 시스템 통일: 인라인 하드코딩 7곳 → BADGE 상수 참조로 통일 + 다크모드 자동 지원

### 추가

- 웹하드 자동 문의 생성: 파일 업로드 시 폴더 경로(칼선의뢰/목형의뢰) 기반 자동 문의 생성
- 문의 유형 분류: inquiry_type 컬럼 (cutting_request/mold_request) + 미분류 관리자 알림
- 관리자 UI: 미분류 배지+드롭다운, 문의유형 필터, 상세 페이지 유형 선택기
- ERP status 보존 가드: processStageToContactStatus에서 drawing/confirmed 덮어쓰기 방지
- 현장 작업자 전용 포털: worker.yjlaser.net 서브도메인 라우팅
- 작업자 IP 화이트리스트: 고정 데스크탑 IP만 접근 허용, rate limit (5회/5분)
- 접근 로그 시스템: 로그인 성공/실패/IP 차단 기록 + 보안 대시보드
- 작업 대시보드: 공정별 카운트 (전체/레이저/칼오시/납품) 통계
- 메모/이슈 보고: 작업자가 작업 카드에서 메모 또는 이슈 보고
- 작업 파일 열기: 웹하드 폴더 내 파일 목록 조회 + 개별 다운로드
- 관리자 워크플로우 모니터링: 작업자 현황 실시간 확인 (Supabase Realtime)
- 관리자 IP 관리 UI: 작업자별 허용 IP CRUD
- 웹하드 새파일 목록: 디렉토리 경로 표시, 업로더 표시 (관리자/업체명)
- 웹하드 새파일 목록: 정렬 기능 3종 (업로드 날짜, 파일명, 업로더)
- 웹하드 사이드바/새파일: 뉴뱃지 부모 폴더 전파 (하위 새파일 있으면 상위에도 표시)
- 웹하드 검색: 폴더 선택 Enter → 해당 경로 페이지 이동
- 웹하드 검색: 위/아래 키보드 네비게이션 + 자동 스크롤

### 변경

- **DB 리팩토링: Supabase → Prisma 단일 ORM 통합** — 이중 ORM 구조 해소
  - Supabase Client `.from()` ~289회 호출 → NestJS API + Prisma ORM으로 전환
  - Supabase RPC 29종 → Prisma 쿼리 / NestJS 서비스 로직으로 대체
  - Supabase Realtime 20곳 → Socket.IO Gateway 5개로 대체
  - NestJS Raw SQL 20건 → Prisma ORM 전환
  - `@supabase/supabase-js`, `@supabase/ssr` 패키지 완전 제거
  - NestJS 모듈 11개 신설 (58+ REST 엔드포인트)
  - Prisma 모델 18 → 33개 (Contact 93컬럼, Company 29컬럼 등)
  - 259 files changed, -3,842 lines net reduction
- 레거시 webhard-contact API 제거 — 문의 자동 생성이 AutoContactService로 이관됨에 따라 기존 엔드포인트 + 외부웹하드동기화프로그램 호출 코드 정리

### 수정

- 대규모 폴더 삭제 timeout 버그 수정 — BFS 200개 청크 분할 soft delete fallback (authenticated 60s timeout 우회)
- collect_folder_tree_ids RPC 추가 (읽기전용 폴더트리 수집)
- 폴더 전체삭제 RPC 오류 수정 — delete_folders_batch 실패 시 delete_folder_recursive fallback
- [보안] batchConfirmUpload company_id 주입 차단
- [보안] 공유링크 생성 file_path 소유권 검증 추가
- [보안] 공유링크 목록 company_id 필터 강제
- [보안] getFolderDetail 하위 리소스 company_id 필터 추가
- [보안] WebSocket 폴더 구독 접근 제어 추가
- [보안] 멀티파트 업로드 key 경로 검증
- [보안] 파일/폴더 삭제 관리자 전용 제한
- [보안] getBadgeCounts 폴더 ID 노출 차단
- [보안] CompanyAccessGuard 전체 컨트롤러 적용
- [보안] presigned URL/markDownloaded folderId 검증 추가
- [보안] 세션쿠키 디버그 로깅 제거
- [보안] Share 링크 삭제 IDOR 취약점 수정 (소유권 검증 추가)
- [보안] NestJS timingSafeEqual 문자열 길이 정보 누출 방지
- 외부웹하드 폴더(올리기전용/내리기전용) company 사용자 접근 차단

### 추가

- CI/CD 파이프라인 (.github/workflows/ci.yml — typecheck, lint, test, build)
- Extended Thinking 가이드 (.claude/rules/extended-thinking.md)
- Git Worktree 가이드 (.claude/rules/git-worktree.md)
- PostToolUse ESLint 훅 + Stop 훅 (변경사항 감지)

- 웹하드 삭제 확인 모달 (ConfirmDeleteModal)

- FEAT-011: 사무실 작업자 페이지 (/worker/office)
  - 사무실 단계 전용 작업 현황 (공정 시작 전, 도면작업, 샘플제작)
  - OfficeAdvanceButton (null→drawing→sample→drawing_confirmed 전환)
  - 실시간 Supabase 구독 + 검색/필터
  - 로그인 역할 기반 라우팅 (office_worker → /worker/office)

- FEAT-012: 외부 프로그램 공정단계 변경 API
  - PATCH /api/admin/contacts/[id]/process-stage (API Key + 관리자 세션 인증)

- FEAT-013: 외부웹하드 파일 감지 → 자동 문의 생성 파이프라인
  - POST /api/v1/integration/contacts/webhard-sync 엔드포인트
  - DXF 파일명 파서 (업체명, 제품정보 자동 추출, 테스트 파일 스킵)
  - WebhardSyncController + DTO (class-validator) + 모듈 등록
  - 기존 createWebhardContact() 메서드 활용 (중복 체크 포함)

- FEAT-010: 작업관리 > 작업 탭 재설계 — 사무실/현장 작업 카테고리 서브탭
  - 작업 탭을 칸반보드에서 작업 목록 뷰로 전환
  - 사무실 작업(접수~샘플) / 현장 작업(도면확정~납품) 카테고리 필터
  - 공정 단계별 필터, 날짜 필터, 검색 기능
  - 실시간 업데이트 (Supabase subscription)
  - Admin contacts API에 workCategory 파라미터 추가
  - 외부 프로그램 연동용 API 명세서 작성 (docs/specs/api/work-tasks-api.md)

### 진행 중

- INFRA-001: 프로젝트 워크플로우 재구성 (SDD 체계 도입)
  - 명세 문서 체계 도입 (docs/specs/)
  - .claude/ 디렉토리 재구성 (스킬, 에이전트, 커맨드, 규칙)
  - 세션 인수인계 시스템 (progress.txt, features-list.md)
  - CHANGELOG 도입

---

## [2026-03-11]

### 추가

- 웹하드 보안 19건 수정 + 성능 최적화 + ApiKeyGuard 통합 (0ae7f0b)
- CLAUDE.md 영어 간결 버전으로 전면 개편 (5427df6)

## [2026-03-10]

### 추가

- Railway 백엔드 배포 + Vercel 프론트엔드 프로덕션 배포 (92c57d8)
- /worker/tasks UI 개선 — 컴팩트 카드 + 작업완료 + 검색 + 납품 플로우 (aae962c)
- Auto Contact 생성 API + 관리프로그램 API 클라이언트 확장 (c0477e8)
- 현장 작업현황 프론트엔드 UI 구현 (3c347b7)
- Workshop + SyncLog 프론트엔드 타입/API/훅 추가 (6aef760)
- 30분 자동 납품완료 Cron Job 추가 (d0302ab)
- Workshop Orders API 추가 (c44af3e)
- SyncLog NestJS 모듈 추가 (8d00871)

---

## [2026-03-10 이전]

- 242 커밋 누적 (상세 이력은 git log 참조)
