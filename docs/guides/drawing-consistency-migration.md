# drawing-consistency 백필 실행 가이드 (task 18)

task 18 (`drawing-consistency`) 에서 추가된 백필/정리 스크립트의 실행 절차. 운영자용 운영 가이드이며, 실제 DB 호스트/API 키/스냅샷 경로 등의 민감 정보는 포함하지 않는다. 각자 환경의 secret 관리 규칙을 따른다.

## 1. 사전 준비

- **DB 백업 필수**. Supabase Dashboard → Database → Backups 에서 즉시 스냅샷을 확보한 뒤 실행한다.
- Supabase **staging/dev 환경에서 먼저 검증** 권장. prod 직접 실행 금지.
- `webhard-api` 의 `.env` 가 올바른 `DATABASE_URL` 을 가리키는지 재확인.
- 실행 계정은 prod DB 에 write 권한이 있는 ops 계정만 사용.

## 2. 실행 순서

세 단계는 독립적으로 실행 가능하다. **2-1 → 2-2 → 2-3 순서를 권장**한다. 각 단계는 기본 dry-run 이며 `--apply` 플래그로만 실제 변경이 발생한다.

### 실행 전제 — 반드시 빌드 후 node 로 실행

스크립트는 ts 원본(`scripts/*.ts`) 을 `npx tsx` 로 직접 실행하면 Nest DI 초기화 단계에서 `createApplicationContext` 와 decorator metadata 상호작용 이슈로 실패한다. **반드시 `pnpm build` 로 컴파일 후 `node dist/scripts/<name>.js` 로 실행**한다.

```bash
cd webhard-api
pnpm build           # dist/scripts/*.js 생성
```

env 변수는 스크립트 상단에서 루트 `.env.local` → `.env` → `webhard-api/.env` 순으로 로드되므로 별도 export 불필요.

### 2-1. 원본 v1 revision 백필 (안전)

과거 `createInitialRevision` fire-and-forget 실패로 v1 이 누락된 Contact 에 대해 원본 도면을 v1 로 복구한다. 기존 revision 행이 있으면 건드리지 않는다.

```bash
cd webhard-api
node dist/scripts/backfill-initial-revisions.js            # dry-run (기본)
node dist/scripts/backfill-initial-revisions.js --apply    # 실제 적용
```

- dry-run 출력에서 "insert 계획 N 건" 항목 확인.
- `--apply` 후에는 Contact 의 타임라인에 v1 (initial) 가 즉시 노출된다.

### 2-2. folder_kind 백필 (무영향)

phase 2 에서 추가된 `webhard_folders.folder_kind` 컬럼의 기본값 `generic` 을 실제 용도(`root` / `template` / `inquiry`) 로 역추론하여 채운다. 파일/폴더 구조에는 영향 없음.

```bash
cd webhard-api
node dist/scripts/migrate-webhard-inquiry-folders.js --backfill-folder-kind            # dry-run
node dist/scripts/migrate-webhard-inquiry-folders.js --backfill-folder-kind --apply    # 실제 적용
```

- 이 단계는 read-heavy 로 실행 시간이 짧다 (대부분 UPDATE 소량).
- `--backfill-folder-kind` 플래그는 파일 이동을 수행하지 않는다.

### 2-3. 폴더·파일명 일괄 정리 (영향 있음)

과거 업체 루트 / template 폴더에 흩어져 있던 WebhardFile 을 올바른 `{업체}/{칼선의뢰|목형의뢰}/문의-{번호}/` 폴더로 이동하고, `name` 을 `[{번호}] 원본명` 포맷으로 rename.

```bash
cd webhard-api
node dist/scripts/migrate-webhard-inquiry-folders.js            # dry-run
# ↑ 스캔/이동/rename 계획 통계 확인 후 --apply
node dist/scripts/migrate-webhard-inquiry-folders.js --apply    # 실제 실행
```

- dry-run 통계 항목: 스캔된 Contact 수 / 이동 계획 파일 수 / rename 계획 파일 수 / skip(미분류) Contact 수.
- `--company-id <uuid>` 플래그로 단일 회사 단위 재적용 가능 (문제 발생 시 범위 축소).
- 재실행 시 이미 올바른 위치·이름인 파일은 자동 skip. idempotent.
- 스크립트 내부에서 `ContactsGateway.emitFolderRenamed` / `emitFileMoved` 를 호출하지만 standalone Nest context 에서는 `server` 가 null 이므로 safeEmit 가 no-op 로 처리한다 (Socket.IO 브로드캐스트는 운영 앱 경로에서만 일어남).

## 3. 롤백

### 파일 이동 역처리

`--apply` 실행은 `WebhardLog` 테이블에 `action='migrate_move'` 혹은 `action='migrate_rename'` 행을 남긴다.

- 이동 역처리: 동일 기간의 `migrate_move` 로그를 조회해 `from_folder_id` ↔ `to_folder_id` 를 뒤집어 수동 UPDATE.
- 파일명 역처리: `webhard_files.originalName` 은 변경되지 않으므로 언제든 재계산 가능. `buildInquiryFileName` 호출을 뺀 원본명으로 되돌리면 된다.

### DB 백업 복구

위 역처리로 문제가 해결되지 않는 경우 스냅샷 복구. Supabase Dashboard → Database → Backups → Restore.

## 4. 실행 후 확인

- 관리자 상세 페이지에서 과거 문의의 도면 다운로드가 200 으로 응답하는지 (R2 key 는 유지 + `decodeURIComponent` 적용).
- 웹하드 트리에서 `{업체}/{칼선의뢰|목형의뢰}/문의-{번호}/` 구조가 실제로 존재하는지.
- `contact_status_history` 에 `changeType='drawing_revision'` + `reason='initial'` 행이 Contact 별로 존재하는지 (v1 백필 검증).

## 5. 관련 스크립트 위치

- `webhard-api/scripts/backfill-initial-revisions.ts` — 원본 v1 복구
- `webhard-api/scripts/migrate-webhard-inquiry-folders.ts` — 폴더·파일명 정리 + folder_kind 백필

## 6. 참고

- spec: `docs/specs/features/drawing-workflow.md` §W.1 / `docs/specs/features/drawing-revision-history.md`
- schema: `webhard-api/prisma/schema.prisma` — `WebhardFolder` 모델의 4 신규 컬럼
- CHANGELOG: `docs/changelog/CHANGELOG.md` — `2026-04-20 — drawing-consistency (task 18)`
