# Operations Monitoring Routine

최종 갱신일: 2026-05-13

## 목적

운영 배포 후 Sentry, Railway logs, sync logs, backup status, webhard pipeline backlog를 정기적으로 확인하는 루틴을 정의한다. 이 문서는 장애 대응 가이드가 아니라 반복 점검 체크리스트다. 상세 디버깅 절차는 `docs/guides/production-monitoring.md`를 따른다.

## 점검 주기

| 주기           | 항목                     | 확인 위치                                                                  | 정상 기준                                      | 이상 징후                                                 |
| -------------- | ------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| 배포 직후 30분 | Health와 error spike     | Vercel, Railway, Sentry                                                    | `/api/v1/health` ok, 신규 P0/P1 issue 없음     | 5xx 증가, auth/session error, upload/download failure     |
| 매일 오전      | Sentry unresolved issues | Sentry frontend/backend project                                            | 신규 high priority issue triage 완료           | 같은 stack trace 반복, release 이후 issue 급증            |
| 매일 오전      | Railway runtime logs     | Railway `webhard-api` logs                                                 | auth/upload/AutoContact/integration error 없음 | `ERROR`, `Unhandled`, Prisma error, R2 error              |
| 매일 오전      | Webhard pipeline backlog | Admin integration dashboard, `GET /integration/sync-logs/pipeline-backlog` | 최근 failed/skipped가 업무적으로 설명 가능     | `routing_failed`, `company_folder_unresolved` 누적        |
| 매일 오후      | External sync logs       | Admin sync/integration 화면                                                | 외부웹하드 sync 성공/skip reason 확인          | 같은 folderPath 반복 실패, API key auth 실패              |
| 매일 오후      | Backup status            | Admin backup 화면, NAS backup logs                                         | 최근 backup 성공, 권한 matrix 유지             | backup 실행 실패, NAS path 접근 실패, scope 없는 key 허용 |
| 매주           | Storage breakdown        | Admin performance/storage 화면                                             | company별 용량이 실제 운영 데이터와 대략 일치  | `companyId=null` 파일이 company breakdown에 섞임          |
| 매주           | Worker access logs       | Admin worker/security 화면 또는 DB query                                   | 실패 시도와 IP가 설명 가능                     | 특정 IP의 PIN 실패 급증, 외부 IP 접근                     |

## 배포 후 집중 관측

1. Railway 배포 완료 후 backend log에서 Prisma migration 실패, NestJS boot failure, healthcheck failure를 먼저 확인한다.
2. Vercel 배포 완료 후 Next server action/API route가 NestJS API를 호출하는지 주요 화면에서 smoke한다.
3. 외부웹하드 sync와 Worker 알림은 같은 날 한 번 연결해서 확인한다.
4. 비밀번호 reset-link는 SMTP와 site URL을 모두 확인한 뒤 운영 test account로 한 번 왕복한다.
5. 배포 24시간 안에 `webhard_pipeline` backlog의 reasonCode 분포를 확인해 release regression인지 기존 데이터 문제인지 분류한다.

## 기록 형식

운영 점검 기록은 아래 형식으로 남긴다.

```text
Date:
Checker:
Environment:
Release/deployment:
Sentry:
Railway logs:
Pipeline backlog:
Backup:
Worker access:
Action items:
```

## Escalation 기준

| 등급 | 조건                                                                     | 조치                              |
| ---- | ------------------------------------------------------------------------ | --------------------------------- |
| P0   | 로그인 불가, 업로드/다운로드 불가, DB migration 실패, 데이터 소유권 침범 | 즉시 rollback 또는 hotfix branch  |
| P1   | 외부 sync/AutoContact/Worker 알림/비밀번호 재설정 실패                   | 당일 hotfix 또는 명시적 운영 우회 |
| P2   | visual regression, dashboard 수치 불일치, non-critical log noise         | 다음 안정화 배치에 포함           |
