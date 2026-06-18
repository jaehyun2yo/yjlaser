# Contact ↔ WebhardFolder 연결 정책

> **task 26 보강 (2026-04-29)**: 본 단일 진입점 정책 (`ContactFolderSyncService`) 위에 외부웹하드
> 폴더 트리 통째 이전 + cascade soft delete + 신규 동기화 routing 이 추가되었다 — 정책 상세는
> [external-folder-migration.md](./external-folder-migration.md) 참고. 외부에서
> `migrateExternalFolderTreeToCompany` / `ensureInquiryFolder` / `relocateContactFiles` 직접 호출
> 금지 원칙은 그대로 유지.

## 개요

- 목적: 공개 문의 폼 접수 Contact 와 외부웹하드(LGU+) 동기화 Contact 가 동일한 폴더 생성 훅을 공유하도록 정책을 통일한다.
- 도메인: CRM > 문의 관리 > 웹하드 폴더 자동 생성
- 배경: 기존에는 `ContactsService.create`, `ContactsService.updateInquiryType`, `ContactsService.updateProcessStage`, `AutoContactService.createNewContact` 각각이 개별적으로 `ensureInquiryFolder` + `relocateContactFiles` 를 호출하여 silent fail 분기가 산재했다. (task 23 qa-contact-worker-v1)

## 폴더 경로 스키마

```
{업체명}/문의/{inquiryNumber}
{업체명}/문의/{inquiryNumber}_{workNumber}
{업체명}/문의/{workNumber}
{업체명}/문의/완료/{inquiryNumber}
{업체명}/문의/완료/{inquiryNumber}_{workNumber}
{업체명}/문의/완료/{workNumber}
```

- 문의 폴더명은 문의번호만 사용한다. 업체명, 문의명, 파일명, 패키지명은 폴더명에 포함하지 않는다.
- UI 표시는 `사무실작업 문의번호 / 현장작업 문의번호` 형태를 사용한다.
  - O만 있으면 `O /`
  - F만 있으면 `/ F`
  - O+F면 `O / F`
- 실제 폴더명에는 `/` 문자를 사용할 수 없으므로 O+F 공존 시 `_` 로 저장한다.
- 기존 라벨/파일명 기반 폴더는 `ensureInquiryFolder` 또는 `renameInquiryFolderForContact` 경유 시 번호 전용 이름으로 정규화된다.
- inquiry 폴더가 확보되면 `Contact.webhardFolderId`는 최초 업로드 위치가 아니라 해당 inquiry 폴더 id를 가리켜야 한다.
- Worker 목록 응답의 `webhard_folder_id`/`webhard_folder_path`는 최신 DrawingRevision 파일의 현재 `folderId`/folder path를 우선한다. 최신 파일 위치가 없으면 `contactId + folderKind='inquiry'` 폴더를 우선하고, 그래도 없을 때만 Contact의 `webhardFolderId` 경로로 fallback한다.
- 업체 대시보드 문의 카드의 `웹하드` 버튼은 Contact DTO의 `webhard_folder_id`를 사용해 해당 문의 폴더로 이동한다. 업체 대시보드용 `/contacts/by-company` 응답도 최신 DrawingRevision 파일의 현재 `folderId/path`를 우선하고, 최신 파일 연결이 비어 있으면 `contactId + folderKind='inquiry'` 폴더를 우선해야 한다. `webhard_file_id`가 함께 있으면 웹하드 URL에 포함해 파일 하이라이트 계약을 유지한다.
- 납품 완료 시 문의 폴더는 `문의/완료/` 하위로 이동한다. `문의/완료/`가 없으면 생성하고, 과거 루트 `완료/` 하위에 있던 문의 폴더는 다시 `문의/완료/`로 정규화한다.
- 납품증빙 사진이 있는 납품 완료 처리에서는 해당 inquiry 폴더에 `납품완료_YYYYMMDD_HHmmss.ext` 이름의 `WebhardFile`을 추가한다. `Contact.deliveryProofImage` URL은 대시보드 표시용 원본으로 유지하고, 웹하드 파일 위치는 `folderId`로 표현한다.

### 폴더명 생성 유틸 확장

`webhard-api/src/common/inquiry-filename.util.ts` 의 `buildInquiryFolderName` 시그니처를 확장한다 (기존 파일 — `_lib/` 아님):

```ts
export interface BuildInquiryFolderNameInput {
  inquiryNumber: string | null;
  workNumber: string | null;
  packageLabel?: string | null;
  filenameFallback?: string | null;
}

export function buildInquiryFolderName(input: BuildInquiryFolderNameInput): string | null;
```

규칙:

1. `inquiryNumber` 와 `workNumber` 모두 있으면 `{inquiryNumber}_{workNumber}` 반환
2. `inquiryNumber` 만 있으면 `{inquiryNumber}` 반환
3. `workNumber` 만 있으면 `{workNumber}` 반환
4. 둘 다 없으면 null 반환
5. `packageLabel` / `filenameFallback` 입력은 하위 호환을 위해 남아 있지만 폴더명에는 사용하지 않는다.

## 폴더 생성 시점

| Contact 상태                  | 폴더 생성 동작                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `inquiryType` 확정            | 생성 즉시 폴더 생성 + 파일 relocate                                                   |
| `inquiryType = null` (미분류) | 번호가 있으면 폴더 생성 가능. 분류 확정 시 파일 relocate 수행                         |
| `processStage` 전환           | `drawing_confirmed` 로 전환되는 순간 F 번호를 확보하고 폴더 rename(`{O}` → `{O}_{F}`) |
| 현장 작업으로 바로 접수       | O가 없으면 F 번호만 폴더명으로 사용. UI는 `/ {F}` 로 표시                             |

## 공통 훅 (`ContactFolderSyncService`)

Contact 상태 변화에 따른 폴더 생성/rename/파일 이동의 **단일 진입점** 서비스.

- 위치: `webhard-api/src/contacts/contact-folder-sync.service.ts` (신규 — `_lib/` 서브디렉토리 없이 `contacts/` 바로 하위)
- 의존성: `FoldersService` 를 주입받는 얇은 orchestration 레이어. `FoldersService` 의 내부 로직을 중복 구현하지 않는다.

### 메서드

```ts
@Injectable()
export class ContactFolderSyncService {
  async onContactCreated(ctx: ContactFolderSyncContext): Promise<void>;
  async onInquiryTypeClassified(ctx: ContactFolderSyncContext): Promise<void>;
  async onProcessStageChanged(
    ctx: ContactFolderSyncContext & { previousStage: string | null; nextStage: string }
  ): Promise<void>;
}

export interface ContactFolderSyncContext {
  contactId: string;
  client?: Prisma.TransactionClient;
}
```

### 호출처

- `ContactsService.create` → `onContactCreated`
- `ContactsService.updateInquiryType` → `onInquiryTypeClassified`
- `ContactsService.updateProcessStage` → `onProcessStageChanged` (Phase 5 에서 silent fail 제거와 함께 교체)
- `AutoContactService.createNewContact` → `onContactCreated`

### Silent fail 제거 범위

`ensureInquiryFolder` 가 null 반환할 때의 처리 정책은 호출 맥락별로 분리한다:

| 훅 메서드                                                 | null 반환 시 동작                                                                      |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `onContactCreated`                                        | **warn + skip**. Company 미등록 업체의 생성 자체를 실패시키지 않기 위함 (UX 회귀 방지) |
| `onInquiryTypeClassified`                                 | **warn + skip**. 분류 확정 자체를 실패시키지 않기 위함 (UX 회귀 방지)                  |
| `onProcessStageChanged` (일반)                            | **warn + skip**. 중간 단계는 폴더 없이도 허용                                          |
| `onProcessStageChanged` (`nextStage='drawing_confirmed'`) | **명시적 throw**. 공정 확정 단계에서는 폴더 없이 진행 금지 (이슈 4 silent fail 제거)   |

throw 시 `$transaction` 롤백을 유도하여 processStage 전환 자체가 취소되고, API 응답은 `UnprocessableEntityException (422)` 로 변환되어 프론트에서 구분 가능하다 (Phase 5 구현).

### 에러 코드

`UnprocessableEntityException` 응답의 `code` 필드:

- `INQUIRY_NUMBER_REQUIRED` — `drawing_confirmed` 전환에 inquiryNumber/workNumber 모두 없음
- `FOLDER_CREATION_FAILED` — `ensureInquiryFolder` null 반환 (NO_COMPANY_ROOT / NO_FALLBACK_MATCH / FOLDER_CREATE_FAILED 등 세부 원인은 `logger.warn` 의 `reason_code` 로 별도 기록)

구체 원인 매핑은 `drawing-workflow.md §W.1 #### 폴더 생성 실패 진단` 참조.

## 외부 동기화 → 가입 업체 폴더 통합 (task 24)

외부웹하드 동기화 시 폴더명 ↔ 가입 업체 매칭이 성공하면 (`Company` insensitive equals 또는 admin 승인된 `CompanyFolderAlias`), 파일은 외부웹하드 원본 폴더가 아니라 매칭된 업체의 `{업체}/문의/{문의번호}/` 로 직접 통합된다. 정규화 매칭 후보가 있어도 admin 승인 전까지는 폴더명 원본 fallback 으로 외부웹하드 원본 폴더에 그대로 남는다.

상세 정책: `docs/specs/features/external-sync-company-folder.md`.

## 관련 task

- [task 25 (2026-04-28): 웹하드 가시성 회복 + 폴더명 alias 매뉴얼 매핑 + 미가입 업체 외부 sync 시 문의 폴더 자동화 회귀 가드](./webhard-visibility-and-external-inquiry-fix.md) — 본 spec 의 단일 진입점 정책 (`ContactFolderSyncService`) 위에서 `relocateAfterAliasApproved` 신규 호출처 (admin 매뉴얼 매핑 endpoint) 추가. `onContactCreated` / `onInquiryTypeClassified` 동작은 무변경.

## 불변 규칙

1. **단일 진입점**: `ContactFolderSyncService` 외부에서 직접 `ensureInquiryFolder` / `renameInquiryFolderForContact` / `relocateContactFiles` 를 호출하지 않는다. 새 호출처가 생기면 반드시 이 서비스를 경유.
2. **호출 순서**: `onProcessStageChanged` 내부에서 `renameInquiryFolderForContact` → `ensureInquiryFolder` → `relocateContactFiles` 순서 고정. 역순 호출 금지.
3. **트랜잭션 전파**: `ContactFolderSyncContext.client` 를 통해 `Prisma.TransactionClient` 가 전파되어야 한다. `$transaction` 외부 호출은 하위 호환용으로만 허용.
4. **`drawing_confirmed` 폴더 필수**: `onProcessStageChanged` 가 `nextStage='drawing_confirmed'` 를 받을 때 폴더가 확보되지 않으면 throw — silent skip 금지.
5. **packageLabel / filenameFallback 은 폴더명에서 제외**: 기존 호출 시그니처는 유지하지만 `buildInquiryFolderName` 은 번호 전용 이름만 반환한다.

## 변경 이력

- 2026-04-24 — Contact ↔ WebhardFolder 훅 단일화, 폴더 경로 스키마에 패키지명·파일명 fallback 도입 (task 23 qa-contact-worker-v1)
- 2026-05-11 — 문의 폴더명을 번호 전용으로 정규화. UI 표시는 `O / F`, 실제 폴더명은 `O_F` 사용. Worker/업체 대시보드 저장 위치와 웹하드 열기는 최신 파일 위치를 우선하고, 최신 파일 연결이 없으면 contact inquiry 폴더를 우선. 업체 대시보드 문의 카드도 `webhard_folder_id` 기반 웹하드 이동 버튼을 제공. 납품 완료 문의 폴더는 `문의/완료/` 하위로 이동.

## 참조

- `webhard-api/src/contacts/contact-folder-sync.service.ts` — 단일 진입점 서비스 (task 23 신규)
- `webhard-api/src/common/inquiry-filename.util.ts` — `buildInquiryFolderName` 확장 (task 23)
- `webhard-api/src/folders/folders.service.ts` — `ensureInquiryFolder` / `renameInquiryFolderForContact` / `relocateContactFiles`
- `webhard-api/src/folders/_lib/resolve-company-root.util.ts` — 업체 루트 3단계 탐색 (task 22)
- `docs/specs/features/drawing-workflow.md` §W.1 — 폴더 생성/rename 불변 규칙
- `docs/specs/api/endpoints/webhard.md` — 폴더명 스키마 변경
- `docs/specs/api/endpoints/integration.md` — Auto-contact companyName 정규화
