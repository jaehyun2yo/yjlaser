# Phase 5: folder-routing-hooks

## 사전 준비

- `tasks/18-drawing-consistency/phase0.md` §1 "저장 구조(새 규칙)" — 이번 phase 가 구현할 3단 구조의 원천.
- `tasks/18-drawing-consistency/phase1.md` 산출물: `buildInquiryFolderName`.
- `tasks/18-drawing-consistency/phase2.md` 산출물: `WebhardFolder.contactId`, `folderKind`, `inquiryNumber`, `workNumber` 필드.
- `webhard-api/src/contacts/contacts.service.ts:1089~1107` — `inquiryType` 변경 시 번호 발급 로직. 이 phase 에서 훅 추가 지점 1.
- `webhard-api/src/contacts/contacts.service.ts:873~889` — processStage 전환 시 (office→field) workNumber 발급. 훅 추가 지점 2.
- `webhard-api/src/contacts/contacts.service.ts:732~733` — `status='production'` 진입 시 workNumber 발급. 훅 추가 지점 3.
- `webhard-api/src/folders/folders.service.ts:468~583` — `DEFAULT_FOLDER_TEMPLATE`, `initializeCompanyFolders`, `computeFolderPath`.
- `webhard-api/src/folders/webhard-config.service.ts:285~297` — `classifyByFolderPath` (inquiryType 판정). 참고.
- `webhard-api/src/contacts/drawing-revision.service.ts:391~469` — 현재 `syncRevisionToWebhard` 의 서브폴더 생성 로직. 이 phase 에서 `FoldersService.ensureInquiryFolder` 호출로 **대체** 한다.
- `webhard-api/src/contacts/contacts.gateway.ts:199~203` — 기존 emit 함수. 이 phase 에서 신규 emit 추가.
- `webhard-api/prisma/schema.prisma` — `WebhardFile.folderId`, `WebhardFile.path` 필드. 이동 시 path 재계산 필요.

이유: LGU+ sync 로 민컴 루트에 쌓인 파일을 관리자 분류 완료 후 `칼선의뢰|목형의뢰/문의-{번호}/` 로 **자동 이동**해야 "한 문의의 도면들이 한 폴더에 모이는" 운영 요구사항을 충족한다.

## 작업 내용

### 1. `FoldersService.ensureInquiryFolder(contactId, tx?)` 신규

시그니처:

```ts
async ensureInquiryFolder(
  contactId: string,
  tx?: Prisma.TransactionClient,
): Promise<WebhardFolder | null>;
```

로직:

1. Contact 조회 (`companyName`, `inquiryNumber`, `workNumber`, `inquiryType`).
2. `buildInquiryFolderName(contact)` 로 서브폴더 이름 계산. null 이면 null 반환 (번호 아직 없음).
3. `classifyByFolderPath` 와 동일한 규칙으로 template 이름 결정:
   - `inquiryType === 'cutting_request'` → `칼선의뢰`
   - `inquiryType === 'mold_request' || inquiryType === 'laser_cutting'` → `목형의뢰`
   - 그 외 → null 반환 (미분류)
4. Company 조회. 없으면 null 반환.
5. rootFolder 확보 (`companyId`, `parentId: null`). 없으면 `initializeCompanyFolders(companyId, companyName)` 호출 후 재조회.
6. templateFolder 확보 (`parentId: rootFolder.id`, `name: templateName`, `folderKind: 'template'`). findFirst → 없으면 create. `initializeCompanyFolders` 가 보통 만들어둠.
7. inquiryFolder 확보:
   - findFirst by `{ companyId, parentId: templateFolder.id, contactId, folderKind: 'inquiry', deletedAt: null }`
   - 있으면: `name` 이 `buildInquiryFolderName(contact)` 와 다르면 `update({ name, path: 재계산, inquiryNumber, workNumber })`. 같으면 그대로 반환.
   - 없으면: `create({ name, parentId: templateFolder.id, companyId, contactId, folderKind: 'inquiry', inquiryNumber, workNumber, path })`.
8. rename 또는 create 가 발생했으면 `contactsGateway.emitFolderEvent(...)` (신규 emit 메서드) 호출.

트랜잭션: `tx` 가 전달되면 해당 tx 로 쿼리, 없으면 `this.prisma` 사용.

### 2. `FoldersService.relocateContactFiles(contactId, targetFolderId, tx?)` 신규

```ts
async relocateContactFiles(
  contactId: string,
  targetFolderId: string,
  tx?: Prisma.TransactionClient,
): Promise<{ movedIds: string[] }>;
```

로직:

1. Contact 조회 (`inquiryNumber`, `workNumber`, `companyId`).
2. 이동 대상 WebhardFile 집합:
   - `DrawingRevision.webhardFileIds` 배열을 합쳐 얻은 id 들
   - `WebhardFile where companyId == contact.companyId AND inquiryNumber in [contact.inquiryNumber, contact.workNumber] AND deletedAt == null`
   - 두 집합 합집합(Set).
3. 각 WebhardFile 에 대해 `folderId !== targetFolderId` 면 `update`:
   - `folderId = targetFolderId`
   - `path = computeFilePath(targetFolderId, webhardFile.name)` 로 재계산
   - R2 object key 는 **건드리지 않는다**. `path` 는 UI 표시용 논리 경로.
4. 각 이동에 대해 `contactsGateway.emitFileMoved({contactId, fileId, oldFolderId, newFolderId})` 호출.
5. 반환값: 이동된 WebhardFile id 배열.

### 3. `ContactsService` 훅 추가

아래 3곳에서 번호 발급 성공 후(같은 tx 내에서) 호출:

- `:1089~1107` `updateContactInquiryType` 분기의 번호 발급 직후
- `:873~889` `updateContactProcessStage` 가 OFFICE → FIELD 전환하여 workNumber 발급한 직후
- `:732~733` `status='production'` 전환 시 workNumber 발급 직후

호출 패턴 (모두 동일):

```ts
const inquiryFolder = await this.foldersService.ensureInquiryFolder(contact.id, tx);
if (inquiryFolder) {
  await this.foldersService.relocateContactFiles(contact.id, inquiryFolder.id, tx);
}
```

이미 `prisma.$transaction` 로 감싸진 구간이면 그 tx 를 재사용. 아니면 새 `$transaction` 블록으로 감싼다.

### 4. `ContactsGateway` 신규 emit

`webhard-api/src/contacts/contacts.gateway.ts` 에 메서드 2개 추가:

```ts
emitFolderRenamed(payload: { contactId: string; folderId: string; oldName: string; newName: string }): void {
  this.server.to('admin').to('worker').emit('folder:renamed', payload);
}

emitFileMoved(payload: { contactId: string; fileId: string; oldFolderId: string; newFolderId: string }): void {
  this.server.to('admin').to('worker').emit('file:moved', payload);
}
```

company 룸은 포함하지 않음 (내부 운영 이벤트). `ensureInquiryFolder` 가 내부에서 적절히 호출한다.

### 5. `syncRevisionToWebhard` 리팩터링

`drawing-revision.service.ts:391~469` 의 기존 서브폴더 생성 로직(L419~L469) 을 `FoldersService.ensureInquiryFolder(contactId, tx)` 호출로 **대체**. `WebhardFile.create` 의 `folderId` 는 ensureInquiryFolder 결과의 `id` 사용. 서브폴더 직접 생성 코드는 **삭제**.

template 폴더 선택 로직도 이제 `ensureInquiryFolder` 내부에서 처리하므로 여기선 `targetFolderId` 만 받는다.

만약 `ensureInquiryFolder` 가 null 반환(미분류·번호 없음) 이면 `syncRevisionToWebhard` 는 **기존 업체 root** 폴더에 파일 생성 (fallback). 분류 완료 후 `relocateContactFiles` 가 자연스럽게 이동.

### 6. 테스트 시나리오

`webhard-api/src/folders/folders.service.spec.ts`:

- `ensureInquiryFolder`:
  - **S-O**: `inquiryType='cutting_request'`, `inquiryNumber='260417-O-002'` → `칼선의뢰/문의-260417-O-002/` 생성, folderKind='inquiry', contactId 채움
  - **S-F**: `inquiryType='mold_request'`, `workNumber='260420-F-004'` → `목형의뢰/문의-260420-F-004/`
  - **S-OF**: O 만 있던 contact 에 F 발급 → 같은 folderId 로 findFirst 되고 name 이 `문의-{O}_{F}` 로 rename
  - **S-Idem**: 재호출 시 같은 folder 반환, 중복 생성 없음
  - **S-Classify-fail**: `inquiryType === null` → null 반환, 폴더 생성 없음
- `relocateContactFiles`:
  - DrawingRevision.webhardFileIds 로 연결된 파일 이동
  - inquiryNumber/workNumber 로 매칭되는 파일 이동
  - 이미 target 에 있는 파일은 skip
  - path 재계산 확인

`webhard-api/src/contacts/contacts.service.spec.ts`:

- inquiryType 변경 → ensureInquiryFolder 호출 + WebhardFile 이동 검증
- processStage 전환(office→field) → F 번호 발급 + 폴더 rename 검증
- 트랜잭션 중간에 ensureInquiryFolder 실패 → Contact 업데이트까지 롤백

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test -- --testPathPattern="folders|contacts"
```

## AC 검증 방법

통과 시 phase 5 status `"completed"`. 3회 실패 시 `"error"`.

## 주의사항

- **R2 object key 를 이동하지 마라**. `WebhardFile.path` (표시 경로) 만 재계산. R2 copy+delete 는 비용·시간 크고 발급된 presigned URL 을 무효화한다.
- `WebhardFolder.path` 도 갱신 (`computeFolderPath(parentId, name)`). 조회 시 path 기반 검색이 있으면 일관성 필요.
- `ensureInquiryFolder` 는 **idempotent** 해야 함. 같은 contactId 로 여러 번 호출해도 결과 동일 + rename 이 필요한 경우 외에 create 안 함.
- `classifyByFolderPath` 는 LGU+ sync 에서만 쓰고, `ensureInquiryFolder` 는 inquiryType 기반. 둘이 독립적으로 동작해야 함.
- 트랜잭션 실패 시 **소켓 emit 은 발생하지 않아야** 한다. emit 은 트랜잭션 커밋 후. 현재 Nest-Socket.IO 패턴상 수동 try 후 성공 시에만 emit.
- `registerFilesToWebhard` (contacts.service.ts:2661) 는 이 phase 에서도 건드리지 마라. 별도 RFC.
- folder rename 시 folder.id 는 **유지**. 참조하던 WebhardFile.folderId 도 자동 유효. folderId 는 절대 바꾸지 마라.
- 신규 emit 은 admin + worker 룸만. company 룸에 emit 하면 거래처에 민감한 운영 정보(폴더 구조) 노출 위험.
