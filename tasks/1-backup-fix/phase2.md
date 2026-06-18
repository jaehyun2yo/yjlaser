# Phase 2: backend-async

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 루트)
- `docs/WEBHARD_ARCHITECTURE.md`
- `docs/WEBHARD_API_SPEC.md`
- `/tasks/1-backup-fix/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/src/backup/backup.service.ts` (Phase 1에서 retentionDays로 변경됨)
- `webhard-api/src/backup/backup.controller.ts`
- `webhard-api/src/backup/dto/backup.dto.ts` (Phase 1에서 retentionDays로 변경됨)

이전 phase에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업 내용

백업 실행을 비동기로 변경하고, 진행률 추적 기능을 추가한다.

### 1. DTO 추가 (`webhard-api/src/backup/dto/backup.dto.ts`)

기존 `BackupExecutionResult` 인터페이스는 유지하되 (내부 사용), 새 응답 타입 2개를 추가한다:

```typescript
export interface BackupStartResult {
  status: 'started' | 'skipped' | 'already_running';
  total?: number;
  reason?: string;
}

export interface BackupStatusResponse {
  isRunning: boolean;
  total: number;
  success: number;
  failed: number;
}
```

### 2. BackupService 변경 (`webhard-api/src/backup/backup.service.ts`)

**2-1. 진행률 추적용 private 필드 추가**

```typescript
private progress: BackupStatusResponse = {
  isRunning: false,
  total: 0,
  success: 0,
  failed: 0,
};
```

**2-2. `getStatus()` 메서드 추가**

`this.progress`의 복사본을 반환한다. 스프레드 연산자로 복사.

**2-3. `startBackup()` 메서드 추가 (public)**

기존 `executeBackup()`을 대체하는 진입점:

1. `this.progress.isRunning` 체크 → true이면 `{ status: 'already_running' }` 반환
2. 설정 로드 (`getSettings()`)
3. `enabled` 체크 → false이면 `{ status: 'skipped', reason: 'Backup is disabled' }` 반환
4. `nasPath` 빈 문자열 체크 → `{ status: 'skipped', reason: 'NAS path is not configured' }` 반환
5. `fs.existsSync(nasPath)` 체크 → false이면 `{ status: 'skipped', reason: 'NAS path not accessible: ...' }` 반환
6. 대상 파일 조회 (`getEligibleFiles`)
7. 파일 수 0이면 `{ status: 'skipped', reason: 'No eligible files found' }` 반환
8. `this.progress = { isRunning: true, total: files.length, success: 0, failed: 0 }` 설정
9. `void this.executeBackupInternal(files, settings)` — fire-and-forget (Promise를 await하지 않음)
10. `{ status: 'started', total: files.length }` 반환

**2-4. 기존 `executeBackup()` → `executeBackupInternal()` (private)**

기존 `executeBackup()` 메서드를 `private async executeBackupInternal(files, settings)` 으로 변경:

- 파라미터로 `files`와 `settings`를 받음 (startBackup에서 이미 조회했으므로)
- 사전 체크 로직 제거 (startBackup에서 이미 수행)
- 파일별 루프 내에서:
  - 성공 시: `this.progress.success++`
  - 실패 시: `this.progress.failed++`
- `finally` 블록에서: `this.progress.isRunning = false`
- 반환값: `BackupExecutionResult` (내부 로깅용)

**2-5. 스케줄 백업 변경**

`handleScheduledBackup()` 메서드:

- `startBackup()` 대신 기존 전체 로직을 직접 호출해야 한다 (스케줄은 fire-and-forget이 아니라 결과를 로깅해야 하므로)
- 또는: `startBackup()`을 호출하고, 결과가 `started`이면 로그만 남김. 실제 실행 결과는 `executeBackupInternal`의 finally에서 로깅.
- 권장: `startBackup()`을 호출하되, 결과를 로그에 기록.

```typescript
@Cron('0 2 * * *')
async handleScheduledBackup(): Promise<void> {
  this.logger.log('Starting scheduled backup...');
  try {
    const result = await this.startBackup();
    if (result.status === 'skipped') {
      this.logger.log(`Scheduled backup skipped: ${result.reason}`);
    } else if (result.status === 'already_running') {
      this.logger.warn('Scheduled backup skipped: already running');
    } else {
      this.logger.log(`Scheduled backup started: ${result.total} files`);
    }
  } catch (error) {
    this.logger.error('Scheduled backup failed with unexpected error', error);
  }
}
```

### 3. Controller 변경 (`webhard-api/src/backup/backup.controller.ts`)

**3-1. `POST /execute` 변경**

- `this.backupService.executeBackup()` → `this.backupService.startBackup()` 호출
- 반환 타입: `BackupStartResult`

**3-2. `GET /status` 엔드포인트 추가**

```typescript
@Get('status')
async getStatus(@CurrentUser() user: SessionUser) {
  this.ensureAdmin(user);
  return this.backupService.getStatus();
}
```

## Acceptance Criteria

```bash
cd webhard-api && pnpm build
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/1-backup-fix/index.json`의 phase 2 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- `void this.executeBackupInternal(...)` 호출 시 반드시 `void` 연산자를 사용하여 unhandled promise rejection을 방지하라. `executeBackupInternal` 내부에서 최상위 try/catch로 모든 에러를 잡아야 한다.
- `this.progress`는 단일 인스턴스 내 in-memory 상태이므로, 서버 재시작 시 초기화된다. 이는 의도된 동작이다.
- `executeBackupInternal`의 `finally` 블록에서 반드시 `this.progress.isRunning = false`를 설정하라. 누락되면 영원히 `already_running` 상태가 된다.
- 프론트엔드 코드를 건드리지 마라. 프론트엔드 수정은 Phase 3에서 한다.
- 기존 `BackupExecutionResult` 인터페이스는 삭제하지 마라. 내부 로깅에 사용될 수 있다.
- 기존 테스트를 깨뜨리지 마라.
