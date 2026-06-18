# Phase 4: Frontend admin UI — 폴더 별칭 관리

## 사전 준비

- `docs/specs/features/external-sync-company-folder.md` (Phase 0) §"Frontend" — 본 phase 는 이 §의 페이지·패널 구조를 구현한다.
- `tasks/24-external-sync-company-folder/docs-diff.md`.
- `tasks/24-external-sync-company-folder/phase3.md` 산출물 — endpoint 시그니처:
  - `GET /api/v1/companies/folder-aliases?status=pending|approved&page=&pageSize=`
  - `POST /api/v1/companies/folder-aliases/:id/approve` body `{ cascadeBackfill?: boolean }`
  - `PATCH /api/v1/companies/folder-aliases/:id/reject`
  - `DELETE /api/v1/companies/folder-aliases/:id`
- `src/app/(admin)/admin/integration/_components/IntegrationNav.tsx` — 탭 네비게이션. 본 phase 에서 `/admin/integration/folder-aliases` 항목 1개 추가.
- `src/app/(admin)/admin/integration/webhard/_components/LaserOnlyCompanySettings.tsx` — UX 패턴 레퍼런스. 동일 패턴(table + 승인/거절 + 토스트 메시지) 을 따른다.
- `src/lib/react-query/queryKeys.ts` — `queryKeys.folderAliases.*` namespace 추가 위치.
- `src/lib/api/nestjs-server-client.ts` 또는 client fetch 패턴 — admin 영역 API 호출 방식. 본 프로젝트의 정확한 호출 방식 (proxy route vs 직접 nestjsClientFetch) 을 확인하여 일치시킬 것.
- `src/components/ui/Button.tsx`, `Input.tsx`, `Badge.tsx` — UI 컴포넌트(CLAUDE.md hard rule: BUTTON_STYLES 같은 string 상수 대신 컴포넌트 사용).
- `src/lib/styles.ts` — CSS 변수 토큰 (`bg-brand`, `text-success` 등).
- 기존 admin 페이지 1개 (`src/app/(admin)/admin/integration/webhard/page.tsx` 등) — page.tsx 가 'use client' 인지 server component 인지 확인하여 본 phase 의 새 페이지에서 일관되게 적용.

## 작업 내용

### 1. `src/lib/react-query/queryKeys.ts` namespace 추가

기존 패턴 (`queryKeys.companies.*`, `queryKeys.contacts.*` 등) 그대로 따라 추가:

```ts
folderAliases: {
  all: ['folderAliases'] as const,
  list: (status: 'pending' | 'approved' | 'rejected', page: number, pageSize: number) =>
    [...queryKeys.folderAliases.all, 'list', status, page, pageSize] as const,
}
```

### 2. `src/app/(admin)/admin/integration/folder-aliases/page.tsx` 신규

```tsx
'use client';

import { IntegrationNav } from '../_components/IntegrationNav';
import { PendingAliasesPanel } from './_components/PendingAliasesPanel';
import { RegisteredAliasesPanel } from './_components/RegisteredAliasesPanel';

export default function FolderAliasesPage() {
  return (
    <div className="space-y-6 p-6">
      <IntegrationNav />
      <header>
        <h1 className="text-2xl font-bold text-primary">폴더 별칭 관리</h1>
        <p className="mt-1 text-sm text-muted">
          외부웹하드 폴더명 ↔ 가입 업체 매핑 승인 / 등록. 승인된 alias 는 다음 외부 동기화부터 자동
          통합됩니다.
        </p>
      </header>
      <PendingAliasesPanel />
      <RegisteredAliasesPanel />
    </div>
  );
}
```

`'use client'` 는 본 페이지가 React Query / useState 를 직접 사용하지 않더라도, 자식 패널이 `'use client'` 이고 직접 import 한다면 명시적으로 클라이언트 트리. 자식 패널만 `'use client'` 로 두고 page 는 server component 로 둘 수도 있다 — 기존 `src/app/(admin)/admin/integration/webhard/page.tsx` 패턴 확인 후 일치.

### 3. `_components/PendingAliasesPanel.tsx` 신규

`'use client'`. 다음 동작 구현:

```tsx
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('PendingAliasesPanel');

interface PendingAlias {
  id: number;
  folderName: string;
  companyId: number;
  company: { id: number; companyName: string; isApproved: boolean };
  createdAt: string;
}

async function fetchPendingAliases(
  page: number,
  pageSize: number
): Promise<{ items: PendingAlias[]; total: number }> {
  const res = await fetch(
    `/api/proxy/companies/folder-aliases?status=pending&page=${page}&pageSize=${pageSize}`,
    {
      credentials: 'include',
    }
  );
  if (!res.ok) throw new Error(`목록 조회 실패: ${res.status}`);
  return res.json();
}

async function approveAlias(input: { id: number; cascadeBackfill: boolean }) {
  const res = await fetch(`/api/proxy/companies/folder-aliases/${input.id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ cascadeBackfill: input.cascadeBackfill }),
  });
  if (!res.ok) throw new Error(`승인 실패: ${res.status}`);
  return res.json();
}

async function rejectAlias(id: number) {
  const res = await fetch(`/api/proxy/companies/folder-aliases/${id}/reject`, {
    method: 'PATCH',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`거절 실패: ${res.status}`);
  return res.json();
}

export function PendingAliasesPanel() {
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [cascadeMap, setCascadeMap] = useState<Record<number, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.folderAliases.list('pending', page, pageSize),
    queryFn: () => fetchPendingAliases(page, pageSize),
  });

  const approveMutation = useMutation({
    mutationFn: approveAlias,
    onSuccess: (data) => {
      const backfill = data.backfill;
      if (backfill) {
        setMessage(`승인 완료. ${backfill.relocated}건 통합, ${backfill.skipped}건 skip.`);
      } else {
        setMessage('승인 완료. 다음 동기화부터 자동 통합됩니다.');
      }
      setTimeout(() => setMessage(null), 3000);
      queryClient.invalidateQueries({ queryKey: queryKeys.folderAliases.all });
    },
    onError: (e: Error) => log.error('approve failed', e),
  });

  const rejectMutation = useMutation({
    mutationFn: rejectAlias,
    onSuccess: () => {
      setMessage('거절 완료.');
      setTimeout(() => setMessage(null), 2000);
      queryClient.invalidateQueries({ queryKey: queryKeys.folderAliases.all });
    },
  });

  /* ... 테이블 렌더 — 컬럼: folderName, company.companyName, createdAt, cascadeBackfill 토글, 승인 버튼, 거절 버튼 ... */
}
```

테이블 컬럼 구조:

| 컬럼                  | 내용                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| 외부 폴더명           | `alias.folderName`                                                                                           |
| 후보 업체             | `alias.company.companyName` (+ `isApproved` false 면 "미승인 가입" 뱃지)                                     |
| 등록일                | `alias.createdAt` (날짜 포맷)                                                                                |
| 기존 데이터 일괄 이동 | `<input type="checkbox" checked={cascadeMap[alias.id] ?? false} onChange=...>`                               |
| 승인                  | `<Button>` 클릭 → `approveMutation.mutate({ id: alias.id, cascadeBackfill: cascadeMap[alias.id] ?? false })` |
| 거절                  | `<Button variant="destructive">` 클릭 → `rejectMutation.mutate(alias.id)`                                    |

승인 / 거절 mutation pending 동안 해당 row 의 두 버튼 disabled + Loader2 스피너.

토스트 메시지(`message`) 는 기존 `LaserOnlyCompanySettings` 의 setMessage 패턴 재사용.

### 4. `_components/RegisteredAliasesPanel.tsx` 신규

`'use client'`. 등록된 alias (status='approved') 목록 + 삭제:

```tsx
async function fetchApprovedAliases(page: number, pageSize: number) {
  const res = await fetch(
    `/api/proxy/companies/folder-aliases?status=approved&page=${page}&pageSize=${pageSize}`,
    {
      credentials: 'include',
    }
  );
  if (!res.ok) throw new Error(`목록 조회 실패: ${res.status}`);
  return res.json();
}

async function deleteAlias(id: number) {
  const res = await fetch(`/api/proxy/companies/folder-aliases/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`삭제 실패: ${res.status}`);
  return res.json();
}
```

테이블 컬럼:

| 컬럼        | 내용                                                            |
| ----------- | --------------------------------------------------------------- |
| 외부 폴더명 | `alias.folderName`                                              |
| 연결 업체   | `alias.company.companyName`                                     |
| 승인자      | `alias.approvedBy`                                              |
| 승인일      | `alias.approvedAt` (날짜 포맷)                                  |
| 삭제        | `<Button variant="destructive">` 클릭 → confirm dialog → DELETE |

삭제 후 toast: "삭제 완료. 동일 폴더명 재동기화 시 다시 pending 으로 등록됩니다." — 멱등 동작 안내.

mutation invalidate: `queryClient.invalidateQueries({ queryKey: queryKeys.folderAliases.all })`.

### 5. `IntegrationNav` 탭 항목 추가

`src/app/(admin)/admin/integration/_components/IntegrationNav.tsx` 의 항목 배열 (line 27-88 근처) 에 추가:

```tsx
{
  href: '/admin/integration/folder-aliases',
  label: '폴더 별칭',
  icon: <FolderSearch className="w-4 h-4" />,
}
```

`FolderSearch` (또는 동등한 lucide-react 아이콘) 을 import.

### 6. (선택) 컴포넌트 unit 테스트 — D1, D2

`src/__tests__/admin/folder-aliases/PendingAliasesPanel.test.tsx`:

| ID  | 시나리오                                                  | 검증                                                                |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| D1  | 승인 버튼 클릭 → POST 호출 + cascadeBackfill 토글 값 전달 | `jest.spyOn(global, 'fetch')` 또는 `msw` mock. 호출 URL + body 검증 |
| D2  | RegisteredAliasesPanel 의 삭제 버튼 클릭 → DELETE 호출    | confirm dialog 자동 통과 (`window.confirm` mock) + DELETE 요청 검증 |

기존 `src/__tests__/` 의 컴포넌트 테스트 패턴(있는 경우) 을 따른다. 없으면 본 task 의 신규 케이스 위주로 단순 mock fetch.

### 7. (필수) Next.js proxy route 가 없을 경우 추가

`/api/proxy/companies/...` 경로가 본 프로젝트에 없으면 `nestjsClientFetch` 헬퍼를 본 컴포넌트 내부에 정의하거나 `src/lib/api/` 에 admin 전용 헬퍼를 추가. NestJS API base URL 은 `process.env.NEXT_PUBLIC_WEBHARD_API_URL` 사용 (CLAUDE.md "Env Vars" 참고).

기존 admin 페이지(`LaserOnlyCompanySettings.tsx`) 의 `nestjsClientFetch` 지역 함수 패턴이 표준이라면 본 phase 도 동일 패턴 사용.

## Acceptance Criteria

병렬 실행 (단일 메시지에 Bash 3개):

```bash
pnpm build
```

```bash
npx tsc --noEmit
```

```bash
pnpm test
```

빌드 + 타입체크 + 테스트 통과 시 OK.

## AC 검증 방법

위 AC 커맨드를 단일 메시지에 Bash 병렬로 발사하라. 모두 통과하면 `tasks/24-external-sync-company-folder/index.json` 의 phase 4 status 를 `"completed"` 로 변경하라. 수정 3회 이상 시도해도 실패하면 status 를 `"error"` 로 변경하고 에러 내용을 `"error_message"` 필드로 기록하라.

## 주의사항

- **`dark:` 클래스 금지**: CLAUDE.md hard rule. CSS 변수 토큰 (`bg-brand`, `text-success`, `text-primary`, `text-muted`) 사용. CSS 변수가 다크모드 전환을 자동으로 처리.
- **string 상수 금지**: `BUTTON_STYLES`, `INPUT_STYLES` 같은 상수 import 금지. `<Button>`, `<Input>` 컴포넌트 사용 (CLAUDE.md hard rule).
- **queryKey factory**: raw 문자열 array 금지. `queryKeys.folderAliases.*` namespace 만 사용.
- **`window.location.reload` 금지**: 변이 후 `queryClient.invalidateQueries({ queryKey: queryKeys.folderAliases.all })` 사용.
- **`'use client'` 위치**: 자식 패널이 React Query / useState 를 직접 사용하므로 `'use client'`. page.tsx 가 직접 import 한다면 server component 로 둘 수도 있고 'use client' 로 둘 수도 있음 — 기존 admin 페이지 패턴과 일관되게.
- **logger 사용**: `console.log` 금지. `logger.createLogger('Name')` (`@/lib/utils/logger`).
- **권한**: admin route group `(admin)` 안이므로 admin 인증 자동. 별도 가드 추가 불필요.
- **상태 disable**: 승인/거절 mutation pending 동안 해당 row 의 두 버튼 disabled + Loader2 스피너. 다른 row 는 영향 없음.
- **확인 다이얼로그**: 삭제 버튼은 `window.confirm` 또는 모달 사용. 승인/거절은 dialog 없이 바로 mutate (한 번 클릭으로 완료).
- **API base URL**: `NEXT_PUBLIC_WEBHARD_API_URL` 환경변수 또는 본 프로젝트의 표준 헬퍼 사용. 하드코딩 금지.
