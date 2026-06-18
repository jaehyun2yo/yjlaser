# docs-diff: qa-contact-worker-v1

Baseline: `22945e0`

## `docs/specs/api/endpoints/integration.md`

```diff
diff --git a/docs/specs/api/endpoints/integration.md b/docs/specs/api/endpoints/integration.md
index 943614ba..02570aaf 100644
--- a/docs/specs/api/endpoints/integration.md
+++ b/docs/specs/api/endpoints/integration.md
@@ -1383,6 +1383,14 @@ DXF 파일 파싱 결과로 Contact + Order를 자동 생성합니다. 사무실
 }
```

+### companyName 정규화 정책 (task 23, 2026-04-24)

- +외부 프로그램이 `POST /api/v1/files/batch-confirm` 또는 `POST /api/v1/integration/contacts/auto` 를 호출할 때, Contact 생성에 사용되는 `companyName` 은 **폴더명 원본이 아니라 `matchCompanyInfo` 가 매칭한 `Company.companyName` 정규형을 우선 사용**한다. 매칭 실패 시 fallback 으로 폴더명 원본을 사용.
- +- 목적: 업체 대시보드(`/company/orders`) 에서 `findByCompany` 로 조회 시 업체 입장의 정규 업체명과 자동 생성 Contact 의 `companyName` 이 일치하도록 보장. QA 에서 "대성목형 자동생성 Contact 가 업체 대시보드에 안 보인다" 는 제보가 이 불일치에서 비롯됨.
  +- `findByCompany` 는 동시에 insensitive match (대소문자 · 공백 무시) 로 하위 호환 보강. 기존 exact match 만 쓸 때 누락되던 레거시 Contact 도 조회된다.
  +- 상세 훅 정책은 `docs/specs/features/contact-webhard-folder.md` 참고.
- ***

  ## Contacts

````

## `docs/specs/api/endpoints/webhard.md`

```diff
diff --git a/docs/specs/api/endpoints/webhard.md b/docs/specs/api/endpoints/webhard.md
index 1244b267..0b0845e5 100644
--- a/docs/specs/api/endpoints/webhard.md
+++ b/docs/specs/api/endpoints/webhard.md
@@ -1434,6 +1434,8 @@ interface BackupHistoryItem {

 저장 위치 정책 (task 19 이후 — 현행): `{거래처루트(company.name)}/문의-{buildInquiryFolderName({inquiryNumber, workNumber})}/[{대표번호}] {originalName}`. 납품 완료된 문의는 `{거래처루트}/완료/문의-.../` 하위로 자동 이관. 거래처 루트·template 폴더(`칼선의뢰`/`목형의뢰`) 가 없으면 `POST /api/v1/folders/initialize` 와 동일한 흐름으로 자동 생성된다. template 폴더는 **삭제·이동 금지** — 거래처 원본 도면 수신 구분용. 상세 정책은 `docs/specs/features/drawing-workflow.md` §W.1 참고.

+> 문의 폴더명 스키마 (task 23 qa-contact-worker-v1, 2026-04-24): 공개 폼 또는 외부웹하드 동기화 경로에서 `inquiry_title`(패키지명) 이 있으면 `{패키지명-slug}-{inquiryNumber}[_{workNumber}]` 형식으로, 없으면 첫 번째 첨부 파일명 slug 를 fallback 으로 사용한다. 둘 다 없으면 현행 `문의-{inquiryNumber}[_{workNumber}]` 를 유지. `buildInquiryFolderName` 시그니처가 `BuildInquiryFolderNameInput { inquiryNumber, workNumber, packageLabel?, filenameFallback? }` 로 확장된다. 상세 정책은 `docs/specs/features/contact-webhard-folder.md` 참고.
+
 생성된 WebhardFile ID 목록은 DrawingRevision의 `webhardFileIds` 컬럼에 저장된다.

 ### `webhardWarning` 응답 필드 (task 19)
````

## `docs/specs/features/contact-file-upload.md`

````diff
diff --git a/docs/specs/features/contact-file-upload.md b/docs/specs/features/contact-file-upload.md
new file mode 100644
index 00000000..2d0125ac
--- /dev/null
+++ b/docs/specs/features/contact-file-upload.md
@@ -0,0 +1,68 @@
+# Contact File Upload — 공개 문의 폼 · Worker · Company 업로드 확장자 정책
+
+## 개요
+
+- 목적: 공개 문의 폼, Worker 도면 업로드 모달, Company 포털 도면 업로드 UI 가 동일한 허용 확장자 목록을 공유하도록 단일 상수화한다.
+- 도메인: CRM > 문의 관리 > 파일 업로드 UX
+- 배경: QA 에서 공개 폼이 `.ai` 파일 업로드를 막는다는 제보가 있었으나, Worker/Company 업로드는 이미 `.ai` 를 허용하고 있었다. 각 UI 가 자체 하드코딩 배열을 갖고 있어 정책 drift 가 발생했다. (task 23 qa-contact-worker-v1)
+
+## 정책
+
+### 단일 상수
+
+- 위치: `src/lib/utils/file-upload-policy.ts` (신규)
+- export: `DRAWING_UPLOAD_ALLOWED_EXTENSIONS` (`readonly string[]`) — 도면 업로드용
+- export: `DRAWING_UPLOAD_ACCEPT_ATTR` (`string`) — `<input type="file" accept>` 속성에 바로 사용할 수 있는 콤마 구분 문자열
+- export: `REFERENCE_UPLOAD_ALLOWED_EXTENSIONS`, `REFERENCE_UPLOAD_ACCEPT_ATTR` — 참고자료(이미지/문서) 업로드용 (도면과 분리 관리)
+
+### 허용 확장자 (도면)
+
+```
+.pdf, .dxf, .ai, .dwg, .jpg, .jpeg, .png, .gif, .zip, .rar
+```
+
+제조업 도면 파일(PDF, DXF, AI, DWG) + 일반 이미지(JPG/JPEG/PNG/GIF) + 압축(ZIP/RAR) 을 모두 허용한다. `.ai` 는 Adobe Illustrator 포맷으로 업체가 원본 도면을 보낼 때 자주 사용되며, 별도 제한 사유가 없다.
+
+### 허용 확장자 (참고자료)
+
+```
+.pdf, .doc, .docx, .jpg, .jpeg, .png, .gif, .webp
+```
+
+공개 폼의 `reference_photos` 업로드 영역에서 사용. `accept` 속성은 `image/*` 와일드카드를 추가 허용하여 모바일 카메라 직접 촬영도 가능.
+
+### 서버측 차단 (독립 레이어)
+
+허용 목록은 클라이언트 UX 용이며, 서버측 위험 확장자 차단은 `src/lib/utils/fileValidation.ts` 의 `DANGEROUS_EXTENSIONS` 로 별도 관리한다:
+
+- `.exe, .bat, .cmd, .scr, .vbs, .js, .jar` 등 실행 가능 바이너리 · 스크립트 → 서버에서 magic byte + 확장자 두 레벨 차단
+- 클라이언트 허용 확장자 확대가 서버 차단을 약화시키지 않는다 (서로 독립)
+
+## 적용 지점
+
+| 컴포넌트                                                      | 적용 영역                                                   |
+| ------------------------------------------------------------- | ----------------------------------------------------------- |
+| `src/app/contact/ContactForm.tsx`                             | `drawing_file` input + `reference_photos` input 의 `accept` |
+| `src/app/contact/_components/ContactCardToggle.tsx`           | `drawing_file` input 의 `accept`                            |
+| `src/app/worker/_components/WorkerDrawingUpload.tsx`          | 로컬 `ALLOWED_EXTENSIONS` 배열 → 단일 상수 import 로 교체   |
+| `src/app/company/orders/_components/CompanyDrawingUpload.tsx` | 동일 패턴 단일 상수 import                                  |
+
+각 컴포넌트는 `DRAWING_UPLOAD_ACCEPT_ATTR` 를 `accept` 속성에 직접 사용하거나 클라이언트 검증 시 `DRAWING_UPLOAD_ALLOWED_EXTENSIONS` 를 import 한다.
+
+## 불변 규칙
+
+1. **단일 상수 원칙**: 도면 업로드 허용 확장자는 `file-upload-policy.ts` 한 곳에서만 정의한다. UI 컴포넌트 내부에 별도 `ALLOWED_EXTENSIONS` 하드코딩 배열을 두지 않는다.
+2. **서버 차단 독립성**: `DANGEROUS_EXTENSIONS` 는 클라이언트 허용 목록과 무관하게 서버에서 차단한다. 클라이언트 `accept` 속성은 UX 보조 수단이지 보안 계층이 아니다.
+3. **`.ai` 허용 유지**: Adobe Illustrator 파일은 PostScript 기반이나 실행 파일이 아니므로 `DANGEROUS_EXTENSIONS` 에 포함하지 않는다.
+4. **도면과 참고자료 분리**: `DRAWING_UPLOAD_*` 와 `REFERENCE_UPLOAD_*` 는 용도가 다르므로 상수를 분리하여 관리한다. 공개 폼의 `drawing_file` 영역은 도면 상수만 사용.
+
+## 변경 이력
+
+- 2026-04-24 — 공개 폼 `.ai` 허용 누락 수정 및 단일 상수화 (task 23 qa-contact-worker-v1)
+
+## 참조
+
+- `src/lib/utils/file-upload-policy.ts` — 단일 상수 위치 (task 23 신규)
+- `src/lib/utils/fileValidation.ts` — 서버측 `DANGEROUS_EXTENSIONS` 목록
+- `docs/specs/features/drawing-workflow.md` — 업로드된 파일의 폴더 저장 정책
+- `docs/specs/features/worker-portal.md` §도면 업로드 — Worker 업로드 모달 UX
````

## `docs/specs/features/contact-webhard-folder.md`

````diff
diff --git a/docs/specs/features/contact-webhard-folder.md b/docs/specs/features/contact-webhard-folder.md
new file mode 100644
index 00000000..8e803519
--- /dev/null
+++ b/docs/specs/features/contact-webhard-folder.md
@@ -0,0 +1,124 @@
+# Contact ↔ WebhardFolder 연결 정책
+
+## 개요
+
+- 목적: 공개 문의 폼 접수 Contact 와 외부웹하드(LGU+) 동기화 Contact 가 동일한 폴더 생성 훅을 공유하도록 정책을 통일한다.
+- 도메인: CRM > 문의 관리 > 웹하드 폴더 자동 생성
+- 배경: 기존에는 `ContactsService.create`, `ContactsService.updateInquiryType`, `ContactsService.updateProcessStage`, `AutoContactService.createNewContact` 각각이 개별적으로 `ensureInquiryFolder` + `relocateContactFiles` 를 호출하여 silent fail 분기가 산재했다. (task 23 qa-contact-worker-v1)
+
+## 폴더 경로 스키마
+
+```
+{업체명}/문의/{패키지명 or 파일명-slug}-{inquiryNumber}[_{workNumber}]
+```
+
+- **공개 폼 경로**: 패키지명 = `Contact.inquiry_title` 의 sanitize 결과 (NFKC 정규화 + 파일시스템 금지 문자 제거 + 최대 50 자 truncate)
+- **외부웹하드 동기화 경로**: 패키지명이 없으면 첫 번째 첨부 파일명(확장자 제거 + slug) 을 fallback 으로 사용
+- 둘 다 없으면 현행 `문의-{inquiryNumber}[_{workNumber}]` 유지 (하위 호환)
+
+### 폴더명 생성 유틸 확장
+
+`webhard-api/src/common/inquiry-filename.util.ts` 의 `buildInquiryFolderName` 시그니처를 확장한다 (기존 파일 — `_lib/` 아님):
+
+```ts
+export interface BuildInquiryFolderNameInput {
+  inquiryNumber: string | null;
+  workNumber: string | null;
+  packageLabel?: string | null;
+  filenameFallback?: string | null;
+}
+
+export function buildInquiryFolderName(input: BuildInquiryFolderNameInput): string | null;
+```
+
+규칙:
+
+1. `inquiryNumber` 없으면 null 반환 (기존 동작 유지)
+2. `packageLabel || filenameFallback` 있으면 → `{slug}-{inquiryNumber}[_{workNumber}]`
+3. 둘 다 없으면 → `문의-{inquiryNumber}[_{workNumber}]` (기존 동작)
+
+slug 유틸 `slugifyPackageLabel` 은 동일 파일 내 헬퍼로 관리. 빈 문자열 결과 시 null 반환하여 호출처가 fallback 경로로 넘어가도록 한다.
+
+## 폴더 생성 시점
+
+| Contact 상태                  | 폴더 생성 동작                                                                                            |
+| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
+| `inquiryType` 확정            | 생성 즉시 폴더 생성 + 파일 relocate                                                                       |
+| `inquiryType = null` (미분류) | 폴더 생성 skip. 분류 확정 시 `ContactFolderSyncService.onInquiryTypeClassified` 훅이 생성                 |
+| `processStage` 전환           | `drawing_confirmed` 로 전환되는 순간 폴더 rename(`문의-{O}` → `문의-{O}_{F}`) — workNumber 존재 여부 무관 |
+
+## 공통 훅 (`ContactFolderSyncService`)
+
+Contact 상태 변화에 따른 폴더 생성/rename/파일 이동의 **단일 진입점** 서비스.
+
+- 위치: `webhard-api/src/contacts/contact-folder-sync.service.ts` (신규 — `_lib/` 서브디렉토리 없이 `contacts/` 바로 하위)
+- 의존성: `FoldersService` 를 주입받는 얇은 orchestration 레이어. `FoldersService` 의 내부 로직을 중복 구현하지 않는다.
+
+### 메서드
+
+```ts
+@Injectable()
+export class ContactFolderSyncService {
+  async onContactCreated(ctx: ContactFolderSyncContext): Promise<void>;
+  async onInquiryTypeClassified(ctx: ContactFolderSyncContext): Promise<void>;
+  async onProcessStageChanged(
+    ctx: ContactFolderSyncContext & { previousStage: string | null; nextStage: string }
+  ): Promise<void>;
+}
+
+export interface ContactFolderSyncContext {
+  contactId: string;
+  client?: Prisma.TransactionClient;
+}
+```
+
+### 호출처
+
+- `ContactsService.create` → `onContactCreated`
+- `ContactsService.updateInquiryType` → `onInquiryTypeClassified`
+- `ContactsService.updateProcessStage` → `onProcessStageChanged` (Phase 5 에서 silent fail 제거와 함께 교체)
+- `AutoContactService.createNewContact` → `onContactCreated`
+
+### Silent fail 제거 범위
+
+`ensureInquiryFolder` 가 null 반환할 때의 처리 정책은 호출 맥락별로 분리한다:
+
+| 훅 메서드                                                 | null 반환 시 동작                                                                      |
+| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
+| `onContactCreated`                                        | **warn + skip**. Company 미등록 업체의 생성 자체를 실패시키지 않기 위함 (UX 회귀 방지) |
+| `onInquiryTypeClassified`                                 | **warn + skip**. 분류 확정 자체를 실패시키지 않기 위함 (UX 회귀 방지)                  |
+| `onProcessStageChanged` (일반)                            | **warn + skip**. 중간 단계는 폴더 없이도 허용                                          |
+| `onProcessStageChanged` (`nextStage='drawing_confirmed'`) | **명시적 throw**. 공정 확정 단계에서는 폴더 없이 진행 금지 (이슈 4 silent fail 제거)   |
+
+throw 시 `$transaction` 롤백을 유도하여 processStage 전환 자체가 취소되고, API 응답은 `UnprocessableEntityException (422)` 로 변환되어 프론트에서 구분 가능하다 (Phase 5 구현).
+
+### 에러 코드
+
+`UnprocessableEntityException` 응답의 `code` 필드:
+
+- `INQUIRY_NUMBER_REQUIRED` — `drawing_confirmed` 전환에 inquiryNumber/workNumber 모두 없음
+- `FOLDER_CREATION_FAILED` — `ensureInquiryFolder` null 반환 (NO_COMPANY_ROOT / NO_FALLBACK_MATCH / FOLDER_CREATE_FAILED 등 세부 원인은 `logger.warn` 의 `reason_code` 로 별도 기록)
+
+구체 원인 매핑은 `drawing-workflow.md §W.1 #### 폴더 생성 실패 진단` 참조.
+
+## 불변 규칙
+
+1. **단일 진입점**: `ContactFolderSyncService` 외부에서 직접 `ensureInquiryFolder` / `renameInquiryFolderForContact` / `relocateContactFiles` 를 호출하지 않는다. 새 호출처가 생기면 반드시 이 서비스를 경유.
+2. **호출 순서**: `onProcessStageChanged` 내부에서 `renameInquiryFolderForContact` → `ensureInquiryFolder` → `relocateContactFiles` 순서 고정. 역순 호출 금지.
+3. **트랜잭션 전파**: `ContactFolderSyncContext.client` 를 통해 `Prisma.TransactionClient` 가 전파되어야 한다. `$transaction` 외부 호출은 하위 호환용으로만 허용.
+4. **`drawing_confirmed` 폴더 필수**: `onProcessStageChanged` 가 `nextStage='drawing_confirmed'` 를 받을 때 폴더가 확보되지 않으면 throw — silent skip 금지.
+5. **packageLabel / filenameFallback 은 optional**: 기존 `ContactFolderSyncService` 를 경유하지 않는 레거시 호출이 있더라도 `buildInquiryFolderName` 은 현행 `문의-{O}_{F}` 동작을 유지한다 (하위 호환).
+
+## 변경 이력
+
+- 2026-04-24 — Contact ↔ WebhardFolder 훅 단일화, 폴더 경로 스키마에 패키지명·파일명 fallback 도입 (task 23 qa-contact-worker-v1)
+
+## 참조
+
+- `webhard-api/src/contacts/contact-folder-sync.service.ts` — 단일 진입점 서비스 (task 23 신규)
+- `webhard-api/src/common/inquiry-filename.util.ts` — `buildInquiryFolderName` 확장 (task 23)
+- `webhard-api/src/folders/folders.service.ts` — `ensureInquiryFolder` / `renameInquiryFolderForContact` / `relocateContactFiles`
+- `webhard-api/src/folders/_lib/resolve-company-root.util.ts` — 업체 루트 3단계 탐색 (task 22)
+- `docs/specs/features/drawing-workflow.md` §W.1 — 폴더 생성/rename 불변 규칙
+- `docs/specs/api/endpoints/webhard.md` — 폴더명 스키마 변경
+- `docs/specs/api/endpoints/integration.md` — Auto-contact companyName 정규화
````

## `docs/specs/features/drawing-workflow.md`

```diff
diff --git a/docs/specs/features/drawing-workflow.md b/docs/specs/features/drawing-workflow.md
index dec68ed5..6607db1f 100644
--- a/docs/specs/features/drawing-workflow.md
+++ b/docs/specs/features/drawing-workflow.md
@@ -47,6 +47,7 @@ WebhardFile 자동 생성 / 분류 시점 rename 시, WebhardFile.name 앞에

 > 2026-04-22 업데이트 — 중간 `문의/` 폴더 삽입 (task 20 webhard-folder-policy-unify). 기존 task 19 의 "업체 루트 직하" 규칙은 사용자가 프로덕션에 적용한 적 없어 본 문서 내에서 바로 교체한다.
 > 2026-04-24 업데이트 — company 탐색 정책 통일 (task 22 contact-webhard-navigate). `ensureInquiryFolder` 와 `relocateContactFiles` 가 동일한 3단계 company 탐색 유틸을 공유하도록 통일. `relocateContactFiles` 의 silent bail-out 제거.
+> 2026-04-24 업데이트 — Contact 생성/분류 확정/processStage 전환 시 폴더 생성 훅 단일화 (task 23 qa-contact-worker-v1). 미분류→분류 확정 시점에 `ensureInquiryFolder + relocateContactFiles` 시도. 단, Company 미등록 등으로 null 반환 시 생성·분류 단계에서는 warn+skip (UX 회귀 방지), `drawing_confirmed` 전환에서는 명시적 throw. `contact-folder-sync.service.ts` 가 단일 진입점으로 모든 호출처(`ContactsService.create`, `updateInquiryType`, `updateProcessStage`, `AutoContactService.createNewContact`) 를 경유. `updateProcessStage` 에서 `workNumber` 가 이미 존재하더라도 `drawing_confirmed` 전환 순간 폴더 rename(`문의-{O}` → `문의-{O}_{F}`) 은 실행된다 — 현재 `issueWorkNumber=false` 시 rename 을 skip 하는 로직은 **버그** 이며 Phase 5 에서 수정. 폴더명 스키마에 `packageLabel`(inquiry*title) / `filenameFallback`(첫 첨부 파일명) 우선 사용, 둘 다 없으면 현행 `문의-{O}*{F}`유지. 상세 정책은`docs/specs/features/contact-webhard-folder.md` 참고.

 **저장 구조:**

```

## `docs/specs/features/visit-booking-admin.md`

````diff
diff --git a/docs/specs/features/visit-booking-admin.md b/docs/specs/features/visit-booking-admin.md
new file mode 100644
index 00000000..299ec15a
--- /dev/null
+++ b/docs/specs/features/visit-booking-admin.md
@@ -0,0 +1,130 @@
+# Visit Booking — 방문 예약 슬롯 UX 및 Admin 관리
+
+## 개요
+
+- 목적: 방문 예약 시스템의 슬롯 UX 로딩 상태, Admin 승인/취소/수정 UI, status enum 검증을 정의한다.
+- 도메인: 방문 예약 > 공개 폼 슬롯 UI + Admin 예약 관리
+- 배경: QA 에서 (1) 슬롯 UI 가 fetch 완료 전에 "예약 가능" 으로 오표시되는 문제, (2) Admin 예약 카드에 승인/거절/수정 버튼이 없는 문제, (3) `VisitBooking.status` 가 enum 검증 없이 임의 문자열 저장 가능한 문제가 제보되었다. (task 23 qa-contact-worker-v1)
+
+## 슬롯 UI 로딩 상태
+
+공개 폼 (`/contact` Step 3) 의 방문 예약 슬롯 버튼은 서버 응답이 도착하기 전까지 **로딩 상태** 를 명시적으로 표시해야 한다.
+
+### 문제점 (기존 동작)
+
+`bookingAvailability` state 초기값이 빈 객체 `{}` 이고, 슬롯 렌더링 시 `availability?.available ?? true` 로 기본값이 "가용" 으로 세팅되어 있어, fetch 완료 전 슬롯이 **실제 자리가 없을 때도 "예약 가능"** 으로 표시되는 버그가 있었다.
+
+### 정책
+
+1. `bookingLoading` state 추가. `currentStep === 3 && receiptMethod === 'visit' && visitDate` 조건 충족 시 `true`, fetch 완료/실패 시 `false`.
+2. 슬롯 렌더링에서 `isAvailable` 기본값을 `?? false` 로 변경. 로딩 중에는 명시적 비활성 처리.
+3. 로딩 중 슬롯 버튼은 **스켈레톤** (`bg-gray-200 animate-pulse` 블록) 또는 비활성 버튼으로 렌더. "예약 가능" 문자열 노출 금지.
+4. fetch 실패 시 모든 슬롯을 `{ count: maxCapacity, available: false }` 로 세팅하여 "예약 마감" 으로 표시 (서버 오류가 가용으로 표시되는 회귀 방지).
+
+### NestJS `getAvailableSlots` 응답 확장
+
+기존 `{ date, slotCounts }` 응답에 `maxCapacity` 필드를 추가한다 (하위 호환 — 기존 소비처는 깨지지 않음):
+
+```ts
+{
+  date: string;
+  slotCounts: Record<string, number>; // 시간대별 현재 예약 수
+  maxCapacity: number; // 슬롯당 정원 (현재 2)
+}
+```
+
+`VisitBookingConstants.MAX_CAPACITY = 2` 를 `webhard-api/src/bookings/constants.ts` 로 분리하여 controller / service / 향후 config 에서 공유. 하드코딩 `2` 를 응답 페이로드로 노출하여 프론트에서 `>= maxCapacity` 비교 시 동일 상수 사용.
+
+### Next.js 프록시 응답
+
+`src/app/api/bookings/available/route.ts` 는 NestJS 응답의 `maxCapacity` 를 그대로 전파한다:
+
+```json
+{
+  "date": "2026-05-01",
+  "timeSlot": "9:00~10:00",
+  "bookingCount": 1,
+  "availableSlots": 1,
+  "isAvailable": true,
+  "maxBookings": 2
+}
+```
+
+기존 `maxBookings` 필드명은 하위 호환을 위해 유지. 값은 `maxCapacity` 에서 전파.
+
+## Admin 예약 관리 UI
+
+`src/app/(admin)/admin/bookings/_components/BookingsCalendar.tsx` 의 예약 카드에 액션 버튼을 추가한다.
+
+### 추가되는 액션
+
+| 버튼 | 조건                     | 동작                                                                      |
+| ---- | ------------------------ | ------------------------------------------------------------------------- |
+| 승인 | `status !== 'confirmed'` | `PATCH /api/admin/bookings/:id` with `{ status: 'confirmed' }`            |
+| 취소 | `status !== 'cancelled'` | confirm 후 `PATCH /api/admin/bookings/:id` with `{ status: 'cancelled' }` |
+| 수정 | 항상 표시                | `BookingEditModal` 오픈 → 일자 / 시간 / 관리자 메모 수정 → `PATCH`        |
+
+### 실시간 갱신
+
+PATCH 성공 시 NestJS `bookingsGateway.emitBookingUpdated` 가 `booking:updated` Socket 이벤트를 emit 한다. 프론트는 이 이벤트 수신 시 React Query `queryKeys.bookings.all` invalidate 하여 재조회. `window.location.reload()` 금지.
+
+### 권한 검증
+
+- **NestJS 레이어**: `@UseGuards(ApiKeyGuard)` 만 적용 (controller-level). 별도 `AdminSessionGuard` 를 추가하지 않는다 (프로젝트에 존재하지 않음).
+- **Next.js 레이어**: `/api/admin/bookings/[id]` route 에서 admin 세션 검증 후 `INTEGRATION_API_KEY` 로 NestJS 호출. 기존 admin API route 패턴(`src/app/api/admin/**/route.ts`) 을 따름.
+- Worker / Company 가 직접 `/api/v1/bookings/:id` 를 호출하지 못하도록 `/api/admin/bookings/[id]` 경로가 유일한 게이트.
+
+## Status Enum 검증
+
+현재 `VisitBooking.status` 는 Prisma 에서 `String?` 로 선언되어 어떤 문자열이든 저장 가능하다. `UpdateBookingDto` 에 enum 검증을 추가한다.
+
+```ts
+import { IsIn, IsOptional, IsDateString, IsString } from 'class-validator';
+
+export const BOOKING_STATUS_VALUES = ['pending', 'confirmed', 'cancelled'] as const;
+export type BookingStatus = (typeof BOOKING_STATUS_VALUES)[number];
+
+export class UpdateBookingDto {
+  @IsOptional()
+  @IsIn([...BOOKING_STATUS_VALUES])
+  status?: BookingStatus;
+
+  @IsOptional()
+  @IsDateString()
+  visitDate?: string;
+
+  @IsOptional()
+  @IsString()
+  visitTimeSlot?: string;
+
+  @IsOptional()
+  @IsString()
+  adminNote?: string;
+}
+```
+
+전역 `ValidationPipe` (whitelist + forbidNonWhitelisted) 가 이미 활성화되어 있으므로 DTO 검증은 자동 적용된다. `CreateBookingDto` 에도 동일 검증 적용.
+
+## 불변 규칙
+
+1. **로딩 상태 기본값은 `false`**: 슬롯 `isAvailable` 의 기본값을 `?? true` 로 되돌리지 않는다. 로딩 중 "가용" 오표시 회귀 방지.
+2. **`maxCapacity` 는 서버 응답 기반**: 프론트 하드코딩 `2` 를 되살리지 않는다. NestJS constants 의 `VisitBookingConstants.MAX_CAPACITY` 가 단일 소스.
+3. **Admin 액션은 `/api/admin/bookings/:id` 경유**: NestJS `/api/v1/bookings/:id` 를 프론트에서 직접 호출하지 않는다. Next.js route 가 admin 세션 검증의 유일한 게이트.
+4. **Status enum**: `'pending' | 'confirmed' | 'cancelled'` 외 값은 DTO 에서 거부된다. 확장 시 `BOOKING_STATUS_VALUES` 와 Prisma 마이그레이션을 동시에 갱신.
+5. **Socket 이벤트 재사용**: `booking:updated` / `booking:deleted` 는 이미 존재. 새 이벤트 이름을 만들지 않는다.
+
+## 변경 이력
+
+- 2026-04-24 — 슬롯 UI 로딩 상태, Admin 승인/취소/수정 UI, status enum 검증 도입 (task 23 qa-contact-worker-v1)
+
+## 참조
+
+- `webhard-api/src/bookings/bookings.service.ts` — `getAvailableSlots` 응답 확장
+- `webhard-api/src/bookings/constants.ts` — `VisitBookingConstants` (task 23 신규 또는 기존)
+- `webhard-api/src/bookings/dto/update-booking.dto.ts` — enum 검증
+- `webhard-api/src/bookings/bookings.gateway.ts` — `booking:updated` / `booking:deleted` Socket 이벤트
+- `src/app/contact/ContactForm.tsx` — 슬롯 UI (`bookingAvailability` state)
+- `src/app/api/bookings/available/route.ts` — Next.js 프록시 (maxCapacity 전파)
+- `src/app/(admin)/admin/bookings/_components/BookingsCalendar.tsx` — Admin 예약 카드
+- `src/app/api/admin/bookings/[id]/route.ts` — admin 세션 gate (task 23 신규)
+- `docs/specs/features/design-system.md` — 버튼 / 모달 UI 컨벤션
````

## `docs/specs/features/worker-contact-classification.md`

````diff
diff --git a/docs/specs/features/worker-contact-classification.md b/docs/specs/features/worker-contact-classification.md
new file mode 100644
index 00000000..a7cf58a4
--- /dev/null
+++ b/docs/specs/features/worker-contact-classification.md
@@ -0,0 +1,90 @@
+# Worker Contact Classification — Worker 페이지 문의 분류 규칙
+
+## 개요
+
+- 목적: Worker 페이지의 Contact 분류(미분류 / 공정 시작 전 / 사무실 / 현장) 규칙을 명확히 정의한다.
+- 도메인: CRM > 문의 관리 > Worker 대시보드 탭 분류
+- 배경: QA 에서 공개 폼 접수 Contact 가 Worker 페이지에서 "미분류" 탭으로 잘못 분류되는 제보가 있었다. 기존 분류 로직은 `source='webhard'` 와 `inquiryType` 만 기준으로 삼아, 공개 폼(`source='website'`) 접수 Contact 의 맥락(공정 시작 전)을 반영하지 못했다. (task 23 qa-contact-worker-v1)
+
+## 분류 정의
+
+| 탭               | 조건                                                                                 | 의미                                                                                                     |
+| ---------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
+| **미분류**       | `source = 'webhard'` 이면서 `inquiryType = null` 인 Contact                          | 외부웹하드 동기화로 자유 폴더에 올라온 도면을 작업자가 수동으로 목형의뢰/칼선의뢰 중 분류하는 용도       |
+| **공정 시작 전** | `source = 'website'` (공개 폼 접수) Contact, `processStage` 가 `null` 또는 `drawing` | 공개 폼에서 접수되어 아직 사무실 공정을 시작하지 않은 상태. `inquiryType` 확정 여부와 무관하게 여기 포함 |
+| **사무실**       | `processStage IN ('drawing', 'sample')` 이면서 `inquiryType` 확정                    | 도면 작업 / 샘플 제작 단계                                                                               |
+| **현장**         | `processStage IN ('drawing_confirmed', 'laser', 'cutting', 'creasing', 'delivery')`  | 도면 확정 이후 현장 가공 ~ 납품 단계                                                                     |
+
+## 필터 조건 (`contacts.service.ts` `workCategory` 쿼리)
+
+```ts
+switch (workCategory) {
+  case 'unclassified':
+    where.source = 'webhard';
+    where.inquiryType = null;
+    where.status = { notIn: ['delivered', 'completed', 'deleting'] };
+    break;
+
+  case 'office':
+    where.OR = [
+      // (a) 공개 폼 접수 — 분류 여부 무관하게 공정 시작 전 포함
+      { source: 'website', processStage: { in: [null, 'drawing', 'sample'] } },
+      // (b) 외부 동기화 + 분류 확정 Contact
+      { inquiryType: { not: null }, processStage: { in: [null, 'drawing', 'sample'] } },
+    ];
+    break;
+
+  case 'field':
+    where.processStage = { in: ['drawing_confirmed', 'laser', 'cutting', 'creasing', 'delivery'] };
+    break;
+}
+```
+
+## Task 카드 표시 형식
+
+Worker 사무실 · 현장 · 공정 시작 전 탭의 카드 제목 영역은 다음 포맷을 따른다:
+
+```
+{업체명} - {inquiry_title ?? '미입력'} - {drawing_file_name ?? '파일 없음'}
+```
+
+- `inquiry_title` 이 null → `"미입력"` 으로 렌더
+- `drawing_file_name` 이 null → `"파일 없음"` 으로 렌더
+- 두 필드 모두 null 이라도 카드는 정상 렌더되어야 한다 (공개 폼 접수 직후 또는 외부 동기화 미분류 상태 대비)
+
+## 우클릭 컨텍스트 메뉴 "정보 보기"
+
+`inquiry-classification-ux.md` §2.2.1 의 "웹하드에서 열기" 와 동일한 방식으로 Worker 컨텍스트 메뉴에도 **"정보 보기"** 항목을 추가한다.
+
+- 위치: `src/app/worker/_components/WorkerContextMenu.tsx` — "웹하드에서 열기" 바로 아래, `<hr>` 구분선 위
+- 라벨: "정보 보기"
+- 아이콘: `lucide-react` 의 `Info`
+- 클릭 동작: `ContactInfoModal` 오픈 (Admin 과 동일 컴포넌트 재사용)
+- 컴포넌트: `src/components/contact/ContactInfoModal.tsx` — 기존 `ContactDetailView` read-only 래핑
+
+### `ContactInfoModal` 계약
+
+- Props: `{ contact: Contact; open: boolean; onClose: () => void }`
+- 내부에서 `ContactDetailView` 를 read-only 모드로 렌더. 편집 버튼 · 저장 버튼 노출 금지.
+- Worker / Admin 양쪽 컨텍스트 메뉴에서 동일 import 경로 사용.
+
+## 불변 규칙
+
+1. **공개 폼은 미분류에 포함되지 않는다**: `source='website'` Contact 는 `inquiryType` 이 null 이라도 미분류 탭에 떨어지지 않는다. 대신 공정 시작 전(사무실 탭) 로 자동 분류.
+2. **미분류 탭은 외부 동기화 전용**: `source='webhard' AND inquiryType=null` 이 유일한 미분류 조건.
+3. **카드 null 필드 허용**: `inquiry_title` / `drawing_file_name` 이 null 이더라도 카드 렌더링이 실패하지 않는다. 각 필드별 fallback 문자열("미입력" / "파일 없음") 을 사용.
+4. **"정보 보기" 는 Admin/Worker 공통**: 두 컨텍스트 메뉴가 동일한 `ContactInfoModal` 컴포넌트를 사용하여 정보 표시 일관성을 유지. 별도 컴포넌트 중복 정의 금지.
+5. **status 제외 조건 유지**: `unclassified` 필터는 `delivered` / `completed` / `deleting` Contact 를 제외한다 (이미 처리된 도면을 다시 분류하지 않기 위함).
+
+## 변경 이력
+
+- 2026-04-24 — 공개 폼 접수 Contact 의 Worker 페이지 분류 규칙 명시, "정보 보기" 메뉴 추가 (task 23 qa-contact-worker-v1)
+
+## 참조
+
+- `webhard-api/src/contacts/contacts.service.ts` — `workCategory` 필터 조건
+- `src/app/worker/_components/OfficeContactCard.tsx` / `StaffContactCard.tsx` — Worker 카드 렌더링
+- `src/app/worker/_components/WorkerContextMenu.tsx` — 우클릭 컨텍스트 메뉴 (task 22 "웹하드에서 열기" + task 23 "정보 보기")
+- `src/components/contact/ContactInfoModal.tsx` — Contact 정보 보기 모달 (task 23 신규)
+- `docs/specs/features/worker-portal.md` — Worker 대시보드 UX 베이스라인
+- `docs/specs/features/inquiry-classification-ux.md` §2.2.1 — 컨텍스트 메뉴 공통 패턴
````

## `docs/거래처-웹하드-폴더-안내.md`

````diff
diff --git a/docs/거래처-웹하드-폴더-안내.md b/docs/거래처-웹하드-폴더-안내.md
index bcbc2a32..f230ce94 100644
--- a/docs/거래처-웹하드-폴더-안내.md
+++ b/docs/거래처-웹하드-폴더-안내.md
@@ -49,3 +49,53 @@
 - 폴더가 없는 경우 업체 폴더에 직접 올려주시면 됩니다
 - 관리자 분류 후 자동으로 `칼선의뢰` 또는 `목형의뢰` 하위의 `문의-{번호}` 폴더로 정리됩니다.
 - 문의사항은 유선(전화)으로 연락 부탁드립니다
+
+---
+
+## 웹사이트 문의 폼으로 도면 제출 (2026-04-24 추가)
+
+LGU+ 웹하드 대신 **홈페이지 문의 폼** 으로도 도면을 제출할 수 있습니다.
+
+### 허용 파일 형식
+
+- 도면 파일: **AI, DXF, DWG, PDF**
+- 이미지: JPG, JPEG, PNG, GIF
+- 압축 파일: ZIP, RAR
+
+> AI (Adobe Illustrator) 파일도 정상 업로드됩니다. 확장자 제한 때문에 올라가지 않던 이전 문제는 수정되었습니다.
+
+### 문의 폼 접수 시 폴더 구조
+
+문의 폼에서 도면을 첨부하면 다음 경로로 **자동 정리** 됩니다:
+
+```
+{업체명}/
+  └── 문의/
+        └── {패키지명}-{문의번호}/
+              └── 첨부하신 도면
+```
+
+- **패키지명**: 문의 폼에 입력하신 `문의 제목` 이 자동으로 사용됩니다.
+- **문의번호**: 접수 순서대로 자동 부여됩니다 (예: `260424-O-003`).
+- 유선으로 "{업체명} {패키지명}" 만 말씀해 주시면 바로 찾을 수 있습니다.
+
+### 외부웹하드(LGU+) 동기화 문의의 경우
+
+LGU+ 로 올리신 도면은 패키지명이 없으므로, 첫 번째 업로드 파일명을 기반으로 폴더명이 생성됩니다.
+
+```
+{업체명}/
+  └── 문의/
+        └── {파일명}-{문의번호}/
+              └── 동기화된 도면
+```
+
+---
+
+### 요약: 3 가지 도면 제출 경로
+
+| 경로                                     | 폴더 자동 생성       | 분류 방식               |
+| ---------------------------------------- | -------------------- | ----------------------- |
+| LGU+ `칼선의뢰` / `목형의뢰` 폴더 업로드 | 자동                 | 유형 자동 분류          |
+| LGU+ 업체 폴더 직접 업로드               | 자동 (파일명 기반)   | 수동 분류 (관리자 확인) |
+| 홈페이지 문의 폼                         | 자동 (패키지명 기반) | 폼에서 선택한 유형      |
````
