# Phase 2: web-form-path

## 사전 준비

아래 문서·코드를 반드시 읽어라:

- `tasks/20-webhard-folder-policy-unify/phase0.md`, `phase1.md` — phase 1 이후 `ensureInquiryFolder` 의 parent 가 `inquiryRoot.id` 로 바뀌었음을 전제.
- `tasks/20-webhard-folder-policy-unify/docs-diff.md` — phase 0 docs diff.
- `docs/specs/features/drawing-workflow.md` §W.1 — 경로별 폴더 동작 표의 "경로 1. 웹폼" 줄.
- `webhard-api/src/contacts/contacts.service.ts` — `create` 메서드. 현재 끝단에서 `this.registerFilesToWebhard(contact).catch(err => logger.error(...))` 식의 fire-and-forget 호출.
- `webhard-api/src/contacts/contacts.service.ts` — `registerFilesToWebhard` private 메서드 (약 line 2700~2790 부근). 이번 phase 에서 **완전 삭제**. 호출자 단 1 곳뿐임 (이미 이전 조사에서 확인됨).
- `webhard-api/src/contacts/contacts.service.spec.ts` — L135~137 (전역 `registerFilesToWebhard` mock), L752~821 (RFW1/RFW2 `webhard_company_mismatch` 테스트). 삭제 후 create 내부 검증으로 이관.
- `webhard-api/src/contacts/drawing-revision.service.ts` — L271 근처·L419 근처 주석에 `registerFilesToWebhard 가 전담` 언급. 이번 phase 에서 주석 업데이트.

이유: fire-and-forget 으로 분리된 경로를 트랜잭션 내부 strict 경로로 통합한다. 기존 `webhard_company_mismatch` Notification 발행 로직은 `create` 내부에 인라인 이관 (동일 사용자 가시적 동작 유지).

## 작업 내용

### 1. `contacts.service.ts` — `create` 내부 트랜잭션 통합

현재 구조 (개략):

```ts
async create(dto) {
  const contact = await this.prisma.$transaction(async (tx) => {
    const created = await tx.contact.create(...);
    // ... status_history, initial revision 등
    return created;
  });
  this.registerFilesToWebhard(contact).catch(err => logger.error(...));
  return contact;
}
```

변경 후:

```ts
async create(dto) {
  return this.prisma.$transaction(async (tx) => {
    const contact = await tx.contact.create(...);
    // ... 기존 status_history, initial revision 로직 유지

    // [NEW] company_mismatch 알림 (기존 registerFilesToWebhard 의 전반부)
    const company = await tx.company.findFirst({ where: { name: contact.companyName } });
    if (!company) {
      await tx.notification.create({
        data: { kind: 'webhard_company_mismatch', /* 기존 payload */ },
      }).catch(err => this.logger.warn(`notification.create failed: ${err.message}`));
      return contact;
    }

    // [NEW] 분류 확정 시만 폴더 생성·파일 이동
    if (contact.inquiryType) {
      const folder = await this.foldersService.ensureInquiryFolder(contact.id, tx);
      if (folder) {
        await this.foldersService.relocateContactFiles(contact.id, folder.id, tx);
      }
    }

    return contact;
  });
}
```

핵심 규칙:

- `inquiryType` 이 `null` 인 경우 **폴더 생성·파일 이동 안 함** — 미분류 Contact.
- fire-and-forget `.catch(logger.error)` 제거 → 트랜잭션 실패 시 Contact 자체 롤백 (strict 정책).
- `ensureInquiryFolder` 가 `null` 반환 (예: inquiryNumber / workNumber 둘 다 없음) 시 relocate 생략, throw 하지 않음.
- Notification 발행 실패는 `.catch` 로 warn 로그만 — 트랜잭션 전체를 깨지 않음 (기존 동작 호환).
- `webhardWarning` 반환 패턴은 create 경로에서 사용 안 함 — 트랜잭션 성공/실패 이분법.

### 2. `contacts.service.ts` — `registerFilesToWebhard` 메서드 완전 삭제

private 메서드 본문 전체 삭제. 호출자 단 1 곳 (이미 `create` 내부에서 제거됨) 이므로 안전.

### 3. `drawing-revision.service.ts` — 주석 업데이트

L271 근처 / L419 근처의 `// registerFilesToWebhard 가 전담` 류 주석을 아래로 교체:

```
// ensureInquiryFolder + relocateContactFiles 로 이관됨 (task 20).
```

**실행 로직 변경 금지 — 주석만 수정**.

### 4. 테스트 수정·추가 — `contacts.service.spec.ts`

**삭제**: L135~137 의 `registerFilesToWebhard` 전역 mock (메서드 자체가 사라지므로 mock 불필요).

**수정**: L752~821 의 `describe('ContactsService.registerFilesToWebhard — webhard_company_mismatch 알림')` 블록을 `describe('ContactsService.create — webhard_company_mismatch 알림')` 으로 rename. 검증 대상 메서드를 `create` 로 교체. 동일한 2 케이스 유지:

- RFW1 (rename 후 P2-5): company 미존재 → `Notification(webhard_company_mismatch)` 생성 + `ensureInquiryFolder` 미호출.
- RFW2 (rename 후 P2-6): `notification.create` 실패해도 Contact 생성 성공 유지, 예외 전파 없음.

**신규 P2-1**: `create` — `inquiryType='cutting_request'` DTO → `inquiryNumber` 발급 + `ensureInquiryFolder` mock 1 회 호출 + `relocateContactFiles` mock 1 회 호출.

**신규 P2-2**: `create` — `inquiryType='mold_request'` DTO → `workNumber` 발급 + `ensureInquiryFolder` mock 1 회 호출.

**신규 P2-3**: `create` — `inquiryType=null` DTO → `ensureInquiryFolder` mock **미호출** 확인.

**신규 P2-4**: `create` — 트랜잭션 롤백: `ensureInquiryFolder` mock 이 throw → `prisma.contact.create` mock 도 롤백되어 DB 에 Contact 없음을 검증 (`$transaction` 이 throw 되는지, rollback 플래그 확인 방식은 기존 spec 패턴 따름).

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test
```

기존 테스트 회귀 없고 P2-1~P2-4 + 이관된 P2-5~P2-6 (구 RFW1/RFW2) 통과.

## AC 검증 방법

위 커맨드 통과 시 `tasks/20-webhard-folder-policy-unify/index.json` 의 phase 2 status 를 `"completed"` 로 변경. 3 회 실패 시 `"error"` + `"error_message"`.

## 주의사항

- `registerFilesToWebhard` 의 시그니처만 남기고 내부만 교체하는 식으로 **금지** — 메서드 자체 완전 삭제.
- W.3 레거시 로직 (`inquiryTitle` 기반 폴더 생성) 완전 제거. 기존 DB 에 생성된 `inquiryTitle` 폴더·파일은 그대로 남아도 무방 (task 21 마이그레이션 범위).
- `drawing-revision.service.ts` 의 본문 로직 건드리지 말 것 — 주석만 수정.
- `contacts.controller.ts` 건드리지 말 것 — `create` 반환 타입·HTTP 응답 변경 없음.
- Phase 3 (auto-contact) 경로는 이 phase 에서 건드리지 않는다 — 분리.
- Phase 4 (split) 도 건드리지 않는다.
- Notification 발행 실패의 `.catch(warn)` 을 제거하지 말 것 — 기존 동작 (notification 실패가 Contact 생성을 막지 않음) 호환성 유지.
- `initial revision` 생성 (`createInitialRevision`) 이 기존 트랜잭션 흐름에 이미 있다면 그 위치 그대로 유지 — 이번 phase 에서 순서 바꾸지 않음.
