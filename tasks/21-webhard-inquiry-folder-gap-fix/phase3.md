# Phase 3: auto-contact-unclassified

## 사전 준비

먼저 아래 문서·파일들을 반드시 읽어라:

- `docs/specs/features/drawing-workflow.md` §W.1 — Phase 0 에서 업데이트된 "경로 2·3 (auto-contact) 미분류 처리" 규칙.
- `tasks/21-webhard-inquiry-folder-gap-fix/docs-diff.md`.
- `tasks/21-webhard-inquiry-folder-gap-fix/phase1.md`, `phase2.md` — 이전 phase 변경 사항.
- **Phase 1·2 에서 실제 수정된 파일들** (git diff 로 확인):
  - `webhard-api/src/folders/folders.service.ts` — `ensureInquiryFolder` 2단계 fallback + reason_code 로깅
  - `webhard-api/src/folders/_lib/company-name-match.util.ts` (신규)
  - `webhard-api/src/contacts/_lib/inquiry-filename.util.ts` — inquiryNumber 만으로 이름 생성
  - `webhard-api/src/contacts/contacts.service.ts` — `!company` 가드 완화
- `webhard-api/src/integration/orders/auto-contact.service.ts` — 이번 phase 수정 대상. 특히 `detectAndCreate` / `createNewContact` 의 `finalInquiryType` 확정 분기.
- `webhard-api/src/integration/orders/__tests__/auto-contact.service.spec.ts` (또는 프로젝트 실제 경로 — 파일을 먼저 찾아 확인) — 기존 P3-1~P3-5 테스트 패턴.

이유: `auto-contact` 경로는 외부웹하드 동기화 → 자체웹하드 auto-contact 트리거의 핵심 흐름. 이번 phase 가 미분류 상태에서도 폴더를 만들도록 분기를 확장하고, Phase 1 의 `buildInquiryFolderName` 확장 (inquiryNumber 만으로 `문의-{O}` 생성) 과 결합되어 실제 효과를 낸다.

## 작업 내용

### 1. `webhard-api/src/integration/orders/auto-contact.service.ts` 수정

**현재 동작** (파일 읽어서 확인, 의사코드):

```typescript
// AutoContactService.createNewContact — 또는 detectAndCreate 내 Contact 생성 후 블록
async createNewContact(payload, tx) {
  const contact = await tx.contact.create({ /* ... */ });
  const finalInquiryType = /* 분류 로직 결과, null 가능 */;

  if (finalInquiryType) {
    // ensureInquiryFolder + relocateContactFiles 호출
    try {
      const folder = await this.foldersService.ensureInquiryFolder(contact.id, tx);
      if (folder) {
        await this.relocateContactFiles(contact.id, folder.id, tx);
      }
    } catch (err) {
      this.logger.warn(/* ... */);
    }
  }
  // finalInquiryType 없으면 폴더 생성 스킵 ← 이번 phase 의 수정 대상

  return contact;
}
```

**변경**:

**1-1. `finalInquiryType` 유무와 무관하게 `ensureInquiryFolder` 호출 + 파일 이동 조건부**

```typescript
// 의사코드
async createNewContact(payload, tx) {
  const contact = await tx.contact.create({ /* ... */ });
  const finalInquiryType = /* 분류 로직 */;

  // 변경: finalInquiryType 체크 제거. ensureInquiryFolder 는 항상 시도.
  // - inquiryNumber 만 있으면 Phase 1 의 buildInquiryFolderName 이 `문의-{O}` 생성.
  // - inquiryNumber 없으면 ensureInquiryFolder 내부에서 NO_INQUIRY_NUMBER logger.warn + null 반환.
  try {
    const folder = await this.foldersService.ensureInquiryFolder(contact.id, tx);
    if (folder && finalInquiryType) {
      // 분류 확정된 경우에만 파일 재배치 (기존 동작 유지)
      await this.relocateContactFiles(contact.id, folder.id, tx);
    }
    // folder 생성됐으나 finalInquiryType 없는 경우: 파일 이동 skip.
    // → 미분류 상태에서 추가 업로드되는 파일은 업체 루트에 누적되다가,
    //   분류 확정 시 updateInquiryType 경로 (task 20 phase 3) 가 이동 처리.
  } catch (err) {
    // best-effort — Phase 1 의 logger.warn reason_code 로 이미 기록됨.
    this.logger.warn(/* 기존 로그 포맷 유지 */);
  }

  return contact;
}
```

**규칙**:

- **`ensureInquiryFolder` 는 무조건 호출** (기존 `if (finalInquiryType)` 가드 제거).
- **`relocateContactFiles` 는 `folder && finalInquiryType` 일 때만** — 미분류 파일을 엉뚱한 폴더로 옮기지 않게.
- **try/catch 유지** (best-effort). 예외 시 Contact 는 유지.
- **`logger.warn` 기존 로그 포맷 유지** — Phase 1 의 reason_code 와 별개. Phase 1 이 이미 `ensureInquiryFolder` 내부에서 reason_code 로깅을 처리함. 이 phase 의 try/catch 는 최외곽 방어.

**1-2. `detectAndCreate` 동일 원칙**

`detectAndCreate` 가 내부적으로 `createNewContact` 를 호출한다면 1-1 수정으로 충분. 별도의 폴더 생성 로직이 `detectAndCreate` 에 있다면 동일 원칙 적용 — `ensureInquiryFolder` 는 무조건 호출, `relocateContactFiles` 는 `finalInquiryType` 확정 시에만.

**1-3. 배치 경로 확인**

`batchDetectAndCreate` (또는 유사 이름) 가 있다면 내부적으로 `createNewContact` / `detectAndCreate` 를 loop 돌린다고 가정 — 별도 수정 불필요. 별도 분기 있으면 동일 원칙 적용.

### 2. 테스트 추가: `webhard-api/src/integration/orders/__tests__/auto-contact.service.spec.ts` (또는 실제 경로)

기존 P3-1~P3-5 (task 20) 는 **전부 유지·통과** 해야 함. 아래 추가 (ID 충돌 피하려면 P3-21-1 등 또는 P3-6 이후):

- **P3-6** (미분류에서도 `ensureInquiryFolder` 호출): `finalInquiryType=null`, `inquiryNumber='O-500'` payload 로 `createNewContact` 호출 → `foldersService.ensureInquiryFolder` spy 가 호출됨 확인.
- **P3-7** (미분류 + 폴더 생성 성공 → `relocateContactFiles` 호출 안 됨): `ensureInquiryFolder` mock 이 folder 반환 + `finalInquiryType=null` → `relocateContactFiles` spy 호출 안 됨 (미분류 파일은 이동하지 않음).
- **P3-8** (분류 확정 + 폴더 생성 → 파일 이동 — 회귀): `finalInquiryType='mold_request'`, `ensureInquiryFolder` mock 이 folder 반환 → `relocateContactFiles` 호출됨 (기존 동작 유지).
- **P3-9** (`ensureInquiryFolder` throw → Contact 유지): `foldersService.ensureInquiryFolder` mock 이 throw → Contact 레코드는 여전히 생성 (best-effort 회귀). `this.logger.warn` spy 호출 확인.
- **P3-10** (`ensureInquiryFolder` null + `finalInquiryType=null`): `ensureInquiryFolder` mock 이 null + 미분류 → `relocateContactFiles` 호출 안 됨. Contact 생성은 유지.

**mock 전략**: 기존 spec 패턴 재사용. `foldersService` 와 `relocateContactFiles` 는 spy / jest.fn.

### 3. 관련 파일 수정 여부

- `auto-contact.module.ts` (있으면): `FoldersModule` 이미 import 되어 있음 (task 20 phase 3) — 변경 불필요.
- `auto-contact.controller.ts`: API 응답 구조 변경 없음 — 수정 불필요.

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test
```

## AC 검증 방법

위 커맨드 통과 시 `tasks/21-webhard-inquiry-folder-gap-fix/index.json` 의 phase 3 status 를 `"completed"` 로 변경.

3 회 실패 시 `"error"`.

## 주의사항

- **`relocateContactFiles` 호출 조건 유지**: `folder && finalInquiryType` 일 때만. 미분류 파일은 이동하지 말 것 — 나중에 분류 시 task 20 의 `updateInquiryType` 경로가 처리.
- **`createNewContact` / `detectAndCreate` 시그니처 변경 금지**.
- **트랜잭션 동작 유지**: best-effort try/catch 는 내부에만 — 외부 트랜잭션 롤백 유발 금지.
- **task 20 의 P3-1~P3-5 는 전부 통과** — 회귀 금지.
- **Prisma mock 외 실제 DB 접근 금지**.
- **다른 integration 모듈 건드리지 말 것** (`orders.service.ts` 의 `createAutoContact` 등 — 이번 task 21 스코프 외, task 22+ 에서 처리).
- **기존 `this.logger.warn` 포맷 유지**: Phase 1 이 `FoldersService` 내부 로깅을 담당하므로, `AutoContactService` 쪽 로그는 최외곽 방어용으로만 유지.
