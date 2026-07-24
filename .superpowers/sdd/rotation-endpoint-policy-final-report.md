# Rotation endpoint policy final source report

상태: `SOURCE_ONLY_DONE — correctness/security approved`

기준일: 2026-07-20

## Source-only 결론

Task 6는 중앙 compatibility evidence collector와 full source 검증까지 완료했다. collector는 DB,
network, server process 또는 환경 secret을 사용하지 않고 source/build/schema hash, enum/nullable-column
호환성과 실제 runtime-disabled boundary 관찰 결과만 출력한다. 실제 운영 전환은 완료가 아니다.

Parent contract 작업은 rotation request/status/cancel, token directive, prepare/ack, ACK 응답 유실 복구,
승인 route 14개, legacy/static 분리와 `device_rotation_incompatible` 409/no-store/fail-closed를 잠갔다.
JS/Python fixture verifier `--require-copies 0`, Node syntax check와 JSON parse는 모두 exit 0이다.
이는 중앙 canonical source 증적이며 desktop 3개 copy 호환 증적이 아니다.

## Collector TDD 및 증적

| 항목                  | 결과                                                                           |
| --------------------- | ------------------------------------------------------------------------------ |
| RED                   | collector import 부재 TS2307, 1 suite failed / 0 tests, exit 1                 |
| Review-fix RED        | runtime boundary 필드 부재 TS2339, 1 suite failed / 0 tests, exit 1            |
| GREEN/final focused   | 1 suite / 16 tests, exit 0                                                     |
| Base HEAD             | `659c06f4e4ba5b139aa490b94012a4756204dc98`                                     |
| Source tree           | 578 files, `21afafacbc4413f680f944b3683cfc67b8dd2a4af857e6dd17772b387d629256`  |
| Determinism           | unchanged tree에서 source hash 2회 동일, 각 exit 0                             |
| Built tree            | 1103 files, `e31f0113715de2495777975d50eb6777e1118250dd1ec48dfa54f2cfe0f9dee3` |
| Prisma schema         | `18b1238896e7e706ab548774afd7959d2f68b6741255b309c44a4c4edd228a3c`             |
| Compatibility         | exact 7 statuses, invalid 3 rejected, nullable columns 5개                     |
| Built collector probe | exact 5 HTTP targets, 404/no-store, all downstream counters 0, exit 0          |

Runtime-disabled probe는 실제 exported middleware를 5개 controller metadata target
(`request`, `status`, `cancel`, `prepare`, `ack`)에 호출한다. 실제 `DeviceAuthModule.configure()` consumer
wiring, built controller method/path metadata, `main` raw gate-before-parser와 generic parser bypass를 함께
검사한다. `next`, body parser, controller, service, Prisma write 관찰 counter는 모두 0이다. token rotation
directive는 HTTP 404 대상이 아니므로 별도로 `rotationRuntimeEnabled ? findFirst : null` gate와 실제
token exchange service 회귀 테스트로 suppression을 검증한다.

Current built tree와 actual dist probe를 코드/빌드 변경 없이 연속 2회 실행했고, 두 번 모두 1103 files,
동일 SHA-256과 exact 5 target/downstream 0 결과를 반환했다. 이전 built-tree 기록 뒤 final
`tsc --noEmit`가 incremental `dist/tsconfig.tsbuildinfo`를 생성해 파일 1개가 늘어난 것이 drift의
원인이다. 기존 Nest build 산출물의 `dist/tsconfig.build.tsbuildinfo`와 별개 파일이다.

재현 가능한 evidence 순서는 `final clean build → actual built probe → built hash/probe 연속 2회 → 이후
build output 변경 금지`다. 회사사이트 compatibility evidence의 built-tree 범위는 `dist`의 모든 파일을
포함하므로 두 `.tsbuildinfo`도 포함한다. 이번 docs-only 교정에서는 rebuild, tsc, dist 삭제/변경을
실행하지 않았다.

Source scope는 `webhard-api/src`, `prisma`, `scripts`와 고정 build input이다. tracked 여부와 무관하게
포함하며 `.env*`, `secrets`, `node_modules`, `dist`, coverage와 evidence output을 제외한다.

## Full source verification

계획의 monolithic Jest 명령은 15 suites PASS 출력 후 summary/exit 없이 종료되어 PASS 증적에서
제외했다. 동일한 53개 target을 누락·중복 없이 직렬 소그룹으로 재실행했다.

| Manifest group                        | Suites |   Tests | 결과         |
| ------------------------------------- | -----: | ------: | ------------ |
| device config/hash/persistence/module |      8 |     141 | PASS         |
| bootstrap/enrollment                  |     11 |     208 | PASS         |
| token/bearer                          |      7 |     109 | PASS         |
| rotation/management/heartbeat         |     11 |     196 | PASS         |
| integration auth A                    |      6 |      37 | PASS         |
| integration endpoint policy           |      3 |      75 | PASS         |
| integration wiring/principal/legacy   |      3 |      27 | PASS         |
| common transport/CSRF/redaction       |      4 |     112 | PASS, exit 0 |
| **합계**                              | **53** | **905** | **PASS**     |

추가 검증:

- collector focused: 1 suite / 16 tests, exit 0
- review-fix affected middleware/module/token/schema regression: 7 suites / 195 tests, exit 0
- `pnpm exec tsc --noEmit --pretty false`: exit 0
- `pnpm build`: success; 기존 npm config warning만 출력
- placeholder `DATABASE_URL`/`DIRECT_URL`의 `pnpm exec prisma validate`: exit 0; DB 연결/apply 없음
- owned code/docs Prettier write/check: exit 0
- scoped `git diff --check`: exit 0; trailing whitespace 0건
- owned 신규 파일과 changelog 변경분 marker/credential scan: 미해결 marker·실제 credential 0건
- collector side-effect API scan: `process.env`, child process, network, server listen 사용 0건

기본 Jest config는 `rootDir=src`라 계획의 `scripts/...spec.ts` 경로를 발견하지 못한다. collector spec은
재현 가능한 inline config(`rootDir=.` / `ts-jest` / exact `--runTestsByPath`)로 실행했다. 전역 Jest
설정은 변경하지 않았다.

전체 changelog 직접 scan에는 기존 384행의 로컬 placeholder Prisma URL 예제가 1건 잡혔다. 이번 Task 6
변경분이 아니며 실제 target/credential이 아닌 기존 문서 예제다. Task 6 신규 파일과 changelog diff에는
해당 패턴이 없다.

## 운영 승인 전 체크리스트

이 표는 실행 명령이 아니라 승인 card다. 실제 endpoint, DSN, secret, PC/customer 식별값을 기록하지
않는다.

| 확인 항목                                       | 현재 상태 | Go 조건                                       |
| ----------------------------------------------- | --------- | --------------------------------------------- |
| 대상 environment 승인 reference                 | 미확보    | 단일 dev 또는 stg 승인 reference              |
| target-bound DB/backup/rollback owner reference | 미확보    | 동일 environment의 검증된 reference           |
| named Redis/JWT/config reference                | 미확보    | 값 없는 승인 reference와 owner                |
| source/build/schema evidence                    | 확보      | 위 hash와 reviewed source 일치                |
| immutable server image ID                       | 미확보    | local no-secret gate에서 한 개의 `sha256:` ID |
| prior compatible rollback image digest          | 미확보    | 새 enum/nullable columns를 읽는 digest        |
| migration pre/post verification owner           | 미확보    | additive migration과 null/null 판정 owner     |
| DEV/STG synthetic/canary/stop owner             | 미확보    | 프로그램별 별도 owner/reference               |
| desktop fixture copies                          | 0/3       | byte-identical copies 및 `--require-copies 3` |

## Docker blocker와 No-Go

Read-only `docker version`은 client 29.1.3을 확인했지만
`npipe:////./pipe/dockerDesktopLinuxEngine` daemon pipe가 없어 exit 1이었다. daemon을 시작하거나
우회하지 않았다. 병렬 parent 확인에서도 별도 context의 `npipe:////./pipe/docker_engine` daemon
pipe가 없었다. 어느 관측에서도 build/pull/run/start/push를 실행하지 않았다. immutable image ID와
prior compatible rollback image digest도 없다. 따라서 local server image artifact gate와 모든 배포는
`No-Go`다.

## 미수행

- 실제 DB 확인 또는 migration apply
- Redis/JWT/Doppler/API key 등 실제 secret 접근·주입
- 실제 장치 등록·회전·폐기, 고객/PC 데이터 검증
- desktop 3개 프로젝트 코드/fixture/version/artifact
- Docker image build/sign/publish, NAS/GitHub publish, Railway/Vercel deploy
- server/container 시작, stage/commit/push

Fresh correctness/security re-review는 두 리뷰 모두 source-only 승인, Critical/Important 0이다. 공통
Minor 1건은 built-tree 문서 drift뿐이었고 current stable evidence로 교정했다. Task 6 source-only 범위는
`DONE`이며 operational image/deploy는 계속 `No-Go`다.
