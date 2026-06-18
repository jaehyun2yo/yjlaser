# Phase 2: contacts-service-gap-fix

## 사전 준비

먼저 아래 문서·파일들을 반드시 읽어라:

- `docs/specs/features/drawing-workflow.md` §W.1 — Phase 0 에서 업데이트된 "공개폼 `!company` 가드 완화" 규칙.
- `tasks/21-webhard-inquiry-folder-gap-fix/docs-diff.md` — Phase 0 docs 변경 기록.
- `tasks/21-webhard-inquiry-folder-gap-fix/phase1.md` — Phase 1 에서 만든 변경 (특히 `ensureInquiryFolder` 의 2단계 fallback 이 어떻게 동작하는지).
- **Phase 1 에서 실제로 수정된 파일들** (git diff 로 확인):
  - `webhard-api/src/folders/folders.service.ts`
  - `webhard-api/src/folders/_lib/company-name-match.util.ts` (신규)
  - `webhard-api/src/contacts/_lib/inquiry-filename.util.ts`
- `webhard-api/src/contacts/contacts.service.ts` — 이번 phase 수정 대상. 특히 `ContactsService.create` 의 555-589 라인대 `!company` 분기 (실제 라인 번호는 브랜치 상태에 따라 이동할 수 있으니 동작 기반으로 탐색).
- `webhard-api/src/contacts/contacts.service.spec.ts` — 기존 테스트 (task 20 의 P2-1 등). 회귀 보호 대상.

이유: Phase 1 에서 `ensureInquiryFolder` 가 `!company` 상황에서도 내부 2단계 fallback 으로 루트를 찾을 수 있게 확장됨. Phase 2 는 이 준비가 된 상태에서 **외부 가드** 를 완화하여 fallback 이 실제로 실행되도록 연결한다. Phase 1 변경 없이 이 phase 만 적용하면 효과 없음 — Phase 1 코드 변경을 꼼꼼히 읽고 호환 확인.

## 작업 내용

### 1. `webhard-api/src/contacts/contacts.service.ts` 수정

**현재 동작** (의사코드):

```typescript
// ContactsService.create 내부, Contact 생성 후 폴더 연결 블록
if (created.inquiryType) {
  const company = await tx.company.findFirst({
    where: { companyName: created.companyName },
  });
  if (company) {
    const folder = await this.foldersService.ensureInquiryFolder(created.id, tx);
    if (folder) {
      await this.relocateContactFiles(created.id, folder.id, tx);
    }
  } else {
    // mismatch 알림만 발송. ensureInquiryFolder 미호출 ← 이번 phase 의 수정 대상
    await this.notificationsService.notify({
      type: 'webhard_company_mismatch',
      contactId: created.id,
      companyName: created.companyName,
    });
  }
}
```

**변경**:

**1-1. `else` 분기 확장 — mismatch 알림 병행 + ensureInquiryFolder 시도**

```typescript
// 의사코드
if (created.inquiryType) {
  const company = await tx.company.findFirst({
    where: { companyName: created.companyName },
  });
  if (company) {
    // 기존 동작 유지 (변경 없음)
    const folder = await this.foldersService.ensureInquiryFolder(created.id, tx);
    if (folder) {
      await this.relocateContactFiles(created.id, folder.id, tx);
    }
  } else {
    // 1) mismatch 알림은 기존대로 발송 (병행)
    await this.notificationsService.notify({
      type: 'webhard_company_mismatch',
      contactId: created.id,
      companyName: created.companyName,
    });
    // 2) 추가: Company 없어도 ensureInquiryFolder 시도
    //    Phase 1 의 2단계 fallback (완전 일치 → 정규화) 이 가상 업체 루트를 찾음
    try {
      const folder = await this.foldersService.ensureInquiryFolder(created.id, tx);
      if (folder) {
        await this.relocateContactFiles(created.id, folder.id, tx);
      }
      // folder === null 은 Phase 1 logger.warn reason_code 로 이미 기록됨
    } catch (err) {
      // best-effort — Contact 는 유지. 트랜잭션 롤백 유발 금지.
      // Phase 1 의 FOLDER_CREATE_FAILED 분기가 예외를 흡수하지만, 방어적으로 외부에서도 catch.
    }
  }
}
```

**규칙**:

- **트랜잭션 `tx` 전파 유지** — `ensureInquiryFolder`, `relocateContactFiles` 모두 같은 tx 사용.
- **알림 순서**: `notify` 를 먼저, `ensureInquiryFolder` 를 뒤에. 알림 실패해도 폴더 생성 시도는 이루어지게.
- **try/catch 범위 최소화**: `ensureInquiryFolder` + `relocateContactFiles` 만 감쌈. 다른 로직 삼키지 말 것.
- **트랜잭션 롤백 금지**: `ensureInquiryFolder` 실패가 Contact 생성 롤백을 유발하면 안 됨.
- **`relocateContactFiles` 는 folder truthy 일 때만** — null 폴더에 파일을 옮기는 버그 방지.

**1-2. `if (company)` 분기는 변경하지 않음**

Company 가 있을 때는 기존 동작 그대로 (**strict 유지** — Phase 1 의 `ensureInquiryFolder` 내부 변화만 자동 적용됨, 구조 변경 없음).

**1-3. 다른 분기·메서드 건드리지 말 것**

`ContactsService` 에는 `create` 외에 `updateInquiryType`, `updateStatus`, `splitContact`, `update`, `createBatch` 등이 있음. 이번 phase 는 **`create` 의 mismatch 가드만** 수정. 다른 메서드는 task 20 에서 이미 처리됨 (`updateInquiryType`, `splitContact` 등) 또는 이번 범위 외 (`update` — QA 경로, 실운영 영향 낮음).

### 2. `webhard-api/src/contacts/contacts.service.spec.ts` 테스트 추가

기존 테스트 (task 20 의 P2-1 등) 는 **전부 유지·통과** 해야 함. 아래 추가:

- **P2-1** (`!company` 분기에서도 `ensureInquiryFolder` 호출): `inquiryType='mold_request'`, `companyName='가상업체'`, Company 테이블 빈 상태 (`company.findFirst` mock → null) 에서 `ContactsService.create` 호출 → `foldersService.ensureInquiryFolder` spy 가 호출됨 확인.
- **P2-2** (`!company` + fallback 매칭 성공): 위와 동일 세팅 + `foldersService.ensureInquiryFolder` mock 이 `WebhardFolder` 객체 반환 → `relocateContactFiles` spy 도 호출됨 확인. Contact 생성 성공.
- **P2-3** (`!company` + fallback 실패 → Contact 유지): `foldersService.ensureInquiryFolder` mock 이 null 반환 → Contact 레코드는 생성 유지, `relocateContactFiles` 호출 안 됨 (folder null 이므로).
- **P2-4** (mismatch 알림 회귀): `!company` 분기에서 `notificationsService.notify({ type: 'webhard_company_mismatch' })` 여전히 호출됨 확인.
- **P2-5** (`ensureInquiryFolder` 예외 → Contact 유지): `foldersService.ensureInquiryFolder` mock 이 throw → Contact 생성 실패 유발하지 않음 (best-effort 확인). spy 로 Contact 가 DB 에 남아있음 확인 (Prisma mock 의 `contact.create` 가 throw 되지 않았음).
- **P2-6** (`if (company)` 분기 회귀): 기존 "Company 있음 → ensureInquiryFolder 호출" 케이스 그대로 통과.

**mock 전략**: 기존 spec 의 Prisma mock + `notificationsService` mock + `foldersService` mock 패턴 재사용. `ensureInquiryFolder` 는 `jest.fn()` 으로 리턴값 케이스별 다르게 설정.

### 3. 관련 파일 수정 여부

- `webhard-api/src/contacts/contacts.module.ts`: `FoldersModule` import 이미 되어 있음 (task 20 phase 2 에서 추가) — 변경 불필요. 파일 열어 확인만.
- `webhard-api/src/contacts/contacts.controller.ts`: API 응답 구조 변경 없음 — 수정 불필요.

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test
```

## AC 검증 방법

위 커맨드 통과 시 `tasks/21-webhard-inquiry-folder-gap-fix/index.json` 의 phase 2 status 를 `"completed"` 로 변경.

3 회 실패 시 `"error"`.

## 주의사항

- **`if (company)` 분기 건드리지 말 것** — 기존 동작 유지. 이번 phase 는 `else` 분기만 확장.
- **`notify` 호출 순서 유지** — 알림 먼저, 폴더 생성 뒤.
- **try/catch 범위 최소화** — `ensureInquiryFolder` + `relocateContactFiles` 만. 다른 로직 삼키지 말 것.
- **트랜잭션 롤백 금지** — ensureInquiryFolder 실패가 Contact 생성 롤백 유발 금지.
- **다른 메서드 (`updateInquiryType`, `updateStatus`, `splitContact`, `update`, `createBatch`) 건드리지 말 것** — 스코프 외.
- **테스트에서 실제 DB 접근 금지** — Prisma mock 사용.
- **기존 P2 번호와 충돌 여부 확인**: task 20 spec 에 이미 P2-1, P2-2 등이 있을 수 있음 — 새 테스트는 겹치지 않는 ID 사용 (예: P2-21-1, P2-21-2 등 또는 `[task21]` 접두사). 기존 번호를 덮어쓰지 말 것.
- **`relocateContactFiles` 의 인자 순서** (`contactId, folderId, tx`) — 기존 시그니처 준수. task 20 phase 2 구현 확인.
