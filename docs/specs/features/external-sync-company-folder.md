# 외부웹하드 동기화 → 가입 업체 폴더 통합 정책 (task 24)

> **task 26 보강 (2026-04-29)**: 본 task 의 contact 단위 통합 (`relocateAfterAliasApproved`) 위에
> 폴더 트리 자체를 통째 이전 (`migrateExternalFolderTreeToCompany`) + cascade soft delete +
> 신규 동기화 routing 이 추가되었다. 자세한 정책은
> [external-folder-migration.md](./external-folder-migration.md) 참고.

## 개요·배경

외부웹하드(LGU+) 자동 동기화로 들어오는 파일은 자체웹하드의 `외부웹하드/{원본업체}/...` 트리에 누적된다. task 23 이후 `AutoContactService.matchCompanyInfo` 가 `companyName` 매칭 성공 시 정규형 업체명을 `Contact.companyName` 에 저장해 업체 대시보드 (`/company/orders`) 노출 문제는 해소되었지만, 폴더 자체는 여전히 `외부웹하드/...` 하위에 머물러 있어 운영자 입장에서 "외부 동기화 파일은 외부웹하드 트리, 자체 등록·수기 업로드는 업체 트리" 라는 이중 폴더 트리를 유지해야 했다.

본 task 는 `Company` 매칭이 성공한 모든 가입 업체에 대해 외부 동기화 파일을 **즉시 매칭된 업체의 `{업체}/문의/{패키지명-문의번호}/` 로 통합**하여 운영자가 단일 폴더 트리에서 외부 동기화·자체 등록·수기 업로드를 모두 한 곳에서 다루도록 한다. 폴더명 ↔ 업체 매칭은 task 23 의 2단계 매칭 (insensitive equals) 위에 0차 alias 우선 매칭 + 3차 정규화 후보 자동 등록을 더해 3단계로 강화한다.

## 정책 — 트리거 범위

- 대상: `Company` 매칭이 성공하는 모든 가입 업체. `isApproved` 무관 (task 23 hotfix 와 동일한 fallback 정책 유지).
- 진입점: 기존 `AutoContactService.detectAndCreate` → `createNewContact` 흐름. 본 task 는 `matchCompanyInfo` 강화와 `ContactFolderSyncService.relocateAfterAliasApproved` 추가만 도입하고 외부 호출처는 늘리지 않는다.

## 정책 — 매칭 강화 (3단계)

`matchCompanyInfo(companyName)` 의 매칭 흐름은 다음 3단계로 확장된다 (위에서 아래로 시도, 첫 단계에서 매칭되면 즉시 종료).

1. **0차 — alias 우선 매칭**: `CompanyFolderAlias.status='approved'` 중 `folderName` 이 일치하는 row 가 있으면 연결된 `companyId` 의 Company 를 즉시 반환. 매칭 결과로 `Contact.companyName` 은 정규형 (`Company.companyName`) 사용.
2. **1차/2차 — Company.companyName insensitive equals (task 23 의 2단계 매칭 그대로 보존)**:
   - 1차: `isApproved=true` + `companyName` insensitive equals
   - 1차 fail 시 2차: `isApproved` 무관 + `companyName` insensitive equals
   - 미승인 업체도 가입돼 있으면 정규형 사용 → 사용자가 로그인 후 자기 회사 정규명으로 dashboard 매칭이 작동.
3. **3차 — 정규화 후보 자동 등록**: 1차/2차 모두 실패 시 `normalizeCompanyName(folderName)` (`webhard-api/src/folders/_lib/company-name-match.util.ts` — task 21 도입, NFKC + 영문 소문자화 + `[^a-z0-9가-힣]` 제거) 결과와 일치하는 모든 Company 를 후보로 모은다. 후보가 1개 이상이면 모두 `CompanyFolderAlias.status='pending'` 으로 upsert 하여 admin 승인 큐에 진입시킨다. **본 단계에서는 매칭 결과를 실제로 적용하지 않고 폴더명 원본 fallback 으로 동작** (현재 동작 보존). 후보가 0개이면 alias 등록도 skip.

3차의 pending alias 는 admin 이 `POST /api/v1/companies/folder-aliases/:id/approve` 로 승인할 때까지 매칭에 사용되지 않는다.

## 정책 — admin 승인

- 승인 endpoint: `POST /api/v1/companies/folder-aliases/:id/approve` (`AdminGuard`).
  - body: `{ cascadeBackfill?: boolean }` (default `false`).
- 승인 시 동일 `folderName` 의 다른 `pending` row 는 자동 `rejected` 로 전환 (한 폴더당 한 업체로 단일 매핑).
- 멱등 — 대상 alias 가 이미 `status='approved'` 면 트랜잭션 부작용 없이 `{ alias }` 만 반환 (다른 pending 의 reject 도, backfill 도 수행하지 않음).
- `cascadeBackfill: true` 옵션은 해당 `folderName` 으로 외부 동기화돼 미통합 상태로 남아있던 Contact 들을 즉시 일괄 통합 (`ContactFolderSyncService.relocateAfterAliasApproved` 호출). 기본값 `false` 인 이유는 일관성 (Q3) — 운영자가 의도적으로 backfill 을 요청한 경우에만 실행하고, 신규 동기화는 승인 즉시 자동 통합되므로 별도 옵션 없이 진행한다.
- 거절은 `PATCH /api/v1/companies/folder-aliases/:id/reject` 로 단순 status 전환 (비존재 id → `NotFoundException`).
- 삭제는 `DELETE /api/v1/companies/folder-aliases/:id` — 등록된 alias 를 운영자가 정리할 때 사용.

## 정책 — 폴더 위치

- 매칭 성공 시 폴더 경로: `{업체}/문의/{패키지명-문의번호}[_{workNumber}]/` 를 그대로 재사용 (task 23 의 `buildInquiryFolderName` 결과).
- 별도 `외부동기화/` 하위 분리 없음 (운영자 단일 트리 정책).
- 즉, 외부 동기화로 들어와 매칭에 성공한 Contact 는 자체 등록·수기 업로드 Contact 와 폴더 경로상 구분되지 않는다.

## 정책 — 미분류·미승인 처리

- **`inquiryType=null` Contact** (외부웹하드 자유 폴더 — 칼선의뢰/목형의뢰 세그먼트 미식별): `onContactCreated` 가 no-op 으로 동작 (현행 유지) → 파일은 외부웹하드 원본 폴더에 그대로 머문다. 분류가 확정되는 시점에 `onInquiryTypeClassified` 가 자동으로 폴더 생성·이동을 수행.
- **admin 미승인 alias**: 3차 단계에서 후보가 등록만 되고 매칭 결과는 적용되지 않는다 → 폴더명 원본 fallback (`dto.companyName.trim()`) 으로 외부웹하드 원본 폴더에 그대로. 이후 admin 이 승인하면 신규 동기화 호출부터 자동 통합된다 (cascadeBackfill 미사용 시 이미 누적된 Contact 는 그대로).

## DB 모델 — `CompanyFolderAlias` (Phase 1)

| 필드         | 타입                             | 비고                                                |
| ------------ | -------------------------------- | --------------------------------------------------- |
| `id`         | Int (PK, auto)                   |                                                     |
| `folderName` | String                           | 외부웹하드 원본 폴더명                              |
| `companyId`  | Int (FK → companies.id, Cascade) | 매핑 대상 가입 업체                                 |
| `status`     | String                           | `pending` / `approved` / `rejected`. 기본 `pending` |
| `approvedBy` | String?                          | admin 사용자명                                      |
| `approvedAt` | DateTime?                        |                                                     |
| `createdAt`  | DateTime                         |                                                     |
| `updatedAt`  | DateTime                         |                                                     |

- Unique: `(folderName, companyId)` — 동일 폴더 + 동일 업체 중복 방지.
- Index: `folderName`, `status` — 매칭 lookup 과 admin 큐 조회 모두 빠르게.
- `@@map("company_folder_aliases")`.
- Relation: `Company` ↔ `CompanyFolderAlias[]` (Cascade onDelete — 업체 삭제 시 alias 도 정리).

## API 엔드포인트 (Phase 3, 모두 `AdminGuard`)

- `GET /api/v1/companies/folder-aliases?status=pending|approved|rejected&page=&pageSize=`
  - 쿼리: `status` (선택, 미지정 시 전체), `page` (기본 1), `pageSize` (기본 50, `class-validator @IsInt @Min(1)`).
  - 응답: `{ items: AliasDto[], total, page, pageSize }`.
  - `AliasDto` = `{ id, folderName, company: { id, companyName, isApproved }, status, approvedBy?, approvedAt?, createdAt, updatedAt }`.
- `POST /api/v1/companies/folder-aliases/:id/approve`
  - body: `{ cascadeBackfill?: boolean }` (default `false`).
  - 동작: 대상 alias `status='approved'` + `approvedBy` / `approvedAt` 기록. 동일 `folderName` 의 다른 `pending` 자동 `rejected`. `cascadeBackfill` 시 `ContactFolderSyncService.relocateAfterAliasApproved(folderName, companyId, tx)` 호출 (트랜잭션 client 전달).
  - 응답: `{ alias, backfill? }` — `alias` 는 업데이트된 row, `backfill` 은 `cascadeBackfill=true` 일 때만 `{ relocated: number, skipped: number }` (false 면 `undefined`).
  - 멱등: 대상 alias 가 이미 `approved` 면 `{ alias }` 만 반환 (다른 pending reject 도, backfill 도 수행하지 않음).
  - `approvedBy` 는 `req.user.userId` 의 string 값. 세션이 없거나 `userId` 가 `undefined` 면 `'admin'` literal fallback.
- `PATCH /api/v1/companies/folder-aliases/:id/reject`
  - body 없음. `status='rejected'` 로 전환. 비존재 id → `NotFoundException`.
- `DELETE /api/v1/companies/folder-aliases/:id`
  - row 삭제 (soft delete 아님 — admin 의 의도적 정리). 응답: `{ ok: true }`.

## Frontend (Phase 4)

- 신규 페이지: `/admin/integration/folder-aliases` (route group `(admin)/admin/integration/folder-aliases/page.tsx`).
- `IntegrationNav` 에 "폴더 별칭" 탭 1개 추가 (`FolderSearch` lucide 아이콘).
- 두 패널로 구성:
  - **`PendingAliasesPanel`**: `status=pending` 후보 list. 각 행에 폴더명 + 매칭된 업체명 + "승인 / 거절" 버튼. 승인 시 `cascadeBackfill` 토글 (default off) 표시. 토글 켜고 승인하면 응답의 `backfill.relocated` / `backfill.skipped` 카운트가 toast 로 노출.
  - **`RegisteredAliasesPanel`**: `status=approved` row list. 각 행에 폴더명 + 업체명 + "삭제" 버튼.
- React Query namespace: `queryKeys.folderAliases` (`src/lib/react-query/queryKeys.ts`).

## 불변 규칙

1. **단일 진입점 (`ContactFolderSyncService`) 보존**: 외부에서 직접 `ensureInquiryFolder` / `renameInquiryFolderForContact` / `relocateContactFiles` 를 호출하지 않는다. 본 task 의 신규 backfill 로직은 `ContactFolderSyncService.relocateAfterAliasApproved` 메서드로 같은 서비스 내부에 추가되며, alias 승인 endpoint 는 이 서비스를 호출한다.
2. **task 23 의 2단계 매칭 동작 보존**: `matchCompanyInfo` 의 1차/2차 단계는 task 23 hotfix 동작을 그대로 보존한다. 본 task 가 새로 도입하는 것은 0차 alias 우선 매칭 + 3차 정규화 후보 자동 등록 두 가지 뿐이며, 1차/2차의 lookup 조건·우선순위·fallback 동작에는 변경이 없다.
3. **정규화 후보 0개일 때**: 3차 단계에서 정규화 매칭 후보가 0개이면 alias row 도 등록하지 않고 폴더명 원본 fallback 으로 진행 (현재 동작 그대로). 빈 후보 큐 진입 금지.
4. **매칭 실패 fallback 동작 보존**: 0차/1차/2차 모두 실패 + 3차에서 후보 등록만 되고 매칭은 미적용 — 이때 `Contact.companyName` 은 task 23 fallback 정책 그대로 `dto.companyName.trim()` 사용.
5. **자동 backfill 금지**: 외부 동기화 미통합 Contact (이미 외부웹하드 원본 폴더에 누적된 Contact) 의 backfill 은 admin 이 `cascadeBackfill=true` 를 명시적으로 지정한 경우에만 수행. alias 승인 자체로는 backfill 이 일어나지 않으며, 신규 동기화 호출부터 자동 통합이 시작된다.
6. **pending upsert 시 기존 status 보존**: 3차 단계에서 정규화 후보를 `pending` 으로 upsert 할 때, 기존 row 의 `status` (`pending` / `approved` / `rejected`) 는 변경하지 않는다 (Prisma `upsert` 의 `update: {}` 빈 객체). 이미 admin 이 `rejected` 로 처리한 후보를 외부 동기화가 다시 `pending` 으로 되돌려 운영자의 결정을 무효화하는 일을 방지하기 위함.

## 테스트 케이스 list

### Phase 2 — `auto-contact.service.spec.ts` + `contact-folder-sync.service.spec.ts`

- **A1** — 0차 alias 매칭: `status='approved'` alias 가 있으면 즉시 그 companyId 의 Company 를 반환. 1차/2차 lookup 호출 없음.
- **A2** — 0차 alias 매칭 시 `Contact.companyName` 은 alias 의 Company 정규형 사용 (폴더명 원본 아님).
- **A3** — 0차 fail (alias 없음) → 1차/2차 매칭으로 fallthrough. task 23 의 hotfix 동작 그대로.
- **A4** — 3차 단계: 1차/2차 fail + 정규화 후보 ≥1 이면 모두 `pending` 으로 upsert. 호출 후 매칭 결과는 null (폴더명 원본 fallback).
- **A5** — 3차 단계: 후보 0개면 upsert 호출 없음.
- **A6** — 3차 upsert 멱등성: 기존 `status='rejected'` row 가 있으면 동일 `(folderName, companyId)` 로 다시 호출되어도 status 가 `rejected` 그대로 유지 (`update: {}`).
- **A7** — 3차 upsert 멱등성: 기존 `status='approved'` row 가 있으면 status `approved` 그대로 유지. (운영 시 0차 매칭 경로로 빠지지만 매칭 직전 race 등 엣지 보장.)
- **C1** — `relocateAfterAliasApproved(folderName, companyId, client?)`: 해당 folderName 으로 동기화돼 외부웹하드 원본 폴더에 머물던 Contact 들을 모두 매칭된 업체의 `{업체}/문의/...` 로 이동. 반환 `{ relocated: number, skipped: number }`. company 미존재 시 `NotFoundException` throw.
- **C2** — `relocateAfterAliasApproved` 가 `inquiryType=null` Contact 는 skip 카운트로 분리 (현행 미분류 정책 유지). 분류는 `onInquiryTypeClassified` 가 자동 처리.
- **C3** — 대상 조회는 `companyId=null` Contact 만 (`OR: [companyName=folderName, companyName insensitive equals]`). 이미 companyId 가 채워진 Contact 는 자동 제외되어 멱등.

### Phase 3 — `folder-alias.service.spec.ts`

- **B1** — `GET ?status=pending`: pending row 만 반환, page/pageSize 적용 (default pageSize=50).
- **B2** — `GET` 기본: status 무관 전체 반환.
- **B3** — `POST :id/approve`: `status='approved'`, `approvedBy` / `approvedAt` 기록.
- **B4** — `POST :id/approve`: 동일 folderName 의 다른 pending 들이 자동 `rejected` 로 전환.
- **B5** — `POST :id/approve { cascadeBackfill: true }`: `relocateAfterAliasApproved` 호출 + 응답에 `backfill: { relocated, skipped }` 포함.
- **B6** — `POST :id/approve` 멱등: 이미 `approved` 면 `{ alias }` 만 반환 (다른 pending reject 도, backfill 도 수행하지 않음).
- **B7** — `PATCH :id/reject`: status `rejected`, approvedBy/At 변동 없음. 비존재 id → 404.
- **B8** — `DELETE :id`: row 삭제. 응답 `{ ok: true }`.

### Phase 4 — UI (선택)

- **D1** — `PendingAliasesPanel`: pending 목록 렌더 + 승인 버튼 클릭 시 `cascadeBackfill` 토글 모달 → 확인 시 mutation + invalidate.
- **D2** — `RegisteredAliasesPanel`: approved 목록 렌더 + 삭제 버튼 confirm + mutation.

### Phase 5 — E2E

- **E2E-1** — 외부 동기화 → admin 승인 → 폴더 통합: 1) 정규화 후보 1개로 동기화 → 폴더명 원본 폴더에 누적 + alias `pending` 등록. 2) admin 승인 (cascadeBackfill=true). 3) 누적 Contact 들이 매칭된 업체 폴더로 이동 + 신규 동기화도 자동 통합.
- **E2E-2** — reject 멱등성: alias `rejected` 상태에서 동일 folderName 으로 재동기화 시 status 변동 없음. admin 이 명시적으로 다시 등록하지 않는 한 매칭에 사용되지 않는다.

## 운영 절차 — 정규화로 매칭되지 않는 폴더명 (task 25, 2026-04-28)

`{업체명}({사이즈})`, `{업체명}_old`, `{업체명}-임시` 등 `normalizeCompanyName` 후에도 가입 업체와 매칭 안 되는 폴더는 admin 이 수동으로 alias 등록한다 (3차 정규화 후보 0개라 자동 pending 등록도 안 되는 케이스 대비).

```
POST /api/v1/companies/folder-aliases
{ folderName: "<외부 폴더명>", companyId: <가입 업체 id>, cascadeBackfill: true }
```

→ 즉시 가입 업체 폴더로 매핑 (`status='approved'` 직행, pending 단계 없음) + 기존 미통합 contact 들 일괄 이동 (`cascadeBackfill: true`, default `true`).

기존 `POST :id/approve` 와의 차이: pending row 검수가 아니라 **운영자의 명시적 의도 매핑** — pending row 없이 바로 approved 생성. cascadeBackfill default 도 `true` (approve 의 default `false` 와 다름). 멱등 — 동일 `(folderName, companyId)` 재호출 시 alias 상태 변경 없이 backfill 만 멱등 추가 실행 (`relocateAfterAliasApproved` 가 `companyId IS NULL` 필터로 자동 제외).

상세 정책: [task 25 spec](./webhard-visibility-and-external-inquiry-fix.md) §정책 — Bug 2.

## 변경 이력

- 2026-04-27 — task 24 신규 (외부 동기화 → 가입 업체 폴더 통합 정책, 3단계 매칭 강화, `CompanyFolderAlias` 모델, admin 승인 endpoint·UI).
- 2026-04-28 — task 25 운영 절차 추가 (`POST /folder-aliases` 매뉴얼 매핑 endpoint, 정규화 후보 0개 케이스 대응). 본 spec 의 매칭 정책은 무변경 — task 25 는 매뉴얼 진입로만 추가.

## 참조

- `webhard-api/src/integration/orders/auto-contact.service.ts` — `matchCompanyInfo` (line 159-228). 0차/1차/2차/3차 분기 위치.
- `webhard-api/src/contacts/contact-folder-sync.service.ts` — 단일 진입점 hook 서비스. `relocateAfterAliasApproved` 메서드 (line 219-271).
- `webhard-api/src/folders/_lib/company-name-match.util.ts` — `normalizeCompanyName(name)` 정규화 유틸 (task 21). 3차 단계에서 그대로 재사용.
- `webhard-api/src/companies/companies.controller.ts` — `folder-aliases` endpoint 4개 (line 178-224, AdminGuard).
- `webhard-api/src/companies/folder-alias.service.ts` — Phase 3 신규 서비스 (alias CRUD + cascadeBackfill orchestration).
- `webhard-api/src/companies/dto/folder-alias.dto.ts` — `ListFolderAliasesDto` / `ApproveFolderAliasDto`.
- `webhard-api/prisma/schema.prisma` `Company` (line 11-66 영역), `CompanyFolderAlias` (line 971-986).
- `docs/specs/features/contact-webhard-folder.md` — 단일 진입점 정책. 본 task 의 통합 정책이 그 위에 쌓이는 것임을 명시.
- `docs/specs/api/endpoints/integration.md` §companyName 정규화 — 본 task 가 3단계로 확장.
- `docs/specs/db/prisma-tables.md` — `companies` 보정 + `company_folder_aliases` 신설.
