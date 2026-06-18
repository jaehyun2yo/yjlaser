# Phase 0: 문서 업데이트 (docs-update)

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/drawing-workflow.md` §W.1 — **이번 task 의 폴더 생성 정책이 이 스펙의 불변 규칙에 정렬되어야 한다**. Task 20, 21, 22 의 업데이트 라인도 읽어 맥락 파악.
- `docs/specs/features/webhard-system.md` — 자체 웹하드 아키텍처. `{업체명}/문의/{폴더명}` 경로 구조의 근거.
- `docs/specs/features/worker-portal.md` — Worker 페이지의 문의 분류(미분류/사무실/현장) 정의. 이번 task 가 "공개 폼 접수 Contact = 공정 시작 전" 규칙을 추가.
- `docs/specs/features/inquiry-classification-ux.md` — Worker/Admin 컨텍스트 메뉴 스펙. "정보 보기" 항목이 Worker 에도 추가되어야 한다.
- `docs/specs/api/endpoints/webhard.md` — 웹하드 API. 폴더명 스키마 변경 반영.
- `docs/specs/api/endpoints/integration.md` — 외부 프로그램 API. Auto-contact companyName 정규화 정책 반영.
- `docs/specs/features/visit-booking.md` (있으면) 또는 관련 문서 — 방문 예약 시스템 현행.
- `docs/거래처-웹하드-폴더-안내.md` — 업체용 안내서. 폴더 구조 변경 반영.
- `docs/specs/features/auto-contact-exclude.md` — 자동 생성 Contact 제외 정책. 이번 task 에서 companyName 정규화와 충돌 없는지 확인.
- `CLAUDE.md` (project root) — 프로젝트 전역 컨벤션 (한글 응답, 커밋 규칙).

## 작업 내용

이번 task 의 코드 변경을 반영하기 위해 **4 개 신규 spec + 4 개 기존 문서 업데이트**를 수행한다. 코드 변경은 Phase 1 이후에서 수행한다.

### 1. `docs/specs/features/contact-file-upload.md` (신규)

공개 문의 폼 · Worker · Company 업로드가 공유할 확장자 허용 정책을 정의한다.

포함 내용:

- **단일 상수**: `src/lib/utils/file-upload-policy.ts` 의 `DRAWING_UPLOAD_ALLOWED_EXTENSIONS` 를 모든 업로드 UI 가 공유한다.
- **허용 확장자 목록**: `.pdf, .dxf, .ai, .dwg, .jpg, .jpeg, .png, .gif, .zip, .rar` (제조업 도면 파일 + 일반 이미지 + 압축).
- **서버측 차단**: `src/lib/utils/fileValidation.ts` 의 `DANGEROUS_EXTENSIONS` (`.exe, .bat, .cmd, .scr, .vbs, .js, .jar` 등) 는 그대로 유지. 업로드 UI 허용과 별개로 서버에서 magic byte + 확장자 두 레벨 차단.
- **적용 지점**: `src/app/contact/ContactForm.tsx` (drawing_file, reference_photos), `src/app/contact/_components/ContactCardToggle.tsx`, `src/app/worker/_components/WorkerDrawingUpload.tsx`, `src/app/company/orders/_components/CompanyDrawingUpload.tsx`.
- **변경 이력**: 2026-04-24 — 공개 폼 `.ai` 허용 누락 수정 및 단일 상수화 (task 23 qa-contact-worker-v1).

### 2. `docs/specs/features/contact-webhard-folder.md` (신규)

Contact ↔ WebhardFolder 연결 정책을 일반 문의와 외부웹하드 동기화 Contact 간 통일한다.

포함 내용:

- **폴더 경로 스키마**: `{업체명}/문의/{패키지명 or 파일명-slug}-{inquiryNumber}[_{workNumber}]`
  - 공개 폼: 패키지명 = Contact.inquiry_title 의 sanitize 결과
  - 외부웹하드 동기화: 패키지명 없음 → 첫 번째 첨부 파일명(확장자 제거 + slug) 으로 fallback
- **폴더 생성 시점**:
  - `inquiryType` 이 확정된 Contact: 생성 즉시 폴더 생성 + 파일 relocate
  - `inquiryType = null` (미분류): 폴더 생성 skip, 분류 확정 시 훅(`ContactFolderSyncService.onInquiryTypeClassified`) 으로 생성
- **공통 훅**: `webhard-api/src/contacts/contact-folder-sync.service.ts` (신규 — `_lib/` 서브디렉토리 없이 contacts 바로 하위). `ContactsService.create`, `ContactsService.updateInquiryType`, `ContactsService.updateProcessStage`, `AutoContactService.createNewContact` 가 이 서비스 사용.
- **폴더명 생성 유틸**: `webhard-api/src/common/inquiry-filename.util.ts` 의 `buildInquiryFolderName` 확장 (기존 파일 — `_lib/` 아님). 매개변수에 `packageLabel?: string | null` 추가, 없으면 `filenameFallback?: string | null` 사용, 둘 다 없으면 현행 `문의-{O}_{F}` 유지.
- **Silent fail 제거 범위**: `ensureInquiryFolder` 가 null 반환할 때의 처리 정책은 호출 맥락별로 다르다:
  - `onContactCreated` (신규 생성) / `onInquiryTypeClassified` (분류 확정): **warn+skip 유지**. Company 미등록 업체의 생성·분류 자체를 실패시키지 않기 위함 (UX 회귀 방지).
  - `onProcessStageChanged` (특히 `nextStage='drawing_confirmed'`): **명시적 throw**. 공정 확정 단계에서는 폴더 없이 진행 금지 (이슈 4 의 silent fail 제거). Phase 5 에서 구현.

### 3. `docs/specs/features/worker-contact-classification.md` (신규)

Worker 페이지의 Contact 분류(미분류/공정 시작 전/사무실/현장) 규칙을 명확히 한다.

포함 내용:

- **미분류**: `source = 'webhard'` (외부 동기화) 이면서 `inquiryType = null` 인 경우 전용. 자유 폴더에 올라온 도면을 작업자가 수동으로 목형의뢰/칼선의뢰 중 분류하는 용도.
- **공정 시작 전**: `source = 'website'` (공개 폼 접수) 인 Contact 는 `inquiryType` 과 무관하게 여기에 자동 포함. `processStage` 가 `null` 또는 `drawing` 이며 `inquiryType` 확정 전단계라도 작업자에게 "접수되었으니 공정 시작 준비" 상태로 보여준다.
- **필터 조건 (contacts.service.ts `workCategory`)**:
  - `unclassified`: `source = 'webhard' AND inquiryType IS NULL AND status NOT IN ('delivered','completed','deleting')`
  - `office`: `(source = 'website' AND processStage IN (NULL, 'drawing', 'sample')) OR (inquiryType IS NOT NULL AND processStage IN (NULL, 'drawing', 'sample'))`
  - `field`: `processStage IN ('drawing_confirmed', 'laser', 'cutting', 'creasing', 'delivery')` (현행 유지)
- **Task 카드 표시 형식**: `{업체명} - {inquiry_title ?? 미입력} - {drawing_file_name ?? 파일 없음}`. 두 필드 중 null 은 "미입력"/"파일 없음" 으로 렌더.
- **우클릭 "정보 보기"**: Worker 에도 추가. `src/components/contact/ContactInfoModal.tsx` 가 `ContactDetailView` read-only 래핑.

### 4. `docs/specs/features/visit-booking-admin.md` (신규)

방문 예약 시스템의 슬롯 UX 와 admin 관리 액션을 정의한다.

포함 내용:

- **슬롯 UI 로딩 상태**: `bookingAvailability` 가 초기 빈 객체 `{}` 일 때 슬롯 버튼은 "예약 가능" 기본값이 아닌 **"로딩 중"** 스켈레톤/비활성 상태로 표시. fetch 성공 후 실제 남은 자리 수(`count/maxCapacity`) 반영.
- **NestJS `getAvailableSlots` 응답**: `{ slots: { [timeSlot]: { count, maxCapacity, available } } }` 형태로 확장. 기존 하드코딩 `2` 를 `maxCapacity` 필드로 노출. 프론트에서 `>= maxCapacity` 비교.
- **Admin 예약 관리 UI** (`src/app/(admin)/admin/bookings/_components/BookingsCalendar.tsx`):
  - 예약 카드에 `승인 / 취소 / 수정` 버튼 추가
  - `PATCH /api/v1/bookings/:id` 엔드포인트 호출 (현재 구현됨, 프론트에서 UI 만 없음)
  - status 변경 시 Socket 이벤트 `booking:updated` 로 실시간 갱신
- **Status enum 검증**: `UpdateBookingDto` 의 `status` 필드에 `@IsIn(['confirmed', 'cancelled', 'pending'])` 추가. 현재 `String?` 으로 어떤 값이든 저장 가능한 문제 수정.

### 5. `docs/specs/api/endpoints/webhard.md` 업데이트

- **폴더명 스키마 변경 라인** 추가: `문의 폴더명은 {패키지명 or 파일명-slug}-{inquiryNumber}[_{workNumber}] 형식을 따른다 (task 23 qa-contact-worker-v1, 2026-04-24).`
- `buildInquiryFolderName` 확장 시그니처 기록 (packageLabel, filenameFallback 매개변수 추가).

### 6. `docs/specs/api/endpoints/integration.md` 업데이트

- **Auto-contact companyName 정규화** 정책 명시: 외부 프로그램이 `POST /api/v1/files/batch-confirm` 호출 시, Contact 생성에 사용되는 `companyName` 은 폴더명 원본이 아니라 `matchCompanyInfo` 가 매칭한 `Company.companyName` 정규형을 우선 사용. 매칭 실패 시 fallback 으로 폴더명 원본.
- **`findByCompany` insensitive match**: 업체 대시보드 조회의 하위 호환 보강.

### 7. `docs/specs/features/drawing-workflow.md` §W.1 업데이트

기존 불변 규칙 블록 상단 날짜 라인에 추가:

```
> 2026-04-24 업데이트 — Contact 생성/분류 확정/processStage 전환 시 폴더 생성 훅 단일화 (task 23 qa-contact-worker-v1). 미분류→분류 확정 시점에 ensureInquiryFolder + relocateContactFiles 시도. 단, Company 미등록 등으로 null 반환 시 생성·분류 단계에서는 warn+skip (UX 회귀 방지), `drawing_confirmed` 전환에서는 명시적 throw.
```

기존 task 20, 21, 22 업데이트 라인은 덮어쓰지 말고 아래에 덧붙인다.

추가할 규칙:

- `contact-folder-sync.service.ts` 가 단일 진입점. `ContactsService.create`, `updateInquiryType`, `updateProcessStage`, `AutoContactService.createNewContact` 모두 이 서비스를 경유한다.
- `updateProcessStage` 에서 `workNumber` 가 이미 존재하더라도 `drawing_confirmed` 로 전환되는 순간 폴더명 rename(`문의-{O}` → `문의-{O}_{F}`) 은 실행된다. 현재 `issueWorkNumber=false` 시 rename 을 skip 하는 로직은 **버그**이며 Phase 5 에서 수정.

### 8. `docs/거래처-웹하드-폴더-안내.md` 업데이트

업체용 안내에 아래 내용 추가:

- 웹사이트 문의 폼에서 AI, DXF, DWG 등 도면 파일을 업로드할 수 있음.
- 문의 접수 시 자동으로 `{업체명}/문의/{패키지명}-{문의번호}` 폴더가 생성되어 도면이 정리됨.
- 외부웹하드(LGU+) 동기화 문의는 패키지명 대신 파일명 기반 폴더명을 사용.

## Acceptance Criteria

이 phase 는 문서 변경만 수행하므로 빌드/테스트 검증은 생략한다. 대신 아래를 수행하라:

```bash
git diff --stat docs/
```

변경된 문서가 정확히 **4 개 신규 + 4 개 기존 업데이트 = 총 8 개** 인지 확인하라:

- 신규: `docs/specs/features/contact-file-upload.md`, `docs/specs/features/contact-webhard-folder.md`, `docs/specs/features/worker-contact-classification.md`, `docs/specs/features/visit-booking-admin.md`
- 수정: `docs/specs/api/endpoints/webhard.md`, `docs/specs/api/endpoints/integration.md`, `docs/specs/features/drawing-workflow.md`, `docs/거래처-웹하드-폴더-안내.md`

## AC 검증 방법

위 커맨드로 8 개 문서만 변경되었는지 확인하면, `/tasks/23-qa-contact-worker-v1/index.json` 의 phase 0 status 를 `"completed"` 로 변경하라.

변경된 문서가 8 개가 아니거나 엉뚱한 파일이 포함되었으면 수정하고 다시 확인. 3 회 이상 실패 시 `"error"` + `error_message` 기록.

## 주의사항

- **코드 파일을 변경하지 마라**. 이 phase 는 순수 문서 업데이트 전용.
- **기존 문서 내용을 덮어쓰지 마라**. 추가/삽입 위주로 작업. 기존 섹션 아래 또는 사이에 새 내용을 삽입.
- `drawing-workflow.md` 의 날짜 라인은 이전 task 들이 남긴 라인을 덮지 말고 아래에 덧붙일 것.
- `docs/changelog/CHANGELOG.md` 와 `docs/features-list.md` 는 **이 phase 에서 건드리지 마라**. Phase 9 에서 일괄 갱신.
- 한국어로 작성. 기존 문서 톤·포맷 유지.
- `docs-diff.md` 는 에이전트가 직접 작성하지 않는다. Phase 0 완료 후 `scripts/run-phases.py` 가 `scripts/gen-docs-diff.py` 를 자동 호출하여 생성한다.
- 커밋 메시지: `docs(qa-contact-worker-v1): phase 0 — docs-update`.
