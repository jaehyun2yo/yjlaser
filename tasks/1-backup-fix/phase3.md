# Phase 3: frontend-fix

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 루트)
- `/tasks/1-backup-fix/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/src/backup/backup.service.ts` (Phase 2에서 비동기 처리로 변경됨)
- `webhard-api/src/backup/backup.controller.ts` (Phase 2에서 startBackup + getStatus 추가됨)
- `webhard-api/src/backup/dto/backup.dto.ts` (Phase 1-2에서 retentionDays + 새 타입 추가됨)

프론트엔드 수정 대상 파일을 반드시 읽어라:

- `src/app/(admin)/admin/integration/webhard/_components/BackupSettings.tsx` (전체)
- `src/lib/react-query/queryKeys.ts` (backup 섹션)
- `src/hooks/useToast.ts` (토스트 사용법 파악)
- `src/components/toast/types.ts` (ToastOptions 타입)

## 작업 내용

백업 프론트엔드의 타입 불일치, 응답 처리 부재, UX 피드백 부족을 수정한다.

### 1. 타입 수정 (`BackupSettings.tsx`)

**1-1. `BackupSettings` 인터페이스** (Line 13-18)

`retentionDays`는 그대로 유지 (백엔드가 이제 `retentionDays`로 맞춰옴). 변경 불필요.

**1-2. `BackupHistoryItem` 인터페이스** (Line 25-34)

변경할 필드:

- `fileSize: number` → `fileSize: string` (백엔드가 BigInt를 string으로 직렬화)
- `errorMessage: string | null` → `error: string | null` (백엔드 응답 필드명과 일치)

**1-3. 새 타입 추가**

백엔드의 새 응답 타입을 프론트엔드에도 정의:

```typescript
interface BackupStartResult {
  status: 'started' | 'skipped' | 'already_running';
  total?: number;
  reason?: string;
}

interface BackupStatusInfo {
  isRunning: boolean;
  total: number;
  success: number;
  failed: number;
}
```

**1-4. `queryKeys` 추가** (`src/lib/react-query/queryKeys.ts`)

backup 섹션에 status 쿼리 키를 추가:

```typescript
backup: {
  all: ['backup'] as const,
  settings: () => [...queryKeys.backup.all, 'settings'] as const,
  eligible: () => [...queryKeys.backup.all, 'eligible'] as const,
  status: () => [...queryKeys.backup.all, 'status'] as const,
  history: (page: number) => [...queryKeys.backup.all, 'history', page] as const,
}
```

### 2. BackupStatusCard 수정 (가장 큰 변경)

**2-1. `useToast` 훅 import 추가**

파일 상단에 `import { useToast } from '@/hooks/useToast';` 추가.
`BackupStatusCard` 컴포넌트 내에서 `const toast = useToast();` 호출.

**2-2. 백업 상태 폴링 쿼리 추가**

```typescript
const statusQuery = useQuery<BackupStatusInfo>({
  queryKey: queryKeys.backup.status(),
  queryFn: () => nestjsClientFetch<BackupStatusInfo>('/backup/status'),
  refetchInterval: statusQuery.data?.isRunning ? 3000 : false,
  // isRunning이 true일 때만 3초마다 폴링. false면 폴링 중지.
});
```

주의: `refetchInterval`이 자기 자신의 데이터를 참조하므로, `enabled`와 별도 state를 조합해야 할 수 있다. 다음 패턴을 사용하라:

```typescript
const [isPolling, setIsPolling] = useState(false);

const statusQuery = useQuery<BackupStatusInfo>({
  queryKey: queryKeys.backup.status(),
  queryFn: () => nestjsClientFetch<BackupStatusInfo>('/backup/status'),
  refetchInterval: isPolling ? 3000 : false,
});

// 폴링 중 완료 감지
if (isPolling && statusQuery.data && !statusQuery.data.isRunning) {
  setIsPolling(false);
  const { total, success, failed } = statusQuery.data;
  if (failed === 0) {
    toast.success('백업 완료', `${success}개 파일이 성공적으로 백업되었습니다.`);
  } else if (success === 0) {
    toast.error('백업 실패', `${failed}개 파일 모두 백업에 실패했습니다.`);
  } else {
    toast.warning('백업 완료 (일부 실패)', `성공: ${success}개, 실패: ${failed}개`);
  }
  // 쿼리 무효화
  void queryClient.invalidateQueries({ queryKey: queryKeys.backup.eligible() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.backup.history(1) });
}
```

**2-3. `executeMutation` 수정**

```typescript
const executeMutation = useMutation({
  mutationFn: () => nestjsClientFetch<BackupStartResult>('/backup/execute', { method: 'POST' }),
  onSuccess: (data) => {
    if (data.status === 'skipped') {
      toast.warning('백업 스킵', data.reason ?? '알 수 없는 사유');
    } else if (data.status === 'already_running') {
      toast.warning('백업 진행 중', '이미 백업이 실행 중입니다.');
    } else {
      toast.success('백업 시작', `${data.total ?? 0}개 파일 백업을 시작합니다.`);
      setIsPolling(true); // 폴링 시작
    }
  },
  onError: (err) => {
    toast.error('백업 실행 실패', (err as Error).message);
  },
});
```

**2-4. 진행률 UI 추가**

버튼 아래 영역에, `isPolling && statusQuery.data?.isRunning`일 때 프로그레스 바를 표시:

```tsx
{
  isPolling && statusQuery.data?.isRunning && (
    <div className="mt-3 space-y-2">
      <div className="flex justify-between text-xs text-gray-500">
        <span>백업 진행 중...</span>
        <span>
          {statusQuery.data.success + statusQuery.data.failed} / {statusQuery.data.total}
        </span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#ED6C00] rounded-full transition-all duration-300"
          style={{
            width: `${
              statusQuery.data.total > 0
                ? ((statusQuery.data.success + statusQuery.data.failed) / statusQuery.data.total) *
                  100
                : 0
            }%`,
          }}
        />
      </div>
    </div>
  );
}
```

프로그레스 바 색상은 프로젝트의 브랜드 컬러 `#ED6C00`을 사용. `BG_COLOR.grayLighter` 등 기존 스타일 상수를 활용해도 좋다.

**2-5. 기존 성공/에러 메시지 제거**

`executeMutation.isSuccess` / `executeMutation.isError` 하드코딩 메시지를 제거한다 (토스트로 대체되었으므로):

```tsx
// 아래 블록 삭제:
{
  executeMutation.isSuccess && (
    <p className="mt-2 text-sm text-green-600">백업이 시작되었습니다.</p>
  );
}
{
  executeMutation.isError && (
    <p className="mt-2 text-sm text-red-500">
      실행 실패: {(executeMutation.error as Error).message}
    </p>
  );
}
```

### 3. BackupHistoryCard 필드 수정

**3-1. 에러 필드명**

`item.errorMessage` → `item.error` (3곳):

- `title={item.errorMessage ?? undefined}` → `title={item.error ?? undefined}`
- `{item.errorMessage ?? '-'}` → `{item.error ?? '-'}`

**3-2. 파일 크기 변환**

`formatBytes(item.fileSize)` → `formatBytes(Number(item.fileSize))`

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/1-backup-fix/index.json`의 phase 3 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 백엔드 코드(`webhard-api/`)를 건드리지 마라.
- `useToast` 훅은 반드시 컴포넌트 최상위에서 호출하라 (React hooks 규칙).
- `setIsPolling`과 `statusQuery.data` 동기화 시 무한 루프에 주의하라. 조건 체크 로직에서 `isPolling`이 false가 된 후에는 더 이상 완료 토스트가 뜨지 않아야 한다.
- `refetchInterval`에 함수를 전달할 수 없다면 `isPolling` state와 조합하라.
- `console.log` 사용 금지. 필요시 `clientLogger` 사용.
- `dark:` 클래스 직접 사용 금지. 스타일 상수 활용.
- 기존 테스트를 깨뜨리지 마라.
- `queryClient`는 `useQueryClient()`로 가져와야 한다. `BackupStatusCard` 컴포넌트에서 `const queryClient = useQueryClient();` 추가.
