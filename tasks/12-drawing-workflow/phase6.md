# Phase 6: 프론트엔드 — Worker 포탈 도면 업로드

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션, 하드 룰)
- `docs/specs/features/drawing-workflow.md` (이번 기능 전체 스펙)
- `/tasks/12-drawing-workflow/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/src/contacts/contacts.controller.ts` (Phase 1 — actorType 동적 처리)
- `webhard-api/src/contacts/dto/drawing-revision.dto.ts` (Phase 1 — actorType 필드 추가됨)
- `src/components/DrawingRevisionTimeline.tsx` (Phase 4에서 그룹핑으로 개선됨)

그리고 아래 기존 Worker 포탈 코드를 반드시 읽어라:

- `src/app/worker/layout.tsx` (레이아웃)
- `src/app/worker/office/page.tsx` (사무실 작업 페이지)
- `src/app/worker/tasks/page.tsx` (작업 페이지)
- `src/app/worker/_components/OfficeContactCard.tsx` (사무실 문의 카드 — 핵심 수정 대상)
- `src/app/worker/_components/StaffContactCard.tsx` (현장 작업 문의 카드)
- `src/app/worker/_components/WorkerFilePanel.tsx` (기존 파일 패널)
- `src/app/worker/_lib/store.ts` (Worker 상태 관리 — Zustand)
- `src/app/worker/_lib/hooks.ts` (Worker 훅)
- `src/app/api/worker/files/route.ts` (Worker 파일 API)

Worker 포탈의 인증 방식(PIN 기반), UI 패턴(모바일 우선), 기존 파일 관련 기능을 이해하라.

## 작업 내용

### 1. Worker 도면 업로드 컴포넌트

새 컴포넌트 생성: `src/app/worker/_components/WorkerDrawingUpload.tsx`

**UI (모바일 최적화):**

```
┌─ 도면 업로드 ──────────────────────┐
│                                     │
│  [📷 카메라] [📎 파일 선택]        │
│                                     │
│  사유:                              │
│  [도무송 맞춤 ▾]                   │
│                                     │
│  [업로드]                           │
└─────────────────────────────────────┘
```

**구현 방향:**

1. 파일 선택: input type=file (accept 속성으로 이미지, PDF, DXF 등)
2. 카메라 캡처: input type=file + capture="environment" (모바일 카메라)
3. 사유 선택 select:
   - domuson_fit: 도무송 맞춤
   - sample_revision: 샘플 수정
   - field_correction: 현장 보정
   - other: 기타
4. 업로드 플로우:
   a. POST `/api/contacts/:id/drawing-revisions/upload-urls` → presigned URL 발급
   b. PUT presigned URL → R2에 직접 업로드
   c. POST `/api/contacts/:id/drawing-revisions` → DrawingRevision 생성
   - actorType: `'worker'`
   - actorName: Worker 이름 (store에서 가져옴)
   - reason: 선택한 사유
   - source: `'manual'`
5. 업로드 완료 → 성공 토스트 + 파일 목록 새로고침

### 2. OfficeContactCard에 도면 업로드 통합

`src/app/worker/_components/OfficeContactCard.tsx` 수정:

- 카드 하단 또는 액션 영역에 "도면 업로드" 버튼 추가
- 클릭 → WorkerDrawingUpload 컴포넌트를 모달 또는 드로어로 표시
- processStage가 drawing, sample일 때만 활성화 (laser 이후는 업로드 불필요)

### 3. StaffContactCard에 도면 업로드 통합

`src/app/worker/_components/StaffContactCard.tsx` 수정:

- OfficeContactCard와 동일 패턴으로 "도면 업로드" 버튼 추가
- processStage가 drawing_confirmed일 때 활성화 (현장 보정 도면 업로드)

### 4. Worker 도면 이력 열람

Worker가 문의의 도면 이력을 볼 수 있도록 한다.

- OfficeContactCard / StaffContactCard에 "도면 이력" 토글 추가
- 토글 시 DrawingRevisionTimeline 컴포넌트 표시 (읽기 전용, showVisibilityToggle=false)
- 기존 `useDrawingRevisions` 훅 사용

### 5. Worker 인증으로 도면 API 호출

Worker는 PIN 로그인 기반이다. 도면 관련 API 호출 시 인증 처리를 확인하라.

기존 Worker 파일 API 패턴 참고:

- `src/app/api/worker/files/route.ts` 에서 Worker 인증이 어떻게 처리되는지 확인
- 동일한 인증 패턴으로 drawing-revisions API 호출

필요하면 Worker 전용 API 라우트 생성:

- `src/app/api/worker/drawing-revisions/route.ts` — POST (Worker 인증 → NestJS 프록시)
- `src/app/api/worker/drawing-revisions/upload-urls/route.ts` — POST (presigned URL)

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/12-drawing-workflow/index.json`의 phase 6 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- Worker 포탈은 **모바일 우선** 디자인이다. 버튼 크기, 터치 영역, 폰트 크기에 주의하라.
- Worker 포탈의 기존 UI 패턴(카드 레이아웃, 액션 버튼 위치, 색상)을 따르라. 기존 컴포넌트 스타일을 참고.
- 스타일링: `@/lib/styles.ts` 상수 사용. `dark:` 금지.
- Worker store (`_lib/store.ts`)에서 Worker 이름을 가져올 수 있는지 확인. 없으면 API 응답에서 추출.
- 파일 업로드 사이즈 제한: 50MB. 모바일에서 카메라로 찍은 사진은 보통 5-10MB이므로 충분.
- `console.log` 금지. `logger.createLogger` 사용.
- `window.location.reload()` 금지. invalidation 사용.
- laser 이후 단계에서는 도면 업로드 버튼을 표시하지 마라 (스펙: laser/cutting 이후 업로드 없음).
  - 단, 관리프로그램 DXF 업로드는 Integration API를 통해 자동으로 들어오므로 Worker UI와 무관.
- 기존 테스트를 깨뜨리지 마라.
