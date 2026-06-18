# Phase 2: Frontend — 소켓 구독 추가 (Admin + Worker)

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션)
- `docs/specs/features/contact-split.md` (분할 문의 스펙)
- `/tasks/3-split-realtime-fix/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/src/contacts/contacts.service.ts` — Phase 1에서 추가된 소켓 이벤트 발행 코드

그리고 아래 파일들을 읽고 기존 소켓 구독 패턴을 이해하라:

- `src/app/(admin)/admin/contacts/_lib/hooks.ts` — `useRealtimeSubscription` 함수 (line ~648). 특히 기존 이벤트 핸들러들의 패턴을 주의 깊게 읽어라.
- `src/app/worker/dashboard/page.tsx` — `socketEvents` useMemo (line ~184). `debouncedFullInvalidate`와 `debouncedTargetedInvalidate`의 차이를 이해하라.
- `src/lib/socket/useSocketNamespace.ts` — 소켓 훅 인터페이스
- `src/lib/react-query/queryKeys.ts` — queryKeys 팩토리

## 작업 내용

### 1. Admin `useRealtimeSubscription` 수정

파일: `src/app/(admin)/admin/contacts/_lib/hooks.ts`

`useRealtimeSubscription` 함수의 `events` useMemo 객체 (line ~767)에 두 개의 이벤트 핸들러를 추가하라.

기존 마지막 이벤트 `contact:drawing_revision_added` 아래에 추가:

```typescript
'contact:group-stage-advanced': (data: Record<string, unknown>) => {
  const parentId = data.parentId as string;
  log.info('Group stage advanced via Socket.IO', { parentId });
  // 그룹 단계 이동은 부모+자식 구조 변경 — full refetch
  queryClient.refetchQueries({
    queryKey: queryKeys.contacts.all,
    exact: false,
  });
  // 타임라인도 무효화
  if (parentId) {
    queryClient.invalidateQueries({
      queryKey: queryKeys.contacts.timeline(parentId),
    });
  }
},
'contact:split': (data: Record<string, unknown>) => {
  const parentId = data.parentId as string;
  log.info('Contact split via Socket.IO', { parentId });
  // 분할은 새 자식 생성 — full refetch
  queryClient.refetchQueries({
    queryKey: queryKeys.contacts.all,
    exact: false,
  });
},
```

**핵심 규칙**:

- `contact:group-stage-advanced`와 `contact:split`은 `refetchQueries` (즉시 refetch)를 사용하라. 구조적 변경(자식 추가/단계 변경)이므로 stale 마킹만으로는 부족하다.
- `contact:updated` 이벤트는 Phase 1에서 추가된 부모+children 데이터를 보내므로, 기존 `updateContactInCache` 핸들러가 캐시를 즉시 교체한다. 이 부분은 이미 동작하므로 수정 불필요.
- `useMemo` deps 배열은 수정 불필요 — `queryClient`는 이미 포함되어 있다.

### 2. Worker 대시보드 소켓 이벤트 추가

파일: `src/app/worker/dashboard/page.tsx`

`socketEvents` useMemo 객체 (line ~184)에 두 개의 이벤트 핸들러를 추가하라.

기존 마지막 이벤트 `contact:process_stage_changed` 아래에 추가:

```typescript
'contact:group-stage-advanced': debouncedFullInvalidate,
'contact:split': debouncedFullInvalidate,
```

**핵심 규칙**:

- `debouncedFullInvalidate`를 사용하라. 그룹 단계 이동과 분할은 구조적 변경이므로 full invalidate가 적절하다.
- `debouncedFullInvalidate`는 이미 `useMemo` deps에 포함되어 있으므로 deps 배열 수정 불필요.
- Phase 1에서 `emitContactUpdated`도 추가 발행하므로, 기존 `contact:updated` 핸들러(`debouncedTargetedInvalidate`)도 자동으로 트리거된다. `contact:group-stage-advanced`는 추가 안전망 역할.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/3-split-realtime-fix/index.json`의 phase 2 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 백엔드 코드(`webhard-api/`)를 수정하지 마라. 이 phase는 프론트엔드만 다룬다.
- `queryKeys` 팩토리의 raw string 배열을 사용하지 마라. 반드시 `queryKeys.contacts.all` 등 팩토리 함수를 사용하라.
- `useRealtimeSubscription`의 기존 이벤트 핸들러를 수정하지 마라. 새 이벤트만 추가.
- `window.location.reload()`를 사용하지 마라. React Query invalidation을 사용하라.
- 기존 테스트를 깨뜨리지 마라.
