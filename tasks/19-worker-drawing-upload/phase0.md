# Phase 0: docs-update

## 사전 준비

먼저 아래 문서를 반드시 읽고 현 폴더 정책과 이번 task 가 바꿀 부분을 정확히 이해하라:

- `tasks/19-worker-drawing-upload/index.json` — 이번 task 의 전체 의도·6 phase 구조·확정 설계.
- `docs/specs/features/drawing-workflow.md` §W, §W.1 — 현재 규칙은 `{업체}/{칼선의뢰|목형의뢰}/문의-{번호}/` template 기반. task 18 에서 확정된 이 규칙을 **이번 phase 에서 단순 구조로 재작성**한다.
- `docs/specs/features/drawing-revision-history.md` §7 — 현재 `syncRevisionToWebhard` 응답 구조. 이번 task 에서 `webhardWarning?` 필드가 추가됨을 반영.
- `docs/specs/features/worker-portal.md` — Worker 포탈 기능. 도면 업로드 모달 UX (드래그드랍, scroll lock, overlay click, 실시간 반영) 를 추가 반영.
- `docs/specs/api/nestjs-endpoints.md` + `docs/specs/api/endpoints/` — `POST /api/v1/contacts/:id/drawing-revisions` 관련 문서에 `webhardWarning` 추가.
- `docs/changelog/CHANGELOG.md` — `[Unreleased]` 블록에 이번 task skeleton 엔트리만 추가 (본문은 phase 5).
- `webhard-api/src/folders/folders.service.ts:1289` `ensureInquiryFolder` — 현재 null 반환 분기 조건 (inquiryType null 시 폴더 미생성). 이 로직이 phase 1 에서 inquiryType 무관하게 재설계된다는 점을 문서에 반영.
- `webhard-api/src/folders/folders.service.ts:520` `initializeCompanyFolders` + `DEFAULT_FOLDER_TEMPLATE` — 기본 template (칼선의뢰/목형의뢰) 는 **유지**. 용도는 "업체가 원본 도면을 업로드할 때 구분용". 이 내용을 문서에 명시.
- `webhard-api/src/contacts/drawing-revision.service.ts:402` `syncRevisionToWebhard` — 현재 `.catch` 로 실패를 조용히 무시. 이번 task 는 `.catch` 제거하되 throw 대신 `webhardWarning` 객체 반환으로 전환.

이유: phase 0 는 문서만 바꾸지만, 각 phase 가 뒤집을 로직 현행을 정확히 알아야 "변경 전/후" 를 문서에 명확히 쓸 수 있다.

## 작업 내용

### 1. `docs/specs/features/drawing-workflow.md` §W.1 전면 재작성

기존 §W.1 을 `§W.2 과거 규칙 (task 18)` 으로 이동(삭제 금지 — 추적 가능성 보존). 새 §W.1 을 아래 골자로 작성:

**저장 구조 (새 규칙)**:

```
{업체명 루트폴더}/
├── 칼선의뢰/          ← 기존 template. 업체가 원본 도면 직접 업로드 시 구분용 (삭제·이동 금지)
├── 목형의뢰/          ← 동일
├── 문의-{O}/          ← Contact 분류 확정 시 자동 생성 (folderKind='inquiry')
│    ├── [O] 원본.DXF
│    └── [O] rev2.DXF
├── 문의-{O}_{F}/      ← F 번호 추가 발급 시 위 폴더가 rename 된 결과
└── 완료/              ← 납품 완료 문의 이관 대상 (folderKind='template', lazy 생성)
     └── 문의-{O}_{F}/
```

**불변 규칙**:

- 문의 폴더는 `ensureInquiryFolder(contactId)` 가 단일 진입점으로 생성·재사용한다. `contactId` 당 1 개. inquiryType 에 따른 template 분기는 **폐기**.
- O 만 있을 때: 폴더명 `문의-{inquiryNumber}`. O + F 공존: `문의-{inquiryNumber}_{workNumber}`.
- F 번호 추가 발급 시점(`contacts.service.ts` 의 workNumber 갱신 경로)에 기존 폴더를 **rename** 한다. DB `WebhardFolder.name` 만 업데이트, R2 object key 는 **유지** (presigned URL 계속 유효).
- 납품 완료(`processStage = '납품'`) 이벤트 발생 시 해당 문의 폴더의 `parentId` 를 업체 루트 하위 `완료/` 폴더로 변경한다. `완료/` 폴더는 필요 시점 lazy 생성 (folderKind='template'). R2 key 유지.
- 원본 도면 + Worker revision 모두 `relocateContactFiles(contactId, targetFolderId)` 로 해당 Contact 의 모든 WebhardFile 을 같은 문의 폴더로 이동한다.
- 기존 template (칼선의뢰/목형의뢰) 폴더는 **절대 삭제·이동하지 않는다**. 거래처가 직접 업로드한 원본 도면의 수신 경로로 계속 사용.

**유입 경로별 동작** (task 18 규칙과의 차이 명시):

1. LGU+ sync: 기존대로 업체 루트 또는 template 폴더로 미러링. 분류 시 `triggerAutoContact` → `ensureInquiryFolder` 호출로 `문의-{O}/` 생성 + relocate.
2. 웹 폼 제출: Contact 생성 + 초기 Revision → `ensureInquiryFolder` → `문의-{O}/` 생성 + relocate.
3. 거래처/Worker 업로드: DrawingRevision 생성 → `ensureInquiryFolder` → 대상 폴더 확보 → relocate. 실패 시 응답에 `webhardWarning` 포함.
4. F 번호 부여 (`contacts.service.ts:updateWorkNumber` 등): 기존 폴더 rename.
5. 납품 완료: 폴더를 `완료/` 하위로 이동.

### 2. `docs/specs/features/drawing-revision-history.md` §7 업데이트

- "WebhardFile 자동 생성 규칙" 섹션의 "저장 위치" 설명에서 template 기반 경로 문구를 새 §W.1 경로 (`{업체}/문의-{O}_{F}/`) 로 교체.
- 응답 스키마 예시에 `webhardWarning?: { code: string; message: string }` 추가. code 후보: `NO_INQUIRY_NUMBER`, `FOLDER_CREATE_FAILED`, `RELOCATE_FAILED`. 프론트는 이 필드가 있으면 toast 경고.

### 3. `docs/specs/features/worker-portal.md` 업데이트

`도면 업로드` 섹션에 UX 요구사항 4 가지 추가 (각 1-2 줄):

- 드래그드랍: 파일 선택 영역에 드롭 시 동일한 validate 로직 통과.
- 모달 오버레이 클릭 / ESC 키 / body scroll lock 은 공통 `BaseModal` 을 사용하여 자동 해결.
- 업로드 응답에 `webhardWarning` 있으면 toast 로 안내 (Revision 자체는 성공으로 처리).
- 타임라인 실시간 반영: 본인 업로드는 즉시, 타 사용자 업로드는 소켓 (`contact:drawing_revision_added`) 구독으로 해당 Contact 카드가 펼쳐진 상태일 때 refetch.

### 4. `docs/specs/api/` 업데이트

- `docs/specs/api/nestjs-endpoints.md` 에서 `POST /api/v1/contacts/:id/drawing-revisions` 엔트리에 `webhardWarning?` 응답 필드 추가 명시.
- `docs/specs/api/endpoints/` 하위 관련 detail 스펙 (webhard.md 또는 contacts.md) 에도 동일 반영.

### 5. `docs/changelog/CHANGELOG.md` skeleton

`[Unreleased]` 블록 아래에 헤더만 추가:

```
### 2026-04-21 — worker-drawing-upload (task 19)

Phase 5 에서 내용 기입.
```

### 6. docs-diff 자동 생성

`scripts/run-phases.py` 가 phase 0 완료 직후 `scripts/gen-docs-diff.py` 를 실행하여 `tasks/19-worker-drawing-upload/docs-diff.md` 를 자동 생성한다. 수동 작성 금지.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit
```

문서만 수정 — 코드 영향 없음. 통과 시 OK.

## AC 검증 방법

위 커맨드 통과 시 `tasks/19-worker-drawing-upload/index.json` 의 phase 0 status 를 `"completed"` 로 변경. 3 회 실패 시 `"error"` + `"error_message"`.

## 주의사항

- 이 phase 는 **문서만** 수정. 코드 변경 금지.
- task 18 의 기존 §W.1 을 통째로 삭제하지 말고 §W.2 로 이동하여 보존 (왜 바뀌었는지 추적 가능하게).
- 기존 template 폴더 (칼선의뢰/목형의뢰) 삭제·이동을 암시하는 문구 금지 — 거래처 업로드 구분용으로 유지 필수.
- CHANGELOG 는 skeleton 까지. 상세 변경은 phase 5.
- Prisma 스키마 자체 변경은 필요 없음 (task 18 에서 이미 `WebhardFolder.folderKind`, `contactId`, `inquiryNumber`, `workNumber` 4 컬럼 추가 완료). 이번 task 는 기존 컬럼을 활용.
