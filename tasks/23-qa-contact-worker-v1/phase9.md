# Phase 9: 문서 동기화 + 마무리 (docs-sync-wrap)

## 사전 준비

먼저 아래 문서를 반드시 읽어라:

- `docs/changelog/CHANGELOG.md` — 이전 task(task 20, 21, 22) 의 기록 포맷 확인. 동일 포맷으로 이번 task 를 기록한다.
- `docs/features-list.md` — 기능 상태 목록. 이번 task 관련 항목들의 갱신 위치 확인.
- `docs/specs/db/prisma-tables.md` — DB 모델 문서. 이번 task 에서 schema 변경이 있었으면 반영 (예: VisitBooking status enum 명시).
- Phase 0 에서 작성된 4 개 신규 spec 문서 — 최종 정책.
- Phase 0 에서 업데이트된 `drawing-workflow.md` §W.1, `integration.md`, `webhard.md`, `거래처-웹하드-폴더-안내.md`.
- `/tasks/23-qa-contact-worker-v1/docs-diff.md` — Phase 0 문서 변경 기록.
- `.claude/rules/spec-code-sync.md` — Spec-Code 동기화 규칙.

그리고 이전 phase 의 산출물을 모두 확인하라 (Phase 1~8 결과):

- **Phase 1**: `src/lib/utils/file-upload-policy.ts` 신규, 4 개 업로드 UI 파일 수정
- **Phase 2**: `webhard-api/src/common/inquiry-filename.util.ts` 확장, `webhard-api/src/contacts/contact-folder-sync.service.ts` 신규, `folders.service.ts` 수정
- **Phase 3**: `webhard-api/src/integration/orders/auto-contact.service.ts` companyName 정규화, `contacts.service.ts:1453` insensitive
- **Phase 4**: `contacts.service.ts:96-114` workCategory 필터 확장, `OfficeContactCard.tsx:243-249` 3 단 표시, `WorkerContextMenu.tsx` 정보보기 추가, `src/components/contact/ContactInfoModal.tsx` 신규
- **Phase 5**: `contacts.service.ts:876-1034` updateProcessStage silent fail 제거, `ensureInquiryFolder` throw 정책
- **Phase 6**: `src/app/worker/_components/OfficeAdvanceButton.tsx` + `src/app/(admin)/admin/contacts/[id]/update-process-stage-button.tsx` 에러 분기, `src/lib/utils/stage-transition-errors.ts` 신규 유틸 (공용 `ErrorModal` 은 만들지 않음)
- **Phase 7**: `ContactForm.tsx` 슬롯 UX 스켈레톤, `bookings.service.ts:206` maxCapacity
- **Phase 8**: `UpdateBookingDto` IsIn enum 추가, `src/app/(admin)/admin/bookings/BookingsCalendar.tsx` (경로 `_components/` 아님) 액션 버튼, admin 전용 Next.js API route `src/app/api/admin/bookings/[id]/route.ts` 신규 (admin 세션 검증은 여기서), `BookingEditModal.tsx` 신규 가능

## 작업 내용

### 1. Spec-Code 정합성 최종 검증

Phase 1~8 에서 구현한 코드를 다시 훑으며, Phase 0 이 작성한 문서와 **불일치가 없는지** 확인한다. 불일치가 있으면:

- 코드가 맞고 문서가 틀렸다 → 문서 수정
- 문서가 맞고 코드가 틀렸다 → 해당 phase 의 코드를 수정 (이 phase 에서 함께 커밋)

체크 포인트:

- `DRAWING_UPLOAD_ALLOWED_EXTENSIONS` 상수가 `contact-file-upload.md` 에 기록된 목록과 일치하는가?
- `buildInquiryFolderName` 시그니처가 `contact-webhard-folder.md` 에 기록된 대로인가? (packageLabel / filenameFallback)
- `ContactFolderSyncService` 의 3 개 메서드(`onContactCreated`, `onInquiryTypeClassified`, `onProcessStageChanged`) 가 실제로 구현되어 있고 호출처에서 사용되는가?
- `findByCompany` insensitive 매칭이 적용되었는가?
- Auto-contact `createNewContact` 가 `matchedCompany.companyName` 을 Contact.companyName 에 저장하는가?
- Worker `workCategory` 필터가 `source='website'` Contact 를 공정 시작 전에 포함하는가?
- `OfficeContactCard` 가 `업체명 - inquiry_title - drawing_file_name` 3 단으로 표시하는가?
- `WorkerContextMenu` 에 "정보 보기" 가 최상단에 있고 `ContactInfoModal` 을 오픈하는가?
- `updateProcessStage` 가 workNumber 존재 여부와 무관하게 rename/ensure/relocate 를 실행하는가?
- `ensureInquiryFolder` null + `nextStage='drawing_confirmed'` 에서 422 에러를 throw 하는가?
- Worker `OfficeAdvanceButton` + Admin `update-process-stage-button` 양쪽이 `mapStageTransitionError` 를 통해 `INQUIRY_NUMBER_REQUIRED` / `FOLDER_CREATION_FAILED` 를 분기 처리하는가?
- 슬롯 UI 가 로딩 중에 `available=false` 기본값으로 disabled 되는가?
- `bookings.service.getAvailableSlots` 응답에 `maxCapacity` 필드가 있는가?
- `UpdateBookingDto` 의 status 필드가 `@IsIn(['pending','confirmed','cancelled'])` 검증을 거치는가?
- `BookingsCalendar` 예약 카드에 승인/취소/수정 버튼이 렌더되는가?

### 2. `docs/changelog/CHANGELOG.md` 기록

이전 task(20, 21, 22) 의 포맷을 따라 새 엔트리 추가. 날짜 2026-04-24 (task 23 created_at 기준).

포함할 내용:

```markdown
## 2026-04-24 — QA followup v1 (task 23 qa-contact-worker-v1)

### 변경 사항

**이슈 1**: 공개 문의 폼 도면 업로드 확장자 단일 상수화

- `src/lib/utils/file-upload-policy.ts` 신규 — `DRAWING_UPLOAD_ALLOWED_EXTENSIONS` 단일 상수
- 공개 폼·ContactCardToggle·Worker·Company 업로드가 모두 공통 상수 사용
- 누락되었던 `.ai` (Illustrator) 파일 허용

**이슈 2**: 방문 예약 슬롯 UX + admin 관리

- 슬롯 로딩 상태 스켈레톤 추가, 로딩 중 기본값 "가용 false" 로 변경 (버그 수정)
- `getAvailableSlots` 응답에 `maxCapacity` 필드 추가
- `BookingsCalendar` 에 승인/취소/수정 버튼 추가
- `UpdateBookingDto` status enum 검증 (`@IsIn`)

**이슈 3**: Worker 페이지 Contact 분류 · 카드 · 정보 보기

- 공개 폼 접수 Contact 를 "공정 시작 전" 필터에 자동 포함 (source='website')
- 미분류 탭은 외부웹하드 자유 폴더 파일 전용으로 유지
- Task 카드 표시 형식: `업체명 - 패키지명 - 파일명`
- Worker 컨텍스트 메뉴에 "정보 보기" 추가, `ContactInfoModal` (ContactDetailView 재사용) 모달

**이슈 4**: 사무실→현장 전환 silent fail 제거

- `updateProcessStage` 에서 workNumber 존재 여부와 무관하게 폴더 rename/ensure/relocate 실행
- `ensureInquiryFolder` null + drawing_confirmed 에서 422 에러 throw
- 프론트 `OfficeAdvanceButton` 이 `INQUIRY_NUMBER_REQUIRED` / `FOLDER_CREATION_FAILED` 에러 분기 표시

**이슈 5**: 외부웹하드 자동생성 Contact 대시보드 노출

- `AutoContactService.createNewContact` 에서 `Company.companyName` 정규형으로 저장 (폴더명 원본 X)
- `findByCompany` insensitive match 로 변종 표기 허용

**이슈 6**: 외부웹하드 동기화 Contact 폴더 정책 통합

- `ContactFolderSyncService` 단일 진입점 구축 (일반 문의 + 외부동기화 공통)
- `inquiryType` 확정 시 즉시 폴더 생성 + 파일 relocate
- 미분류 상태는 폴더 미생성 유지 (분류 확정 훅에서 생성)
- `buildInquiryFolderName` 에 packageLabel + filenameFallback 지원

### Breaking change

없음. API 응답 shape 은 `BookingAvailability` 에 `maxCapacity` 필드 **추가** (기존 필드 유지).
`updateProcessStage` 에러 응답이 422 로 변경될 수 있으나 클라이언트는 기존대로 `success: false` 로 처리.

### 주요 파일

- **Backend 신규**: `webhard-api/src/contacts/contact-folder-sync.service.ts`
- **Backend 수정**: `contacts.service.ts`, `auto-contact.service.ts`, `folders.service.ts`, `inquiry-filename.util.ts`, `bookings.service.ts`, `update-booking.dto.ts`
- **Frontend 신규**: `src/lib/utils/file-upload-policy.ts`, `src/components/contact/ContactInfoModal.tsx`
- **Frontend 신규**: `src/lib/utils/file-upload-policy.ts`, `src/components/contact/ContactInfoModal.tsx`, `src/lib/utils/stage-transition-errors.ts`, `src/app/api/admin/bookings/[id]/route.ts`
- **Frontend 수정**: `ContactForm.tsx`, `ContactCardToggle.tsx`, `OfficeContactCard.tsx`, `WorkerContextMenu.tsx`, `WorkerDrawingUpload.tsx`, `CompanyDrawingUpload.tsx`, `src/app/worker/_components/OfficeAdvanceButton.tsx`, `src/app/(admin)/admin/contacts/[id]/update-process-stage-button.tsx`, `src/app/(admin)/admin/bookings/BookingsCalendar.tsx`, `src/app/api/bookings/available/route.ts` (maxCapacity 전파), Server Action `src/app/actions/contacts.ts` (updateProcessStage error shape)
```

### 3. `docs/features-list.md` 상태 갱신

다음 항목 추가/갱신:

- "공개 문의 폼 도면 업로드 — 확장자 단일 상수화" (신규 or 업데이트)
- "방문 예약 — admin 승인/거절/수정 UI" (신규)
- "방문 예약 — 슬롯 로딩 UX" (신규)
- "Worker 페이지 — Contact 정보 보기 모달" (신규)
- "Worker 페이지 — 접수 Contact 공정 시작 전 자동 분류" (업데이트)
- "사무실→현장 전환 — silent fail 제거" (업데이트)
- "외부웹하드 자동 Contact — 업체 대시보드 노출 정상화" (업데이트)
- "Contact 웹하드 폴더 생성 훅 — 일반/동기화 통합" (업데이트)

기존 항목 구조 · 포맷 따라 작성.

### 4. `docs/specs/db/prisma-tables.md` 갱신 (변경 시)

- 이번 task 에서 Prisma schema 변경이 있었으면 (VisitBooking status enum 관련 등) 반영.
- 없으면 이 단계 skip.

### 5. 통합 AC 검증

전체 빌드 · 테스트 통과 확인:

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

```bash
pnpm lint
```

6 개 모두 통과해야 한다.

## Acceptance Criteria

위 6 개 검증 커맨드를 **병렬 실행** (단일 assistant 메시지 + Bash 6 개) 하여 모두 통과.

AC 만족 시 `/tasks/23-qa-contact-worker-v1/index.json` 의 phase 9 status 를 `"completed"` 로, 그리고 `/tasks/index.json` 의 task 23 status 를 `"completed"` 로 변경.

## AC 검증 방법

위 병렬 실행 결과 모두 통과 시 `"completed"` 처리. 하나라도 실패하면 원인에 따라:

- 문서·코드 불일치 → 1~4 단계 재수행 후 재검증
- 기존 phase 의 회귀 → 해당 phase 로 되돌아가 근본 원인 수정

3 회 이상 실패 시 `"error"` + `error_message` 기록.

## 주의사항

- **이 phase 에서 새 기능을 추가하지 마라**. 순수 문서 동기화 + 통합 검증. 코드 수정은 spec-code 불일치 해결 시에만 허용.
- CHANGELOG · features-list 작성 시 이전 task 포맷을 정확히 따라 일관성 유지. 이번 task 만 튀는 포맷 금지.
- 기존 CHANGELOG 엔트리를 지우거나 수정하지 마라 — 추가만.
- features-list 기존 항목 구조 유지. 새 항목 추가는 기존 섹션 내 적절한 위치에.
- 통합 AC 중 하나라도 깨지면 커밋 전 반드시 원인 파악 후 수정. "적당히 넘어가기" 금지 (CLAUDE.md "No Simplest Fix" 원칙).
- Phase 0 의 `docs-diff.md` 는 Phase 9 에서 다시 생성하지 않는다. Phase 0 완료 직후 자동 생성된 파일 그대로 유지.
- 한글 커밋: `docs(qa-contact-worker-v1): phase 9 — docs-sync-wrap`.
