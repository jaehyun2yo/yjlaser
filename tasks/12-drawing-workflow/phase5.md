# Phase 5: 프론트엔드 — 거래처 포탈 도면 업로드

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션, 하드 룰)
- `docs/specs/features/drawing-workflow.md` (이번 기능 전체 스펙)
- `/tasks/12-drawing-workflow/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/src/contacts/contacts.controller.ts` (Phase 3 — company-drawing, link-webhard-file 엔드포인트)
- `webhard-api/src/contacts/dto/company-drawing.dto.ts` (Phase 3 — DTO)
- `src/components/DrawingRevisionTimeline.tsx` (Phase 4에서 그룹핑으로 개선됨)
- `src/lib/types/contact.ts` (Phase 4에서 latestDrawing 필드 추가됨)

그리고 아래 기존 코드를 반드시 읽어라:

- `src/app/company/orders/[id]/OrderDetailClient.tsx` (거래처 문의 상세 — 핵심 수정 대상)
- `src/app/company/orders/[id]/page.tsx` (거래처 문의 상세 페이지)
- `src/app/company/orders/_lib/api.ts` (거래처 API 함수)
- `src/app/company/orders/_lib/hooks.ts` (거래처 훅)
- `src/app/company/orders/_lib/types.ts` (거래처 타입)
- `src/app/company/orders/_components/OrderCard.tsx` (문의 카드)
- `src/app/company/orders/_components/OrderStatusTimeline.tsx` (상태 타임라인)
- `src/app/api/contacts/[id]/revision-request/route.ts` (기존 수정요청 라우트)
- `src/app/api/contacts/[id]/drawing-revisions/route.ts` (기존 도면 이력 프록시)
- `src/app/api/contacts/[id]/drawing-revisions/upload-urls/route.ts` (presigned URL 프록시)
- `src/lib/auth/session.ts` (세션 관리)

거래처 포탈의 인증 방식, API 호출 패턴, UI 컨벤션을 이해하라.

## 작업 내용

### 1. 방법 A: 문의 상세 도면 업로드 영역

`src/app/company/orders/[id]/OrderDetailClient.tsx`에 도면 업로드 섹션 추가:

**UI:**

```
┌─ 도면 업로드 ────────────────────────────────┐
│                                               │
│  [📎 파일 선택] 또는 드래그하여 업로드        │
│  (PDF, DXF, AI, DWG, ZIP — 최대 50MB)        │
│                                               │
│  용도:                                        │
│  ○ 수정도면 제출                              │
│  ● 목형의뢰 도면                              │
│  ○ 기타                                       │
│                                               │
│  메모: [________________]                     │
│                                               │
│  [업로드]                                     │
└───────────────────────────────────────────────┘
```

**구현 방향:**

새 컴포넌트 생성: `src/app/company/orders/_components/CompanyDrawingUpload.tsx`

1. 파일 선택 UI (input type=file + drag & drop)
2. 용도 선택 라디오 (revision_submit / mold_request / other)
3. 메모 입력 (optional)
4. 업로드 플로우:
   a. POST `/api/contacts/:id/drawing-revisions/upload-urls` → presigned URL 발급
   b. PUT presigned URL → R2에 직접 업로드
   c. POST `/api/contacts/:id/company-drawing` → DrawingRevision 생성
5. 업로드 완료 → 성공 토스트 + 도면 이력 새로고침

**Next.js API 프록시 추가:**

- `src/app/api/contacts/[id]/company-drawing/route.ts` — POST
  - 거래처 세션 인증 (company session 검증)
  - NestJS `/contacts/:id/company-drawing` 프록시
  - 요청 body에 companyName 자동 추가 (세션에서 추출)

### 2. 도면 이력 열람

`src/app/company/orders/[id]/OrderDetailClient.tsx`에 도면 이력 섹션 추가:

새 컴포넌트 생성: `src/app/company/orders/_components/CompanyDrawingHistory.tsx`

- `useDrawingRevisions(contactId, { includePrivate: false })` 사용 (공개 항목만)
- `DrawingRevisionTimeline` 컴포넌트 재사용 (showVisibilityToggle=false)
- 읽기 전용 — 삭제/수정 버튼 없음

### 3. 방법 B: 웹하드 업로드 후 문의 연결

거래처 웹하드에서 파일 업로드 완료 후 "관련 문의 연결" 선택지를 제공한다.

**기존 웹하드 업로드 플로우 확인:**
거래처 웹하드 파일 업로드가 어디서 처리되는지 확인하라. 웹하드 페이지는 `/webhard` 경로에 있을 수 있다. 업로드 완료 콜백 또는 확인 UI를 찾아서 그 지점에 문의 연결 선택지를 삽입한다.

새 컴포넌트 생성: `src/components/modals/LinkFileToContactModal.tsx`

**UI:**

```
┌─ 문의 연결 ──────────────────────────────┐
│                                           │
│ 업로드한 파일과 관련된 문의가 있나요?      │
│                                           │
│ ┌─ 진행 중인 문의 ─────────────────────┐  │
│ │ ○ 260416-O-001 박스도면 (도면작업)    │  │
│ │ ○ 260418-O-003 포장지 (샘플제작)      │  │
│ │ ○ 해당 없음                           │  │
│ └──────────────────────────────────────┘  │
│                                           │
│ 용도: ○ 수정도면 ● 목형의뢰 ○ 기타      │
│                                           │
│        [건너뛰기]  [연결]                 │
└───────────────────────────────────────────┘
```

**로직:**

1. 거래처의 진행 중인 문의 목록 조회 (by-company API 또는 별도 API)
2. 문의 선택 + 용도 선택
3. "연결" → POST `/api/contacts/:id/link-webhard-file` 호출
4. "건너뛰기" → 모달 닫기 (기존 동작 유지)
5. "해당 없음" → 모달 닫기

**Next.js API 프록시 추가:**

- `src/app/api/contacts/[id]/link-webhard-file/route.ts` — POST
  - 거래처 세션 인증
  - NestJS 프록시

### 4. 수정요청 → DrawingRevision 통합

`src/app/api/contacts/[id]/revision-request/route.ts` 수정:

기존 수정요청 로직에 DrawingRevision 생성을 추가한다:

```typescript
// 기존 로직 유지 (revisionRequestTitle, revisionRequestContent 등 업데이트)
// + 파일이 첨부된 경우 DrawingRevision도 생성
if (fileUrl) {
  // POST /api/contacts/:id/drawing-revisions 호출
  // reason: 'revision_request'
  // actorType: 'company'
  // source: 'manual'
  // files: [{ url: fileUrl, name: fileName }]
  // note: title + content 요약
  // isPublic: true (거래처 수정요청이므로 공개)
}
```

**핵심 규칙:**

- 기존 revisionRequest\* 필드 업데이트 로직은 유지한다 (하위호환).
- DrawingRevision 생성은 추가 동작이다. 실패해도 수정요청 자체는 완료.
- 파일이 없는 수정요청은 DrawingRevision을 생성하지 않는다.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/12-drawing-workflow/index.json`의 phase 5 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 거래처 포탈의 기존 UI/UX를 크게 변경하지 마라. 새 섹션만 추가.
- 스타일링: `@/lib/styles.ts` 상수 사용. `dark:` 금지.
- 거래처 인증: admin 세션이 아닌 company 세션을 사용하라. `verifySession()`이 admin 전용이면, 거래처용 세션 검증 함수를 별도로 찾아라. 기존 거래처 API 라우트의 인증 패턴을 참고.
- 파일 업로드 사이즈 제한: 50MB. 클라이언트 측에서도 검증.
- 허용 파일 형식: PDF, DXF, AI, DWG, ZIP, JPG, PNG.
- `window.location.reload()` 금지. React Query invalidation 사용.
- `console.log` 금지. `logger.createLogger` 사용.
- 기존 수정요청 route의 동작을 변경하지 마라. DrawingRevision 생성만 추가.
- 기존 테스트를 깨뜨리지 마라.
