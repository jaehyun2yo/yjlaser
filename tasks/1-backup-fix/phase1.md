# Phase 1: backend-schema

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 루트)
- `docs/WEBHARD_ARCHITECTURE.md`
- `docs/WEBHARD_API_SPEC.md`
- `/tasks/1-backup-fix/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 현재 백업 시스템 코드를 반드시 읽어라:

- `webhard-api/prisma/schema.prisma` (BackupLog 모델, SystemSetting 모델)
- `webhard-api/src/backup/backup.service.ts` (전체)
- `webhard-api/src/backup/backup.controller.ts` (전체)
- `webhard-api/src/backup/dto/backup.dto.ts` (전체)
- `webhard-api/prisma/migrations/manual/` (기존 manual migration 파일 패턴 확인)

## 작업 내용

### 1. DB 마이그레이션: `backup_logs` 테이블

**1-1. Manual migration SQL 파일 생성**

`webhard-api/prisma/migrations/manual/006_add_backup_logs.sql` 파일을 생성한다:

```sql
-- backup_logs 테이블 생성
CREATE TABLE IF NOT EXISTS backup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id VARCHAR NOT NULL,
  file_name VARCHAR NOT NULL,
  original_name VARCHAR NOT NULL,
  file_size BIGINT NOT NULL,
  r2_key VARCHAR NOT NULL,
  backup_path VARCHAR NOT NULL,
  company_id INTEGER,
  status VARCHAR NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_logs_created_at ON backup_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_backup_logs_status ON backup_logs (status);
CREATE INDEX IF NOT EXISTS idx_backup_logs_file_id ON backup_logs (file_id);
```

**1-2. Prisma schema 동기화**

`npx prisma db push`를 실행하여 schema.prisma의 BackupLog 모델을 DB에 반영한다. 이미 모델은 schema.prisma에 존재하므로 추가 스키마 변경은 불필요.

### 2. 필드명 통일: `periodDays` → `retentionDays`

**2-1. `webhard-api/src/backup/dto/backup.dto.ts`**

- `UpdateBackupSettingsDto` 클래스: `periodDays` 프로퍼티명을 `retentionDays`로 변경. 데코레이터(@IsInt, @Min, @Max 등)는 유지.
- `BackupSettingsResponse` 인터페이스: `periodDays` → `retentionDays`
- `BackupEligibleSummary` 인터페이스: `periodDays` → `retentionDays`

**2-2. `webhard-api/src/backup/backup.service.ts`**

- `BackupConfig` 인터페이스: `periodDays` → `retentionDays`
- `DEFAULT_BACKUP_CONFIG`: `periodDays: 45` → `retentionDays: 45`
- `getSettings()` 메서드: 기존 DB에 `periodDays`로 저장된 값도 읽을 수 있도록 호환 처리:
  ```typescript
  retentionDays: typeof value.retentionDays === 'number'
    ? value.retentionDays
    : typeof value.periodDays === 'number'
      ? value.periodDays
      : DEFAULT_BACKUP_CONFIG.retentionDays,
  ```
  이때 `value`의 타입은 `Record<string, unknown>`이므로 `value.periodDays`도 안전하게 접근 가능.
- `updateSettings()`: `dto.retentionDays`로 접근 (DTO 이름이 변경되었으므로 자동 반영)
- `getEligibleFiles(retentionDays: number)`: 파라미터 이름 변경 (내부 로직 동일)
- `getEligibleSummary()`: `settings.retentionDays` 사용, 응답의 `periodDays` → `retentionDays`

**핵심 규칙**: `getSettings()`에서 `value.retentionDays ?? value.periodDays` 패턴으로 읽어야 한다. 이는 기존에 `periodDays`로 저장된 설정값과의 하위 호환성을 보장한다. 저장(upsert) 시에는 항상 `retentionDays` 키로 저장한다.

## Acceptance Criteria

```bash
cd webhard-api && npx prisma db push && pnpm build
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/1-backup-fix/index.json`의 phase 1 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- `backup.controller.ts`는 이 phase에서 변경하지 마라. controller 변경은 Phase 2에서 한다.
- `src/app/` 프론트엔드 코드를 건드리지 마라. 프론트엔드 수정은 Phase 3에서 한다.
- `npx prisma db push` 실행 시 데이터 손실 경고가 나오면, 프로덕션 DB가 아닌지 확인하라. 개발 DB에서만 실행.
- `getSettings()`의 `periodDays` fallback 로직을 빠뜨리면 기존 설정이 초기화되므로 반드시 포함하라.
- 기존 테스트를 깨뜨리지 마라.
