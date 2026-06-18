# Phase 0: docs-update

## 사전 준비

먼저 아래 문서들을 반드시 읽고 task 24 의 정책 의도와 기존 아키텍처를 완전히 이해하라:

- `docs/specs/features/contact-webhard-folder.md` — 단일 진입점 정책(`ContactFolderSyncService`). task 24 는 이 위에 외부 동기화 → 가입 업체 통합 정책을 추가한다. 불변 규칙(§"불변 규칙" 1번 "단일 진입점") 을 절대 깨면 안 된다. 새 hook 메서드만 추가하고 외부에서 직접 `ensureInquiryFolder` 호출은 금지.
- `docs/specs/api/endpoints/integration.md` §Auto Contact §companyName 정규화 (line 1386-1396) — 기존 2단계 매칭(task 23, 2026-04-27 hotfix). task 24 는 이를 3단계로 확장하면서 0차 alias 우선 매칭을 도입.
- `docs/specs/db/prisma-tables.md` — 기존 companies 테이블 정의는 실제 schema 와 차이가 있다(`isApproved`, `username`, `passwordHash`, `businessRegistrationNumber`, `approvedAt`, `approvedBy`, `status`, `webhardAccess`, `laserOnly` 등 누락). 본 phase 에서 보정. CompanyFolderAlias 신규 §추가.
- `docs/specs/features/webhard-system.md` — 외부 동기화 폴더 구조 / 업체 폴더 구조 개요. task 24 의 통합 정책이 어디 위치하는지 한 줄 추가.
- `docs/changelog/CHANGELOG.md` 의 task 23 (2026-04-24, 2026-04-27 hotfix) 항목 — task 24 가 이어지는 맥락 파악.
- `webhard-api/src/folders/_lib/company-name-match.util.ts` — `normalizeCompanyName(name)` 정규화 알고리즘(NFKC + 공백·특수문자 제거 + 소문자화, task 21 도입). Phase 2 매칭 3차 단계에서 그대로 재사용한다는 점을 spec 에 박아둘 것.
- `webhard-api/src/integration/orders/auto-contact.service.ts` `matchCompanyInfo` 위치 (line 156-186, task 23 hotfix). spec 에 새 매칭 흐름을 명시.
- `webhard-api/src/contacts/contact-folder-sync.service.ts` `onContactCreated`, `onInquiryTypeClassified`, `onProcessStageChanged` — 단일 진입점 hook. Phase 2 에서 `relocateAfterAliasApproved` 메서드를 이 서비스 내부에 추가할 위치.
- `webhard-api/prisma/schema.prisma` `Company` (line 11-66), `LaserOnlyMapping` (line 951-963) 모델 — Phase 1 의 `CompanyFolderAlias` 모델 패턴 (relation, unique, index, @@map) 의 레퍼런스.

## 작업 내용

본 phase 는 **문서 작성·갱신만** 수행한다. 코드 변경 없음.

### 1. `docs/specs/features/external-sync-company-folder.md` 신규 작성 (task 24 메인 spec)

다음 섹션 구조로 작성하라. 후속 phase 들이 이 spec 을 기준으로 구현한다.

- **§ 개요·배경**: 외부웹하드 동기화 파일이 자체웹하드의 `외부웹하드/{원본업체}/...` 에 별도 누적되어 가입 업체 대시보드 (`/company/dashboard`) 와 분리되던 문제. 가입 업체 매칭 성공 시 `{업체}/문의/{패키지명-문의번호}/` 로 직접 통합하여 운영자 단일 폴더 트리에서 외부 동기화·자체 등록·수기 업로드가 모두 한 곳에 모이도록 한다.
- **§ 정책 — 트리거 범위**: `Company` 매칭 성공한 모든 가입 업체. `isApproved` 무관 (task 23 hotfix 와 동일).
- **§ 정책 — 매칭 강화 (3단계)**:
  1. `CompanyFolderAlias status='approved'` folderName 일치 → 즉시 매칭 + 정규형 companyName 사용.
  2. `Company.companyName` insensitive equals (task 23 의 2단계 매칭 그대로 — `isApproved=true` 우선, fallback 으로 `isApproved` 무관).
  3. `normalizeCompanyName` 정규화 후보 → 1개 이상이면 모두 `CompanyFolderAlias status='pending'` 으로 upsert(admin 승인 큐 진입). 본 단계에서는 매칭 결과를 적용하지 않고 폴더명 원본 fallback.
- **§ 정책 — admin 승인**:
  - 승인은 `POST /api/v1/companies/folder-aliases/:id/approve { cascadeBackfill?: boolean }` 로 수행.
  - 승인 시 동일 folderName 의 다른 pending → 자동 `rejected`.
  - `cascadeBackfill: true` 옵션은 해당 folderName 의 외부 동기화 미통합 Contact 를 즉시 일괄 통합 (`ContactFolderSyncService.relocateAfterAliasApproved` 호출). 기본값 `false` (Q3 일관성).
- **§ 정책 — 폴더 위치**: 기존 `{업체}/문의/{패키지명-문의번호}/` 재사용. 별도 `외부동기화/` 하위 분리 없음 (task 23 spec 과 정합).
- **§ 정책 — 미분류·미승인 처리**:
  - `inquiryType=null` Contact: `onContactCreated` 가 no-op (현행 유지) → 외부웹하드 원본 폴더에 그대로. 분류 확정 시 `onInquiryTypeClassified` 가 자동 이동.
  - admin 미승인 alias: 매칭 결과를 적용하지 않고 폴더명 원본 fallback → 외부웹하드 원본 폴더 유지. 승인 후 신규 동기화부터 자동 통합 (cascadeBackfill 미사용 시).
- **§ DB 모델 — `CompanyFolderAlias`** (Phase 1):
  - `id` (PK, auto), `folderName`, `companyId` (FK, onDelete: Cascade), `status` (`pending`/`approved`/`rejected`, default `pending`), `approvedBy?`, `approvedAt?`, `createdAt`, `updatedAt`.
  - Unique: `(folderName, companyId)`. Index: `folderName`, `status`. `@@map("company_folder_aliases")`.
- **§ API 엔드포인트** (Phase 3, 모두 `AdminAuthGuard`):
  - `GET /api/v1/companies/folder-aliases?status=pending|approved|rejected&page=&pageSize=`
  - `POST /api/v1/companies/folder-aliases/:id/approve` body `{ cascadeBackfill?: boolean }`
  - `PATCH /api/v1/companies/folder-aliases/:id/reject`
  - `DELETE /api/v1/companies/folder-aliases/:id`
- **§ Frontend** (Phase 4): `/admin/integration/folder-aliases` 신규 페이지. `PendingAliasesPanel` (미승인 후보 + 승인/거절 + cascadeBackfill 토글) + `RegisteredAliasesPanel` (등록된 alias + 삭제). `IntegrationNav` 탭 1개 추가.
- **§ 불변 규칙**:
  1. `ContactFolderSyncService` 외부에서 `ensureInquiryFolder`/`renameInquiryFolderForContact`/`relocateContactFiles` 직접 호출 금지. `relocateAfterAliasApproved` 도 이 서비스 내부에 추가한다.
  2. `matchCompanyInfo` 의 1차/2차 단계는 task 23 의 2단계 매칭 동작을 그대로 보존. 0차 alias 우선 + 3차 pending 자동 등록만 신규.
  3. 정규화 매칭 후보가 0개일 때는 alias 자동 등록도 하지 않고 폴더명 원본 fallback (현재 동작).
  4. 매칭 실패 fallback 동작은 기존 `dto.companyName.trim()` 그대로.
  5. 외부 미통합 Contact 의 backfill 은 `cascadeBackfill=true` 명시 시에만 수행. 자동 backfill 금지.
  6. 정규화 매칭 후보를 `pending` 으로 upsert 시 기존 row 의 status (`pending`/`approved`/`rejected`) 를 변경하지 않는다 (`update: {}`). admin 의 reject 결정을 무효화하지 않기 위함.
- **§ 테스트 케이스 list** (각 phase 에서 구현):
  - Phase 2: A1~A7 (matchCompanyInfo 3단계), C1~C3 (relocateAfterAliasApproved)
  - Phase 3: B1~B7 (folder-alias.service)
  - Phase 4: D1~D2 (PendingAliasesPanel, RegisteredAliasesPanel) — 선택
  - Phase 5: E2E 시나리오 1개 (외부 동기화 → admin 승인 → 폴더 통합) + reject 멱등성
- **§ 변경 이력**: 2026-04-27 — task 24 신규.
- **§ 참조**: 본 spec 끝에 관련 코드 경로 list (`auto-contact.service.ts`, `contact-folder-sync.service.ts`, `company-name-match.util.ts`, `companies.controller.ts`, `folder-alias.service.ts`).

### 2. `docs/specs/features/contact-webhard-folder.md` §추가

§"폴더 생성 시점" 표 아래 또는 §"불변 규칙" 위에 다음 §추가:

```markdown
## 외부 동기화 → 가입 업체 폴더 통합 (task 24)

외부웹하드 동기화 시 폴더명 ↔ 가입 업체 매칭이 성공하면 (`Company` insensitive equals 또는 admin 승인된 `CompanyFolderAlias`), 파일은 외부웹하드 원본 폴더가 아니라 매칭된 업체의 `{업체}/문의/{패키지명-문의번호}/` 로 직접 통합된다. 정규화 매칭 후보가 있어도 admin 승인 전까지는 폴더명 원본 fallback 으로 외부웹하드 원본 폴더에 그대로 남는다.

상세 정책: `docs/specs/features/external-sync-company-folder.md`.
```

### 3. `docs/specs/api/endpoints/integration.md` §확장

기존 §companyName 정규화 정책 (line 1386-1396) 끝에 다음을 추가:

```markdown
**`matchCompanyInfo` 3단계 매칭 (task 24, 2026-04-27)**

1. 0차: `CompanyFolderAlias status='approved'` folderName 일치 → companyId.
2. 1차/2차: `Company.companyName` insensitive equals (task 23 의 2단계 — `isApproved=true` 우선, fallback `isApproved` 무관).
3. 3차: `normalizeCompanyName` 정규화 후보 1개 이상 → 모두 `CompanyFolderAlias status='pending'` upsert (멱등 — 기존 row status 보존). 본 단계에서는 매칭 결과 미적용, 폴더명 원본 fallback.

3차의 pending alias 는 admin 이 `POST /api/v1/companies/folder-aliases/:id/approve` 로 승인할 때까지 매칭에 사용되지 않는다. 관련 신규 endpoint: `GET/POST/PATCH/DELETE /api/v1/companies/folder-aliases` (Phase 3, AdminAuthGuard).
```

### 4. `docs/specs/db/prisma-tables.md` 보정·신설

- `companies` 테이블의 spec drift 보정: 실제 schema.prisma (line 11-66) 와 일치하도록 칼럼 list 갱신. `isApproved Boolean`, `username String?`, `passwordHash String?`, `businessRegistrationNumber String?`, `approvedAt DateTime?`, `approvedBy String?`, `status String?`, `webhardAccess Boolean`, `laserOnly Boolean` 등 추가. 기존 `id`, `companyName`, `managerName`, `createdAt`, `updatedAt` 외에 누락된 모든 칼럼 보강.
- 새 §추가:

```markdown
### `company_folder_aliases`

외부웹하드 폴더명 ↔ 가입 업체 매핑 (task 24).

| Column      | Type                  | Notes                                               |
| ----------- | --------------------- | --------------------------------------------------- |
| id          | Int (PK, auto)        |                                                     |
| folder_name | String                | 외부웹하드 원본 폴더명                              |
| company_id  | Int (FK companies.id) | onDelete: Cascade                                   |
| status      | String                | `pending` / `approved` / `rejected`. 기본 `pending` |
| approved_by | String?               | admin 사용자명                                      |
| approved_at | DateTime?             |                                                     |
| created_at  | DateTime              |                                                     |
| updated_at  | DateTime              |                                                     |

Unique: `(folder_name, company_id)`. Index: `folder_name`, `status`.
```

### 5. `docs/specs/features/webhard-system.md` 한 줄 추가 (선택)

외부 동기화 §에 다음 한 줄을 추가하라:

> task 24 이후 가입 업체 매칭 성공 시 외부웹하드 원본 폴더가 아니라 `{업체}/문의/...` 로 직접 통합. 상세는 `external-sync-company-folder.md` 참조.

해당 §이 없으면 skip.

### 6. docs-diff 생성은 runner 가 담당

Phase 0 는 문서 업데이트만 수행한다. `tasks/24-external-sync-company-folder/docs-diff.md` 는 `scripts/run-phases.py` 가 Phase 0 완료 직후 `scripts/gen-docs-diff.py` 를 호출해 자동 생성하므로 **직접 작성하지 않는다**.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit
```

문서만 수정되므로 빌드·타입체크가 통과하면 OK. 테스트는 Phase 0 에서 실행하지 않는다.

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `tasks/24-external-sync-company-folder/index.json` 의 phase 0 status 를 `"completed"` 로 변경하라. 수정 3회 이상 시도해도 실패하면 status 를 `"error"` 로 변경하고 에러 내용을 `"error_message"` 필드로 기록하라.

## 주의사항

- **코드 수정 금지**: 본 phase 는 docs 전용. `webhard-api/src/`, `src/` 코드는 수정하지 마라. 모든 코드 변경은 Phase 1~4.
- **불변 규칙 박아넣기**: 단일 진입점(`ContactFolderSyncService`) 정책을 깨는 변경을 spec 에 적지 말 것. 새 hook 메서드(`relocateAfterAliasApproved`) 가 같은 서비스 내에 추가된다는 점을 명시.
- **task 23 의 2단계 매칭 보존**: 1차/2차 단계는 task 23 hotfix 와 동일 동작이라는 점을 spec 에 명확히 적을 것. 본 task 가 task 23 매칭을 변경한다고 오해되지 않도록.
- **fallback 동작 보존**: 매칭 실패 시 `dto.companyName.trim()` 폴더명 원본 사용 (task 23 와 동일). 정규화 매칭 후보가 있어도 pending 단계에서는 적용하지 않는다는 점을 굵게 강조.
- **`prisma-tables.md` 다른 모델 정의 보존**: `companies` 보정 + `CompanyFolderAlias` 신설만 수행. 다른 모델의 칼럼 정의는 손대지 마라.
- **CHANGELOG 미작성**: 본 phase 는 spec 까지만. CHANGELOG 엔트리는 phase 5 에서 작성한다.
