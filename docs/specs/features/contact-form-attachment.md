# Contact Form Attachment — 공개 문의 폼 첨부 분류 정책

## 개요

- 목적: 공개 문의 폼(`/contact`) 의 파일 첨부가 NestJS Contact 의 `drawingFileUrl` / `referencePhotosUrls` 두 컬럼 중 어디로 분류되는지 정의한다.
- 도메인: CRM > 문의 관리 > 공개 폼 첨부 처리
- 배경: QA 라운드 2 에서 "샘플 제작 필요" 흐름의 자료 영역에 올린 파일이 모두 `reference_photos` 로만 저장되어 ContactDetailModal "첨부 파일" 영역에 도면이 누락되고, NestJS `createInitialRevision` 호출 조건(`drawingFileUrl` 존재)을 충족하지 못해 타임라인에도 반영되지 않는 회귀가 발견됐다.

## 분류 규칙

| 폼 흐름                                      | 노출되는 입력 영역                                   | drawing_file 컬럼             | reference_photos 컬럼 |
| -------------------------------------------- | ---------------------------------------------------- | ----------------------------- | --------------------- |
| `drawing_type='have'` (도면 보유, 목형 의뢰) | `drawing_file` 영역만 (도면 필수)                    | 사용자가 명시 첨부한 파일     | (보통 사용 안 함)     |
| `drawing_type='create'` (샘플 제작 필요)     | `hasReferencePhotos` 토글 시 자료 업로드 영역만 노출 | 자료 영역 첫 파일 (자동 승격) | 자료 영역 나머지 파일 |
| 그 외 (drawing_type 미선택)                  | 영역 미노출                                          | (없음)                        | (없음)                |

### 자동 승격 정책 (hotfix v2 R1)

`drawing_type !== 'have'` 흐름에서는 폼에 `drawing_file` 입력 영역이 노출되지 않는다. 사용자가 "샘플 제작에 필요한 도면이나 사진" 자료 영역에 첨부한 파일 중 첫 번째를 클라이언트 단에서 자동으로 `drawing` 으로 승격해 NestJS 로 전송한다.

- 적용 위치: `src/app/contact/ContactForm.tsx::onSubmit` — `formData.append('drawing_file', ...)` 직전에 승격 로직 수행
- 승격 조건 (모두 충족):
  1. `drawingType !== 'have'`
  2. `hasReferencePhotos === true`
  3. `drawingFile[0]` 미첨부 (사용자 명시 도면 우선 보존)
  4. `referencePhotosFiles.length > 0`
- 승격 결과:
  - `formData['drawing_file']` ← 자료 영역 첫 파일
  - `formData['reference_photos']` ← 자료 영역 나머지 파일들 (체크 해제 시 R3 가드로 차단)

### 효과

- ContactDetailModal "첨부 파일" 영역의 `FileItem (도면)` 슬롯에 자동 승격된 파일이 표시.
- NestJS `contacts.service.create()` 의 트랜잭션에서 `created.drawingFileUrl` 이 채워지므로 `createInitialRevision` 이 호출되어 `DrawingRevision` 1건 생성 + 타임라인 `drawing_revision` 항목 자동 등록.
- `referencePhotosUrls` 는 나머지 자료 파일들로 채워져 ContactDetailView "참고 사진" 영역에 정상 표시.

## 알려진 한계 — 폴더 이동 (후속 task)

`relocateContactFiles` (`webhard-api/src/folders/folders.service.ts:1633`) 는 `DrawingRevision.webhardFileIds` 또는 `WebhardFile.inquiryNumber` 매칭 파일만 폴더로 이동한다. 공개 폼 제출 시 reference 파일은 R2 storage 에는 업로드되지만 `WebhardFile` 테이블에 등록되지 않으므로, 자체 웹하드 `{업체}/문의/{패키지명-문의번호}/` 폴더로 자동 이동되지 않는다.

본 hotfix v2 는 ContactDetailModal/타임라인 표시 정합성까지만 처리한다. reference 파일까지 폴더로 이동하는 흐름은 후속 task 에서 다음 중 하나의 방식으로 해결:

- (A) 폼 제출 시 reference URL 도 `WebhardFile` 로 등록 + `DrawingRevision.files` 에 추가 등록 (단일 initial revision 에 multi-file)
- (B) `Contact` ↔ `WebhardFile` 별도 매핑 테이블 (`ContactAttachment`) 도입
- (C) `relocateContactFiles` 에 `referencePhotosUrls` 직접 처리 분기 추가 (R2 URL 로부터 WebhardFile 생성 후 이동)

이 결정은 별도 디자인 단계에서 진행한다.

## 회귀 보호

- `src/__tests__/lib/utils/contactDataProcessor.test.ts` — 자동 분류 매핑 (R4) 회귀 테스트와 동일 그룹.
- ContactForm.tsx 의 클라이언트 승격 로직은 통합 테스트 부재 — manual QA 시나리오:
  1. `/contact` → "샘플 제작이 필요합니다" → "샘플 제작에 필요한 도면이나 사진이 있습니다" 체크 → 파일 1 개 첨부 → 제출
     - 기대: ContactDetailModal "첨부 파일" 에 도면 1 + 참고사진 0 표시, 타임라인에 `drawing_revision` 항목
  2. 같은 흐름에 파일 3 개 첨부 → 제출
     - 기대: 도면 1 (첫 번째) + 참고사진 2 (나머지), 타임라인 `drawing_revision`
  3. drawing_type='have' 흐름에 도면 + 참고사진 별도 첨부
     - 기대: 사용자 명시 도면 보존, 자동 승격 미발생
  4. 체크박스 토글 후 해제 → 제출
     - 기대: R3 가드로 reference_photos 미전송, drawing 승격도 미발생

## 변경 이력

- 2026-04-27 — hotfix v2 R1 신규 spec. `drawing_type='create'` 흐름의 자료 영역 첫 파일 자동 drawing 승격 정책 명시. 폴더 이동 한계는 후속 task 로 분리. (task 23 hotfix v2 R1)

## 참조

- `src/app/contact/ContactForm.tsx` — 폼 제출 (자동 승격 로직)
- `src/app/actions/contacts.ts::submitContact` — server action (R2 업로드)
- `webhard-api/src/contacts/contacts.service.ts::create` — `createInitialRevision` 호출 조건
- `webhard-api/src/contacts/drawing-revision.service.ts::createInitialRevision` — DrawingRevision + WebhardFile 등록
- `webhard-api/src/folders/folders.service.ts::relocateContactFiles` — 폴더 이동 (현 한계)
- `docs/specs/features/worker-contact-classification.md` — 공개 폼 자동 분류 (R4) 와 인접 도메인
