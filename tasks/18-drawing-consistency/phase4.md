# Phase 4: filename-prefix-apply

## 사전 준비

- `tasks/18-drawing-consistency/phase1.md` — 공통 유틸 설계 확정 내용.
- `webhard-api/src/common/inquiry-filename.util.ts` — phase 1 산출물 (`buildInquiryFileName`, `pickInquiryNumberForDownload` 사용).
- `webhard-api/src/common/inquiry-filename.util.spec.ts` — phase 1 테스트 케이스 참고.
- `webhard-api/src/contacts/drawing-revision.service.ts:148~187` — `getRevisionDownloadUrl` 현재 로직. `fileName: file.name` 을 그대로 응답 (prefix 없음) — **이 phase 에서 `buildInquiryFileName` 로 교체**.
- `webhard-api/src/contacts/drawing-revision.service.ts:492~510` — `syncRevisionToWebhard` 의 `displayName = prefix + file.name`. **교체**.
- `webhard-api/src/contacts/contacts.service.ts:1450~1461`, `1572~1584` — 관리자 `drawing-download` / `file-download` 의 기존 `FIELD_STATUSES` 기반 `[${number}] ${originalName}`. **교체** (status 참조 제거).
- `webhard-api/src/integration/orders/auto-contact.service.ts:382~409` — `updateFileNamePrefix` 의 기존 `${numberPrefix} ${originalName}` 공백 포맷. **교체**.
- `docs/specs/features/drawing-revision-history.md` — phase 0 에서 업데이트된 파일명 포맷 spec.

이유: 현재 4곳의 파일명 규칙이 모두 달라서 타임라인·관리자 페이지·웹하드 UI·LGU+ sync 각 경로에서 서로 다른 이름이 나옴. phase 1 유틸 1개로 통일.

## 작업 내용

### 1. `getRevisionDownloadUrl` 교체

`webhard-api/src/contacts/drawing-revision.service.ts` 의 해당 메서드:

```ts
async getRevisionDownloadUrl(revisionId: string, fileIndex = 0) {
  const revision = await this.prisma.drawingRevision.findUnique({
    where: { id: revisionId },
    include: { contact: true },   // NEW — contact 필요
  });
  if (!revision) throw new NotFoundException(...);

  const files = revision.files as { url: string; name: string; ... }[];
  const file = files[fileIndex];
  if (!file) throw new NotFoundException(...);

  const key = extractKey(file.url);   // phase 6 에서 decodeURIComponent 추가
  const displayName = buildInquiryFileName({
    contact: revision.contact,
    revision: { processStage: revision.processStage },
    originalName: file.name,
  });

  const presigned = await this.storageService.getDownloadPresignedUrl(key, undefined, displayName);
  return { url: presigned.url, fileName: displayName };
}
```

### 2. 관리자 `drawing-download` / `file-download` 교체

`webhard-api/src/contacts/contacts.service.ts` 의 두 헬퍼 (line 1450 부근 / 1572 부근):

기존 `isFieldStatus` 체크 + `FIELD_STATUSES` 배열 참조 **제거**. 대체 로직:

```ts
const displayName = buildInquiryFileName({
  contact,
  revision: undefined, // contact.processStage 가 fallback
  originalName,
});
```

`FIELD_STATUSES = ['production','cutting','finishing','delivered']` 배열은 **완전히 삭제** (이 파일에서 더 이상 사용 안 함).

### 3. `syncRevisionToWebhard` 교체

같은 파일 (`drawing-revision.service.ts`) line 492~510 부근의 `WebhardFile.create` 직전 `displayName` 계산 부분:

```ts
const displayName = buildInquiryFileName({
  contact,
  revision: { processStage: revision.processStage },
  originalName: file.name,
});

await this.prisma.webhardFile.create({
  data: {
    name: displayName,         // 기존 "${workNumber} ${file.name}" 에서 교체
    originalName: file.name,
    ...
    inquiryNumber: contact.inquiryNumber ?? contact.workNumber ?? null,
  },
});
```

### 4. `updateFileNamePrefix` 교체

`webhard-api/src/integration/orders/auto-contact.service.ts:382~409`:

기존 `const fullName = ${numberPrefix} ${originalName}` 공백 포맷을 제거하고:

```ts
const fullName = buildInquiryFileName({
  contact: { inquiryNumber, workNumber, processStage, inquiryType },
  originalName: webhardFile.originalName,
});

await this.prisma.webhardFile.update({
  where: { id: webhardFile.id },
  data: { name: fullName },
});
```

### 5. 테스트

각 서비스 spec 에 케이스 추가:

- `drawing-revision.service.spec.ts`:
  - `getRevisionDownloadUrl` 가 `[번호] 원본명` 형식의 fileName 을 반환
  - revision.processStage 가 field 일 때 workNumber 가 prefix
  - revision.processStage 가 office 일 때 inquiryNumber 가 prefix
  - `syncRevisionToWebhard` 가 WebhardFile.name 에 동일 포맷 적용
- `contacts.service.spec.ts`:
  - `drawing-download` 와 `file-download` 가 `[${번호}] ${원본명}` 포맷 응답
  - `FIELD_STATUSES` 참조 제거 후 동작
- `auto-contact.service.spec.ts`:
  - `updateFileNamePrefix` 호출 시 WebhardFile.name 이 대괄호 포맷으로 업데이트

E2E HTTP 레벨 (Content-Disposition 헤더) 검증은 phase 9 에서.

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test -- --testPathPattern="drawing-revision|contacts|auto-contact|inquiry-filename"
```

## AC 검증 방법

통과 시 phase 4 status `"completed"`. 3회 실패 시 `"error"`.

## 주의사항

- 기존 `FIELD_STATUSES` 배열을 **삭제**. 같은 상수를 다른 곳에서 참조하지 않는지 `Grep` 으로 확인. 만약 다른 곳에 있으면 그것도 phase 1 유틸 기반으로 마이그레이션.
- `WebhardFile.originalName` 은 **건드리지 마라**. 오로지 `name` 필드만 교체. `originalName` 은 중복 체크 용도로 그대로 유지.
- Content-Disposition 헤더 인코딩 (`encodeURIComponent`) 는 phase 6 에서 robustness 개선. 이 phase 는 **displayName 계산** 만.
- 공백 구분 포맷 (`260420-F-004 원본명.DXF`) 은 **더 이상 생성하지 마라**. 모두 `[260420-F-004] 원본명.DXF` 대괄호 포맷.
- 기존 DB 의 WebhardFile.name 에 공백 구분 포맷으로 쌓인 기존 데이터는 phase 7 마이그레이션 스크립트가 rename 한다. 이 phase 는 **신규 생성만** 대괄호 포맷.
- 유틸 사용 시 `contact` 객체 전체가 아니라 필요한 필드만 추려서 넘기는 편이 타입 안정성 높다 (phase 1 에서 `InquiryFileContact` 타입 정의).
