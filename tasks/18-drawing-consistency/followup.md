# task 18 drawing-consistency — 후속 작업 지시서

> 본 문서는 **다음 세션의 Claude** 가 이 파일 하나만 읽고 잔여 작업을 완수할 수 있도록 작성됨. 독립 컨텍스트 가정.

## 1. 현재 상태 (2026-04-20 종료 시점)

### 완료된 것

- **task 18 PR #7 머지 완료** (2026-04-20T11:08:14Z, merge commit `5b298b59`)
  - URL: https://github.com/jaehyun2yo/yjlaser/pull/7
  - 10 phase 전부 `"completed"` (`tasks/18-drawing-consistency/index.json` 참조)
- **dev DB 마이그레이션 부분 적용**
  | # | 스크립트 | 결과 |
  |---|---|---|
  | 1 | `backfill-initial-revisions.js --apply` | ✅ `applied=36 failed=0` (원본 v1 36건 복구) |
  | 2 | `migrate-webhard-inquiry-folders.js --backfill-folder-kind --apply` | ✅ root=1 + template=2253 + unchanged=598, inquiry=0 |
  | 3 | `migrate-webhard-inquiry-folders.js --apply` | ⚠️ **failed=4** (`Cannot read properties of null (reading 'to')`) |

### 로컬 git 상태

- 현재 브랜치: `master`. HEAD = origin/master = `5b298b59` (task 18 squash merge).
- **uncommitted 변경 2 파일** (이 문서의 잔여 작업 A 의 소스):
  - `webhard-api/scripts/backfill-initial-revisions.ts` — NestFactory import 앞에 dotenv.config 3줄 추가됨
  - `webhard-api/scripts/migrate-webhard-inquiry-folders.ts` — 동일
- 로컬 백업 브랜치 `feat/drawing-consistency-backup` 존재 (방치 가능, 의미 없음)
- `dist/` 빌드 산출물 있음 (gitignored)

### 마이그레이션 3번 실패 분석

`migrate-webhard-inquiry-folders --apply` 가 33 Contact 중 4건 실패. 실패 Contact 들은 **E2E 테스트 fixture** (`E2E-URGENT-17` 등). 실 운영 데이터는 `already in place` 로 처리되어 이동·rename 대상 0건, **운영 영향 없음**.

에러 스택의 `.to()` 호출 주체는 `ContactsGateway` 내 Socket.IO `server.to('admin')`. 스크립트가 `NestFactory.createApplicationContext` 로 부트되어 HTTP adapter 가 없고, 그 결과 `WebSocketGateway` 의 `server` 속성이 `null` 인 채로 `emitFolderRenamed` 호출 → `null.to` 에서 throw.

---

## 2. 잔여 작업 (우선순위 순)

### A. 스크립트 dotenv 로딩 — 이미 소스 수정됨 (커밋 필요)

**목적**: `npx tsx scripts/...` 실행 시 `.env.local` 환경변수를 process.env 에 주입하여 `ConfigModule.forRoot` 가 값을 읽을 수 있도록.

**적용 파일**: 이미 아래처럼 수정되어 있음 (커밋만 남음)

```ts
// NestFactory import 직전에 삽입됨
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
```

**주의**: `npx tsx` 로 ts 실행 시 dotenv 로 env 주입돼도 **여전히 Nest DI 가 실패**한다 (원인 미상, ts-node 계열 runtime 의 decorator metadata 처리와 `createApplicationContext` 상호작용 이슈 추정). **해결책: 반드시 빌드 후 node 로 실행** — `pnpm build && node dist/scripts/<name>.js`. 이 사실을 `docs/guides/drawing-consistency-migration.md` 에 반영 필요.

### B. ContactsGateway emit null-guard 추가 (핵심)

**파일**: `webhard-api/src/contacts/contacts.gateway.ts`

**문제**: `createApplicationContext` 로 부트 시 `@WebSocketServer()` 데코레이터의 `server` 가 null. 스크립트 경로에서 `emitFolderRenamed`, `emitFileMoved` 등이 호출되면 `null.to(...)` throw.

**해결안 (권장)**: 모든 `emit*` 메서드에 early return 추가.

```ts
emitFolderRenamed(payload: { contactId: string; folderId: string; oldName: string; newName: string }) {
  if (!this.server) return;                // NEW — standalone context skip
  this.server.to('admin').to('worker').emit('folder:renamed', payload);
}

emitFileMoved(payload: { contactId: string; fileId: string; oldFolderId: string; newFolderId: string }) {
  if (!this.server) return;                // NEW
  this.server.to('admin').to('worker').emit('file:moved', payload);
}
```

또는 공통 헬퍼로 통일:

```ts
private safeEmit(event: string, payload: unknown, rooms: string[] = ['admin', 'worker']) {
  if (!this.server) return;
  const target = rooms.reduce((acc: any, r) => acc.to(r), this.server);
  target.emit(event, payload);
}
```

**적용 범위**: `contacts.gateway.ts` 내 모든 `emit*` 메서드 (기존 `emitContactUpdated`, `emitContactStatusChanged`, `emitDrawingRevisionAdded`, `emitGroupStageAdvanced`, `emitContactSplit`, `emitContactProcessStageChanged` + phase 5 추가분).

**테스트**: `contacts.gateway.spec.ts` 에 `server=null` 일 때 emit 호출이 throw 없이 통과하는지 케이스 추가.

### C. 문서 동기화

**파일**: `docs/guides/drawing-consistency-migration.md`

실행 방법 섹션을 **compiled JS 기반**으로 수정:

````md
## 실행 전제

반드시 빌드 후 실행:

\```bash
cd webhard-api
pnpm build # dist/scripts/\*.js 생성
\```

`npx tsx scripts/...` 는 Nest DI 초기화 문제로 동작하지 않는다.

## 실행 순서

### 1. 원본 v1 백필

\```bash
node dist/scripts/backfill-initial-revisions.js # dry-run
node dist/scripts/backfill-initial-revisions.js --apply
\```

### 2. folder_kind 백필

\```bash
node dist/scripts/migrate-webhard-inquiry-folders.js --backfill-folder-kind # dry-run
node dist/scripts/migrate-webhard-inquiry-folders.js --backfill-folder-kind --apply
\```

### 3. 폴더·파일명 정리

\```bash
node dist/scripts/migrate-webhard-inquiry-folders.js # dry-run
node dist/scripts/migrate-webhard-inquiry-folders.js --apply
\```
````

### D. Production DB 적용

Railway 배포 환경 (prod Supabase) 에서 동일 절차 반복. 단 B 수정이 배포된 후 실행해야 3번 스크립트가 E2E fixture 없이 깨끗이 통과.

**순서**:

1. B 수정 + C 문서 수정을 같이 묶어 hotfix PR → master merge → Railway 자동 배포 완료 대기
2. DB 스냅샷 백업 (Supabase dashboard)
3. Railway shell 접속 후 `node dist/scripts/...` 3종 순차 실행
4. 각 스크립트 로그 + `WebhardLog` 테이블에서 `action IN ('migrate_move','migrate_rename','migrate_folder_kind')` 조회로 검증

### E. E2E 테스트 수동 실행 (선택)

`e2e/drawing-consistency.spec.ts` 5 시나리오. 준비:

1. 테스트 DB seed: `cd webhard-api && npx tsx prisma/seed.ts`
2. dev 서버: `pnpm dev:all`
3. 테스트 실행: `npx playwright test e2e/drawing-consistency.spec.ts`

---

## 3. 권장 작업 순서

1. **A 커밋 + B 수정 + C 문서 수정** 을 한 hotfix 브랜치에 묶기
2. 로컬 테스트: `pnpm build && node dist/scripts/migrate-webhard-inquiry-folders.js` (dry-run) → B 수정 후 failed=0 이면 성공
3. 작은 PR 로 master 머지
4. Railway 자동 배포 확인 후 D 진행
5. E 는 환경 구축 가능 시

---

## 4. 참고 경로

- phase 문서: `tasks/18-drawing-consistency/phase{0..9}.md`
- phase 3 에러 내역 (초기 누락 36건): `tasks/18-drawing-consistency/phase3-output.json`
- phase 7 에러 내역: `tasks/18-drawing-consistency/phase7-output.json`
- phase 9 환경 제약 기록: `tasks/18-drawing-consistency/index.json` 의 `phases[9].error_message`
- 마이그레이션 가이드 (원본): `docs/guides/drawing-consistency-migration.md`
- 관련 spec: `docs/specs/features/drawing-workflow.md §W`, `docs/specs/features/drawing-revision-history.md`
- 핵심 소스:
  - `webhard-api/src/common/inquiry-filename.util.ts`
  - `webhard-api/src/folders/folders.service.ts` (`ensureInquiryFolder`, `relocateContactFiles`)
  - `webhard-api/src/contacts/contacts.gateway.ts` (B 의 수정 대상)

---

## 5. 다음 세션 시작 프롬프트 (사용자 복붙용)

아래 중 하나를 다음 세션 첫 메시지로 복사:

### 가벼운 진행 (A+B+C 한 번에)

```
tasks/18-drawing-consistency/followup.md 를 읽고 잔여 작업 A·B·C 를 hotfix PR 한 번으로 묶어 master 머지까지 진행해.
```

### 풀 진행 (D·E 포함)

```
tasks/18-drawing-consistency/followup.md 를 읽고 A~E 전체를 순서대로 진행해.
D(Production 적용) 는 Railway shell 접근 필요하니 단계별로 나한테 확인받고 진행.
```

### 선택 진행

```
tasks/18-drawing-consistency/followup.md 의 "§2. 잔여 작업" 을 검토하고 B(ContactsGateway null-guard) 만 먼저 처리해. 다른 건 내가 결정해서 지시할게.
```
