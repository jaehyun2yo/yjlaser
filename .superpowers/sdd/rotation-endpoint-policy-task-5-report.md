# Rotation endpoint policy Task 5 report

상태: `DONE — final correctness/security re-reviews clean`

기준일: 2026-07-20

대상: 회사사이트 clean RC의 중앙 API source와 로컬 합성 테스트

## 결론

표준 장치 bearer 업무 allowlist를 정확히 14개 method/path로 연결했다. 승인되지 않은 route는
default-deny이며 `safe_canary`, wrong program/environment/permission, revoked/stale 장치와 혼합
principal은 업무 서비스 전에 차단한다. 장치 principal은 `request.deviceAuthInfo`만 사용하고
`request.user`를 합성하지 않는다. 기존 session/static API key 흐름은 별도 legacy 경계로 유지했다.
독립 보안 리뷰의 Important 2건(`TASK5-SEC-001`, `TASK5-SEC-002`)과 correctness 후속
`TASK5-COR-002`의 upload/event 경계는 device 전용 service 경계, 서버 파생 namespace,
canonical R2 key 및 presign-confirm 전달 계약으로 수정했다. 최종 correctness와 security 재리뷰는
각각 finding 0, Critical/Important/Minor `0/0/0`으로 clean이며 `TASK5-COR-002`는 closed다.

실제 DB/migration apply, Redis/secret, 운영 설정, 장치 등록·폐기·rotation, desktop 코드, 배포,
stage, commit, push는 실행하지 않았다.

## 승인 route

| Program                 | Method/path                                            | Permission                 |
| ----------------------- | ------------------------------------------------------ | -------------------------- |
| `external_webhard_sync` | `GET /folders/children`                                | `folder/read`              |
| `external_webhard_sync` | `POST /folders`                                        | `folder/write`             |
| `external_webhard_sync` | `PATCH /folders/:id/rename`                            | `folder/write`             |
| `external_webhard_sync` | `PATCH /folders/:id/move`                              | `folder/move`              |
| `external_webhard_sync` | `GET /files`                                           | `file/read`                |
| `external_webhard_sync` | `POST /files/presigned-url`                            | `file/write`               |
| `external_webhard_sync` | `POST /files/confirm`                                  | `file/write`               |
| `external_webhard_sync` | `PATCH /files/:id/rename`                              | `file/write`               |
| `external_webhard_sync` | `PATCH /files/:id/move`                                | `file/move`                |
| `management_program`    | `POST /integration/events`                             | `event/write`              |
| `management_program`    | `GET /integration/orders`                              | `job/read`                 |
| `management_program`    | `GET /integration/bank-notifications`                  | `bank-notification/read`   |
| `management_program`    | `PATCH /integration/bank-notifications/mark-processed` | `bank-notification/manage` |
| `management_program`    | `POST /integration/bank-notifications/backup-batches`  | `bank-notification/manage` |

Registry 14개 행과 controller handler metadata 14개를 1:1로 검증했다. 파일/폴더 controller는
device 전용 service method로만 분기하며, 해당 service는 wrong program 또는 missing permission을
persistence/storage mock 호출 전에 거부한다.

## Hard hold 및 비중앙 범위

- 모든 `nesting_program` 업무 route
- file/folder delete, batch delete, multipart 및 admin mutation
- management retention, contact/general-contact cleanup
- inventory, nesting task, laser completion, legacy `/integration/programs/heartbeat`
- 관리자 device-management와 rotation route
- registry에 없는 모든 장치 bearer route

presigned storage PUT, LGU+ provider, browser download, task DXF URL, local/NAS I/O는 중앙 장치
principal 정책 대상이 아니다. hard-hold 범위는 bearer-only, bearer+valid-static,
bearer+named-session 조합에서 모두 서비스/write 0호출을 확인했다. 관리자 device/rotation 두
controller도 같은 세 조합을 명시적으로 거부한다.

## 주요 변경

- `CurrentIntegrationPrincipal` discriminated union을 추가하고 device principal에서 ambient
  `request.user` 합성을 금지했다.
- `CompanyAccessGuard`는 composite source guard가 인증한 exact device bearer만 허용한다.
- files/folders에 비파괴 승인 route용 device-scoped service adapter를 추가하고 destructive route는
  기존 session/static 경계에 남겼다.
- events/orders/bank notification의 승인 route에 exact endpoint metadata를 추가했다.
- touched sibling module은 `DeviceAuthModule`과 composite/policy guard provider를 명시적으로
  연결했다.
- legacy programs 혼합 source 기대값을 중앙 계약의 HTTP 401 및
  `INTEGRATION_PRINCIPAL_AMBIGUOUS`로 정합화했다.

## 독립 리뷰 finding 수정

### `TASK5-SEC-001` 이벤트 principal binding

- `POST /integration/events`가 `CurrentIntegrationPrincipal`을 받고 device bearer를
  `EventsService.createEventForDevice`로 분기한다.
- device bearer는 `EventEnvelopeDto`만 허용하며 legacy `CreateEventDto`를 거부한다.
- `source_worker`는 인증된 `principal.programType`과 exact match여야 한다. CR/LF suffix를 포함한
  불일치는 persistence 및 상태 변경 전에 거부한다.
- device `event_type`과 `error.code`의 CR/LF도 persistence 및 logger 호출 전에 거부한다.
- static API key와 admin session의 envelope/legacy payload 호환은 유지했다.

### `TASK5-SEC-002` device resource namespace integrity

- `external_webhard_sync` device의 folder create는 client `companyId`와 검증된 parent namespace를
  비교한다. file presign/confirm은 client `companyId`를 신뢰하지 않으며 non-null 값을 routing,
  lazy folder create, pipeline event, storage 및 Prisma write 전에 거부한다.
- device upload의 effective `companyId`는 routed folder, 검증된 folder, 또는 null root에서 서버가
  파생한다. client는 `companyId`를 생략하거나 null로만 보낼 수 있다.
- device R2 confirm key는 서버 파생 company/folder의 canonical
  `webhard/{company-segment}/{effectiveFolderId?}/` prefix와 일치해야 한다. 다른 company/folder
  namespace key는 mutation, storage 및 event 전에 거부한다.
- device file/folder move는 source와 target의 company namespace가 동일해야 하며, null root 이동도
  source namespace가 null일 때만 허용한다.
- 모든 mismatch는 storage, Prisma mutation, event 호출 전에 거부한다. 기존 session/static
  경계의 정상 routed/original-husk 흐름은 유지했다.

### `TASK5-COR-002` device confirm presign binding

- device confirm은 non-null client `companyId`를 먼저 거부한 뒤 제출된 `folderId`를 read-only로
  조회하고, 서버가 확인한 company 및 그 exact folder의 canonical key를 검증한 후에만 mutation을
  수행한다.
- device 클라이언트는 presign 응답의 `folderId`와 `key`를 변경하지 않고 confirm에 전달해야 한다.
  원래 외부웹하드 husk `folderId` 재전송은 금지하며, device confirm은 rerouting 또는 lazy folder
  생성을 수행하지 않는다.
- nested wrong-key 거부 시 routing, lazy folder/Drive 생성, pipeline event, storage, Prisma mutation이
  모두 0호출임을 검증했다.
- 기존 static API key 및 admin session confirm의 original-husk rerouting은 legacy 호환을 위해
  그대로 유지하고 회귀 테스트로 확인했다.

완전한 presign receipt는 이번 Task 5 wire 계약 확장 범위가 아니다. canonical prefix는
cross-company/cross-folder key 결합을 차단하지만, 같은 company/folder namespace 안에서의 key replay를
one-time으로 소진시키지는 않는다. signed one-time presign receipt는 별도 후속 hardening residual이다.
canonical key boundary와 idempotency의 전용 명시 테스트 보강도 비차단 testing gap으로 남긴다.

## 검증

| 검증                                                             | 결과                                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security/correctness finding focused                             | 2 suites / 26 tests, exit 0                                                                                                                                   |
| Upload/routing 기존 회귀                                         | 3 suites / 106 tests, exit 0                                                                                                                                  |
| Task 5 central focused (`folders.service.spec.ts` residual 제외) | formatter 확인 후 fresh 18 suites / 314 tests, exit 0; 사전 경로 18/18 확인                                                                                   |
| Files/folders 전체 service                                       | 104 passed / 107 total, 아래 기존 3건만 실패                                                                                                                  |
| TypeScript `--noEmit`                                            | exit 0                                                                                                                                                        |
| Nest build                                                       | exit 0                                                                                                                                                        |
| Prisma schema validate                                           | 1차는 필수 `DIRECT_URL` placeholder 누락으로 P1012; `DATABASE_URL`과 `DIRECT_URL`을 process-local placeholder로 지정한 최종 실행은 exit 0; DB 접속/apply 없음 |
| Prettier (Task 5 변경 코드)                                      | formatter 적용 후 `--check` exit 0                                                                                                                            |
| Scoped `git diff --check`                                        | tracked worktree 전체 exit 0; Task 5 untracked 20개 경로 no-index check exit 0                                                                                |
| Placeholder/secret-pattern scan                                  | 변경 source/report 문서에서 미해결 marker 또는 credential 패턴 없음                                                                                           |

별도 folders suite 잔여 실패:

1. `inquiryNumber/workNumber 매칭 파일 이동`
2. `이미 target 에 있는 파일은 skip`
3. `#6: 정상 Company + webhardFileIds + inquiryNumber 매칭 → 합집합 이동`

세 실패는 `FoldersService.relocateContactFiles`의 기존 fixture/동작이며 Task 5가 수정한 device
adapter/helper와 직접 호출 관계가 없다. Task 5 diff는 해당 함수(현재 source 2351행 이후)나 기존
테스트 기대를 변경하지 않았다. 인증 범위 밖 production 수정은 하지 않았다. Task 5가 추가한
folders service wrong-program/missing-permission 테스트 2건은 통과했다.

## 변경 경로

- `webhard-api/src/integration/auth/`: current principal, endpoint scope/wiring tests
- `webhard-api/src/auth/guards/company-access.guard*`
- `webhard-api/src/files/`: controller/service/module 및 Task 5 tests
- `webhard-api/src/folders/`: controller/service/module 및 Task 5 tests
- `webhard-api/src/integration/events/`, `orders/`, `bank-notifications/`
- 관리자 device-management/rotation 및 legacy programs의 혼합 principal 회귀 tests
- clean RC API/progress 문서와 승인된 parent inventory/current-goal/plan 문서

## 최종 독립 재리뷰

최종 correctness와 security reviewer는 14개 승인 행, registry-handler wiring, legacy/session 보존,
destructive route hard hold, device principal 비합성 및 `TASK5-SEC-001`, `TASK5-SEC-002`,
`TASK5-COR-002` 수정 경계를 재검토했다. 결과는 양쪽 모두 finding 0,
Critical/Important/Minor `0/0/0`이며 `TASK5-COR-002`는 closed다.

Reviewer의 독립 Jest 재실행은 실행 환경의 `EPERM`/OOM 제약으로 완료되지 않았다. 이 실행 한계는
구현자가 clean RC에서 확보한 focused 26/26, upload/routing 106/106, central 314/314 증적을 무효화하지
않지만 독립 실행 증적으로 과장하지 않는다. same-namespace key replay와 signed one-time receipt,
canonical key-boundary/idempotency 전용 테스트는 비차단 후속이며, 실제 DB/migration, 배포 및 운영 장치
검증은 수행하지 않았다. 잔여 folders 3건은 Task 5 범위 밖이다. 현재 상태는 `DONE`이다.
