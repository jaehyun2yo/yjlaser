# Phase 0: docs-update

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 루트)
- `docs/WEBHARD_ARCHITECTURE.md`
- `docs/WEBHARD_API_SPEC.md`
- `docs/specs/api/nestjs-endpoints.md`
- `docs/specs/api/endpoints/webhard.md`
- `docs/specs/db/prisma-tables.md`
- `docs/changelog/CHANGELOG.md`

그리고 현재 백업 시스템 코드를 읽어 실제 구현 상태를 파악하라:

- `webhard-api/src/backup/backup.controller.ts`
- `webhard-api/src/backup/backup.service.ts`
- `webhard-api/src/backup/backup.module.ts`
- `webhard-api/src/backup/dto/backup.dto.ts`
- `webhard-api/prisma/schema.prisma` (BackupLog 모델)
- `src/app/(admin)/admin/integration/webhard/_components/BackupSettings.tsx`

## 작업 내용

백업 시스템의 현재 구현과 이번 task에서 변경될 내용을 문서에 반영한다.

### 1. `docs/specs/api/nestjs-endpoints.md` 업데이트

백업 관련 엔드포인트 섹션을 추가/업데이트:

| 메서드 | 경로                    | 설명                    | 인증  |
| ------ | ----------------------- | ----------------------- | ----- |
| GET    | /api/v1/backup/settings | 백업 설정 조회          | Admin |
| PUT    | /api/v1/backup/settings | 백업 설정 수정          | Admin |
| GET    | /api/v1/backup/eligible | 백업 대상 파일 요약     | Admin |
| POST   | /api/v1/backup/execute  | 백업 실행 (비동기)      | Admin |
| GET    | /api/v1/backup/status   | 백업 진행 상태 조회     | Admin |
| GET    | /api/v1/backup/history  | 백업 이력 조회 (페이징) | Admin |

### 2. `docs/specs/api/endpoints/webhard.md` 업데이트

백업 엔드포인트 상세 스펙 추가:

- 각 엔드포인트의 요청/응답 형식
- `BackupStartResult` 응답 타입: `{ status: 'started' | 'skipped' | 'already_running', total?: number, reason?: string }`
- `BackupStatusResponse` 응답 타입: `{ isRunning: boolean, total: number, success: number, failed: number }`
- 설정 필드명: `retentionDays` (기존 `periodDays`에서 변경)

### 3. `docs/specs/db/prisma-tables.md` 업데이트

`backup_logs` 테이블 스펙 추가:

- 컬럼: id(uuid), file_id, file_name, original_name, file_size(bigint), r2_key, backup_path, company_id, status, error, created_at
- 인덱스: created_at, status, file_id

### 4. `docs/WEBHARD_ARCHITECTURE.md` 업데이트

백업 시스템 아키텍처 섹션 추가:

- R2 → NAS 백업 흐름 (비동기 실행)
- 로컬 NestJS에서만 동작 (Railway 불가)
- 스케줄 백업 (매일 새벽 2시)
- 진행률 추적 메커니즘

### 5. `docs/changelog/CHANGELOG.md` 업데이트

최신 항목으로 추가:

```
## 2026-04-13
### fix: 백업 시스템 버그 수정 + 비동기 처리
- periodDays → retentionDays 필드명 통일 (프론트엔드-백엔드 불일치 해결)
- backup_logs 테이블 마이그레이션 추가
- 백업 실행을 비동기 처리로 변경 (즉시 응답 + 백그라운드 실행)
- 진행률 추적 API 추가 (GET /backup/status)
- 프론트엔드: 토스트 메시지로 실행 결과 피드백 개선
- 프론트엔드: 백업 진행률 실시간 표시
- 프론트엔드: 이력 테이블 필드명 불일치 수정 (errorMessage → error)
```

## Acceptance Criteria

```bash
echo "Phase 0: docs only — no code changes"
```

문서 파일만 수정하고 코드는 변경하지 않는다. 문서 변경 후 `/tasks/1-backup-fix/index.json`의 phase 0 status를 `"completed"`로 변경하라.

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/1-backup-fix/index.json`의 phase 0 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 코드 파일을 수정하지 마라. 이 phase는 문서만 업데이트한다.
- 기존 문서의 다른 섹션을 삭제하거나 의미를 변경하지 마라.
- 변경될 예정인 내용(비동기 처리, 새 엔드포인트 등)을 현재 시제가 아닌 설계 의도로 기술하라.
