# Phase 2: backend-error-relocate

## 사전 준비

아래를 반드시 읽어 phase 1 에서 확정된 폴더 API 와 현재 syncRevisionToWebhard 의 에러 숨김 지점을 파악하라:

- `tasks/19-worker-drawing-upload/phase1.md` — phase 1 의 새 폴더 API 시그니처 (`ensureInquiryFolder`, `renameInquiryFolderForContact`, `moveInquiryFolderToCompleted`). 이 phase 는 이 API 들을 호출.
- `tasks/19-worker-drawing-upload/docs-diff.md` — 문서 diff.
- `webhard-api/src/contacts/drawing-revision.service.ts:49~128` `createRevision` — 현 트랜잭션 범위.
- `webhard-api/src/contacts/drawing-revision.service.ts:402~519` `syncRevisionToWebhard` — `.catch` 로 실패 숨김. 이 phase 의 핵심 변경 대상.
- `webhard-api/src/folders/folders.service.ts:relocateContactFiles` — 원본 도면 + revision 을 같은 폴더로 일괄 이동. 재사용.
- `webhard-api/src/contacts/contacts.controller.ts:323` — `POST /api/v1/contacts/:id/drawing-revisions` 응답 조립 지점.
- `webhard-api/src/integration/drawing-revisions/drawing-revisions.controller.ts:79` — 외부 통합 엔드포인트. 동일 응답 타입 공유.
- `src/app/api/worker/drawing-revisions/route.ts:62~120` — Worker 프록시 route. 응답 passthrough 확인.
- `webhard-api/src/contacts/drawing-revision.service.spec.ts` — 기존 테스트 패턴. 수정 후 확장.

이유: revision 자체는 트랜잭션 보존하되 webhard 동기화 실패는 사용자에게 알리는 구조를 만들기 위해 응답 스키마와 호출 계층을 모두 맞춰야 한다.

## 작업 내용

### 1. 공통 타입 정의

`webhard-api/src/contacts/types/webhard-sync-warning.ts` (없으면 신규):

```ts
export type WebhardSyncWarningCode =
  | 'NO_INQUIRY_NUMBER'
  | 'FOLDER_CREATE_FAILED'
  | 'RELOCATE_FAILED'
  | 'UNKNOWN';

export interface WebhardSyncWarning {
  code: WebhardSyncWarningCode;
  message: string;
}
```

### 2. `drawing-revision.service.ts` — `syncRevisionToWebhard` 재작성

반환 타입 변경:

```ts
async syncRevisionToWebhard(args: {
  contactId: string;
  revisionId: string;
  files: Array<{ url: string; name: string; size: number; mimeType: string }>;
}): Promise<{ webhardFiles: WebhardFile[]; warning?: WebhardSyncWarning }>
```

내부 로직:

1. `ensureInquiryFolder(contactId)` 호출.
   - null 반환 시 → rootFolder fallback + `warning: { code: 'NO_INQUIRY_NUMBER', message: '문의번호 미발급 — 업체 루트에 임시 저장됨' }`.
   - 예외 시 → `warning: { code: 'FOLDER_CREATE_FAILED', message: err.message }`.
2. 대상 폴더 확보 후 `WebhardFile.create` 로 각 파일 레코드 생성.
3. `relocateContactFiles(contactId, targetFolderId)` 호출해 해당 Contact 의 기존 파일 (원본 + 이전 revision) 을 같은 폴더로 일괄 이동.
   - 실패 시 `warning: { code: 'RELOCATE_FAILED', message: err.message }` (생성된 WebhardFile 은 보존).
4. 기존 `.catch` 블록 전체 **제거**. 이제 내부에서 try/catch 로 warning 조립 후 정상 return.

### 3. `createRevision` 반환 업데이트

반환 타입에 `webhardWarning?: WebhardSyncWarning` 추가:

```ts
return { revision, webhardFiles, webhardWarning: syncResult.warning };
```

트랜잭션 자체는 유지 — Revision 레코드는 원자적으로 생성. `syncRevisionToWebhard` 는 트랜잭션 **밖**에서 호출 (기존 구조 유지, `.catch` 만 제거).

### 4. Controller 응답 반영

- `contacts.controller.ts:323` 의 `POST /drawing-revisions` 응답 객체에 `webhardWarning` 필드 pass-through.
- `integration/drawing-revisions.controller.ts:79` 동일.
- `src/app/api/worker/drawing-revisions/route.ts` 는 NestJS 응답을 그대로 프록시하므로 별도 수정 불필요 (단, 타입 정의에 webhardWarning 추가 필요 시 반영).

### 5. 테스트 확장

`webhard-api/src/contacts/drawing-revision.service.spec.ts`:

- R1: `ensureInquiryFolder` 가 null 반환 → `createRevision` 결과에 `webhardWarning.code === 'NO_INQUIRY_NUMBER'`, revision 은 여전히 생성됨 (DB row 존재).
- R2: 정상 경로 → `webhardWarning === undefined`, `webhardFiles.length > 0`.
- R3: 첫 업로드 시 Contact 에 이미 있던 원본 도면 WebhardFile 레코드가 `relocateContactFiles` 로 새 `문의-{O}` 폴더로 이동 (mock 의 `update({ folderId })` 호출 검증).
- R4: 같은 Contact 에 두 번째 revision 업로드 — `ensureInquiryFolder` 가 기존 폴더 재사용 (findFirst 반환), 신규 WebhardFile 레코드만 추가, 중복 폴더 생성 없음, `webhardWarning` 없음.
- R5: `relocateContactFiles` 내부 throw → `webhardWarning.code === 'RELOCATE_FAILED'`, 신규 WebhardFile 은 보존.

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test -- --testPathPattern="drawing-revision"
```

## AC 검증 방법

위 커맨드 통과 시 `tasks/19-worker-drawing-upload/index.json` 의 phase 2 status 를 `"completed"`. 3 회 실패 시 `"error"` + `"error_message"`.

## 주의사항

- DrawingRevision 자체 트랜잭션 롤백 로직 유지 — revision 생성은 원자적. 오직 webhard sync 실패만 warning 으로.
- 기존 응답 성공 컨트랙트 (revision, webhardFiles) 는 유지 — warning 은 **optional** 필드로만 추가.
- `.catch` 제거 시 throw 가 밖으로 튀어나가지 않도록 내부 try/catch 로 감싸서 warning 으로 수렴. Promise rejection 이 상위에 전파되면 안 됨.
- `relocateContactFiles` 의 기존 호출처는 건드리지 않음. 이번 phase 는 `syncRevisionToWebhard` 안에서만 추가 호출.
- Worker route (`src/app/api/worker/drawing-revisions/route.ts`) 의 응답 타입 정의에서 `webhardWarning` 필드 추가 누락 시 타입 에러 발생 — 체크.
- phase 3 의 프론트 모달은 이 응답의 `webhardWarning` 을 읽어 toast 를 띄우므로 필드명 `webhardWarning` 확정 후 절대 변경 금지.
