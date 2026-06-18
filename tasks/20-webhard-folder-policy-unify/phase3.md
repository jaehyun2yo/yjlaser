# Phase 3: auto-contact-path

## 사전 준비

아래 문서·코드를 반드시 읽어라:

- `tasks/20-webhard-folder-policy-unify/phase0.md`, `phase1.md` — phase 1 이후 `ensureInquiryFolder` 가 `inquiryRoot.id` 를 parent 로 사용.
- `tasks/20-webhard-folder-policy-unify/docs-diff.md`
- `docs/specs/features/drawing-workflow.md` §W.1 — 경로별 폴더 동작 표의 "경로 2,3. 웹하드 감지" 줄 (미분류 원위치 유지, 분류 확정 시 이동).
- `docs/followups/19-webhard-folder-policy-status.md` §3.3 — 이번 phase 가 해결하는 구멍 (자동 분류 시 파일이 실제로 이동 안 되는 문제).
- `webhard-api/src/integration/orders/auto-contact.service.ts` — `createNewContact` 메서드. 현재 Contact 생성만 하고 폴더·파일 이동 없음. `updateFileNamePrefix` 는 fire-and-forget 유지.
- `webhard-api/src/integration/orders/auto-contact.service.ts` — `detectAndCreate` 메서드, `classifyByFolderPath` 호출 흐름 (분류 결정 경로 파악용).
- `webhard-api/src/files/files.service.ts` — `triggerAutoContact` (단건), `batchTriggerAutoContact` (배치). 둘 다 `AutoContactService.detectAndCreate` → `createNewContact` 공통 경로를 탄다. 이 phase 는 **공통 경로 1 곳만 수정** 하면 단건·배치 모두 커버됨을 코드 추적으로 반드시 재확인.
- `webhard-api/src/integration/orders/__tests__/auto-contact.service.spec.ts` — 기존 spec. 신규 P3-1~P3-5 추가.

이유: 자동 분류 Contact 가 `inquiryType` 을 확정한 순간 파일도 `문의-{O}/` 로 이동해야 W.1 스펙과 일치. 현재 코드는 revision 업로드 시에만 이동 — task 19 후속 followup §3.3 의 구멍.

## 작업 내용

### 1. `auto-contact.service.ts` — `createNewContact` 끝단 훅 추가

현재 구조 (개략):

```ts
async createNewContact(dto) {
  // ... Contact 생성 + ContactStatusHistory + 기타
  const contact = /* $transaction 내부 또는 외부 */;

  this.updateFileNamePrefix(contact).catch(() => { /* fire-and-forget */ });

  return contact;
}
```

변경 후:

```ts
async createNewContact(dto) {
  // ... 기존 로직 유지 (Contact 생성, updateFileNamePrefix fire-and-forget)
  const contact = /* 기존대로 */;

  this.updateFileNamePrefix(contact).catch(() => { /* fire-and-forget, 유지 */ });

  // [NEW] 분류 확정 시 폴더·파일 정착
  if (contact.inquiryType) {
    const folder = await this.foldersService.ensureInquiryFolder(contact.id /*, tx?*/);
    if (folder) {
      await this.foldersService.relocateContactFiles(contact.id, folder.id);
    }
  }

  return contact;
}
```

핵심 규칙:

- `inquiryType` 이 `null` (미분류) 인 경우 **폴더 생성·파일 이동 안 함** → 파일은 template (칼선의뢰·목형의뢰) 또는 업체 루트 원위치 유지.
- `createNewContact` 이 기존에 `prisma.$transaction` 내부라면 `tx` 인자 전달 (코드 확인 후 결정). 트랜잭션 외부면 별 호출.
- `updateFileNamePrefix` 기존 fire-and-forget **유지** — 파일명 prefix 와 폴더 이동은 독립 관심사.
- `ensureInquiryFolder` 가 `null` 반환 시 relocate 생략. 호출 실패는 auto-contact best-effort 성격이므로 `try/catch + logger.warn` 로 감싸서 Contact 생성 자체는 성공으로 끝내는 것 고려 (단, **LGU+ sync 의 batch 호출 시 대량 실패 시나리오 고려** — catch 로 warn 후 계속 진행이 안전).

### 2. 단건·배치 공통 경로 검증

`triggerAutoContact` → `AutoContactService.detectAndCreate` → `createNewContact` 경로가 단일. `batchTriggerAutoContact` 도 동일 경로를 순회 호출하는지 코드 추적으로 재확인. 만약 배치가 `createNewContact` 를 우회하는 별 로직이 있다면 동일한 훅을 그 쪽에도 추가.

코드 추적 결과 공통 경로이면 그대로 진행. 분기가 있으면 이 phase 범위 안에서 양쪽 모두 커버.

### 3. 테스트 추가 — `auto-contact.service.spec.ts`

**신규 P3-1**: `createNewContact` — `classifyByFolderPath` 가 `inquiryType='cutting_request'` (칼선의뢰 폴더 경로 기반) 를 반환 → `ensureInquiryFolder` mock 1 회 호출 + `relocateContactFiles` mock 1 회 호출.

**신규 P3-2**: 동일 케이스 `inquiryType='mold_request'` (목형의뢰 경로).

**신규 P3-3**: `createNewContact` — `classifyByFolderPath` 가 `null` 반환 (미분류 경로) → `ensureInquiryFolder` / `relocateContactFiles` mock **미호출** (파일 원위치 유지 검증).

**신규 P3-4**: `createNewContact` — 이미 문의 폴더가 있는 Contact 멱등성 검증 → `ensureInquiryFolder` findFirst hit, 중복 create 없음 (phase 1 의 멱등성을 이 경로에서도 확인).

**신규 P3-5 (통합)**: `batchTriggerAutoContact` 경로에서도 동일 로직 적용 — 배치 5 개 중 분류 성공 3 개는 폴더 생성, 미분류 2 개는 원위치. (spec 이 분리되어 있다면 `files.service.spec.ts` 에 작성.)

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test
```

기존 auto-contact 테스트 회귀 없고 P3-1~P3-5 통과.

## AC 검증 방법

위 커맨드 통과 시 `tasks/20-webhard-folder-policy-unify/index.json` 의 phase 3 status 를 `"completed"` 로 변경. 3 회 실패 시 `"error"` + `"error_message"`.

## 주의사항

- `updateFileNamePrefix` 기존 fire-and-forget **유지** — 파일명 prefix 로직은 독립.
- `FilesService.triggerAutoContact` / `batchTriggerAutoContact` 본문 직접 수정 **금지** (공통 `createNewContact` 경로 사용). 공통 경로가 아니라고 판명되면 그때만 최소 수정.
- 미분류 Contact 에 폴더 생성하지 않음 — "임시 폴더" 로직 추가 **절대 금지**.
- LGU+ sync 로 업체 루트에 떨어진 **기존 파일** 처리는 이번 범위 아님 (task 21 후보 §3.1).
- Phase 4 (split) 는 이 phase 에서 건드리지 **않는다**.
- `ensureInquiryFolder` 실패 (예: company·rootFolder 누락) 시 `try/catch + logger.warn` 으로 감싸서 Contact 생성 자체는 성공으로 끝낸다 (best-effort). Contact 롤백 **금지** — 경로 1 (웹폼, strict) 과 다른 이유: LGU+ sync 대량 처리 중 개별 실패가 전체 동기화를 막으면 안 됨.
