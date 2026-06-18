# Phase 4: 거래처 대시보드 + E2E 전체 흐름 테스트

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (루트 + yjlaser_website)
- `docs/specs/features/laser-only-company-inquiry.md`
- `/tasks/6-laser-only/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/src/companies/laser-only-mapping.service.ts` — LaserOnlyMapping 서비스 (Phase 1)
- `src/lib/types/contact.ts` — InquiryType, ContactStatus 타입 수정됨 (Phase 2)
- `src/app/(admin)/admin/contacts/_components/InquiryTypeBadge.tsx` — laser_cutting 뱃지 (Phase 2)
- `src/app/(admin)/admin/integration/webhard/_components/LaserOnlyCompanySettings.tsx` — 관리 UI (Phase 3)

아래 거래처 포탈 코드를 반드시 읽어라:

- `src/app/company/dashboard/CompanyDashboardClient.tsx` — 대시보드 메인
- `src/app/company/dashboard/types.ts` — Contact 타입 (대시보드용)
- `src/app/company/dashboard/hooks.ts` — useFilteredContacts 등
- `src/app/company/dashboard/components/shared/ContactList.tsx` — 문의 목록 렌더링
- `src/app/company/dashboard/components/shared/StatsCards.tsx` — 통계 카드
- `src/app/company/dashboard/components/shared/StatusFilterButtons.tsx` — 상태 필터
- `src/app/company/dashboard/page.tsx` — 서버 컴포넌트 (데이터 fetch)
- `src/app/company/orders/_lib/statusUtils.ts` — toCustomerStatus 매핑 (참고)
- `src/lib/utils/statusLabels.ts` — STATUS_LABELS (completed: '작업완료')
- `src/lib/styles.ts` — BADGE 상수

## 작업 내용

### 1. 거래처 대시보드 Contact 타입 수정

`src/app/company/dashboard/types.ts`의 Contact 인터페이스에 `inquiry_type` 필드 추가:

```typescript
export interface Contact {
  // ... 기존 필드 ...
  inquiry_type?: string | null; // 'cutting_request' | 'mold_request' | 'laser_cutting' | null
}
```

### 2. 대시보드 서버 컴포넌트 — inquiry_type 반환 확인

`src/app/company/dashboard/page.tsx`를 읽고, 백엔드에서 Contact 데이터를 fetch할 때 `inquiry_type` 필드가 포함되는지 확인하라.

만약 NestJS API의 Contact 조회 응답에 `inquiry_type`이 포함되지 않는다면:

- `webhard-api/src/contacts/contacts.service.ts`의 조회 쿼리 `select`에 `inquiryType: true`를 추가하라.
- 응답 매핑에서 `inquiry_type: contact.inquiryType`을 포함하라.

이미 포함되어 있다면 수정하지 마라.

### 3. ContactList에 레이저가공 뱃지 표시

`src/app/company/dashboard/components/shared/ContactList.tsx`를 읽고, 각 Contact 카드 렌더링 부분에 inquiry_type 기반 뱃지를 추가하라.

**표시 규칙:**

- `inquiry_type === 'laser_cutting'` → 회색 뱃지 "레이저가공" 표시
- 다른 inquiry_type이나 null → 표시 안 함 (거래처에게 칼선의뢰/목형의뢰 구분은 불필요)

**구현:**

```tsx
{
  contact.inquiry_type === 'laser_cutting' && (
    <span className={`${BADGE.gray} text-xs`}>레이저가공</span>
  );
}
```

`@/lib/styles`에서 BADGE를 import하라.

### 4. 상태 필터에서 completed 매핑 확인

`src/app/company/dashboard/hooks.ts`의 `useFilteredContacts`를 읽고, 상태 필터링 로직을 확인하라.

현재 `StatusFilterType = 'all' | 'new' | 'in_progress' | 'completed'`인데:

- `completed` 필터가 어떤 contact status를 포함하는지 확인
- `status === 'completed'`인 문의가 `completed` 필터에 포함되도록 확인
- `status === 'delivered'`와 `status === 'completed'` 둘 다 완료 카테고리에 들어가야 함

필요시 필터 로직을 수정하라.

### 5. StatsCards에 completed 반영

`src/app/company/dashboard/components/shared/StatsCards.tsx`를 읽고, 통계 계산에서 `completed` 상태가 적절한 카테고리에 포함되는지 확인하라. `completed`는 `delivered`와 마찬가지로 "완료" 카테고리에 포함되어야 한다.

### 6. E2E 테스트 — 관리자 문의 목록 뱃지 + 필터

`e2e/laser-only-company.spec.ts`에 추가:

```typescript
// ============================================================
// 6. 관리자 문의 목록 — 레이저가공 뱃지 및 필터
// ============================================================
test.describe('관리자 문의 목록 — 레이저가공', () => {
  test.use({ storageState: authFile });

  test('문의유형 필터에 "레이저가공" 옵션이 존재한다', async ({ page }) => {
    await page.goto('/admin/work-management');
    await page.waitForLoadState('domcontentloaded');
    // "레이저가공" 필터 버튼 visible 확인
    // 이미 INQUIRY_TYPE_FILTERS에 있으므로 표시되어야 함
  });
});
```

### 7. E2E 테스트 — 전체 흐름

`e2e/laser-only-company.spec.ts`에 추가:

```typescript
// ============================================================
// 7. 전체 흐름 — 매핑 등록 → 문의 생성 → 상태 변경 → 확인
// ============================================================
test.describe.serial('레이저가공 전체 흐름', () => {
  test.use({ storageState: authFile });

  const testFolderName = `E2E테스트업체_${Date.now()}`;
  let mappingId: number;
  let contactId: string;

  test('매핑 등록 → auto-contact API로 문의 생성', async ({ request }) => {
    const apiBaseUrl = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
    const apiKey = process.env.MIGRATION_API_KEY || '';
    if (!apiKey) {
      test.skip(true, 'API 키 없음');
      return;
    }

    // 1. 매핑 등록
    const addResp = await request.post(`${apiBaseUrl}/api/v1/companies/laser-only-mappings`, {
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      data: { folderName: testFolderName },
    });
    expect(addResp.ok()).toBe(true);
    const mapping = await addResp.json();
    mappingId = mapping.id;

    // 2. auto-contact API 호출 (파일 업로드 시뮬레이션)
    // 이 API는 webhard sync에서 호출되는 내부 API
    // auto-contact endpoint를 직접 호출하거나,
    // contacts를 직접 생성하여 laser_cutting 문의를 만든다
    const contactResp = await request.post(`${apiBaseUrl}/api/v1/contacts`, {
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      data: {
        company_name: testFolderName,
        inquiry_type: 'laser_cutting',
        status: 'cutting',
        process_stage: 'laser',
        name: 'E2E테스트',
        phone: '010-0000-0000',
        email: 'test@test.com',
        source: 'webhard',
      },
    });
    if (contactResp.ok()) {
      const contact = await contactResp.json();
      contactId = contact.id;
    }
  });

  test('관리자 목록에서 레이저가공 뱃지 확인', async ({ page }) => {
    if (!contactId) {
      test.skip(true, '이전 단계 실패');
      return;
    }

    await page.goto('/admin/work-management');
    await page.waitForLoadState('domcontentloaded');

    // 테스트 업체명으로 문의 검색 → 레이저가공 뱃지 확인
    // 검색 기능이 있으면 사용, 없으면 스크롤하여 확인
  });

  test('문의 상태 cutting → completed 전환', async ({ request }) => {
    if (!contactId) {
      test.skip(true, '이전 단계 실패');
      return;
    }

    const apiBaseUrl = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
    const apiKey = process.env.MIGRATION_API_KEY || '';

    const resp = await request.patch(`${apiBaseUrl}/api/v1/contacts/${contactId}/status`, {
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      data: { status: 'completed' },
    });
    expect(resp.ok()).toBe(true);
  });

  test('cleanup — 테스트 데이터 삭제', async ({ request }) => {
    const apiBaseUrl = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
    const apiKey = process.env.MIGRATION_API_KEY || '';
    if (!apiKey) return;

    // 매핑 삭제
    if (mappingId) {
      await request.delete(`${apiBaseUrl}/api/v1/companies/laser-only-mappings/${mappingId}`, {
        headers: { 'X-API-Key': apiKey },
      });
    }

    // 문의 삭제 (soft delete)
    if (contactId) {
      await request.delete(`${apiBaseUrl}/api/v1/contacts/${contactId}`, {
        headers: { 'X-API-Key': apiKey },
      });
    }
  });
});
```

**주의:** E2E 테스트의 API 엔드포인트와 요청/응답 형식은 실제 구현에 맞게 조정하라. 위 코드는 시그니처 수준의 가이드이다. 실제 contacts API의 생성/상태변경 엔드포인트 경로와 DTO를 확인하고 사용하라.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test && cd webhard-api && pnpm build
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/6-laser-only/index.json`의 phase 4 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 거래처 대시보드에서 DXF 관련 데이터(가격, 네스팅 효율)를 표시하지 마라.
- `console.log` 사용 금지. `logger.createLogger()` 사용.
- `@/` 절대 import만 사용.
- `dark:` 클래스 사용 금지.
- 백엔드 Contact 조회 API 수정이 필요한 경우, `inquiry_type` 필드 추가만 하라. 다른 변경 금지.
- E2E 테스트에서 API 키가 없으면 `test.skip`으로 처리하라.
- E2E에서 생성한 테스트 데이터는 반드시 cleanup하라.
- 기존 테스트를 깨뜨리지 마라.
