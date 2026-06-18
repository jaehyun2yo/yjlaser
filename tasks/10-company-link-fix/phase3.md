# Phase 3: backup-api-frontend

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 루트)
- `/tasks/10-company-link-fix/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/src/backup/backup.controller.ts` — Phase 2에서 ApiKeyGuard로 변경됨

아래 기존 코드를 반드시 읽어라:

- `src/app/(admin)/admin/integration/webhard/_components/BackupSettings.tsx` — 현재 NestJS 직접 호출
- `src/lib/api/nestjs-server-client.ts` — 서버 사이드 NestJS 호출 패턴 참고
- `src/lib/auth/session.ts` — admin 세션 검증 함수 (`verifySession`, `getSessionUser`)
- `src/app/api/company/dashboard/route.ts` — Next.js API route 패턴 참고 (admin session 검증 후 NestJS 호출)

## 작업 내용

### 1. Next.js API route 생성 — `src/app/api/admin/backup/[...path]/route.ts`

catch-all 프록시 route를 생성한다. admin 세션 검증 후 NestJS backup API를 API key로 호출.

**설계:**

```typescript
// 허용 경로 화이트리스트
const ALLOWED_PATHS = new Set([
  'settings',
  'eligible',
  'status',
  'execute',
  'history',
  'browse-directories',
]);

// GET handler: settings, eligible, status, history, browse-directories
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
);

// POST handler: execute
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
);

// PUT handler: settings
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
);
```

**각 핸들러의 공통 로직:**

1. `verifySession()` + `getSessionUser()` 로 admin 세션 확인. `userType !== 'admin'`이면 403.
2. `params.path`를 join하여 endpoint 경로 추출. `ALLOWED_PATHS`에 없으면 400 반환.
3. `nestjsFetch` (또는 서버 사이드 fetch)로 NestJS `/backup/{path}` 호출 (API key 사용).
4. query parameter를 그대로 전달 (history의 page/limit, browse-directories의 path 등).
5. POST/PUT 요청 시 request body를 그대로 전달.
6. NestJS 응답을 그대로 NextResponse.json()으로 반환.

**`nestjs-server-client.ts`에 함수 추가하지 마라.** 이 프록시는 범용 패턴이므로 route 파일 내에서 직접 fetch를 구성한다. `nestjsFetch` 헬퍼를 사용해도 좋지만, 새로운 개별 함수(serverGetBackupSettings 등)는 만들지 마라.

### 2. `BackupSettings.tsx` 수정

NestJS 직접 호출을 Next.js API route 경유로 변경한다.

**변경 내용:**

1. **삭제할 코드:**
   - `NESTJS_API_URL`, `API_PREFIX` 상수
   - `getCsrfToken()` 함수
   - `nestjsClientFetch()` 함수 전체

2. **대체 fetch 함수:**

```typescript
async function backupFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/admin/backup/${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `API 오류: ${res.status}`);
  }
  return res.json() as Promise<T>;
}
```

3. **모든 `nestjsClientFetch` 호출을 `backupFetch`로 교체:**
   - `nestjsClientFetch<BackupSettings>('/backup/settings')` → `backupFetch<BackupSettings>('settings')`
   - `nestjsClientFetch<BackupSettings>('/backup/settings', { method: 'PUT', ... })` → `backupFetch<BackupSettings>('settings', { method: 'PUT', ... })`
   - `nestjsClientFetch<EligibleInfo>('/backup/eligible')` → `backupFetch<EligibleInfo>('eligible')`
   - `nestjsClientFetch<BackupStartResult>('/backup/execute', { method: 'POST' })` → `backupFetch<BackupStartResult>('execute', { method: 'POST' })`
   - `nestjsClientFetch<BackupStatusInfo>('/backup/status')` → `backupFetch<BackupStatusInfo>('status')`
   - `nestjsClientFetch<BackupHistoryResponse>('/backup/history?...')` → `backupFetch<BackupHistoryResponse>('history?...')`
   - `nestjsClientFetch<BrowseDirectoriesResponse>('/backup/browse-directories...')` → `backupFetch<BrowseDirectoriesResponse>('browse-directories...')`

4. **`credentials: 'include'` 제거:** Next.js 내부 호출이므로 쿠키는 자동 전달됨. fetch에서 `credentials` 옵션 불필요.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/10-company-link-fix/index.json`의 phase 3 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- `BackupSettings.tsx`의 UI 로직/컴포넌트 구조는 변경하지 마라. 호출 경로만 바꾼다.
- `FolderBrowser` 컴포넌트 내부의 `nestjsClientFetch` 호출도 `backupFetch`로 교체해야 한다. 누락하지 마라.
- API route에서 path traversal 공격을 방어하라: `ALLOWED_PATHS` 화이트리스트 체크 이전에 path 세그먼트가 `..`를 포함하면 즉시 400을 반환하라.
- Next.js App Router의 catch-all route에서 `params`는 Promise이다. `const { path } = await params;`로 사용해야 한다.
- logger를 사용하라. `console.log` 금지. `import { logger } from '@/lib/utils/logger'` 사용.
- 기존 테스트를 깨뜨리지 마라.
