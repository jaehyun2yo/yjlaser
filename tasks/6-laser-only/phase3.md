# Phase 3: 웹하드 관리 페이지 — 레이저가공 업체 관리 UI

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (루트 + yjlaser_website)
- `docs/specs/features/laser-only-company-inquiry.md`
- `/tasks/6-laser-only/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `src/lib/types/contact.ts` — InquiryType에 laser_cutting 추가됨
- `src/app/(admin)/admin/contacts/_components/InquiryTypeBadge.tsx` — laser_cutting 뱃지 추가됨

아래 기존 코드를 반드시 읽어 UI 패턴을 이해하라:

- `src/app/(admin)/admin/integration/webhard/page.tsx` — 웹하드 관리 페이지
- `src/app/(admin)/admin/integration/webhard/_components/index.ts` — 컴포넌트 export
- `src/app/(admin)/admin/integration/webhard/_components/FolderStatusMappingSettings.tsx` — **참고 패턴** (카드형 설정 UI)
- `src/app/(admin)/admin/integration/webhard/_components/AutoContactExcludedFoldersSettings.tsx` — **참고 패턴** (폴더 추가/삭제 UI)
- `src/app/(admin)/admin/companies/CompaniesList.tsx` — 업체 목록 UI 패턴
- `src/lib/styles.ts` — TEXT_COLOR, BG_COLOR, BORDER_COLOR, BADGE 등 스타일 상수
- `src/lib/api/nestjs-server-client.ts` — serverGetCompanies 등 API 호출 패턴
- `src/lib/react-query/queryKeys.ts` — queryKeys 팩토리

## 작업 내용

### 1. LaserOnlyCompanySettings 컴포넌트 신규 생성

`src/app/(admin)/admin/integration/webhard/_components/LaserOnlyCompanySettings.tsx`

**기능:**

1. 현재 등록된 레이저가공 매핑 목록 표시 (GET /api/v1/companies/laser-only-mappings)
2. 매핑 추가 — 두 가지 방법:
   - **드롭다운**: 등록된 활성 업체 목록에서 선택 → folderName = company_name, companyId = company.id
   - **직접 입력**: 텍스트 input에 폴더명(업체명) 입력 → companyId = null
3. 매핑 삭제 (DELETE /api/v1/companies/laser-only-mappings/:id)
4. 미연결 매핑에 "업체 연결" 기능 (PATCH /api/v1/companies/laser-only-mappings/:id/link)

**UI 구조:**

```
┌─────────────────────────────────────────────────────┐
│ 레이저가공 업체 관리                                    │
│ 레이저가공만 필요한 업체를 등록하면, 해당 업체의 웹하드    │
│ 폴더에서 접수되는 파일이 자동으로 레이저가공 문의로       │
│ 생성됩니다.                                            │
│                                                        │
│ ┌──── 추가 ────────────────────────────────────────┐   │
│ │ [등록업체에서 선택 ▼]  또는  [폴더명 직접입력___]  │   │
│ │                                      [추가] 버튼  │   │
│ └──────────────────────────────────────────────────┘   │
│                                                        │
│ ┌──── 등록 목록 ───────────────────────────────────┐   │
│ │ 대성목형(2265-1295)   연결: 대성목형    [삭제]    │   │
│ │ 새업체               미연결 [업체연결] [삭제]     │   │
│ └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**API 호출 패턴:**

- NestJS API 호출은 `fetch`로 직접 호출하라 (기존 FolderStatusMappingSettings 패턴 참고).
- API base URL은 환경에 따라 결정한다. 기존 컴포넌트들의 API 호출 패턴을 정확히 따르라.
- CSRF 토큰(x-csrf-token 헤더)을 POST/DELETE/PATCH 요청에 포함하라.

**상태 관리:**

- 매핑 목록은 `useState`로 관리. 추가/삭제 후 목록을 다시 fetch.
- 업체 목록 (드롭다운용)은 컴포넌트 마운트 시 1회 fetch.
- 로딩/에러 상태 표시.

**스타일링:**

- `@/lib/styles`에서 import. `dark:` 클래스 사용 금지.
- 기존 FolderStatusMappingSettings, AutoContactExcludedFoldersSettings와 동일한 카드형 UI.
- 섹션 헤더: `TEXT_COLOR.primary` + `TEXT_COLOR.tertiary` 설명문.

**"업체 연결" 기능:**

- 미연결 매핑(company_id=null)에만 표시.
- 클릭 시 활성 업체 드롭다운 표시.
- 업체 선택 후 PATCH /laser-only-mappings/:id/link 호출.
- 성공 시 목록 갱신.

### 2. 컴포넌트 export 추가

`src/app/(admin)/admin/integration/webhard/_components/index.ts`에 추가:

```typescript
export { default as LaserOnlyCompanySettings } from './LaserOnlyCompanySettings';
```

### 3. 페이지에 컴포넌트 추가

`src/app/(admin)/admin/integration/webhard/page.tsx`에서 LaserOnlyCompanySettings를 import하고, FolderStatusMappingSettings 바로 아래에 배치:

```tsx
<FolderStatusMappingSettings />
<LaserOnlyCompanySettings />
<AutoContactExcludedFoldersSettings />
```

### 4. E2E 테스트 — 웹하드 관리 UI

`e2e/laser-only-company.spec.ts`에 아래 테스트 섹션을 추가하라. 기존 테스트 코드의 패턴(authFile, API 키 체크, skip 처리)을 따르라.

```typescript
// ============================================================
// 5. 웹하드 관리 — 레이저가공 업체 관리 UI
// ============================================================
test.describe('웹하드 관리 — 레이저가공 업체 관리', () => {
  test.use({ storageState: authFile });

  test('웹하드 관리 페이지에 "레이저가공 업체 관리" 섹션이 표시된다', async ({ page }) => {
    // /admin/integration/webhard 이동 → "레이저가공 업체 관리" 텍스트 visible
  });

  test('폴더명 직접 입력으로 매핑 추가 및 삭제', async ({ page, request }) => {
    // 1. 페이지 이동
    // 2. 폴더명 입력 → 추가 버튼 클릭
    // 3. 목록에 추가된 항목 확인
    // 4. 삭제 버튼 클릭
    // 5. 목록에서 제거 확인
    // API 키 없으면 skip
  });

  test('등록 업체 드롭다운으로 매핑 추가', async ({ page, request }) => {
    // 1. 드롭다운에서 업체 선택
    // 2. 추가 → 목록에 업체 연결 상태로 표시
    // cleanup: 삭제
  });

  test('미연결 매핑에 업체 연결', async ({ page, request }) => {
    // 1. 폴더명으로 매핑 추가 (미연결)
    // 2. "업체 연결" 버튼 클릭
    // 3. 업체 선택
    // 4. 연결 완료 확인
    // cleanup: 삭제
  });
});
```

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/6-laser-only/index.json`의 phase 3 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- **백엔드 코드는 수정하지 마라.** Phase 1에서 백엔드 작업은 완료되었다.
- `@/lib/styles`의 상수만 사용하라. 인라인 색상값 금지. `dark:` 클래스 금지.
- `console.log` 사용 금지. 필요시 `logger.createLogger()` 사용.
- 상대 import 금지. `@/` 절대 경로만 사용.
- CSRF 토큰을 POST/DELETE/PATCH 요청에 포함하라 (기존 컴포넌트 패턴 참고).
- 기존 테스트를 깨뜨리지 마라.
- E2E 테스트는 API 키가 없는 환경에서 `test.skip`으로 처리하라.
