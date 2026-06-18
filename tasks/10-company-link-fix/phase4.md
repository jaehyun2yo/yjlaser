# Phase 4: e2e-tests

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 루트)
- `docs/testing.md`
- `/tasks/10-company-link-fix/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/src/companies/laser-only-mapping.service.ts` — Phase 1에서 linkCompany에 contact 동기화 추가됨
- `webhard-api/src/backup/backup.controller.ts` — Phase 2에서 ApiKeyGuard로 변경됨
- `src/app/api/admin/backup/[...path]/route.ts` — Phase 3에서 생성됨
- `src/app/(admin)/admin/integration/webhard/_components/BackupSettings.tsx` — Phase 3에서 수정됨

아래 기존 E2E 테스트를 반드시 읽어라:

- `e2e/laser-only-company.spec.ts` — 기존 레이저가공 E2E 테스트 (패턴 참고)

## 작업 내용

### 1. `e2e/laser-only-company.spec.ts` — 업체 연결 후 문의 대시보드 조회 E2E 추가

기존 파일의 마지막 `test.describe` 블록 이후에 새로운 섹션을 추가한다.

**섹션 8: 업체 연결 시 기존 문의 동기화 검증**

```typescript
// ============================================================
// 8. 업체 연결 시 기존 문의 companyName 동기화 검증
// ============================================================
test.describe.serial('업체 연결 — 기존 문의 동기화', () => {
  // ...
});
```

**테스트 흐름:**

1. **Setup — 테스트 데이터 생성** (serial test 1):
   - 고유 폴더명 생성: `const testFolderName = 'SyncTest_' + Date.now();`
   - API로 미연결 매핑 생성: `POST /companies/laser-only-mappings` (folderName=testFolderName)
   - API로 문의 2건 생성: `POST /contacts` (companyName=testFolderName, source='webhard', inquiryType='laser_cutting', status='cutting', processStage='laser')
   - 각 문의의 id를 저장

2. **업체 연결** (serial test 2):
   - 기존 업체 목록에서 첫 번째 업체 사용 (`GET /companies/names`)
   - `PATCH /companies/laser-only-mappings/{id}/link` (companyId=targetCompany.id) 호출
   - 응답에서 `updated_contact_count` 확인: testFolderName !== targetCompany.company_name이면 2, 같으면 0

3. **문의 companyName 변경 확인** (serial test 3):
   - `GET /contacts/{contactId}` 로 각 문의 조회
   - `company_name` 필드가 `targetCompany.company_name`으로 변경되었는지 확인
   - (단, testFolderName과 company_name이 원래 같았다면 이 검증은 스킵)

4. **업체 대시보드에서 문의 조회** (serial test 4):
   - `GET /contacts/by-company?companyName={targetCompany.company_name}` 호출
   - 응답에 변경된 문의 2건이 포함되어 있는지 확인 (id로 매칭)

5. **Cleanup** (serial test 5):
   - 생성한 문의 2건 삭제: `DELETE /contacts/{id}` (permanent=true)
   - 매핑 삭제: `DELETE /companies/laser-only-mappings/{id}`

**참고 패턴:** 기존 "7. 전체 흐름" 섹션의 serial test 패턴을 따르라. `test.use({ storageState: authFile })`, API key 사용, test.skip 조건 등 동일.

### 2. `e2e/laser-only-company.spec.ts` — 백업 설정 페이지 접근 E2E 추가

**섹션 9: 백업 설정 페이지 로드 검증**

```typescript
// ============================================================
// 9. 백업 설정 — 프록시 API를 통한 데이터 로드
// ============================================================
test.describe('백업 설정 — 데이터 로드', () => {
  // ...
});
```

**테스트 케이스:**

1. `'웹하드 관리 페이지에서 백업 설정 섹션이 표시된다'`:
   - `/admin/integration/webhard` 이동
   - `h2` 태그에 "백업 설정" 텍스트 존재 확인
   - 로딩 상태("설정을 불러오는 중...")가 사라지고 실제 UI(토글 또는 폼)가 표시되는지 확인 (timeout 15초)

2. `'백업 현황 섹션에 데이터가 표시된다'`:
   - `/admin/integration/webhard` 이동
   - `h2` 태그에 "백업 현황" 텍스트 존재 확인
   - "현황을 불러오는 중..." 텍스트가 사라지는지 확인 (데이터 로드 성공 의미)
   - "현황 조회에 실패했습니다." 텍스트가 표시되지 않는지 확인 (에러 없음)

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit
```

E2E 테스트 자체의 실행은 AC에 포함하지 않는다 (개발 서버가 필요하므로). 빌드와 타입 체크만 통과하면 된다.

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/10-company-link-fix/index.json`의 phase 4 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 기존 E2E 테스트(섹션 1~7)를 수정하지 마라. 새로운 섹션만 추가한다.
- 모든 테스트 데이터는 cleanup에서 반드시 삭제하라. 테스트 간 격리를 유지한다.
- `test.skip(true, ...)` 패턴을 사용하여 API 키 없는 환경에서 graceful하게 스킵하라.
- Playwright의 `import { test, expect } from '@playwright/test'`는 파일 상단에 이미 있으므로 중복 import하지 마라.
- serial 테스트에서 이전 단계 실패 시 `test.skip`으로 다음 단계를 건너뛰라. 기존 패턴(`if (!contactId) { test.skip(true, '이전 단계 실패'); return; }`) 참고.
