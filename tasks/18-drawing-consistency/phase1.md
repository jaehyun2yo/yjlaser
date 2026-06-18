# Phase 1: filename-util

## 사전 준비

먼저 아래 코드/문서를 읽어 현재 파일명/폴더명 규칙의 분산 상태와 이번 phase 가 통일해야 할 범위를 이해하라:

- `tasks/18-drawing-consistency/phase0.md` 의 "저장 구조(새 규칙)" 및 "파일명 규칙(새 규칙)" 섹션 — 이번 유틸이 구현할 단일 규칙의 원천.
- `tasks/18-drawing-consistency/docs-diff.md` — phase 0 의 문서 변경 요약.
- `webhard-api/src/contacts/drawing-revision.service.ts:492~510` — `syncRevisionToWebhard` 의 현재 `${prefix}${file.name}` 로직. `prefix = contact.workNumber ? contact.workNumber + ' ' : ''`. **공백 구분** + **workNumber만** 쓰는 한계 확인.
- `webhard-api/src/contacts/contacts.service.ts:1450~1461`, `1572~1584` — 관리자 `drawing-download` / `file-download` 의 현재 `[${number}] ${originalName}` 로직. **status 기반** 번호 선택. `FIELD_STATUSES = ['production','cutting','finishing','delivered']`.
- `webhard-api/src/integration/orders/auto-contact.service.ts:382~409` — `updateFileNamePrefix` 의 현재 `${numberPrefix} ${originalName}` 로직.
- `webhard-api/src/number/number.service.ts` — `generateNumber('inquiry'|'work')` 의 O/F prefix 생성 규칙 확인.
- `webhard-api/prisma/schema.prisma` 의 `Contact` 모델 — `inquiryNumber`, `workNumber`, `processStage`, `inquiryType` 필드의 타입·nullable 여부.

이유: 이 유틸은 4개 호출 지점(phase 4) 과 `ensureInquiryFolder`(phase 5), 마이그레이션 스크립트(phase 7) 에서 공통으로 사용되므로, 현재의 분산 규칙을 정확히 파악한 뒤 단일 소스로 흡수해야 한다.

## 작업 내용

### 1. 신규 파일 `webhard-api/src/common/inquiry-filename.util.ts`

아래 타입/함수를 export 한다:

```ts
export const OFFICE_PROCESS_STAGES = new Set<string | null>([null, 'drawing', 'sample']);
export const FIELD_PROCESS_STAGES = new Set<string>([
  'drawing_confirmed',
  'laser',
  'cutting',
  'creasing',
  'delivery',
]);

export type InquiryFileContact = {
  inquiryNumber?: string | null;
  workNumber?: string | null;
  processStage?: string | null;
  inquiryType?: string | null;
};

export type InquiryFileRevision = {
  processStage?: string | null;
};

/** O/F 중 어느 번호를 파일명 prefix 로 쓸지 결정. null 이면 둘 다 없음. */
export function pickInquiryNumberForDownload(
  contact: InquiryFileContact,
  revision?: InquiryFileRevision
): string | null;

/** "[260420-F-004] 원본명.DXF" 또는 번호 없으면 원본명 그대로. */
export function buildInquiryFileName(params: {
  contact: InquiryFileContact;
  revision?: InquiryFileRevision;
  originalName: string;
}): string;

/** "문의-260417-O-002_260420-F-004" / "문의-260417-O-002" / "문의-260420-F-004" / null. */
export function buildInquiryFolderName(contact: {
  inquiryNumber?: string | null;
  workNumber?: string | null;
}): string | null;
```

### 2. `pickInquiryNumberForDownload` 규칙

1. `revision?.processStage` 가 `FIELD_PROCESS_STAGES` 에 속하면 → `contact.workNumber || contact.inquiryNumber`
2. `revision?.processStage` 가 `OFFICE_PROCESS_STAGES` 에 속하면 → `contact.inquiryNumber || contact.workNumber`
3. `revision?.processStage` 가 없으면 `contact.processStage` 로 동일 규칙 적용
4. 둘 다 없으면 `contact.inquiryType`:
   - `cutting_request` → `contact.inquiryNumber || contact.workNumber`
   - `mold_request` | `laser_cutting` → `contact.workNumber || contact.inquiryNumber`
   - 그 외 → `contact.inquiryNumber || contact.workNumber || null`

### 3. `buildInquiryFileName` 규칙

```
const picked = pickInquiryNumberForDownload(contact, revision);
return picked ? `[${picked}] ${originalName}` : originalName;
```

파일 확장자 보존, 원본명 내 `[` `]` 이스케이프 필요 없음 (단순 문자열 연결).

### 4. `buildInquiryFolderName` 규칙

```
const { inquiryNumber, workNumber } = contact;
if (!inquiryNumber && !workNumber) return null;
if (inquiryNumber && workNumber) return `문의-${inquiryNumber}_${workNumber}`;
return `문의-${inquiryNumber || workNumber}`;
```

O 가 항상 먼저, F 가 나중. 역순(F→O 발급) 은 운영상 드물고 이 규칙으로 고정해도 UX 해석 일관성 유지.

### 5. 유닛 테스트 `webhard-api/src/common/inquiry-filename.util.spec.ts`

아래 케이스를 **반드시** 커버:

- `pickInquiryNumberForDownload`:
  - revision.processStage='drawing_confirmed' + 양쪽 번호 → workNumber 반환
  - revision.processStage='drawing' + 양쪽 번호 → inquiryNumber 반환
  - revision 없음 + contact.processStage='laser' → workNumber 반환
  - contact.processStage 도 없음 + inquiryType='cutting_request' → inquiryNumber
  - inquiryType='mold_request' → workNumber
  - 둘 다 없고 inquiryType 도 null → workNumber 가 있으면 그것, 없으면 inquiryNumber, 없으면 null
- `buildInquiryFileName`:
  - 번호 있음 → `[번호] 원본명` 포맷
  - 번호 없음 → 원본명 그대로
  - 한글 파일명 유지
- `buildInquiryFolderName`:
  - O 만 → `문의-260417-O-002`
  - F 만 → `문의-260420-F-004`
  - 둘 다 → `문의-260417-O-002_260420-F-004`
  - 둘 다 없음 → null
  - 분할 문의 suffix 보존: `260417-O-002-1` / `260417-O-002-2` 그대로

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test -- --testPathPattern="inquiry-filename"
```

## AC 검증 방법

위 커맨드 실행 후 통과하면 `tasks/18-drawing-consistency/index.json` 의 phase 1 status 를 `"completed"` 로 변경. 3회 실패 시 `"error"`.

## 주의사항

- 이 phase 는 **순수 함수만** 작성. DB 조회·서비스 주입·Nest 데코레이터 금지.
- `status` (`'production'`, `'cutting'` 등) 는 **사용하지 않는다**. 오직 `processStage`, `inquiryType` 으로만 O/F 결정. 기존 `contacts.service.ts` 의 `FIELD_STATUSES` 배열은 phase 4 에서 삭제된다.
- 포맷 `[번호] 원본명` 의 공백은 **1개**. 대괄호와 원본명 사이.
- 번호가 없을 때 빈 대괄호 `[] 원본명` 금지.
- `buildInquiryFolderName` 의 `문의-` 접두는 한글 고정. 영어 `inquiry-` 로 바꾸지 마라 (운영 호환성).
- 유틸은 순수 함수 — 다른 phase 에서 import 만 해서 쓰도록. service class 만들지 마.
