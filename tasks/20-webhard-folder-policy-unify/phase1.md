# Phase 1: folder-service-refactor

## 사전 준비

아래 문서·코드를 반드시 읽고 이번 phase 가 바꾸는 로직의 현행을 이해하라:

- `tasks/20-webhard-folder-policy-unify/phase0.md` — §1 "저장 구조" 및 §2 불변 규칙. 이 phase 가 문서를 실제 코드로 옮긴다.
- `tasks/20-webhard-folder-policy-unify/docs-diff.md` — phase 0 문서 diff (run-phases.py 가 자동 생성).
- `docs/specs/features/drawing-workflow.md` §W.1 (phase 0 에서 업데이트된 새 규칙).
- `webhard-api/src/folders/folders.service.ts` — 현재 `ensureInquiryFolder` 는 업체 루트 직하에 `문의-{O}/` 폴더를 만든다. 그 parent 계산 로직을 식별할 것 (rootFolder 확보 로직).
- `webhard-api/src/folders/folders.service.ts` — `DEFAULT_FOLDER_TEMPLATE` 상수 (현재 `['칼선의뢰', '목형의뢰']`). `initializeCompanyFolders` 는 이 상수를 순회해 업체 초기화 시 template 폴더를 eager 생성.
- `webhard-api/src/folders/folders.service.ts` — `moveInquiryFolderToCompleted` (변경 불필요, 로직 유지 확인용).
- `webhard-api/src/folders/folders.service.spec.ts` — 기존 E1~E7 (또는 해당 번호) 테스트에서 `ensureInquiryFolder` 결과의 `parentId` 기대값이 `rootFolder.id` 로 되어 있음. 이번 phase 에서 중간 `문의/` 폴더 id 로 교체 필요.
- `webhard-api/prisma/schema.prisma` — `WebhardFolder` 모델. `folderKind` 필드가 `'template' | 'inquiry' | 'root' | 'generic'` 등을 받음. 새 enum 값 추가 불필요.
- `webhard-api/src/common/inquiry-filename.util.ts` — `buildInquiryFolderName`. 분할 suffix 처리 이미 OK (`inquiry-filename.util.spec.ts:155, 159` 검증됨) — 이 phase 에서 util 수정 불필요.

이유: 폴더 구조 변경 (중간 "문의" 폴더 삽입) 은 `ensureInquiryFolder` 의 parent 계산 로직 한 지점에 집중된다. 기존 spec 의 parent 기대값도 함께 수정해야 회귀를 막을 수 있다.

## 작업 내용

### 1. `folders.service.ts` — `ensureInquiryRootFolder` 헬퍼 신규 추가

아래 시그니처로 메서드 추가:

```ts
async ensureInquiryRootFolder(
  companyId: string,
  tx?: Prisma.TransactionClient,
): Promise<WebhardFolder>
```

동작 규칙:

- 업체 루트 폴더 조회 (기존 `ensureInquiryFolder` 내부의 rootFolder 확보 로직 재사용 — 복붙 금지, private helper 로 분리하거나 기존 내부 접근 방식 그대로 쓸 것).
- 업체 루트 하위에서 `findFirst({ where: { parentId: rootFolder.id, name: '문의', folderKind: 'template' } })`.
- 없으면 `create({ parentId: rootFolder.id, name: '문의', folderKind: 'template', companyId })`. 있으면 그대로 반환.
- 멱등: 여러 번 호출해도 중복 생성 없음.
- `tx` 가 있으면 트랜잭션 클라이언트 사용, 없으면 `this.prisma` 직접 사용 (기존 `ensureInquiryFolder` 패턴 재활용).

### 2. `folders.service.ts` — `ensureInquiryFolder` parent 계산 변경

기존 동작: 업체 루트 조회 → `parentId = rootFolder.id` 로 `문의-{O}` 폴더 생성.

변경 후:

```ts
const inquiryRoot = await this.ensureInquiryRootFolder(companyId, tx);
// parentId = inquiryRoot.id 로 문의 폴더 create
```

나머지 동작 (contactId 기준 findFirst, `buildInquiryFolderName`, `folderKind='inquiry'`, `inquiryNumber`/`workNumber`/`contactId` 세팅) 은 그대로 유지.

### 3. `folders.service.ts` — `DEFAULT_FOLDER_TEMPLATE` 에 "문의" 추가

기존 상수:

```ts
const DEFAULT_FOLDER_TEMPLATE = ['칼선의뢰', '목형의뢰'];
```

변경 후:

```ts
const DEFAULT_FOLDER_TEMPLATE = ['칼선의뢰', '목형의뢰', '문의'];
```

`initializeCompanyFolders` 본문은 건드리지 말 것 — 상수 갱신만으로 신규 업체는 `문의/` 폴더가 eager 생성됨.

### 4. `folders.service.ts` — `moveInquiryFolderToCompleted` 확인

로직 변경 불필요. 단, 주석을 한 줄 보강:

```
// NOTE: 문의 폴더의 기존 parent 는 업체 루트 하위 `문의/` 폴더.
//       이관 후 parent 는 업체 루트 하위 `완료/` 폴더 (중간 `문의/` 아님).
```

### 5. 테스트 추가·수정 — `folders.service.spec.ts`

**수정**: 기존 E1~E7 (`ensureInquiryFolder` 결과의 parent 기대값) 테스트에서 parent 를 `rootFolder.id` → **`inquiryRoot.id`** 로 변경. 테스트 setup 에서 `문의/` 폴더를 선행 생성하거나, `ensureInquiryRootFolder` 가 내부에서 호출될 것을 전제로 mock 세팅.

**신규 P1-1**: `ensureInquiryRootFolder` — 업체 루트만 있고 `문의/` 폴더 없을 때 생성. 반환값의 `name='문의'`, `folderKind='template'`, `parentId=rootFolder.id` 확인.

**신규 P1-2**: `ensureInquiryRootFolder` — 이미 `문의/` 폴더 존재 시 findFirst hit, 중복 create **안 함** (멱등 검증 — `prisma.webhardFolder.create` mock 미호출 확인).

**신규 P1-3**: `ensureInquiryFolder` — parent 가 `inquiryRoot.id` 여야 함 (핵심 구조 변경 검증). `rootFolder.id` 가 아닌지 명시적으로 assertion.

**신규 P1-4**: `initializeCompanyFolders` — 신규 업체 초기화 시 `칼선의뢰`, `목형의뢰`, `문의` 3 개 폴더 모두 eager 생성됨 확인 (`prisma.webhardFolder.create` 3 회 호출).

**신규 P1-5 (통합)**: 기존 업체 (칼선의뢰·목형의뢰 만 있는 setup) 에서 `ensureInquiryFolder` 호출 시 — `ensureInquiryRootFolder` 가 lazy 로 `문의/` 생성 → 이어서 `문의-{O}` 가 그 하위에 생성. 2 폴더 create 호출 확인.

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test
```

기존 테스트 회귀 없고 신규 P1-1~P1-5 통과. 단위 테스트는 `folders.service.spec.ts` 파일 내에 추가 (새 파일 생성 금지).

## AC 검증 방법

위 커맨드 통과 시 `tasks/20-webhard-folder-policy-unify/index.json` 의 phase 1 status 를 `"completed"` 로 변경. 3 회 실패 시 `"error"` + `"error_message"`.

## 주의사항

- `folderKind` enum 에 새 값 추가 **금지** — 기존 `'template'` 재사용.
- `moveInquiryFolderToCompleted` 로직 건드리지 말 것 — 주석만 1 줄 보강.
- `renameInquiryFolderForContact` 건드리지 말 것 — 폴더명만 바꾸므로 parent 변경 영향 없음.
- `ensureInquiryRootFolder` 에 `folderKind='inquiry_root'` 같은 새 값 쓰지 말 것 — `'template'` 통일.
- prisma migration 생성 **금지** (schema 변경 없음).
- phase 2 (`contacts.service.create`) 는 이 phase 에서 건드리지 **않는다**.
- 기존 업체 (task 19 이후 `문의-{O}` 폴더가 업체 루트 직하에 이미 만들어진) 폴더 데이터 마이그레이션 **금지** — task 21 으로 분리.
