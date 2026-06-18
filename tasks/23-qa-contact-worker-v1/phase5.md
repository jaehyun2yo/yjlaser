# Phase 5: 사무실 → 현장 전환 Silent Fail 제거 — 백엔드 (stage-transition-backend)

## 사전 준비

먼저 아래 문서를 반드시 읽어라:

- `docs/specs/features/drawing-workflow.md` §W.1 (Phase 0 업데이트 포함) — **이번 phase 의 불변 규칙**. `workNumber` 존재 여부와 무관하게 rename 실행, silent skip 금지.
- `docs/specs/features/contact-webhard-folder.md` (Phase 0 신규) — 폴더 생성 훅 단일화 정책. Phase 2 에서 만든 `ContactFolderSyncService.onProcessStageChanged` 를 여기서 활용.
- `/tasks/23-qa-contact-worker-v1/docs-diff.md` — Phase 0 문서 변경 기록.
- Phase 2 산출물 (`ContactFolderSyncService`, `buildInquiryFolderName` 확장).
- Phase 3 산출물 (Auto-contact companyName 정규화) — 전환되는 Contact 중 외부동기화 출처가 있을 수 있어 맥락 파악.

그리고 현재 구조를 이해하라:

- `webhard-api/src/contacts/contacts.service.ts:876` `updateProcessStage` 진입점.
- `webhard-api/src/contacts/contacts.service.ts:981-1034` 트랜잭션 내 전환 로직. 버그 지점 다수:
  - Line 989-998: `issueWorkNumber` 조건 — `existing.workNumber` 있으면 rename 자체를 skip
  - Line 1029: `renameInquiryFolderForContact` — `buildInquiryFolderName` 이 null 반환 시 no-op
  - Line 1030-1033: `ensureInquiryFolder` + `relocateContactFiles` — null 반환 시 조용히 skip
- `webhard-api/src/folders/folders.service.ts:1380-1388` `ensureInquiryFolder` null 반환 분기.
- `webhard-api/src/folders/folders.service.ts:1468-1497` `renameInquiryFolderForContact`.

## 작업 내용

### 1. `updateProcessStage` 의 `issueWorkNumber` 조건 수정

`webhard-api/src/contacts/contacts.service.ts:989-998` — `workNumber` 이미 존재 시 rename skip 로직이 버그.

현재 (개념):

```ts
const issueWorkNumber =
  !existing.workNumber && nextStage === 'drawing_confirmed';

if (!issueWorkNumber) {
  // 단순 update. 폴더 rename / ensureInquiryFolder 모두 skip
  return this.prisma.contact.update({ ... });
}

// 트랜잭션으로 workNumber 발급 + rename
return this.prisma.$transaction(async (tx) => {
  const workNumber = await issueNewWorkNumber(tx);
  await tx.contact.update({ ... });
  await renameInquiryFolderForContact(tx, contactId);
  await ensureInquiryFolder(tx, contactId);
  await relocateContactFiles(tx, contactId);
});
```

문제: workNumber 가 이미 있는데 다시 `drawing_confirmed` 로 전환 시(예: 되돌렸다 다시 전진, 또는 동기화된 Contact 가 이미 workNumber 보유) 폴더 rename 과 파일 relocate 가 실행되지 않음.

수정:

```ts
const willIssueNewWorkNumber = !existing.workNumber && nextStage === 'drawing_confirmed';

return this.prisma.$transaction(async (tx) => {
  if (willIssueNewWorkNumber) {
    const workNumber = await issueNewWorkNumber(tx);
    await tx.contact.update({
      where: { id: contactId },
      data: { workNumber, processStage: nextStage /* ... */ },
    });
  } else {
    await tx.contact.update({
      where: { id: contactId },
      data: { processStage: nextStage /* ... */ },
    });
  }

  // 핵심: 폴더 rename / ensure / relocate 는 workNumber 발급 여부와 무관하게 실행
  await this.contactFolderSync.onProcessStageChanged({
    contactId,
    client: tx,
    previousStage: existing.processStage,
    nextStage,
  });
});
```

`this.contactFolderSync` 는 Phase 2 에서 만든 서비스. `ContactsService` 에 DI. `onProcessStageChanged` 내부에서:

1. `renameInquiryFolderForContact` 호출 (폴더명이 바뀔 가능성 있으면 rename)
2. `ensureInquiryFolder` 호출 (없으면 생성)
3. `relocateContactFiles` 호출 (파일 이동)

### 2. `ensureInquiryFolder` null 반환 시 throw

`webhard-api/src/folders/folders.service.ts:1380-1388` 현재:

```ts
if (!folderName) {
  this.logger.warn({ contactId }, 'NO_INQUIRY_NUMBER');
  return null;
}
```

이 silent null 반환을 호출처가 무시하는 것이 이슈 4 의 silent fail 원인. 수정 정책:

- `ensureInquiryFolder` 자체의 시그니처는 기존대로 `Promise<WebhardFolder | null>` 유지.
- 대신 `ContactFolderSyncService.onProcessStageChanged` 에서 null 반환 시 **명시적으로 에러 throw**.

```ts
async onProcessStageChanged(ctx: ...): Promise<void> {
  const client = ctx.client ?? this.prisma;
  const contact = await client.contact.findUnique({ where: { id: ctx.contactId } });
  if (!contact) throw new Error(`Contact ${ctx.contactId} not found`);

  // drawing_confirmed 로 전환 시 폴더 필수
  if (ctx.nextStage === 'drawing_confirmed' && !contact.inquiryNumber && !contact.workNumber) {
    throw new Error(`Cannot transition to drawing_confirmed: contact has no inquiryNumber or workNumber`);
  }

  // FoldersService 인수 순서: (contactId, tx?) — client 는 두 번째 optional.
  await this.foldersService.renameInquiryFolderForContact(ctx.contactId, ctx.client);
  const folder = await this.foldersService.ensureInquiryFolder(ctx.contactId, ctx.client);

  if (!folder && ctx.nextStage === 'drawing_confirmed') {
    // drawing_confirmed 는 폴더가 반드시 있어야 함 — null 반환 케이스를 구분하지 않고 일괄 throw.
    // (NO_INQUIRY_NUMBER / NO_FALLBACK_MATCH / NO_COMPANY_ROOT / FOLDER_CREATE_FAILED 모두 FOLDER_CREATION_FAILED 로 매핑.
    //  구체 원인은 FoldersService 의 warn 로그에 reason_code 로 남아 있으므로 사용자 메시지는 통합.)
    throw new Error(`Failed to ensure inquiry folder for contact ${ctx.contactId}`);
  }

  if (folder) {
    await this.foldersService.relocateContactFiles(ctx.contactId, folder.id, ctx.client);
  }
}
```

throw 시 트랜잭션 롤백 → `processStage` 는 `sample` 로 유지. API 호출자(Admin UI) 는 에러 응답 수신 → Phase 6 에서 에러 모달 표시.

### 3. 에러 응답 상세화

NestJS 레벨에서 `updateProcessStage` 호출 중 `contactFolderSync` throw 발생 시 HTTP 500 대신 `UnprocessableEntityException` (422) 또는 `BadRequestException` (400) 으로 변환하여 프론트가 구분 가능하게 한다.

`contacts.controller.ts` 의 `@UseFilters` 또는 서비스 내부에서 `try/catch` 로 변환:

```ts
try {
  await this.prisma.$transaction(...);
} catch (err) {
  if (err instanceof Error && err.message.includes('no inquiryNumber')) {
    throw new UnprocessableEntityException({
      code: 'INQUIRY_NUMBER_REQUIRED',
      message: '도면 확정 전에 inquiryNumber 가 할당되어야 합니다.',
    });
  }
  if (err instanceof Error && err.message.includes('Failed to ensure inquiry folder')) {
    throw new UnprocessableEntityException({
      code: 'FOLDER_CREATION_FAILED',
      message: '웹하드 문의 폴더 생성 실패. Company 매핑을 확인하세요.',
    });
  }
  throw err;
}
```

응답 DTO shape 은 기존 에러 포맷 준수 (프로젝트 컨벤션 확인).

### 4. 단위 테스트

`webhard-api/src/contacts/contacts.service.spec.ts` **확장**:

- `updateProcessStage`:
  - workNumber 이미 존재 + `drawing_confirmed` 전환 → `contactFolderSync.onProcessStageChanged` 호출 확인 (spy)
  - workNumber 없음 + `drawing_confirmed` 전환 → workNumber 발급 + `onProcessStageChanged` 호출
  - inquiryNumber/workNumber 둘 다 없음 + `drawing_confirmed` 전환 → `UnprocessableEntityException` throw

`webhard-api/src/contacts/_lib/contact-folder-sync.service.spec.ts` **Phase 2 에서 추가됨, 여기서 확장**:

- `onProcessStageChanged`:
  - `ensureInquiryFolder` null + `nextStage='drawing_confirmed'` → throw
  - `ensureInquiryFolder` null + `nextStage='drawing'` → throw 안 함 (중간 단계는 허용)
  - 정상 케이스 → rename + ensure + relocate 순서 호출 확인

### 5. 통합 테스트 (실제 Supabase dev DB)

`webhard-api/src/contacts/contacts.integration.spec.ts` **신규 또는 확장**:

- Contact `sample → drawing_confirmed` 전환 시나리오:
  - 정상: 폴더명 `문의-O123` → `문의-O123_F45` rename 확인 (DB 실데이터)
  - inquiryNumber 없는 Contact: 422 에러 수신, processStage 는 `sample` 유지
- 트랜잭션 롤백 검증

## Acceptance Criteria

백엔드 phase:

```bash
cd webhard-api && pnpm build
```

```bash
cd webhard-api && pnpm test
```

## AC 검증 방법

위 2 커맨드 병렬 실행 후 모두 통과 시 phase 5 status `"completed"`.

3 회 이상 실패 시 `"error"` + `error_message`.

## 주의사항

- **기존 `updateProcessStage` API 계약(요청/응답) 을 바꾸지 마라**. 내부 로직만 수정. 프론트(Phase 6) 는 에러 응답 구조만 새로 처리.
- `ensureInquiryFolder` / `relocateContactFiles` / `renameInquiryFolderForContact` 자체의 시그니처는 **불변**. 변경 시 task 20, 21, 22 의 다른 호출처에 영향.
- `contactFolderSync` 는 Phase 2 에서 만든 서비스. `ContactsService` constructor 에 DI 주입. 순환 의존성 주의.
- 전환 중 **부분 실패** (workNumber 발급은 성공했지만 폴더 rename 실패) 는 트랜잭션 롤백으로 방지. `$transaction` 내부에서 throw 하면 모두 롤백됨.
- 에러 코드 (`INQUIRY_NUMBER_REQUIRED`, `FOLDER_CREATION_FAILED`) 는 Phase 6 프론트에서 구분하여 사용자 안내. 코드 naming 일관성 유지.
- 기존 `updateProcessStage` 테스트가 이 phase 에서 실패하면 기대 동작이 바뀐 것. 새 동작(rename 항상 실행)이 정답이므로 **기존 테스트를 수정**한다 (deleting silent skip expectation 등).
- 한글 커밋: `feat(qa-contact-worker-v1): phase 5 — stage-transition-backend`.
