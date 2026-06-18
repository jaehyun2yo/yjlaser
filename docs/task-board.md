# YJ Laser 작업 보드

최종 갱신일: 2026-05-13

## 목적

이 문서는 다음 작업 우선순위를 결정하기 위한 운영용 작업 보드다. 기존에는 배포 대기 기능, 수동 QA 누락, 미완료 스펙, 장기 기능 후보가 `docs/features-list.md`, `docs/progress.txt`, `docs/specs/**`, `TODOS.md`, `docs/reports/**`에 흩어져 있었다.

이 문서는 기능 스펙을 대체하지 않는다. 실제 구현 전에는 연결된 spec/API/DB/test 문서를 기준으로 범위를 다시 확인한다.

## 기준 문서

- `docs/features-list.md` — shipped / implemented pending deploy 상태.
- `docs/progress.txt` — 최근 세션, 수동 QA 누락, 배포 후속 작업.
- `docs/specs/PRD.md` — 제품 단위 완료/미구현 범위.
- `docs/specs/features/webhard-system.md` — 웹하드 동작 계약.
- `docs/specs/features/worker-portal.md` — Worker 포털 완료 기준.
- `docs/specs/features/design-system.md` — 디자인 시스템 검증 체크리스트.
- `docs/reports/project-audit-2026-05-08.md` 및 후속 playbook — 감사 기반 안정화 작업.
- `TODOS.md` 및 코드 TODO — 낮은 수준의 기술부채와 보류된 보안 작업.

## 현재 상태 요약

- `docs/features-list.md` 기준 `implemented (..., pending deploy)` 항목은 REL-001 작성 시점 29개였다. 남은 작업 처리 중 Worker PIN brute-force와 외부웹하드 미분류 알림 dedupe 2개가 추가되어 release train 추적 대상은 31개가 됐고, 2026-05-14 기준 이 2개는 backend production 배포 후 수동 QA 대기 상태다.
- 최근 `docs/progress.txt`에는 Worker 알림, 웹하드 조작, 외부웹하드 sync, 납품증빙 사진, 레이저 완료 API, 비밀번호 재설정 메일 플로우의 브라우저/운영 수동 QA 미실행이 반복 기록되어 있다.
- PRD의 명시 미구현은 청구서다: `ADM-004` 관리자 청구서 관리, `CMP-003` 거래처 청구서 조회.
- `worker-portal.md`는 아직 `IN_PROGRESS`다. Worker 기능은 실사용 가능한 수준까지 올라왔지만, 접속 보안과 운영 추적은 미완성이다.
- 웹하드는 기능 폭이 넓지만 업로드, 폴더 라우팅, 자동 문의 생성, realtime, 미다운로드 배지, 권한, 외부웹하드 sync가 서로 강하게 연결되어 회귀 위험이 높다.
- 공개 회사사이트는 PRD상 완료지만, 디자인 품질과 모바일/데스크톱 시각 QA가 별도 release gate로 관리되지 않는다.

## 우선순위 기준

| 우선순위 | 의미                                                              | 예시                                                                         |
| -------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| P0       | 운영 배포, 보안, 데이터 소유권, 복구 가능성을 막는 작업           | 배포 확인, migration, auth/session, 파일 ownership, 백업 권한                |
| P1       | 일상 업무 안정성 또는 자주 쓰는 흐름을 막는 작업                  | 웹하드 QA, Worker 납품, 자동 문의 파이프라인, 비밀번호 재설정 메일, 모니터링 |
| P2       | 제품 완성도와 사용자 경험에 중요하지만 즉시 운영 차단은 아닌 작업 | 청구서 기획, 회사사이트 시각 개선, 디자인 시스템 정리                        |
| P3       | 장기 자동화 또는 나중에 해도 되는 개선                            | 오시칼 자동화, 운영 안정화 이후 대형 리팩토링                                |

## 상태 컬럼

| 상태           | 의미                                                        |
| -------------- | ----------------------------------------------------------- |
| Backlog        | 알려진 작업이지만 아직 바로 시작하기에는 범위가 덜 정리됨   |
| Ready          | 추가 조사 없이 바로 시작 가능한 작업                        |
| In Progress    | 현재 작업 중                                                |
| Needs QA       | 구현 또는 설정은 됐지만 수동/브라우저/운영 유사 검증이 남음 |
| Pending Deploy | repo에는 구현됐지만 운영 배포와 검증이 완료되지 않음        |
| Shipped        | 의도한 환경에 배포되고 검증됨                               |
| Follow-up      | 운영 반영은 됐지만 낮은 우선순위 개선이나 관측이 남음       |

## 권장 실행 순서

1. P0 배포 준비와 운영 검증.
2. P0 보안과 인증 경계.
3. P1 웹하드와 외부웹하드 end-to-end QA.
4. P1 Worker 운영 보강과 모바일 QA.
5. P1 문의/거래처 계정 운영 QA.
6. P2 회사사이트와 디자인 시스템 품질 정리.
7. P2 청구서 시스템 기획.

## 작업 보드

| ID      | 우선순위 | 영역            | 상태      | 작업                                                         | 완료 기준                                                                                                                                                             | 출처                                                                                                                         |
| ------- | -------- | --------------- | --------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| REL-001 | P0       | Release         | Shipped   | 29개 `pending deploy` 항목을 하나의 release checklist로 정리 | `docs/release-readiness.md`에 각 항목의 도메인, 배포 대상, migration/env 의존성, 수동 QA 시나리오, 위험도, 완료 기준이 지정됨                                         | `docs/features-list.md`, `docs/release-readiness.md`                                                                         |
| REL-002 | P0       | Release         | Needs QA  | 프론트/백엔드 운영 배포 경로 확인                            | Railway production 연결, runtime health, backend 로컬 build는 확인됨. Vercel production project 접근과 Docker build 검증, 실제 release 배포가 남음                    | `docs/progress.txt` sessions #66, #69, `docs/release-readiness.md`                                                           |
| REL-003 | P0       | Infra           | Needs QA  | 배포 전 운영 env와 migration 확인                            | password reset migration은 운영 DB에 적용됐고 DB/R2/SMTP/session/CORS env 이름은 확인됨. frontend Vercel env, DB backup/rollback, 실제 메일 왕복 QA가 남음            | `docs/progress.txt` sessions #35, #66, #69, `docs/release-readiness.md`                                                      |
| SEC-001 | P0       | Worker          | Needs QA  | PIN brute-force 방어 구현 또는 마무리                        | `pin-brute-force.spec.ts` TODO 경로가 활성화되고 Worker PIN 시도가 actor/IP 정책으로 rate limit됨. Railway deployment `aa505252-66fb-4ee5-b87f-8013aa2ad0a3`에 배포됨 | `docs/progress.txt`, `webhard-api/src/erp/workers/__tests__/pin-brute-force.spec.ts`, `docs/specs/features/worker-portal.md` |
| SEC-002 | P0       | Realtime/Auth   | Backlog   | 운영 WebSocket cookie/session 인증 문제 해결                 | Admin/Worker realtime 연결이 운영 도메인에서 정상 session을 검증하고 만료/위조 session을 거부함                                                                       | `docs/progress.txt` sessions #26-#32, `TODOS.md`                                                                             |
| SEC-003 | P0       | Admin/Backup    | Needs QA  | 백업 API 권한 경계 운영 확인                                 | admin session과 scoped backup API key는 허용되고 company session과 unscoped API key는 거부됨                                                                          | `docs/features-list.md`, audit PR 1                                                                                          |
| WH-001  | P1       | Webhard         | Needs QA  | 웹하드 핵심 브라우저 smoke 실행                              | admin/company 계정으로 upload, download, rename, move, DXF preview, badge refresh, session expiry가 reload 복구 없이 동작함                                           | `docs/progress.txt`, `docs/specs/features/webhard-system.md`                                                                 |
| WH-002  | P1       | Webhard         | Needs QA  | 외부웹하드 sync → AutoContact → Worker 알림 E2E 실행         | 외부 sync 파일이 올바르게 라우팅되고 Contact 생성/갱신, Worker 알림, 문의 폴더 이동까지 확인됨                                                                        | `docs/features-list.md`, `docs/progress.txt`                                                                                 |
| WH-003  | P1       | Webhard         | Needs QA  | 실제 폴더 데이터로 company ownership/visibility 확인         | company 사용자는 허용된 폴더/파일만 보고 admin-only 폴더 action을 수행하지 못함                                                                                       | `docs/specs/features/webhard-system.md`                                                                                      |
| WH-004  | P1       | Webhard         | Follow-up | pipeline backlog가 관리자에게 실제로 유용한지 확인           | routing 실패와 AutoContact skip reason이 presigned URL, token, raw API key, secret 없이 조회됨                                                                        | `docs/specs/features/webhard-pipeline-observability.md`                                                                      |
| WH-005  | P1       | Webhard         | Needs QA  | 외부 sync dedupe 정책 결정                                   | 같은 `folderPath` 중복 이벤트 정책이 문서화되고 구현되어 Railway deployment `aa505252-66fb-4ee5-b87f-8013aa2ad0a3`에 배포됨                                           | `webhard-api/src/integration/orders/auto-contact.service.ts`, `docs/specs/features/webhard-system.md`                        |
| WRK-001 | P1       | Worker          | Shipped   | Worker portal hardening 범위 마무리                          | subdomain routing, IP whitelist, access log, admin IP UI, monitoring/security dashboard가 티켓화됨                                                                    | `docs/specs/features/worker-portal.md`, `docs/specs/features/worker-hardening-roadmap.md`                                    |
| WRK-002 | P1       | Worker          | Needs QA  | Worker 알림과 카드 UX 브라우저 QA                            | 새 문의 알림 보존, 클릭 이동, 카드 강조, 번호/생성시간 레이아웃이 target device에서 확인됨                                                                            | `docs/progress.txt` sessions #64-#67                                                                                         |
| WRK-003 | P1       | Worker/Delivery | Needs QA  | Worker 납품 모바일 카메라/증빙 QA                            | 납품증빙 촬영 후 inquiry folder WebhardFile 생성, 업체 대시보드 사진 표시, 완료 폴더 이동 확인                                                                        | `docs/features-list.md`, `docs/specs/features/delivery-photo.md`                                                             |
| WRK-004 | P2       | Worker          | Backlog   | 긴급 표시와 worker notes 스펙 처리 여부 결정                 | urgent sorting과 다중 note 모델을 다음 운영 milestone에 포함할지 보류할지 결정됨                                                                                      | `docs/specs/features/worker-urgent-notes.md`                                                                                 |
| INQ-001 | P1       | Inquiry         | Needs QA  | 공개 문의 제출 운영 흐름 확인                                | 공개 문의가 DB 저장, 파일 업로드, 웹하드 문의 폴더 생성, 알림/Integration Order 생성까지 이어짐                                                                       | `docs/progress.txt`, contact specs                                                                                           |
| INQ-002 | P1       | Company/Auth    | Needs QA  | 비밀번호 재설정 실제 메일 왕복 검증                          | migration 적용과 SMTP env 이름 확인은 완료됨. reset email 발송, 1회성 token reset 성공, token 누출 없음 확인이 남음                                                   | `docs/features-list.md`, `docs/progress.txt` sessions #35, #69                                                               |
| INQ-003 | P1       | Company/Auth    | Needs QA  | 업체 승인 대기 로그인 문구 확인                              | 미승인 업체가 일반 invalid credentials 대신 승인 대기 안내를 봄                                                                                                       | `docs/features-list.md`                                                                                                      |
| ADM-001 | P1       | Admin           | Needs QA  | 관리자 모니터링/성능 화면 확인                               | activity log 24시간 범위, storage breakdown, pipeline backlog, webhard monitoring이 운영 유사 데이터와 일치함                                                         | audit PR 2/3, `docs/features-list.md`                                                                                        |
| ADM-002 | P2       | Admin/Company   | Ready     | 청구서 시스템 연동 기획                                      | 관리프로그램 연동 계약 확인 후 `ADM-004`, `CMP-003`이 PRD/API/DB/UI/test 태스크로 분해됨                                                                              | `docs/specs/PRD.md`, `docs/specs/features/invoice-system-planning.md`                                                        |
| DES-001 | P1       | Design System   | Needs QA  | 변경된 디자인 시스템 surface light/dark visual smoke         | sidebar, search dropdown, search modal, Card, Badge, admin/webhard 우선 화면이 시각 검증됨                                                                            | `docs/specs/features/design-system.md`                                                                                       |
| DES-002 | P2       | Company Site    | Follow-up | 공개 회사사이트 시각 품질 감사                               | main, portfolio, blog/notice, contact, company intro의 mobile/desktop QA 메모와 개선 우선순위가 생김                                                                  | `docs/specs/PRD.md`, `docs/reports/company-site-visual-audit-2026-05-13.md`                                                  |
| OPS-001 | P1       | Operations      | Shipped   | release train용 수동 QA runbook 작성                         | 각 QA 시나리오에 actor, account, environment, data setup, steps, expected result, evidence, rollback note가 있음                                                      | `docs/progress.txt`의 반복 QA gap, `docs/guides/release-qa-runbook.md`                                                       |
| OPS-002 | P2       | Operations      | Shipped   | 운영 모니터링 루틴 정의                                      | Sentry, Railway logs, sync logs, backup status, webhard pipeline backlog 점검 주기가 정리됨                                                                           | `docs/specs/PRD.md`, audit reports, `docs/guides/operations-monitoring-routine.md`                                           |

## 첫 release train 체크리스트

현재 `pending deploy` 작업을 운영 완료로 보기 전에 아래를 먼저 확인한다.

1. Vercel과 Railway의 현재 배포 commit을 확인한다.
2. pending feature가 요구하는 DB migration을 확인한다.
3. Railway Node 20 Docker build에서 고정된 pnpm 버전으로 build되는지 확인한다.
4. 운영 env를 확인한다.
   - `DATABASE_URL` / `DIRECT_URL`
   - R2 credentials와 bucket
   - SMTP settings
   - `NEXT_PUBLIC_SITE_URL` 또는 `FRONTEND_URL`
   - integration API keys와 backup API key scope
   - frontend/backend/realtime session cookie domain 정책
5. actor별 smoke를 실행한다.
   - Admin: login, webhard, monitoring, backup settings, integration dashboard.
   - Company: login, webhard, contact cards, password reset, delivery proof view.
   - Worker: PIN login, board, notification, drawing download/upload, delivery start/complete.
   - External program: external-webhard sync와 laser-completion API.
6. 로그를 확인한다.
   - Railway backend logs: auth, upload, AutoContact, integration, backup.
   - Vercel frontend logs: route/API proxy error.
   - `sync_logs` pipeline backlog: routing 또는 AutoContact skip.
   - Sentry production issues.
7. 각 feature를 `shipped`, `needs hotfix`, `deferred` 중 하나로 표시한다.

## 최소 수동 QA 매트릭스

| 시나리오                                               | Actor                     | 우선순위 | 증거                                                      |
| ------------------------------------------------------ | ------------------------- | -------- | --------------------------------------------------------- |
| 외부웹하드 sync가 문의와 Worker 알림을 생성            | External program + Worker | P0       | contact id가 포함된 화면 녹화 또는 timestamp note         |
| 거래처 웹하드 업로드가 문의 폴더를 올바르게 생성/갱신  | Company                   | P0       | 전후 folder id/contact id                                 |
| Worker가 최신 도면을 올바른 filename prefix로 다운로드 | Worker                    | P1       | 다운로드 파일명과 source contact                          |
| Worker 납품 완료 증빙 사진 저장                        | Worker + Company          | P1       | inquiry folder file과 company dashboard screenshot        |
| 비밀번호 재설정 메일 왕복                              | Company                   | P1       | 요청 시각과 reset 성공, token 미노출 확인                 |
| 업체 승인 대기 로그인 문구                             | Company                   | P1       | login 결과 screenshot                                     |
| 관리자 activity range와 pipeline backlog               | Admin                     | P1       | metric/backlog sample                                     |
| 웹하드 권한 smoke                                      | Admin + Company           | P0       | company가 admin-only action을 볼 수 없거나 실행할 수 없음 |
| session expiry 동작                                    | Company/Admin             | P1       | empty-folder false state 없이 `/login` redirect           |
| 디자인 시스템 visual smoke                             | Admin/Public              | P2       | light/dark screenshot 또는 확인 note                      |

## 결정이 필요한 사항

| 결정                                                                   | 중요한 이유                                          | 권장 결정자   |
| ---------------------------------------------------------------------- | ---------------------------------------------------- | ------------- |
| staging 환경이 있는가, 아니면 production test account로 직접 QA하는가? | 파괴적 테스트 허용 범위와 release safety가 달라진다. | project owner |
| 현재 운영 기준 외부웹하드 sync 프로그램/version은 무엇인가?            | E2E QA는 실제 sync 동작에 의존한다.                  | project owner |
| 안정화 이후 다음 큰 기능이 청구서인가?                                 | PRD의 유일한 명시 미구현 core feature다.             | project owner |
| Worker IP 제한을 첫 운영 cut에 포함할 것인가?                          | schema, admin UI, rollout friction에 영향이 있다.    | project owner |
| urgent/notes를 지금 구현할 것인가, 보류할 것인가?                      | Worker card 데이터 모델과 정렬/표시 정책이 바뀐다.   | project owner |

## 유지 규칙

- 배포와 수동 QA가 끝난 feature는 `docs/features-list.md`의 `implemented (..., pending deploy)`를 `shipped`로 바꾸고 날짜 또는 배포 기준을 남긴다.
- 이 보드의 상태가 바뀌면 해당 row만 수정하고 출처를 유지한다.
- unit test 또는 type check만으로 `Needs QA`를 `Shipped`로 바꾸지 않는다.
- 새 작업은 영역, 우선순위, 완료 기준, 출처가 명확할 때만 추가한다.
- P0/P1 release blocker는 shipped 또는 명시 보류 전까지 계획 대화의 상단에 유지한다.
