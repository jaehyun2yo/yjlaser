# Phase 7: webhard-migration

## 사전 준비

- `tasks/18-drawing-consistency/phase1.md` 산출물: `buildInquiryFolderName`, `buildInquiryFileName`.
- `tasks/18-drawing-consistency/phase2.md` 산출물: WebhardFolder 새 필드.
- `tasks/18-drawing-consistency/phase5.md` 산출물: `FoldersService.ensureInquiryFolder`, `relocateContactFiles`.
- `webhard-api/scripts/` 디렉토리 — 기존 스크립트 패턴 (argv 파싱, Prisma 인스턴스 생성, exit code).
- `webhard-api/src/webhard-log/` 또는 `WebhardLog` 모델 — 감사 로그 기록 패턴.
- `webhard-api/prisma/seed.ts` — 테스트 fixture 참고.
- `webhard-api/src/folders/folders.service.ts:468~583` — `DEFAULT_FOLDER_TEMPLATE`, `findFolderByPath` 등 유틸 재사용.

이유: 이미 운영 중인 WebhardFile 들은 대부분 `inquiryType` 분류는 되어 있으나 name 에 prefix 가 없거나 `문의-{번호}/` 서브폴더에 모이지 않은 상태. 이 스크립트가 일괄 백필한다.

## 작업 내용

### 1. 신규 스크립트 `webhard-api/scripts/migrate-webhard-inquiry-folders.ts`

실행:

```bash
# dry-run (기본)
npx tsx webhard-api/scripts/migrate-webhard-inquiry-folders.ts

# 실제 실행
npx tsx webhard-api/scripts/migrate-webhard-inquiry-folders.ts --apply

# 특정 회사만
npx tsx webhard-api/scripts/migrate-webhard-inquiry-folders.ts --company-id <uuid>
```

로직:

```
1. argv 파싱: --apply (기본 dry-run), --company-id (필터).

2. 대상 Contact 조회:
   where {
     inquiryType != null,                            // 미분류는 건너뜀 (phase 6 Notification 대상)
     OR: [inquiryNumber != null, workNumber != null] // 번호 하나라도 있어야
     companyId: <filter>
   }
   include: companyId, inquiryNumber, workNumber, inquiryType, processStage, drawingRevisions.

3. for each Contact c:
   a. expectedFolder = dry-run 이면 계산만, apply 면 ensureInquiryFolder(c.id) 호출 결과.
   b. expectedFolder == null (classify 실패) → skip + 로그.
   c. 이동 대상 WebhardFile 집합:
      - DrawingRevision.webhardFileIds 로부터 id 배열
      - WebhardFile where companyId == c.companyId AND inquiryNumber in [c.inquiryNumber, c.workNumber] AND deletedAt == null
      합집합.
   d. for each WebhardFile f:
      - 이동 필요 (f.folderId !== expectedFolder.id):
          plan += { type: 'move', fileId: f.id, from: f.folderId, to: expectedFolder.id }
      - rename 필요 (f.name !== buildInquiryFileName({contact: c, originalName: f.originalName})):
          plan += { type: 'rename', fileId: f.id, from: f.name, to: newName }
   e. apply 모드면 실제 실행 (relocateContactFiles + updateMany { name }).

4. WebhardLog 기록:
   apply 시 action='migrate_move' 또는 'migrate_rename' 로 각 파일 건별 기록.
   dry-run 에선 로그만 stdout.

5. 통계 출력:
   - 스캔된 Contact 수
   - 이동 계획 파일 수
   - rename 계획 파일 수
   - skip (미분류) Contact 수
   - 실제 이동/rename 건수 (apply 모드)
   - 실패 건수
```

### 2. Idempotency 검증

재실행 시:

- 이미 `expectedFolder` 에 있는 파일 → move skip (로그 "already in place")
- 이미 `buildInquiryFileName` 포맷인 name → rename skip

### 3. `folder_kind` 백필

기존 `WebhardFolder` 레코드는 phase 2 마이그레이션으로 모두 `folder_kind='generic'`. 이 스크립트 첫 단계에서 아래를 한 번 실행:

- `parentId == null && name == companyName` → `folder_kind='root'`
- `name in ('칼선의뢰', '목형의뢰', '완료') && parentId != null` → `folder_kind='template'`
- `name LIKE '문의-%'` → `folder_kind='inquiry'` + `contactId` 역추적 (name 에서 번호 파싱 → Contact 매칭)
- 나머지 → `generic` 유지

이 백필은 `--apply` 없이도 `--backfill-folder-kind` 플래그로 독립 실행 가능하게 분리.

### 4. 테스트

`webhard-api/scripts/__tests__/migrate-webhard-inquiry-folders.spec.ts`:

Seed 기반 통합 테스트. 테스트용 fixture 함수 `seedDrawingConsistencyFixtures()` 를 `webhard-api/prisma/seed.ts` 에 추가 (기존 seed 에 영향 없게 별도 export):

```ts
// 6 Contact 케이스:
// 1. cutting_request + inquiryNumber + WebhardFile(민컴 루트, name=원본)
// 2. mold_request + workNumber + WebhardFile(민컴/목형의뢰)
// 3. cutting→mold 전환 + 양쪽 번호 + WebhardFile 3개
// 4. 미분류 (inquiryType=null) + WebhardFile
// 5. 이미 올바른 위치·name 인 파일 (idempotency)
// 6. 분할 문의 (parentContactId 있음)
```

케이스:

- **dry-run**: DB 무변경, 이동 계획 6건 출력 (미분류 1개는 skip)
- **--apply**: 각 Contact 의 파일이 `칼선의뢰/문의-{번호}/` or `목형의뢰/문의-{번호}/` 로 이동, name 에 `[번호]` prefix 추가
- **재실행**: 전부 skip, WebhardLog 에 "already in place" 만
- **미분류 Contact**: 파일 건드리지 않음, skip 카운트 증가
- **분할 문의**: 번호 suffix `-1` 포함 폴더명 생성 (`문의-260417-O-002-1`)

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test -- --testPathPattern="migrate-webhard-inquiry"
```

## AC 검증 방법

통과 시 phase 7 status `"completed"`. 3회 실패 시 `"error"`.

## 주의사항

- **`--apply` 없이는 절대 DB 를 건드리지 마라**. dry-run 이 기본.
- R2 object key 는 이동시키지 마라. `WebhardFile.folderId`, `.path`, `.name` 만 update.
- phase 5 의 `ensureInquiryFolder` + `relocateContactFiles` 를 그대로 재사용. 스크립트가 로직 중복 구현하면 안 됨.
- `folder_kind` 백필은 독립 플래그로 분리하여 필요 시 단독 실행 가능.
- `WebhardLog.action` 값은 `'migrate_move'`, `'migrate_rename'` 로 통일 (이후 조회 쿼리에서 사용).
- 대량 데이터일 때 메모리 문제 방지 — Contact 조회는 스트림 또는 batch (예: 100 개씩).
- 성능: apply 시 각 Contact 마다 트랜잭션. 전체 한 트랜잭션으로 묶으면 락 시간 과다.
- seed fixture 는 기존 `seed.ts` 본체와 분리된 `seedDrawingConsistencyFixtures()` 로 export. 기존 seed 커맨드(`prisma db seed`) 에 영향 없게.
- 스크립트 실행 전 반드시 DB 백업 안내를 README 또는 `docs/` 하단에 추가 (phase 9 문서 동기화).
- 테스트에서 실제 R2 접근하지 마라 — mock / inmemory.
