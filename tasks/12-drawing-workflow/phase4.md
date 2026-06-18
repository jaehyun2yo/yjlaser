# Phase 4: 프론트엔드 — 관리자 도면 UI 개선

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션, 하드 룰)
- `docs/specs/features/drawing-workflow.md` (이번 기능 전체 스펙)
- `/tasks/12-drawing-workflow/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/src/contacts/drawing-revision.service.ts` (Phase 1 — 상태별 도면 조회)
- `webhard-api/src/contacts/contacts.controller.ts` (Phase 1, 3 — 새 엔드포인트)
- `webhard-api/src/contacts/dto/company-drawing.dto.ts` (Phase 3 — 새 DTO)

그리고 아래 기존 프론트엔드 코드를 반드시 읽어라:

- `src/components/DrawingRevisionTimeline.tsx` (기존 도면 타임라인 컴포넌트)
- `src/components/modals/DrawingRevisionModal.tsx` (기존 도면 등록 모달)
- `src/app/(admin)/admin/contacts/_components/ContactDetailView.tsx` (문의 상세 뷰)
- `src/app/(admin)/admin/contacts/_components/ContactCardSummary.tsx` (문의 카드 요약)
- `src/lib/hooks/useDrawingRevisions.ts` (도면 조회 훅)
- `src/lib/types/contact.ts` (Contact, DrawingRevision 타입)
- `src/lib/react-query/queryKeys.ts` (쿼리 키)
- `src/lib/styles.ts` (스타일 상수)
- `src/app/(admin)/admin/contacts/_lib/utils.ts` (유틸 함수)

## 작업 내용

### 1. DrawingRevisionTimeline 단계별 그룹핑

`src/components/DrawingRevisionTimeline.tsx` 수정:

현재는 모든 revision을 flat 리스트로 보여주고 있다. 이를 processStage별로 그룹핑하여 표시한다.

**UI 구조:**

```
┌─ 현장가공 (1건) ─────────────────────────────┐
│  v4 | 레이저 가공 | 관리프로그램 | 04/16 14:00 │ ⬇
└─────────────────────────────────────────────┘
┌─ 도면확정/목형의뢰 (1건) ────────────────────┐
│  v3 | 현장 보정 | 삼성포장 | 04/15 16:00      │ ⬇
└─────────────────────────────────────────────┘
┌─ 도면작업 (2건) ─────────────────────────────┐
│  v2 | 도무송 맞춤 | admin | 04/14 10:00       │ ⬇  ← 최신
│  v1 | 초기 도면 | system | 04/13 09:00        │ ⬇
└─────────────────────────────────────────────┘
```

**구현 방향:**

- revisions 배열을 processStage별로 그룹핑하는 유틸 함수 생성
- processStage가 null인 revision은 "미분류" 그룹으로
- 그룹 순서: PROCESS_STAGE_ORDER의 역순 (최신 단계가 위)
- 각 그룹 내 revision은 createdAt 내림차순 (최신이 위)
- 각 그룹 헤더: 단계 한글명 + 도면 수 + 접기/펼치기 (기본 펼침)
- 기존 개별 revision 항목의 UI(버전, 사유, 다운로드 버튼, 공개 토글)는 유지

**단계명 한글 매핑** (기존 `getProcessStageInfo` 활용):

- drawing → 도면작업
- sample → 샘플제작
- drawing_confirmed → 도면확정/목형의뢰
- laser → 레이저가공
- cutting → 칼작업
- creasing → 오시작업
- delivery → 납품
- null → 미분류

### 2. ContactCardSummary — 최신 도면 다운로드 버튼

`src/app/(admin)/admin/contacts/_components/ContactCardSummary.tsx` 수정:

문의 카드 요약 영역에 "최신 도면" 원클릭 다운로드 버튼 추가.

**구현 방향:**

- Contact 타입에 `latestDrawing` 필드가 Phase 1에서 추가됨 (findOne 응답)
- latestDrawing이 존재하면 다운로드 버튼 표시
- latestDrawing이 null이면 기존 drawingFileUrl fallback (없으면 미표시)
- 다운로드: 기존 `DownloadButton` 컴포넌트 활용
- 위치: 현재 도면 다운로드 영역 (drawing_file_url 표시 영역) 근처

**Contact 타입 업데이트:**

- `src/lib/types/contact.ts`에 `latestDrawing` 필드 추가 (DrawingRevision | null)

### 3. Next.js API 라우트 추가

Phase 1, 3에서 추가된 NestJS 엔드포인트를 프론트엔드에서 호출하기 위한 Next.js API 프록시 라우트:

- `src/app/api/contacts/[id]/latest-drawing/route.ts` — GET, NestJS `/contacts/:id/latest-drawing` 프록시
- `src/app/api/contacts/[id]/merge-drawing-from/[sourceId]/route.ts` — POST, admin 전용

기존 프록시 패턴을 참고하라:

- `src/app/api/contacts/[id]/drawing-revisions/route.ts` (기존 예시)
- admin 인증: `verifySession()` 사용

### 4. 관리자 수동 문의 연결 모달

새 컴포넌트: `src/app/(admin)/admin/contacts/_components/MergeContactModal.tsx`

**트리거 조건:**

- Contact의 source가 'webhard'이고 processStage가 'drawing_confirmed'이며, 매칭 전 상태로 판단되는 경우
- 또는 관리자가 수동으로 "기존 문의 연결" 버튼을 클릭

**모달 UI:**

```
┌─ 기존 문의와 연결 ──────────────────────┐
│                                         │
│ 같은 업체({companyName})의 진행 중 문의: │
│                                         │
│ ○ 260416-O-001 박스도면 (도면작업)      │
│ ○ 260418-O-003 포장지 (샘플제작)        │
│                                         │
│ 선택한 문의에 이 도면을 연결하고,       │
│ 현재 문의는 삭제됩니다.                 │
│                                         │
│        [취소]  [연결]                    │
└─────────────────────────────────────────┘
```

**로직:**

1. 같은 companyName의 활성 Contact 목록 조회 (by-company API)
2. 현재 Contact 제외, parentContactId가 없는(분할 하위가 아닌) Contact만 표시
3. 선택 후 "연결" → merge-drawing-from API 호출
4. 성공 시 queryClient.invalidateQueries

**이 버튼의 위치:**

- ContactDetailView의 상단 액션 영역 또는 ContactCardActions에 추가
- 조건부 표시: source가 'webhard'인 Contact에만

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/12-drawing-workflow/index.json`의 phase 4 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 스타일링: `@/lib/styles.ts`의 상수만 사용하라. `dark:` 클래스 직접 사용 금지.
- 로깅: `console.log` 금지. `logger.createLogger` 사용.
- import: 항상 `@/` 절대 경로 사용. 상대 경로 금지 (같은 디렉토리의 `_components/`, `_lib/` 제외).
- React Query: `queryKeys` 팩토리 사용. raw string 배열 금지.
- DrawingRevisionTimeline의 기존 개별 항목 UI(다운로드, 공개 토글)를 변경하지 마라. 그룹핑 래퍼만 추가.
- 기존 ContactCardSummary의 레이아웃을 크게 변경하지 마라. 다운로드 버튼만 추가.
- 기존 테스트를 깨뜨리지 마라.
