# Worker Contact Classification — Worker 페이지 문의 분류 규칙

## 개요

- 목적: Worker 페이지의 Contact 분류(미분류 / 공정 시작 전 / 사무실 / 현장) 규칙을 명확히 정의한다.
- 도메인: CRM > 문의 관리 > Worker 대시보드 탭 분류
- 배경: QA 에서 공개 폼 접수 Contact 가 Worker 페이지에서 "미분류" 탭으로 잘못 분류되는 제보가 있었다. 기존 분류 로직은 `source='webhard'` 와 `inquiryType` 만 기준으로 삼아, 공개 폼(`source='website'`) 접수 Contact 의 맥락(공정 시작 전)을 반영하지 못했다. (task 23 qa-contact-worker-v1)

## 분류 정의

| 탭               | 조건                                                                                 | 의미                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **미분류**       | `source = 'webhard'` 이면서 `inquiryType = null` 인 Contact                          | 외부웹하드 동기화로 자유 폴더에 올라온 도면을 작업자가 수동으로 목형의뢰/칼선의뢰 중 분류하는 용도       |
| **공정 시작 전** | `source = 'website'` (공개 폼 접수) Contact, `processStage` 가 `null` 또는 `drawing` | 공개 폼에서 접수되어 아직 사무실 공정을 시작하지 않은 상태. `inquiryType` 확정 여부와 무관하게 여기 포함 |
| **사무실**       | `processStage IN ('drawing', 'sample')` 이면서 `inquiryType` 확정                    | 도면 작업 / 샘플 제작 단계                                                                               |
| **현장**         | `processStage IN ('drawing_confirmed', 'laser', 'cutting', 'creasing', 'delivery')`  | 도면 확정 이후 현장 가공 ~ 납품 단계                                                                     |

## 필터 조건 (`contacts.service.ts` `workCategory` 쿼리)

```ts
switch (workCategory) {
  case 'unclassified':
    where.source = 'webhard';
    where.inquiryType = null;
    where.status = { notIn: ['delivered', 'completed', 'deleting'] };
    break;

  case 'office':
    where.OR = [
      // (a) 공개 폼 접수 — 분류 여부 무관하게 공정 시작 전 포함
      { source: 'website', processStage: { in: [null, 'drawing', 'sample'] } },
      // (b) 외부 동기화 + 분류 확정 Contact
      { inquiryType: { not: null }, processStage: { in: [null, 'drawing', 'sample'] } },
    ];
    break;

  case 'field':
    where.processStage = { in: ['drawing_confirmed', 'laser', 'cutting', 'creasing', 'delivery'] };
    break;
}
```

## 공개 문의 폼 자동 분류 (drawing_type 기반)

공개 폼(`/contact`) 으로 접수되는 Contact 는 폼 옵션을 기반으로 `inquiryType` 이 자동 결정되어야 한다. Worker 가 [칼선의뢰] / [목형의뢰] 분류 버튼을 다시 누르지 않아도 되도록 하기 위함.

| 폼 옵션                                             | 자동 분류         | status      | processStage        | 흐름                                    |
| --------------------------------------------------- | ----------------- | ----------- | ------------------- | --------------------------------------- |
| `service_mold_request=true` (개인 "목형만 제작")    | `mold_request`    | `confirmed` | `drawing_confirmed` | 현장 직행                               |
| `drawing_type='have'` (도면 준비됨, 바로 목형 의뢰) | `mold_request`    | `confirmed` | `drawing_confirmed` | 현장 직행                               |
| `drawing_type='create'` (샘플 제작 필요)            | `cutting_request` | `received`  | `null`              | 사무실 "공정 시작 전" → [도면작업 시작] |
| 위 어느 조건에도 해당 안 됨                         | `null`            | `received`  | `null`              | (worker 가 수동 분류 필요)              |

### 적용 위치

- `src/lib/utils/contactDataProcessor.ts::prepareContactInsertData` — frontend 가 `inquiryType`/`status`/`processStage` 를 명시적으로 채워서 NestJS 로 전송. 비워서 보내면 NestJS create 의 `dto.status ?? autoStatus ?? 'received'` 분기에서 `dto.status='received'` 가 항상 우선되어 자동 분류가 무력화된다.
- 위 매핑은 NestJS `webhard-api/src/contacts/contacts.service.ts::create` 의 `autoStatus` / `autoProcessStage` 매핑과 1:1 동기화 유지.

### 효과

- 공개 폼 Contact 는 더 이상 `inquiryType=null` 로 떨어지지 않으므로 `onContactCreated` hook (phase 2) 이 정상 작동 → `{업체명}/문의/{패키지명-문의번호}` 폴더 자동 생성 + 첨부 파일 이동.
- Worker UI 의 카드 분기 `!contact.inquiry_type ? <InquiryClassifyButtons> : <OfficeAdvanceButton>` 에서 자동으로 `OfficeAdvanceButton` 로 분기되어 [작업 시작] / [샘플제작 전환] / [도면 확정] 같은 단계 전진 버튼만 노출.
- 외부 동기화(`source='webhard'`) Contact 는 자동 분류 대상이 아니므로 그대로 [칼선의뢰] / [목형의뢰] 분류 UI 유지.

## Task 카드 표시 형식

Worker 사무실 · 현장 · 공정 시작 전 탭의 카드 제목 영역은 다음 포맷을 따른다:

```
{업체명} - {inquiry_title ?? '미입력'} - {drawing_file_name ?? '파일 없음'}
```

- `inquiry_title` 이 null → `"미입력"` 으로 렌더
- `drawing_file_name` 이 null → `"파일 없음"` 으로 렌더
- 두 필드 모두 null 이라도 카드는 정상 렌더되어야 한다 (공개 폼 접수 직후 또는 외부 동기화 미분류 상태 대비)

## 우클릭 컨텍스트 메뉴 "정보 보기"

`inquiry-classification-ux.md` §2.2.1 의 "웹하드에서 열기" 와 동일한 방식으로 Worker 컨텍스트 메뉴에도 **"정보 보기"** 항목을 추가한다.

- 위치: `src/app/worker/_components/WorkerContextMenu.tsx` — "웹하드에서 열기" 바로 아래, `<hr>` 구분선 위
- 라벨: "정보 보기"
- 아이콘: `lucide-react` 의 `Info`
- 클릭 동작: `ContactInfoModal` 오픈 (Admin 과 동일 컴포넌트 재사용)
- 컴포넌트: `src/components/contact/ContactInfoModal.tsx` — 기존 `ContactDetailView` read-only 래핑

### `ContactInfoModal` 계약

- Props: `{ contact: Contact; open: boolean; onClose: () => void }`
- 내부에서 `ContactDetailView` 를 read-only 모드로 렌더. 편집 버튼 · 저장 버튼 노출 금지.
- Worker / Admin 양쪽 컨텍스트 메뉴에서 동일 import 경로 사용.

## 불변 규칙

1. **공개 폼은 미분류에 포함되지 않는다**: `source='website'` Contact 는 `inquiryType` 이 null 이라도 미분류 탭에 떨어지지 않는다. 대신 공정 시작 전(사무실 탭) 로 자동 분류.
2. **미분류 탭은 외부 동기화 전용**: `source='webhard' AND inquiryType=null` 이 유일한 미분류 조건.
3. **카드 null 필드 허용**: `inquiry_title` / `drawing_file_name` 이 null 이더라도 카드 렌더링이 실패하지 않는다. 각 필드별 fallback 문자열("미입력" / "파일 없음") 을 사용.
4. **"정보 보기" 는 Admin/Worker 공통**: 두 컨텍스트 메뉴가 동일한 `ContactInfoModal` 컴포넌트를 사용하여 정보 표시 일관성을 유지. 별도 컴포넌트 중복 정의 금지.
5. **status 제외 조건 유지**: `unclassified` 필터는 `delivered` / `completed` / `deleting` Contact 를 제외한다 (이미 처리된 도면을 다시 분류하지 않기 위함).

## 변경 이력

- 2026-04-24 — 공개 폼 접수 Contact 의 Worker 페이지 분류 규칙 명시, "정보 보기" 메뉴 추가 (task 23 qa-contact-worker-v1)
- 2026-04-27 — 공개 문의 폼 자동 분류 정책 추가 (`drawing_type='have'→mold_request`, `drawing_type='create'→cutting_request`). frontend `prepareContactInsertData` 가 명시적으로 `inquiryType`/`status`/`processStage` 를 채우도록 변경. (task 23 hotfix)
- 2026-04-27 — hotfix v2: `drawing_type='create'` 의 status/processStage 를 `received`/`null` 로 변경. cutting_request 분류는 유지하되 worker 가 사무실 "공정 시작 전" 탭에서 [도면작업 시작] 버튼으로 도면 단계 진행. 직전 hotfix 가 `drawing/drawing` 으로 매핑하여 "공정 시작 전" 필터 누락 + [도면작업 시작] 버튼 미노출 회귀를 수정. NestJS `contacts.service.create()` 의 `autoStatus`/`autoProcessStage` 도 동기화. (task 23 hotfix v2 R4)

## 참조

- `webhard-api/src/contacts/contacts.service.ts` — `workCategory` 필터 조건
- `src/app/worker/_components/OfficeContactCard.tsx` / `StaffContactCard.tsx` — Worker 카드 렌더링
- `src/app/worker/_components/WorkerContextMenu.tsx` — 우클릭 컨텍스트 메뉴 (task 22 "웹하드에서 열기" + task 23 "정보 보기")
- `src/components/contact/ContactInfoModal.tsx` — Contact 정보 보기 모달 (task 23 신규)
- `docs/specs/features/worker-portal.md` — Worker 대시보드 UX 베이스라인
- `docs/specs/features/inquiry-classification-ux.md` §2.2.1 — 컨텍스트 메뉴 공통 패턴
