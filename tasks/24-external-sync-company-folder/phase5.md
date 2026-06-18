# Phase 5: docs 동기화 + E2E + 최종 회귀

## 사전 준비

- `docs/specs/features/external-sync-company-folder.md` (Phase 0 신규) — 본 phase 는 이 spec 의 모든 §이 실제 구현과 일치하는지 역방향 검증한다.
- `docs/specs/api/endpoints/integration.md` (Phase 0 §확장) — companyName 정규화 §의 3단계 매칭 정의가 실제 `auto-contact.service.ts` 와 일치하는지.
- `docs/specs/db/prisma-tables.md` (Phase 0 갱신) — `companies` 보정 + `company_folder_aliases` §이 schema.prisma 와 일치하는지.
- `docs/specs/features/contact-webhard-folder.md` (Phase 0 §추가) — 외부 동기화 통합 §이 실제 동작과 일치.
- `docs/specs/api/nestjs-endpoints.md` — Phase 3 endpoint 4개가 endpoint index 에 추가되었는지.
- `docs/changelog/CHANGELOG.md` — task 24 항목 추가 위치.
- `docs/features-list.md` (있으면) — 외부 동기화 통합 상태 갱신.
- `tasks/24-external-sync-company-folder/docs-diff.md` (Phase 0 후 자동 생성) — 본 phase 는 이 diff 가 코드와 정합인지 검증.
- `tasks/24-external-sync-company-folder/phase1~4.md` 산출물 (모든 코드 변경) — 정합 검증 대상:
  - `webhard-api/prisma/schema.prisma` (CompanyFolderAlias 모델, Company.folderAliases relation)
  - `webhard-api/prisma/migrations/{timestamp}_add_company_folder_alias/`
  - `webhard-api/src/integration/orders/auto-contact.service.ts` (matchCompanyInfo 4단계)
  - `webhard-api/src/contacts/contact-folder-sync.service.ts` (relocateAfterAliasApproved)
  - `webhard-api/src/companies/folder-alias.service.ts` (신규)
  - `webhard-api/src/companies/companies.controller.ts` (endpoint 4개 추가)
  - `webhard-api/src/companies/companies.module.ts` (provider 등록)
  - `webhard-api/src/companies/dto/folder-alias.dto.ts` (신규)
  - `webhard-api/src/contacts/contacts.module.ts` (export 추가)
  - `src/app/(admin)/admin/integration/folder-aliases/page.tsx` (신규)
  - `src/app/(admin)/admin/integration/folder-aliases/_components/PendingAliasesPanel.tsx`
  - `src/app/(admin)/admin/integration/folder-aliases/_components/RegisteredAliasesPanel.tsx`
  - `src/lib/react-query/queryKeys.ts` (folderAliases namespace)
  - `src/app/(admin)/admin/integration/_components/IntegrationNav.tsx` (탭 추가)
  - 추가/수정된 모든 spec 파일
- `webhard-api/test/` — 기존 e2e-spec 패턴 (테스트 환경 셋업, DB seed/teardown 방식).

## 작업 내용

### 1. 코드 ↔ spec 정합 검증 + 미세 조정

각 spec 파일의 §이 실제 구현과 일치하는지 점검. 불일치 항목(파일 경로 오타, 시그니처 변경, prop 이름 오차) 발견 시 **spec 을 코드 기준으로 수정** 한다 (코드는 phase 1~4 에서 이미 결정됨, 본 phase 는 docs 만).

검증 체크리스트:

- **`external-sync-company-folder.md` §"매칭 강화 (3단계)"**: `auto-contact.service.ts matchCompanyInfo` 의 0차/1차/2차/3차 분기와 일치. 분기 조건·반환 타입·trim 처리·에러 처리가 spec 과 코드 양쪽에서 같은가.
- **§"DB 모델 — `CompanyFolderAlias`"**: `schema.prisma` 의 모델 시그니처 (필드 7개 + relation + unique + index 2개 + @@map) 와 일치.
- **§"API 엔드포인트"**: `companies.controller.ts` 의 실제 method/path/DTO/auth 와 일치.
- **§"admin 승인" cascadeBackfill 흐름**: `folder-alias.service.ts approve()` 의 트랜잭션 흐름 (다른 pending → rejected → 본 alias → approved → optional backfill) 과 일치. 멱등 처리(`alias.status === 'approved'` 시 NoOp) 도 spec 에 명시되었는지.
- **§"불변 규칙 #1"**: `contact-folder-sync.service.ts` 가 새 hook (`relocateAfterAliasApproved`) 을 단일 진입점 내부에 추가했는지. 외부에서 ensureInquiryFolder 직접 호출 추가 여부를 grep 으로 재확인:

```bash
grep -rn "ensureInquiryFolder\|relocateContactFiles\|renameInquiryFolderForContact" webhard-api/src --include="*.ts" | grep -v "contact-folder-sync.service" | grep -v "folders.service" | grep -v "_lib" | grep -v ".spec."
```

결과가 비어있어야 한다 (또는 기존부터 허용된 호출처만). 새 호출처가 발견되면 phase 2/3 의 변경이 잘못된 것이므로 본 phase 에서는 spec 만 수정하지 말고 phase 2/3 status 를 `"error"` 로 마킹하여 문제를 표면화.

- **§"불변 규칙 #6"**: 3차 upsert 의 `update: {}` 가 코드에 그대로 존재하는지 grep:

```bash
grep -n "update: {}" webhard-api/src/integration/orders/auto-contact.service.ts
```

- **`integration.md` §companyName 정규화**: 4단계(0/1/2/3차) 정의가 코드와 일치.
- **`nestjs-endpoints.md` (또는 endpoints/integration.md)**: 신규 endpoint 4개가 index 에 등록.

### 2. `docs/specs/features/contact-webhard-folder.md` 참조 갱신 확인

Phase 0 에서 추가된 §"외부 동기화 → 가입 업체 폴더 통합 (task 24)" 라인이 실제 spec 에 존재하는지 확인. 없으면 추가.

### 3. `docs/changelog/CHANGELOG.md` 엔트리 추가

`[Unreleased]` 섹션 (없으면 생성) 의 가장 위(최근 날짜 상단) 에 task 24 항목 추가:

```markdown
## [Unreleased]

### 2026-04-27 — external-sync-company-folder (task 24)

- **변경**: 외부웹하드 동기화 파일을 가입 업체 매칭 시 `{업체}/문의/{패키지명-문의번호}/` 로 직접 통합. 기존 `외부웹하드/{원본업체}/...` 누적 분리 해소.
- **신규 매칭 단계**: `matchCompanyInfo` 가 0차 `CompanyFolderAlias status='approved'` 를 우선 매칭. 1차/2차는 task 23 의 2단계 매칭(insensitive equals + isApproved 우선) 그대로. 3차에서 정규화 매칭 후보를 모두 `pending` 으로 자동 등록 (admin 승인 큐). pending alias 의 status 는 후속 동기화에서 변경되지 않음 (`update: {}`).
- **신규 모델**: `CompanyFolderAlias` (`folder_name`, `company_id`, `status: pending|approved|rejected`, `approved_by`, `approved_at`). unique [folder_name, company_id]. onDelete: Cascade.
- **신규 API**: `GET/POST/PATCH/DELETE /api/v1/companies/folder-aliases` (AdminAuthGuard). 승인 시 `cascadeBackfill?: boolean` — true 면 해당 folder_name 의 외부 미통합 Contact 일괄 통합. 승인 자체는 멱등 (이미 approved 면 NoOp).
- **신규 admin UI**: `/admin/integration/folder-aliases` — PendingAliasesPanel (승인/거절 + cascadeBackfill 토글) + RegisteredAliasesPanel (등록된 alias + 삭제). `IntegrationNav` 탭 1개 추가.
- **신규 hook**: `ContactFolderSyncService.relocateAfterAliasApproved(folderName, companyId, client?)` — 외부 미통합 Contact 일괄 통합. 단일 진입점 정책 유지 (외부에서 ensureInquiryFolder 직접 호출 금지).
- **불변 규칙**: 정규화 매칭 후보가 있어도 admin 승인 전까지 폴더명 원본 fallback 동작 유지 (Q3 일관성). admin 의 reject 결정을 다음 동기화가 무효화하지 않도록 upsert 시 `update: {}` 로 status 보존.
- **영향 파일**: `webhard-api/prisma/schema.prisma`, `webhard-api/src/integration/orders/auto-contact.service.ts`, `webhard-api/src/contacts/contact-folder-sync.service.ts`, `webhard-api/src/companies/folder-alias.service.ts` (신규), `webhard-api/src/companies/companies.controller.ts`, `webhard-api/src/companies/companies.module.ts`, `webhard-api/src/companies/dto/folder-alias.dto.ts` (신규), `src/app/(admin)/admin/integration/folder-aliases/page.tsx` (신규), `src/lib/react-query/queryKeys.ts`, `src/app/(admin)/admin/integration/_components/IntegrationNav.tsx` 외 다수.
- **검증**: A1~A7 (matchCompanyInfo 3단계), B1~B8 (folder-alias.service), C1~C3 (relocateAfterAliasApproved), D1~D2 (admin UI), E2E 시나리오 1개 (외부 동기화 → admin 승인 → 폴더 통합).
```

기존 CHANGELOG 엔트리 포맷 (최근 task 23 / classify-cta 등) 그대로 따른다. 날짜 형식 `2026-04-27` 고정.

### 4. `docs/features-list.md` 갱신

(파일이 있으면) 외부 동기화 / 폴더 정책 행에 "task 24 외부 동기화 → 가입 업체 폴더 통합 완료 (2026-04-27)" 한 줄 추가. 없으면 skip.

### 5. E2E 시나리오 — `webhard-api/test/external-sync-alias.e2e-spec.ts` 신규

NestJS supertest + 실 DB 연결. 기존 `webhard-api/test/*.e2e-spec.ts` 파일 1개를 레퍼런스로 참고하여 동일한 TestingModule + bootstrap + DB seed/cleanup 패턴을 따른다.

```ts
describe('External sync alias workflow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiKey: string; // 외부 동기화용 X-API-Key
  let adminCookie: string; // admin 세션 쿠키

  beforeAll(async () => {
    /* TestingModule.compile + app.init() + DB seed (Company 1개, ApiKey 1개, admin 세션) */
  });

  afterAll(async () => {
    /* DB cleanup + app.close() */
  });

  it('가입 업체 정규화 매칭 → admin 승인 (cascadeBackfill=true) → 폴더 통합', async () => {
    // 1. seed: Company { id: X, companyName: '대성목형(주)', isApproved: true }
    //
    // 2. POST /api/v1/files/batch-confirm (X-API-Key) — 외부 폴더명 '대성목형' + 파일 1개
    //    folderPath 가 외부웹하드 → '대성목형' (정규화 매칭으로 후보)
    //    → assert:
    //       - Contact 생성 (companyName='대성목형' 폴더명 원본)
    //       - CompanyFolderAlias status='pending' 1개 등록 (folderName='대성목형', companyId=X)
    //       - 파일 위치는 외부웹하드 원본 폴더 (companyId 미통합)
    //
    // 3. POST /api/v1/companies/folder-aliases/{aliasId}/approve (admin 세션 쿠키) body { cascadeBackfill: true }
    //    → assert:
    //       - alias status='approved', approvedBy 채워짐
    //       - response.backfill = { relocated: 1, skipped: 0 } (분류된 Contact 1건 통합 가정)
    //
    // 4. GET /api/v1/contacts/{contactId} (admin 또는 적절한 인증)
    //    → assert:
    //       - Contact.companyName = '대성목형(주)' (정규형으로 변경)
    //       - Contact.companyId = X
    //
    // 5. WebhardFolder 검증
    //    → assert: 해당 contactId 의 inquiry 폴더가 Company X 의 루트 하위에 위치 (외부웹하드 루트 아님)
  });

  it('admin 이 거절한 폴더는 다음 동기화에서 다시 pending 으로 살아나지 않는다', async () => {
    // 1. seed: CompanyFolderAlias { folderName='abc', companyId=X, status='rejected' }
    // 2. POST /api/v1/files/batch-confirm — 동일 폴더명 'abc' 재호출
    //    matchCompanyInfo 3차에서 upsert 의 update: {} 동작 검증
    // 3. → assert: alias status='rejected' 유지 (status 변경 없음)
  });

  it('알리아스 미승인 상태에서 매칭 실패 fallback 동작', async () => {
    // 1. seed: Company { companyName='ABC주식회사' } + alias 없음
    // 2. POST /api/v1/files/batch-confirm — 외부 폴더명 'ABC회사' (정규화 매칭으로 후보 1개)
    //    → assert:
    //       - Contact 생성 (companyName='ABC회사' 폴더명 원본 trim)
    //       - alias status='pending' 자동 등록
    //       - 파일은 외부웹하드 원본 폴더에 위치 (admin 승인 전이므로 통합 안 됨)
  });
});
```

E2E 환경 변수 (`DATABASE_URL` 등) 가 셋업되지 않은 환경에서도 본 테스트 파일이 컴파일 가능해야 하며 (`pnpm build` 통과), 실제 실행은 CI 또는 로컬 테스트 DB 가 있을 때만.

### 6. 통합 회귀 검증

다음 커맨드를 단일 메시지에 Bash 병렬로 발사:

```bash
pnpm build
```

```bash
npx tsc --noEmit
```

```bash
pnpm test
```

```bash
cd webhard-api && pnpm build
```

```bash
cd webhard-api && pnpm test
```

E2E 별도 (환경 의존):

```bash
cd webhard-api && pnpm test:e2e -- --testPathPattern=external-sync-alias
```

(`pnpm test:e2e` 스크립트가 없으면 `npx jest --config test/jest-e2e.json --testPathPattern=external-sync-alias` 등 본 프로젝트의 e2e 실행 명령으로 대체.)

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test && cd webhard-api && pnpm build && pnpm test
```

위 통합 검증이 모두 통과해야 한다 (단일 메시지 Bash 병렬 발사 권장). E2E 는 환경 의존이므로 별도 커맨드:

```bash
cd webhard-api && pnpm test:e2e -- --testPathPattern=external-sync-alias
```

## AC 검증 방법

위 AC 커맨드를 단일 메시지에 Bash 병렬로 발사하라. 통합 회귀가 통과하면 `tasks/24-external-sync-company-folder/index.json` 의 phase 5 status 를 `"completed"` 로 변경하고, runner 가 `tasks/index.json` 의 task 24 status 를 `"completed"` 로 자동 변경하도록 둔다.

E2E 환경 의존 실패는 `error_message` 에 "E2E 환경 미셋업, 본 phase 외 무관" 명시 후 phase 5 completed 마킹 가능 (단, unit + 통합 빌드/타입체크/테스트는 반드시 통과). 수정 3회 이상 시도해도 통합 회귀가 실패하면 phase 5 status 를 `"error"` 로 변경하고 에러 내용을 `"error_message"` 필드로 기록하라.

## 주의사항

- **코드 수정 금지**: 본 phase 는 docs 동기화 + E2E spec 추가 전용. `src/`, `webhard-api/src/` 의 비테스트 코드는 수정하지 마라. spec 과 코드의 실제 동작이 다를 때는 spec 을 코드 기준으로 맞추는 방향으로 docs 만 수정.
- **CHANGELOG 순서**: `[Unreleased]` 블록의 가장 위(가장 최근 날짜) 에 task 24 추가. 기존 엔트리 순서 보존.
- **task 23 회귀 점검**: N1~N4 가 깨지면 phase 2 의 분기 잘못. 본 phase 에서 직접 수정하지 말고 phase 2 의 status 를 `"error"` 로 마킹하여 문제를 표면화.
- **불변 규칙 grep**: `ensureInquiryFolder` / `relocateContactFiles` 직접 호출이 service 외부에 새로 추가되지 않았는지 위 §1 의 grep 으로 마지막 확인. 새 호출처 발견 시 phase 2/3 error.
- **task-level 완료 처리**: `tasks/index.json` 의 task 24 `completed_at` 은 runner 가 자동 기록. 수동 기록 금지.
- **features-list.md 가 없으면 skip**.
- **E2E spec 컴파일 가능성**: E2E 환경 변수가 없어도 `pnpm build` 와 `npx tsc --noEmit` 은 통과해야 한다 — 즉 E2E spec 파일 자체는 타입 체크에서 깨지지 않게.
- **E2E 시나리오 위치**: `webhard-api/test/` 디렉토리. `webhard-api/src/__tests__/` 와 별개. jest config 가 두 디렉토리를 어떻게 분리하는지 기존 패턴 확인.
