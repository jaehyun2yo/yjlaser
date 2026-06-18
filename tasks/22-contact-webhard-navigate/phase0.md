# Phase 0: 문서 업데이트 (docs-update)

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/drawing-workflow.md` — 섹션 W.1 (현행 규칙), 유입 경로별 동작, 업체 루트 매칭 fallback 2단계 — **이번 task 의 핵심 스펙**. `relocateContactFiles` 정책 통일 규칙을 여기에 명시해야 한다.
- `docs/specs/features/inquiry-classification-ux.md` — Admin/Worker 문의카드 컨텍스트 메뉴 현행 스펙. "웹하드에서 열기" 항목을 추가해야 한다.
- `docs/specs/features/worker-portal.md` — Worker 포탈 Completion Criteria 의 "작업 파일 열기 (웹하드 연결)" 항목이 아직 미완료. 이번 task 에서 체크된다.
- `docs/specs/api/endpoints/webhard.md` — 웹하드 페이지 URL 규약 및 파일 조회 엔드포인트. `fileId` 쿼리 파라미터 추가를 기록해야 한다.
- `docs/WEBHARD_ARCHITECTURE.md` — 웹하드 전체 아키텍처 맥락 파악용.
- `CLAUDE.md` (project root) — 프로젝트 전역 컨벤션 (한글 응답, 커밋 규칙).

## 작업 내용

이번 task 의 코드 변경을 반영하기 위해 **네 개 문서를 업데이트한다**. 코드 변경은 Phase 1 이후에서 수행한다.

### 1. `docs/specs/features/drawing-workflow.md` §W.1 "불변 규칙" 업데이트

기존 규칙 블록에 아래 내용을 **추가**한다 (기존 규칙은 유지).

- `ensureInquiryFolder` 와 `relocateContactFiles` 는 **동일한 3단계 company 탐색** 유틸 `resolveCompanyRoot(client, companyName, tx?)` 를 공유한다. 탐색 순서:
  1. `Company` 테이블에서 `companyName` 일치 → 해당 `company_id` 의 루트 `webhard_folders` 조회
  2. `webhard_folders.name` 완전 일치 fallback (task 20, 9be443cc)
  3. `webhard_folders.name` 정규화 매칭 fallback (task 21) — NFKC + 공백/특수문자 제거 + 소문자화
- **과거 `relocateContactFiles` 의 `if (!company) return { movedIds: [] }` silent bail-out 은 제거된다**. LGU+ 동기화로 생성된 `company_id=null` 가상 업체(정식 Company row 미등록) 의 도면도 fallback rootFolder 를 통해 정상 이동한다.
- 위 유틸은 `webhard-api/src/folders/_lib/resolve-company-root.util.ts` 로 단일 진입점 보장. `ensureInquiryRootFolder` / `ensureInquiryFolder` / `relocateContactFiles` 모두 이 유틸을 사용한다.
- 반환 타입: `{ rootFolderId: string | null, reasonCode?: 'NO_COMPANY_ROOT' | 'NO_FALLBACK_MATCH' }`. 실패 시 `logger.warn` 에 `reasonCode` 기록 (기존 폴더 생성 실패 진단 로그와 동일 필드 규약).

또한 `#### W.1 불변 규칙 (현행)` 블록 상단의 날짜 라인을 `> 2026-04-24 업데이트 — company 탐색 정책 통일 (task 22 contact-webhard-navigate)` 로 **추가** (기존 task 20 업데이트 라인 아래에 덧붙인다, 덮어쓰기 금지).

### 2. `docs/specs/features/inquiry-classification-ux.md` 컨텍스트 메뉴 섹션에 "웹하드에서 열기" 항목 추가

해당 문서의 컨텍스트 메뉴 정의(Admin / Worker 공통) 섹션에 아래 항목을 **추가**:

- 메뉴 최상단에 "웹하드에서 열기" 항목 배치 (재분류 / 긴급 / 분할 등 기존 항목 **위**, `<hr>` 구분선으로 분리)
- 아이콘: `lucide-react` 의 `FolderOpen`
- 라벨: "웹하드에서 열기"
- 클릭 동작: Next.js `router.push(/webhard?folderId={contact.webhard_folder_id}&fileId={contact.webhardFileId})` — 같은 탭 이동
- disabled 조건: `contact.webhard_folder_id == null`
- disabled 시 `title` 툴팁: `"웹하드 폴더 미생성"`
- `contact.webhardFileId` 가 null 이어도 메뉴는 활성화. URL 조립 시 `fileId` 쿼리만 생략

적용 컴포넌트:

- Admin: `src/app/(admin)/admin/contacts/_components/ContactContextMenu.tsx`
- Worker: `src/app/worker/_components/WorkerContextMenu.tsx`

### 3. `docs/specs/features/worker-portal.md` Completion Criteria 체크

"작업 파일 열기 (웹하드 연결)" 항목을 체크 표시 `[x]` 로 변경하고, 구현 위치 코멘트를 추가:

- 구현: `WorkerContextMenu` 의 "웹하드에서 열기" 메뉴 항목 (task 22)

### 4. `docs/specs/api/endpoints/webhard.md` URL 규약 확장

웹하드 페이지 URL 섹션에 아래 내용 추가:

- 기존: `/webhard?folderId={uuid}` — 특정 폴더 선택
- **신규**: `/webhard?folderId={uuid}&fileId={uuid}` — 폴더 선택 + 파일 하이라이트 (폴더 로드 완료 후 `useWebhardHighlightStore` 를 통해 3 초간 `ring-2 ring-blue-500 animate-pulse` 표시)
- `fileId` 만 단독으로 주어진 경우: noop (folderId 없이 특정 파일만 하이라이트하는 기능은 미지원)
- 파일이 해당 폴더에 존재하지 않을 경우: setHighlight 은 호출하되 UI 는 기존 store 로직대로 렌더링된 요소가 없으면 noop

그리고 Contact 응답 DTO 섹션(또는 관련 섹션) 에 아래 필드 추가를 기록:

- `webhardFileId: string | null` — 해당 Contact 의 최신 DrawingRevision 의 첫 번째 `webhardFileIds` 값. 컨텍스트 메뉴의 "웹하드에서 열기" 기능에서 파일 하이라이트 대상으로 사용. DrawingRevision 이 없거나 `webhardFileIds` 가 비어 있으면 null.

## Acceptance Criteria

이 phase 는 문서 변경만 수행하므로 빌드/테스트 검증은 생략한다. 대신 아래를 수행하라:

```bash
git diff --stat docs/
```

변경된 문서가 정확히 4 개 (`docs/specs/features/drawing-workflow.md`, `docs/specs/features/inquiry-classification-ux.md`, `docs/specs/features/worker-portal.md`, `docs/specs/api/endpoints/webhard.md`) 인지 확인하라.

## AC 검증 방법

위 커맨드로 4 개 문서만 변경되었는지 확인하면, `/tasks/22-contact-webhard-navigate/index.json` 의 phase 0 status 를 `"completed"` 로 변경하라.

변경된 문서가 4 개가 아니거나 엉뚱한 파일이 포함되었으면 수정하고 다시 확인. 3 회 이상 실패 시 `"error"` + `error_message` 기록.

## 주의사항

- **코드 파일을 변경하지 마라**. 이 phase 는 순수 문서 업데이트 전용. 코드 수정은 Phase 1 이후.
- **기존 문서 내용을 덮어쓰지 마라**. 추가/삽입 위주로 작업. 기존 섹션(W.1, Completion Criteria 등) 아래 또는 사이에 새 내용을 삽입한다.
- `drawing-workflow.md` 의 날짜 라인은 task 20, 21 이 남긴 라인을 덮지 말고 아래에 덧붙일 것.
- 한국어로 작성. 기존 문서 톤·포맷 유지.
- 위 4 개 문서 외의 파일은 건드리지 말 것 (예: CHANGELOG.md, features-list.md 는 Phase 5 에서 갱신).
- `docs-diff.md` 는 에이전트가 직접 작성하지 않는다. Phase 0 완료 후 `scripts/run-phases.py` 가 `scripts/gen-docs-diff.py` 를 자동 호출하여 생성한다.
