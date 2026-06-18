# Phase 1: backend-folder-policy

## 사전 준비

아래 문서·코드를 반드시 읽어 이번 phase 가 바꾸는 로직의 현행을 이해하라:

- `tasks/19-worker-drawing-upload/phase0.md` — §1 "저장 구조 (새 규칙)" 및 "불변 규칙". 이 phase 가 문서를 실제 코드로 옮기는 phase 다.
- `tasks/19-worker-drawing-upload/docs-diff.md` — phase 0 문서 diff.
- `docs/specs/features/drawing-workflow.md` §W.1 (phase 0 에서 업데이트된 새 규칙).
- `webhard-api/src/folders/folders.service.ts:1289~1458` — 현재 `ensureInquiryFolder`. inquiryType 이 null 이면 null 반환하는 분기. 이걸 **inquiryType 무관 단일 로직**으로 교체.
- `webhard-api/src/folders/folders.service.ts:520~` `initializeCompanyFolders` + `DEFAULT_FOLDER_TEMPLATE` (칼선의뢰·목형의뢰) — **유지** 대상. 변경 금지.
- `webhard-api/src/folders/folders.service.ts` 내 `relocateContactFiles` — 기존 파일 이동 유틸. 재사용.
- `webhard-api/src/common/inquiry-filename.util.ts` — `buildInquiryFolderName`. 새 규칙 (`문의-{O}`, `문의-{O}_{F}`) 과 호환되는지 확인·필요 시 수정.
- `webhard-api/src/contacts/contacts.service.ts` — `updateInquiryType`, `updateProcessStage`, workNumber 갱신 경로 (현재 task 18 에서 처리된 873~889, 1089~1107 근처). F 번호 추가 감지 지점 식별.
- `webhard-api/prisma/schema.prisma` — `WebhardFolder` 모델 (task 18 에서 추가된 `contactId`, `inquiryNumber`, `workNumber`, `folderKind` 확인).
- `webhard-api/src/folders/folders.service.spec.ts`, `contacts.service.spec.ts` — 기존 테스트 패턴 파악.

이유: 폴더 생성·rename·이동 3 가지 새 동작이 contacts.service 여러 이벤트에 훅으로 걸려야 하며, 기존 호출처들을 깨뜨리지 않도록 기존 시그니처 호환성을 먼저 파악해야 한다.

## 작업 내용

### 1. `folders.service.ts` — 폴더 API 재설계

**`ensureInquiryFolder(contactId: string): Promise<WebhardFolder | null>`** 재작성:

- `WebhardFolder.findFirst({ where: { contactId, folderKind: 'inquiry' } })` 로 기존 폴더 확인. 있으면 반환.
- 없으면 Contact 조회 → `company` 조회 → 업체 루트 폴더 (`folderKind='root'` 또는 parentId null + name == company.name) 확보.
- 폴더명: `buildInquiryFolderName({ inquiryNumber: contact.inquiryNumber, workNumber: contact.workNumber })`.
- inquiryNumber · workNumber 가 **둘 다 null** 이면 `null` 반환 (문의번호 없으면 폴더 생성 불가). Contact 루트 fallback 은 상위 호출자가 판단.
- 생성 시 `folderKind='inquiry'`, `contactId`, `inquiryNumber`, `workNumber` 채움.

**`renameInquiryFolderForContact(contactId: string): Promise<void>`** 신규:

- `ensureInquiryFolder` 와 동일한 findFirst 로 기존 폴더 조회.
- Contact 현재 `inquiryNumber`, `workNumber` 를 다시 읽어 `buildInquiryFolderName` 으로 새 이름 계산.
- 기존 `name` 과 다르면 `update({ name, workNumber: contact.workNumber })`. R2 object key 는 건드리지 않는다.
- 폴더 자체가 없으면 no-op.

**`moveInquiryFolderToCompleted(contactId: string): Promise<void>`** 신규:

- 기존 문의 폴더 조회 (동일 findFirst). 없으면 no-op.
- 이미 `완료/` 하위에 있으면 no-op (이중 이동 방지 — parentId 의 name === '완료' 체크).
- 업체 루트 하위 `완료/` 폴더 ensure (없으면 생성, `folderKind='template'`).
- 문의 폴더 `update({ parentId: 완료폴더.id })`. R2 key 유지.

**`initializeCompanyFolders`**: 기존 template (`DEFAULT_FOLDER_TEMPLATE`) 생성 로직 그대로. `완료/` 는 **여기서 미리 생성하지 말 것** — lazy.

### 2. `contacts.service.ts` — 이벤트 훅 추가

workNumber 가 갱신되는 모든 경로에서 `renameInquiryFolderForContact(contactId)` 호출 (await, 실패는 try/catch 로 warn 로그 + 진행 허용).

- 후보 경로: `updateWorkNumber` 전용 메서드가 있으면 거기, 없으면 `updateProcessStage` 내부에서 workNumber 발번되는 분기.

processStage 가 `'납품'` (또는 `delivery` 등 도메인 enum 명확화) 로 전환되는 경로에서 `moveInquiryFolderToCompleted(contactId)` 호출 (Best Effort: try/catch + warn 로그).

- processStage 도메인은 `docs/specs/features/drawing-workflow.md` 또는 `contacts.service.ts` 의 기존 stage enum 참고. 정확한 값이 불확실하면 해당 enum 정의부에서 `'납품'` / `'delivery'` 에 해당하는 키를 그대로 사용.

### 3. `inquiry-filename.util.ts` 확장 (필요 시)

`buildInquiryFolderName({ inquiryNumber, workNumber })` 가 이미 있으면 그대로 사용. 없으면 신규:

```ts
export function buildInquiryFolderName(input: {
  inquiryNumber: string | null;
  workNumber: string | null;
}): string | null {
  const { inquiryNumber, workNumber } = input;
  if (!inquiryNumber && !workNumber) return null;
  if (inquiryNumber && workNumber) return `문의-${inquiryNumber}_${workNumber}`;
  return `문의-${inquiryNumber ?? workNumber}`;
}
```

### 4. 테스트 추가

`webhard-api/src/folders/__tests__/inquiry-folder.spec.ts` (없으면 신규, 있으면 확장):

- E1: `ensureInquiryFolder` — O 만 있을 때 `문의-{O}` 이름으로 생성 (`folderKind='inquiry'`, `contactId`, `inquiryNumber` 세팅 확인).
- E2: O + F 있을 때 `문의-{O}_{F}` 이름.
- E3: `renameInquiryFolderForContact` — 기존 `문의-{O}` 폴더가 있는 Contact 에 F 번호 추가 → findFirst 로 조회된 폴더 `name` 이 `문의-{O}_{F}` 로 update 됨. R2 key 변경 없음 (mock 호출 없음 확인).
- E4: `moveInquiryFolderToCompleted` — `완료/` 폴더 없으면 자동 생성 + 문의 폴더 parentId 가 `완료/` 로 변경.
- E5: 동일 contactId 로 `ensureInquiryFolder` 두 번 호출 — 기존 폴더 재사용 (중복 생성 안 함).
- E6: template (`칼선의뢰`, `목형의뢰`) 폴더는 `initializeCompanyFolders` 재호출 시 삭제되지 않음.

`webhard-api/src/contacts/contacts.service.spec.ts` 확장:

- H5: workNumber 갱신 시 `renameInquiryFolderForContact` 호출됨.
- H6: `processStage='납품'` 전환 시 `moveInquiryFolderToCompleted` 호출됨.
- H7: 이미 완료 폴더에 있는 Contact 에 재진입 시 중복 이동 없음 (moveInquiryFolderToCompleted 의 no-op 분기 확인).

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test -- --testPathPattern="folders|contacts"
```

build 통과 + 관련 spec 파일 녹색.

## AC 검증 방법

위 커맨드 통과 시 `tasks/19-worker-drawing-upload/index.json` 의 phase 1 status 를 `"completed"`. 3 회 실패 시 `"error"` + `"error_message"`.

## 주의사항

- template (`칼선의뢰`, `목형의뢰`) 폴더 **생성 제거 / 삭제 / 이동 금지**. 거래처 원본 업로드 수신 경로로 계속 사용.
- R2 object key 는 폴더 rename / 이동 시 **변경 금지** — DB 레코드만 업데이트.
- `contactId` FK 는 loose reference (`onDelete: SetNull` 아님, task 18 스펙 유지). Contact 삭제돼도 folder 는 남는다.
- `ensureInquiryFolder` 의 기존 호출처 (`syncRevisionToWebhard`, `registerFilesToWebhard`, `auto-contact.service.ts` 등) 에서 inquiryType 인자를 넘기던 부분이 있다면 해당 인자 제거. 기존 호출처 모두 새 시그니처와 호환되게 조정.
- `moveInquiryFolderToCompleted` 는 Best Effort — 실패해도 processStage 전환 자체는 성공으로 처리. try/catch + `logger.warn` 만. 트랜잭션 롤백 금지.
- 기존 DB 데이터 백필 금지 — 기존 rootFolder 에 흩어진 파일들은 건드리지 않음 (task 17 confirmed 정책).
- phase 2 가 `syncRevisionToWebhard` 에서 이 API 들을 호출할 것이므로 시그니처 확정 후 절대 변경 금지.
