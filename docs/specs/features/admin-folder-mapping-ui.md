# 외부웹하드 폴더 매핑 UI 통합 — `/admin/integration/companies` (task 26)

## 개요·배경

task 24 가 `/admin/integration/folder-aliases` 별도 탭에 매핑 UI 를 도입했으나, 운영자 입장에서 "업체 관리" 와 "폴더 매핑" 이 분리되어 있어 동선이 어색했다. 본 task 는 매핑 UI 를 업체관리 페이지로 통합하고, 매뉴얼 매핑 폼 + 미매칭 외부 폴더 목록 패널을 추가해 한 화면에서 모든 매핑 작업이 가능하도록 한다.

본 spec 은 UI/UX·라우팅·React Query 측면의 정책만 다룬다. 백엔드 매핑 알고리즘·migration 정책은 [external-folder-migration.md](./external-folder-migration.md) 참고.

## 정책 — UI 위치 변경

### 신규 통합 페이지: `/admin/integration/companies`

기존 페이지 (업체 목록 + 통계) 위에 `<FolderMappingSection>` 추가. 섹션 내부 패널 4개:

```
/admin/integration/companies/page.tsx
├── <CompaniesList>                          (기존 — 업체 테이블 + 통계)
└── <FolderMappingSection>                   (신규)
    ├── <PendingAliasesPanel>                ← folder-aliases/_components 에서 이동
    ├── <UnmatchedFoldersPanel>              ← 신규 (Phase 2 endpoint 사용)
    ├── <ManualMappingForm>                  ← 신규 (업체 + 폴더명 직접 입력)
    └── <RegisteredAliasesPanel>             ← folder-aliases/_components 에서 이동
```

표시 순서 근거:

1. **Pending** 먼저 — 자동 등록된 후보가 운영자 액션 대기 중인 가장 우선 항목.
2. **Unmatched** 두 번째 — 정규화 후보 0개로 자동 등록조차 안 된 폴더들. 매뉴얼 매핑 폼의 "원본 폴더명" 필드와 시각적 인접.
3. **ManualMappingForm** 세 번째 — Unmatched 패널의 행을 클릭하면 폼의 `folderName` 이 자동 채워짐 (UX 보조).
4. **Registered** 마지막 — 이미 처리된 매핑은 참조용. 삭제 버튼만 노출.

### 컴포넌트 이동

- `src/app/(admin)/admin/integration/folder-aliases/_components/PendingAliasesPanel.tsx` → `src/app/(admin)/admin/integration/companies/_components/PendingAliasesPanel.tsx`
- `src/app/(admin)/admin/integration/folder-aliases/_components/RegisteredAliasesPanel.tsx` → `src/app/(admin)/admin/integration/companies/_components/RegisteredAliasesPanel.tsx`
- `src/app/(admin)/admin/integration/folder-aliases/_lib/api.ts` → `src/app/(admin)/admin/integration/companies/_lib/folder-alias-api.ts`

이동 시 import 경로 수정 외 로직 변경 없음.

### 신규 컴포넌트

#### `<UnmatchedFoldersPanel>`

```ts
// src/app/(admin)/admin/integration/companies/_components/UnmatchedFoldersPanel.tsx
interface UnmatchedFolder {
  id: string;
  name: string;
  path: string;
  contactCount: number; // 누적 contact 수
  fileCount: number; // 누적 파일 수
  createdAt: string;
}
```

- 데이터 소스: `GET /api/v1/folders/external-unmatched` (task 26 Phase 2 신규 endpoint).
- 행 클릭 → `<ManualMappingForm>` 의 `folderName` 자동 채움 (props callback).
- 빈 상태: "미매칭 외부 폴더가 없습니다."

#### `<ManualMappingForm>`

```ts
// src/app/(admin)/admin/integration/companies/_components/ManualMappingForm.tsx
interface ManualMappingFormState {
  folderName: string;
  companyId: number | null; // 업체 검색 콤보박스
  cascadeBackfill: boolean; // default true
}
```

- 업체 콤보박스: `companies` 쿼리 재사용 (`queryKeys.companies.all`), 자동완성 필터링.
- 제출 → `POST /api/v1/companies/folder-aliases` (createApprovedAlias).
- 응답의 `migration` 카운트를 toast 로 노출:
  ```
  "대성목형 매핑 완료 — Contact 5건, 폴더 12개, 파일 47개 이동, 외부 폴더 3개 정리"
  ```
- 충돌 rename 발생 시 toast 에 추가 표시.

### 라우팅 변경

`IntegrationNav.tsx` 에서 "폴더 별칭" 탭 항목 (`href: '/admin/integration/folder-aliases'`) 제거. 업체관리 탭은 그대로 유지.

`/admin/integration/folder-aliases/page.tsx` 를 redirect 로 교체 (결정 #3 — 6개월 redirect):

```tsx
import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/integration/companies');
}
```

`_components/`, `_lib/`, `page.tsx` 외 디렉토리 파일은 삭제 (이동 또는 dead code 제거). 6개월 후 (2026-10) 별도 task 로 redirect 페이지 자체 삭제.

## React Query keys

`src/lib/react-query/queryKeys.ts` 갱신:

```ts
export const queryKeys = {
  // 기존
  folderAliases: {
    all: ['folder-aliases'] as const,
    list: (status: string, page: number, pageSize: number) =>
      ['folder-aliases', 'list', status, page, pageSize] as const,
  },

  // 신규 (task 26)
  externalUnmatchedFolders: {
    all: ['external-unmatched-folders'] as const,
    list: () => ['external-unmatched-folders', 'list'] as const,
  },
};
```

invalidate 정책:

- `ManualMappingForm` 제출 성공 → `folderAliases.all` + `externalUnmatchedFolders.all` 모두 invalidate.
- `PendingAliasesPanel` 승인/거절 → 동일.
- `RegisteredAliasesPanel` 삭제 → `folderAliases.all` 만 (외부 폴더는 이미 옮겨졌으므로 unmatched 영향 없음).

## 신규 endpoint — `GET /api/v1/folders/external-unmatched`

운영자가 매뉴얼 매핑 폼에서 "어떤 외부 폴더를 매칭할지" 선택하기 위한 조회 endpoint.

### 인증

`AdminGuard` (admin 세션). API key 호출 차단.

### Request

쿼리 파라미터 없음.

### Response

```json
[
  {
    "id": "uuid",
    "name": "대성목형(2265-1295)",
    "path": "/외부웹하드/대성목형(2265-1295)",
    "contactCount": 5,
    "fileCount": 47,
    "createdAt": "2026-04-15T09:00:00.000Z"
  }
]
```

### 조건

- `WebhardFolder.path startsWith '/외부웹하드/'`
- `WebhardFolder.companyId IS NULL`
- `WebhardFolder.deletedAt IS NULL`
- `WebhardFolder.folderKind IN ('root', 'generic')` (template 폴더 제외 — 운영자가 매핑할 단위 아님)
- depth=2 (외부웹하드 직하 root 만, 그 하위 임의 폴더는 제외 — 매핑은 root 단위로만 수행)
- 동일 `name` 의 `CompanyFolderAlias status='approved'` 가 없는 것만 (이미 매핑된 폴더 제외)

### 통계

`contactCount` / `fileCount` 는 폴더 트리 BFS 로 누적 계산. depth 무제한, deletedAt=null 조건.

성능: 외부 폴더 수가 많지 않으므로 (수십~수백) 단일 쿼리로 충분. 향후 필요 시 캐싱 (`folders.service.ts` 의 기존 `getAllFoldersCached` 패턴 적용).

## 업체 상세 페이지 강화 (Phase 4 — 선택)

`/admin/integration/companies/[id]/page.tsx` 에 카드 추가:

```
"연결된 외부 폴더" 섹션
├── 매핑된 alias 목록 (folderName + 통계)
└── "이 업체에 폴더 매핑 추가" 버튼
    → ManualMappingForm 모달 (folderName 빈 칸, companyId 자동 채움)
```

매뉴얼 매핑 폼을 모달로 재사용. 업체 상세 → 매핑 추가가 자연스러운 동선.

## 디자인 토큰

기존 `BG_COLOR.card`, `BORDER_COLOR.default`, `TEXT_COLOR.{primary, secondary, success, error}` 재사용. 새 토큰 도입 없음.

## 테스트 케이스 list

### Phase 3 — `companies/_components/*.test.tsx`

- **U1** — `<FolderMappingSection>` 4개 패널 모두 렌더 + 빈 상태 메시지 정상.
- **U2** — `<UnmatchedFoldersPanel>` 행 클릭 → `<ManualMappingForm>` 의 folderName 채워짐.
- **U3** — `<ManualMappingForm>` 제출 → API 호출 + 응답 migration 카운트 toast 노출.
- **U4** — invalidate 검증: 제출 성공 시 `folderAliases.all` + `externalUnmatchedFolders.all` 둘 다 invalidate.

### Phase 4 (선택) — 업체 상세

- **U5** — 업체 상세 → "매핑 추가" 모달 → companyId 자동 채워짐.

### Phase 5 — E2E (Playwright 또는 수동)

- **E2E-3** — `/admin/integration/folder-aliases` 접속 → 자동으로 `/admin/integration/companies` 로 redirect.
- **E2E-4** — 대성목형 매뉴얼 매핑 시나리오 (UI flow): 업체관리 진입 → Unmatched 행 클릭 → 폼 자동 채움 → 업체 검색 → 제출 → toast 확인 → Registered 패널에 추가됨.

## 변경 이력

- 2026-04-29 — task 26 신규: 매핑 UI 를 `/admin/integration/companies` 로 통합 + Unmatched 패널 + 매뉴얼 폼 + 옛 URL 6개월 redirect.

## 참조

- `external-folder-migration.md` — 본 task 의 백엔드 정책 (별도 spec).
- `webhard-api/src/companies/folder-alias.service.ts:122` `createApprovedAlias` — 매뉴얼 폼이 호출하는 endpoint 의 서비스.
- `src/app/(admin)/admin/integration/_components/IntegrationNav.tsx` — 탭 제거 위치.
- `src/app/(admin)/admin/integration/companies/page.tsx` — `<FolderMappingSection>` 추가 위치.
- `docs/specs/features/external-sync-company-folder.md` §Phase 4 — task 24 의 기존 UI 정책 (본 task 가 위치 변경).
