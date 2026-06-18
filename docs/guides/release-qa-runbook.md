# Release QA Runbook

최종 갱신일: 2026-05-13

## 목적

첫 release train에서 `docs/release-readiness.md`의 pending deploy 항목을 운영 완료로 전환하기 위한 수동 QA 절차다. 각 시나리오는 actor, account, environment, data setup, steps, expected result, evidence, rollback note를 남겨야 한다.

## 공통 원칙

- 운영 secrets, reset token, presigned URL, raw API key, session cookie는 증거에 남기지 않는다.
- destructive 동작이 있는 경우 staging 또는 운영 test account로 먼저 실행한다.
- QA 결과는 `pass`, `needs hotfix`, `deferred` 중 하나로 표시하고, 관련 contact id/file id/folder id/sync log id/timestamp를 남긴다.
- 배포 후 hotfix가 필요한 경우 해당 feature를 `shipped`로 바꾸지 않는다.

## 환경 준비

| 항목              | 확인값                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Frontend          | Vercel production URL과 현재 deployed commit                                                   |
| Backend           | Railway `webhard-api` production URL과 현재 deployment id                                      |
| DB                | Railway PostgreSQL production, migration status                                                |
| Storage           | Cloudflare R2 bucket, CORS, presigned upload/download                                          |
| Accounts          | admin test account, company approved test account, company pending account, worker PIN account |
| External programs | 외부웹하드 sync, 레이저네스팅프로그램 API key 또는 staging key                                 |

## QA 시나리오

| 시나리오                      | Actor / Account                   | Environment / Data setup                              | Steps                                                                                          | Expected result                                                                  | Evidence                                         | Rollback note                                                  |
| ----------------------------- | --------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| 배포 baseline 확인            | Release owner                     | Vercel/Railway dashboard 접근                         | Vercel deployment commit, Railway deployment id, `/api/v1/health` 확인                         | frontend/backend가 같은 release train commit을 가리키고 health가 ok              | deployment id, commit hash, health timestamp     | 실패 시 이전 Vercel/Railway deployment로 rollback              |
| DB migration 확인             | Release owner                     | Railway authenticated CLI, DB backup 확인             | `railway run -- npx prisma migrate status`, 필요 시 `migrate deploy`                           | `password_reset_tokens` 포함 pending migration 없음                              | migration status timestamp                       | migration 실패 시 backup/restore 또는 Prisma resolve plan 기록 |
| 공개 문의 제출                | Public user                       | 새 테스트 문의, 첨부 파일 1개                         | `/contact` 제출 후 admin contact, webhard inquiry folder, notification, integration order 확인 | DB 저장, 파일 업로드, 문의 폴더 생성, 알림 생성                                  | contact id, folder id, file id                   | 테스트 문의 soft delete, R2 파일 보존/정리 여부 기록           |
| 거래처 웹하드 조작            | Company                           | 승인된 company test account                           | upload, download, rename, move, DXF preview, badge refresh, session expiry 재현                | company ownership 밖 파일/폴더가 보이지 않고 조작이 reload 없이 반영             | file id, folder id, before/after screenshot      | 잘못 이동된 파일은 admin으로 원위치                            |
| 웹하드 admin 권한 smoke       | Admin                             | admin test account                                    | folder create/rename/move/delete, batch move, trash restore                                    | admin-only action은 admin에서만 가능하고 realtime/badge가 갱신                   | folder id, file id, timestamp                    | 삭제는 trash restore 우선, permanent delete 금지               |
| 외부웹하드 sync E2E           | External program + Admin + Worker | 외부웹하드 test folder/file, sync API key             | batch upload/confirm 후 AutoContact, Worker alert, inquiry folder 이동 확인                    | routed folder metadata가 유지되고 Contact/Worker 알림이 생성                     | sync log id, contact id, worker alert screenshot | test contact 삭제 또는 archive                                 |
| 미분류 classify failed dedupe | External program + Admin          | 같은 `folderPath`로 미분류 파일 2개를 1시간 내 업로드 | 첫 파일 후 admin notification 확인, 두 번째 파일 후 중복 여부 확인                             | `webhard_classify_failed` 알림은 같은 folderPath 기준 1시간 내 1개만 생성        | notification id, folderPath, timestamp           | 필요 시 notification read 처리                                 |
| Worker PIN brute-force        | Worker                            | worker test PIN, 동일 IP                              | 잘못된 PIN 5회 후 추가 로그인 시도                                                             | worker 조회 전 차단, `reason=rate_limited`, retry time 반환, access log 기록     | access log id, response reason                   | test IP 차단 window 종료 대기                                  |
| Worker 새 문의 알림           | Worker + External program         | Worker 로그인 세션 유지                               | 외부웹하드 AutoContact 생성, 알림 클릭, 새로고침, 모두 확인/비우기                             | 알림 보존, 카드 이동/강조, 목록 제거가 정상                                      | contact id, screenshot/video                     | 테스트 contact 삭제                                            |
| Worker 최신 도면 다운로드     | Worker                            | DrawingRevision이 2개 이상인 문의                     | 다운로드 버튼 클릭                                                                             | 마지막 업로드 revision이 다운로드되고 F 번호 prefix가 우선 적용                  | downloaded filename, contact id                  | 없음                                                           |
| Worker 납품증빙               | Worker + Company                  | 모바일 카메라 가능 기기, delivery 대상 문의           | 사진 촬영 후 납품완료, company dashboard 확인                                                  | inquiry folder에 `납품완료_YYYYMMDD_HHmmss.ext` WebhardFile 생성, dashboard 표시 | file id, contact id, screenshot                  | 테스트 문의 상태 원복 불가 시 테스트 데이터로만 실행           |
| 비밀번호 재설정 메일          | Company                           | SMTP env, approved company account                    | reset request, email 수신, token confirm, 재사용 시도                                          | API 응답에 token 없음, 1회 성공, 재사용/만료 실패                                | request timestamp, success screenshot            | 테스트 계정 비밀번호 원복                                      |
| 승인 대기 로그인              | Company pending                   | `is_approved=false` test account                      | 로그인 시도                                                                                    | 일반 invalid credentials가 아니라 승인 대기 안내 표시                            | screenshot                                       | 없음                                                           |
| Backup 권한 matrix            | Admin + Company + API key         | backup read/write/execute scoped key와 unscoped key   | settings/execute/browse-directories 호출                                                       | admin/scoped key만 허용, company/unscoped key 거부                               | status code matrix                               | 설정 변경 시 원복                                              |
| Monitoring 화면               | Admin                             | 운영 유사 activity/storage/pipeline 데이터            | activity 24h range, storage breakdown, pipeline backlog 확인                                   | 시간 범위/회사 scope/reasonCode가 일치하고 민감정보 없음                         | screenshot, sync log id                          | 없음                                                           |
| Design visual smoke           | Public/Admin                      | desktop 1440px, mobile 390px, light/dark              | main, portfolio, notice/blog, contact, about, sidebar/card/badge 확인                          | 텍스트 겹침 없음, CTA/카드/폼이 viewport 안에 맞음                               | screenshots                                      | 시각 결함은 hotfix ticket로 분리                               |

## 종료 조건

- P0 시나리오는 모두 `pass` 또는 명시적 `deferred` 사유가 있어야 한다.
- P1 시나리오는 핵심 actor별 smoke가 최소 1회 이상 통과해야 한다.
- 실패한 항목은 `docs/features-list.md`에서 `shipped`로 전환하지 않는다.
- 운영 배포가 끝나면 `docs/task-board.md`의 해당 row 상태를 갱신한다.
