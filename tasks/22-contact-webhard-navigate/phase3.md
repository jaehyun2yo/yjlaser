# Phase 3: Frontend — 웹하드 페이지 fileId 쿼리 지원 (webhard-fileid-query)

## 사전 준비

먼저 아래 문서를 반드시 읽어라:

- `docs/specs/api/endpoints/webhard.md` — `/webhard?folderId=...&fileId=...` URL 규약 (Phase 0 에서 추가됨). 하이라이트 타이밍 · noop 조건의 최종 명세.
- `docs/specs/features/webhard-system.md` — 웹하드 프론트 구조 (Container/Presentational, Context, hooks).
- `/tasks/22-contact-webhard-navigate/docs-diff.md` — Phase 0 문서 변경.
- `CLAUDE.md` (프로젝트 루트) — Hard Rules: `window.location.reload()` 금지, logger 사용, 상대 import 금지 (`@/` 강제), 등.

그리고 이전 phase 의 작업물을 확인하라 (Phase 1 의 backend 변경은 이 phase 에 직접 영향 없지만 `webhardFileId` 필드가 Contact 타입에 추가된 것만 확인):

- `src/lib/types/contact.ts` — Phase 1 에서 `webhardFileId` 필드 추가됨. 이 phase 의 Phase 4 에서 사용.

이 phase 의 주요 수정 대상 코드 파일들을 미리 읽어 구조 파악:

- `src/app/webhard/components/containers/WebhardMain.tsx` — 웹하드 페이지의 메인 컨테이너. `useSearchParams` 로 `folderId` 를 이미 처리 중. `fileId` 처리를 여기에 추가.
- `src/app/webhard/hooks/` 디렉토리 — `useWebhardFiles` 등 파일 목록 로딩 훅.
- `src/app/webhard/store/` 또는 `src/store/` — `useWebhardHighlightStore` Zustand store 위치 확인. 검색 결과 클릭 시 기존에 사용 중.
- `src/app/webhard/components/presentational/` — `WebhardFileItem` 등에서 highlight 렌더링. 새로 건드릴 필요 없음 (이미 store 기반 하이라이트 구현됨).

## 작업 내용

### `src/app/webhard/components/containers/WebhardMain.tsx` 수정

**목표**: URL 쿼리 `fileId` 를 읽어, `folderId` 의 파일 로드가 완료되면 `useWebhardHighlightStore.setHighlight(fileId, 'file')` 을 호출. 기존 `folderId` 처리 로직에 영향 없이 **단방향 추가**만 한다.

구현 포인트:

1. 기존 `const folderIdFromUrl = useSearchParams().get('folderId')` 근처에 `const fileIdFromUrl = useSearchParams().get('fileId')` 추가.
2. 파일 로드 완료 시점 감지를 위한 `useEffect`:

   ```ts
   useEffect(() => {
     if (!fileIdFromUrl) return;
     if (!selectedFolderId) return; // folderId 없이 fileId 단독은 noop
     // 파일 리스트가 로드 완료되고 해당 파일이 현재 폴더의 files 배열에 포함되어 있으면 하이라이트
     const fileExists = files.some((f) => f.id === fileIdFromUrl);
     if (fileExists) {
       useWebhardHighlightStore.getState().setHighlight(fileIdFromUrl, 'file');
     }
   }, [fileIdFromUrl, selectedFolderId, files]);
   ```

   `files` 는 해당 폴더의 파일 목록 state. 실제 state 이름은 코드를 읽고 정확히 사용 (`files`, `currentFolderFiles` 등).

3. setHighlight 은 1 회만 호출되도록 하고 (useEffect dependency 로 관리), 한 번 호출 후에는 URL 에 `fileId` 가 남아 있어도 중복 호출 방지. 가장 간단한 방법: `useRef<string | null>(null)` 로 "이미 처리된 fileId" 저장.

   ```ts
   const handledFileIdRef = useRef<string | null>(null);
   useEffect(() => {
     if (!fileIdFromUrl || handledFileIdRef.current === fileIdFromUrl) return;
     if (!selectedFolderId) return;
     const fileExists = files.some((f) => f.id === fileIdFromUrl);
     if (fileExists) {
       useWebhardHighlightStore.getState().setHighlight(fileIdFromUrl, 'file');
       handledFileIdRef.current = fileIdFromUrl;
     }
   }, [fileIdFromUrl, selectedFolderId, files]);
   ```

4. `useWebhardHighlightStore` import 경로는 기존 사용처(`searchUtils.tsx` 또는 검색 결과 컴포넌트) 를 찾아 동일하게 사용. 3 초 auto-clear 는 기존 store 로직이 처리하므로 별도 코드 불필요.

### 테스트 (신규, 간소화)

`src/__tests__/webhard/webhard-main-fileid.test.tsx` (신규):

2 개 케이스:

| #   | 케이스                                                            | assertion                                                          |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | `?folderId=A&fileId=B` 쿼리 + 폴더 파일 로드 완료 + 파일에 B 포함 | `useWebhardHighlightStore.setHighlight` 가 `(B, 'file')` 로 호출됨 |
| 2   | `?fileId=B` 만 (folderId 없음)                                    | `setHighlight` 호출 안 됨                                          |

Zustand store 는 mock (테스트 내부에서 `useWebhardHighlightStore` 를 Jest mock 으로 대체). React Query 는 `QueryClientProvider` 로 감싸고 `useWebhardFiles` 의 반환값을 mock 으로 고정해 파일 리스트를 controlled state 로 제공. Next.js `useSearchParams` 는 `next/navigation` mock 사용.

복잡한 폴더 트리 전체 렌더링은 불필요. `WebhardMain` 컴포넌트 전체를 렌더하는 대신 **shallow 하게 관련 훅 로직만 검증**하는 접근도 OK — 테스트 가독성 · 유지보수성 우선.

testing.md 원칙 준수: "깨지면 치명적인 분기만" — 위 2 개 시나리오가 하이라이트 플로우의 유일한 분기이므로 충분.

## Acceptance Criteria

```bash
npx tsc --noEmit
```

```bash
pnpm test -- --testPathPattern="webhard-main-fileid"
```

```bash
pnpm build
```

세 커맨드 모두 통과.

## AC 검증 방법

위 세 커맨드를 **병렬로 실행** (단일 assistant 메시지 + Bash 3 개). 모두 통과하면 `/tasks/22-contact-webhard-navigate/index.json` 의 phase 3 status 를 `"completed"` 로 변경.

3 회 이상 실패 시 `"error"` + `error_message` 기록.

## 주의사항

- **기존 `folderId` 처리 로직을 바꾸지 마라**. `fileId` 처리는 **추가만**. 기존 폴더 선택 · 브레드크럼 · 뒤로가기 동작이 회귀하면 안 됨.
- `window.location.reload()` 금지. Next.js 라우팅 · Zustand store 로만 상태 제어.
- `console.log` 금지 — logger 사용 (디버깅 용도로도 추가하지 말 것).
- `dark:` Tailwind 클래스 금지. 이 phase 에서 UI 수정은 없지만 원칙.
- `@/` 절대 import 사용.
- Phase 4 에서 쓸 컨텍스트 메뉴 수정은 이 phase 에서 하지 말 것 — scope 엄수.
- `useWebhardHighlightStore` API (setHighlight, clearHighlight) 는 기존 그대로 사용. 새 API 추가 금지.
- `fileId` 쿼리가 파일 리스트에 없는 경우 setHighlight 호출 안 함 (단순 noop). 에러 throw 하지 말 것.
- 한글 커밋: `feat(contact-webhard-navigate): phase 3 — webhard-fileid-query`.
