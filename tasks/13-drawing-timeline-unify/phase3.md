# Phase 3: 프론트엔드 — 통합 타임라인 컴포넌트 (timeline-ui)

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `yjlaser_website/CLAUDE.md` — 프론트엔드 규칙 (Server Components 기본, React Query queryKeys 팩토리, @/ 절대 import, no any, no dark: classes, UI 컴포넌트 `@/components/ui/` 우선)
- `docs/specs/features/drawing-workflow.md` — 통합 타임라인 UI 섹션
- `docs/specs/features/drawing-revision-history.md` — 관리자/거래처 UI 구성
- `docs/specs/api/nestjs-endpoints.md` — timeline 응답 shape
- `/tasks/13-drawing-timeline-unify/docs-diff.md`

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/src/contacts/dto/timeline-item.dto.ts` — TimelineItemDto 정의 (Phase 2 산출물)
- `webhard-api/src/contacts/contact-timeline.service.ts` — 통합 응답 로직
- `webhard-api/src/contacts/contacts.controller.ts` — `/timeline` 응답 shape `{ timeline: TimelineItemDto[] }`

현재 프론트엔드 상태 (삭제/수정 대상):

- `src/components/ContactTimeline.tsx` — 리팩토링 대상
- `src/components/DrawingRevisionTimeline.tsx` — **삭제**
- `src/app/(admin)/admin/contacts/_components/ContactDetailView.tsx` — L352-383 + L581-612 중복 Section 존재
- `src/lib/hooks/useContactTimeline.ts` — `as unknown as` 캐스팅 제거
- `src/lib/hooks/useDrawingRevisions.ts` — 거래처 공개 이력 전용으로 축소 or 제거 (아래 결정)
- `src/lib/react-query/queryKeys.ts` — `contacts.timeline`, `contacts.drawingRevisions` 키 존재
- `src/components/modals/DrawingRevisionModal.tsx` — 관리자 모달 (유지)
- `src/app/company/orders/_components/CompanyDrawingUpload.tsx:154` — 거래처 업로드 UI (유지)

이전 phase에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업 내용

### 1. 타입 정의 동기화

**파일**: `src/lib/types/contact.ts`

- `ContactTimelineEntry` 구형 타입 제거/변경.
- 신규 타입 추가 (백엔드 DTO와 일치):

  ```ts
  export type TimelineItemKind = 'status_change' | 'drawing_revision';

  export interface TimelineItem {
    id: string;
    kind: TimelineItemKind;
    createdAt: string;
    actorType: 'admin' | 'worker' | 'system' | 'external' | 'company';
    actorName: string | null;
    color?: string;
    payload: StatusChangePayload | DrawingRevisionPayload;
  }

  export interface StatusChangePayload {
    changeType: string;
    fromValue?: string | null;
    toValue?: string | null;
    metadata?: Record<string, unknown>;
  }

  export interface DrawingRevisionPayload {
    revisionId: string;
    version: number;
    processStage: string | null;
    reason: string;
    reasonDetail: string | null;
    files: Array<{ url: string; name: string; size: number; mimeType: string }>;
    isPublic: boolean;
    note: string | null;
  }
  ```

### 2. `useContactTimeline` 훅 정합화

**파일**: `src/lib/hooks/useContactTimeline.ts`

- `as unknown as` 캐스팅 제거.
- 반환 타입 `TimelineItem[]`.
- Next route(`src/app/api/contacts/[id]/timeline/route.ts`)가 `{ timeline: [...] }` 형태로 래핑 반환 중 → 훅은 `.timeline` 접근. server action `serverGetContactTimeline` (`src/lib/api/nestjs-server-client.ts:761`) 도 동일 shape 반환하도록 수정.
- React Query key: `queryKeys.contacts.timeline(contactId)` 유지.

### 3. `ContactTimeline.tsx` 리팩토링

**파일**: `src/components/ContactTimeline.tsx`

**Props**:

```ts
interface ContactTimelineProps {
  entries: TimelineItem[];
  compact?: boolean;
  showActor?: boolean;
}
```

**렌더 규칙**:

- `kind === 'status_change'`: 기존 구현 스타일 유지 (색상 점 + 라벨 + 시간). `payload.changeType`으로 라벨 맵핑.
- `kind === 'drawing_revision'`:
  - 왼쪽에 색상 점 (타임라인 공통)
  - 라벨: `도면 수정 v{version}` + reason 뱃지 (`REASON_LABELS` 맵)
  - 공개/비공개 Badge (`isPublic` 기반, 거래처 UI에서는 `isPublic=true`만 내려오므로 실질 관리자 전용 표시)
  - `actorName` 옆 표시
  - 파일 목록:
    - `files.length === 1`: 단일 `<Button>` + 파일명(truncate, max-w-[200px] 정도) + 다운로드 아이콘 → 기존 `DownloadButton`과 동일한 API(`/api/drawing-revisions/{revisionId}/download?fileIndex=0`) 사용
    - `files.length >= 2`: "N개 파일 펼치기" → 클릭 시 하위 리스트 렌더. 각 파일 개별 다운로드 버튼
  - `processStage` 있으면 작은 회색 뱃지로 표시
  - `note` (null 아닐 때만) 블록 인용식 스타일로 표시

**날짜 포맷**:

- `formatTimelineDate` 유지하되 `entry.createdAt`이 `undefined`/`null`/`''`이면 `'-'` 반환 (NaN 회귀 방지).

**스타일 (디자인 시스템 준수)**:

- UI 컴포넌트: `@/components/ui/Button`, `@/components/ui/Badge` 사용.
- 색상: CSS 변수 토큰 (`bg-muted`, `text-muted-foreground`, `bg-card`) — `dark:` 클래스 금지.
- 아이콘: 기존 lucide-react 패턴 재사용.

### 4. `DrawingRevisionTimeline.tsx` 삭제

**파일**: `src/components/DrawingRevisionTimeline.tsx` → **파일 삭제**

**삭제 후 확인**:

```bash
grep -rn "DrawingRevisionTimeline\|useDrawingRevisions" src/
```

- 참조가 있는 모든 파일에서 import 제거 + 해당 Section 제거.
- `src/app/company/**` 내 사용처도 동일 처리 — 거래처 포탈도 이제 `ContactTimeline` 단일 컴포넌트 사용.

### 5. `useDrawingRevisions` 훅 처리

**파일**: `src/lib/hooks/useDrawingRevisions.ts`

- Phase 3 기준 **완전 제거**.
- 이유: 통합 타임라인 API에 drawing_revision 포함되므로 별도 훅 불필요.
- React Query key `queryKeys.contacts.drawingRevisions` 도 `queryKeys.ts`에서 제거. 고아 키 금지.
- 관련 Next route (`src/app/api/contacts/[id]/drawing-revisions/route.ts`) 는 외부 통합 목적이 없다면 유지 선택 가능 — 다만 사용처가 없으니 이 phase에서 제거.

### 6. `ContactDetailView.tsx` 정리

**파일**: `src/app/(admin)/admin/contacts/_components/ContactDetailView.tsx`

- L352-383 "도면 수정 이력" Section #1 **제거**.
- L581-612 "도면 수정 이력" Section #2 **제거**.
- L645-655 기존 타임라인 Section 하나로 통합 렌더 유지. 데이터 소스: `useContactTimeline` 그대로 (백엔드가 통합 응답 내림).
- Section 헤더: "타임라인" (단일).
- 관리자 도면 수정 등록 버튼 (`DrawingRevisionModal` 트리거) 은 타임라인 헤더 우측에 배치. 모달 기능은 유지.

### 7. 거래처 포털 페이지

**파일**: `src/app/company/orders/[id]/page.tsx` 또는 해당 상세 페이지 (grep으로 찾아라)

- 기존 도면 이력 Section 제거 → `<ContactTimeline entries={timeline} />` 로 대체.
- `useContactTimeline` 사용 (백엔드 Guard가 `forCompany: true` 주입 → 필터/마스킹된 응답 수신).
- 거래처 업로드 UI (`CompanyDrawingUpload`) 는 **유지**. 업로드 후 `invalidateQueries(queryKeys.contacts.timeline(contactId))` 호출.

### 8. DownloadButton 리팩토링 검토

**파일**: `src/components/DownloadButton.tsx` (기존, 있음)

- 기존 `apiUrl` prop 재사용. drawing-revisions/:id/download?fileIndex=N URL 그대로.
- 수정 없이 재사용 가능하면 그대로. 필요한 경우에만 확장.

### 9. 테스트

**파일**: `src/__tests__/components/ContactTimeline.test.tsx` (신규 or 확장)

**환경**: Jest + JSDOM. `render` from `@testing-library/react`.

**필수 테스트 케이스 (6개)**:

1. `kind: 'status_change'` 항목 렌더: 라벨/색상점/시간 표시.
2. `kind: 'drawing_revision'` 항목 렌더: 버전 뱃지 `v3`, reason 라벨, 파일명 표시.
3. 파일 1개 → 단일 다운로드 버튼 / 파일 2개 → "N개 파일 펼치기" 후 각 다운로드 버튼.
4. `createdAt`이 빈 문자열/undefined일 때 `'-'` 표시 (NaN/NaN 방지).
5. `isPublic=false` 항목에 비공개 Badge 노출. (관리자 UI 기준)
6. 긴 파일명 truncate 적용 (`...` 포함 여부).

**기존 DrawingRevisionTimeline.test.tsx가 있으면 삭제.**
**ContactDetailView 테스트**가 있으면 중복 Section 제거에 맞춰 스냅샷 업데이트.

### 10. Playwright E2E 추가

**파일**: `e2e/drawing-timeline.spec.ts` (신규)

- 테스트 A: 관리자 세션 → 문의 상세 → 통합 타임라인에 status_change + drawing_revision 혼합 렌더 확인.
- 테스트 B: 다른 회사 세션으로 자기 회사 아닌 contactId 요청 → 403 or 리다이렉트.
- 테스트 C: 거래처 세션 → 응답에 `isPublic=false` drawing_revision 없음 확인 (DOM에 해당 revisionId 텍스트 없음).
- 테스트 D: 거래처 세션 → 관리자 actorName 노출 금지 확인 (DOM에 "YJLaser" 마스킹 확인).

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test && npx playwright test e2e/drawing-timeline.spec.ts
```

모두 통과.

## AC 검증 방법

위 AC 커맨드 실행. 통과하면 `/tasks/13-drawing-timeline-unify/index.json`의 phase 3 status를 `"completed"`로 변경.
수정 3회 이상 시도해도 실패하면 `"error"` + `error_message` 기록.

## 주의사항

- **하드 룰 준수**: `any` 타입 금지, `dark:` 클래스 금지, `console.log` 금지(logger 사용), 상대 경로 import 금지(`@/` 사용), `queryKeys` 팩토리 사용, `window.location.reload()` 금지 (invalidateQueries 사용).
- UI 컴포넌트 `@/components/ui/Button`, `Badge` 등 우선 사용. 기존 `BUTTON_STYLES` 상수 쓰지 말 것 (CLAUDE.md Hard Rules).
- 서버 응답 shape 변경 후 React Query 캐시 꼬임 방지: `useContactTimeline` 반환 타입이 바뀌므로, 혹시 persist cache가 있으면 버전 bump. 프로젝트 기본은 메모리 캐시이므로 대부분 무해.
- 거래처 페이지에서 **`isPublic` 뱃지 자체를 렌더할지 여부**: 거래처는 `isPublic=true`만 내려오므로 모든 항목이 공개 상태 — 뱃지 렌더 해도 무해하나 관리자 관점 정보이므로 거래처 컨텍스트에서는 생략 권장. `entries`에 `isPublic=false`가 있는지 여부로 자동 판단 가능 — 모두 true면 뱃지 생략.
- 파일명 truncate는 CSS `truncate max-w-*` 방식 사용. JS로 자르지 말 것 (접근성).
- `DrawingRevisionTimeline` 삭제 후 `git status`로 참조 오류 없는지 재확인.
- 기존 테스트를 깨뜨리지 마라. 특히 `ContactDetailView` 관련 스냅샷이 있다면 의도한 변경만 반영.
- 백엔드는 건드리지 마라. Phase 1/2에서 완료됨.
- `docs/specs/` 는 Phase 5에서 최종 정합. 이번 phase는 코드만.
