# Phase 2: Contact ↔ WebhardFolder 공통 훅 구축 (contact-folder-hook)

## 사전 준비

먼저 아래 문서를 반드시 읽어라:

- `docs/specs/features/contact-webhard-folder.md` — **이번 phase 의 스펙**. 폴더 경로 스키마, 공통 훅 설계, 폴더명 생성 유틸 확장 규칙이 전부 여기 있다.
- `docs/specs/features/drawing-workflow.md` §W.1 (Phase 0 업데이트 포함) — 폴더 생성/relocate 불변 규칙.
- `/tasks/23-qa-contact-worker-v1/docs-diff.md` — Phase 0 문서 변경 기록.
- `CLAUDE.md` — NestJS 컨벤션 (DTO + class-validator, Prisma as sole DB access).

그리고 현재 구조를 이해하라:

- `webhard-api/src/common/inquiry-filename.util.ts` — 기존 `buildInquiryFolderName`. 현재 `문의-{O}_{F}` 형식만 지원, 시그니처 `(contact: { inquiryNumber?: string | null; workNumber?: string | null }): string | null`. 확장 필요.
- `webhard-api/src/folders/folders.service.ts:1336` `ensureInquiryFolder(contactId, tx?)`, 1468 `renameInquiryFolderForContact(contactId, tx?)`, 1625 `relocateContactFiles(contactId, folderId, tx?)`, 1376-1389 폴더명 생성 분기. **인수 순서 주의: contactId 가 첫 번째, tx 가 두 번째 optional.**
- `webhard-api/src/folders/_lib/resolve-company-root.util.ts` (task 22 에서 추가된) — 업체 루트 폴더 탐색. (프로젝트 내 `_lib/` 디렉토리는 folders 한정. contacts 하위 신규 파일은 `_lib/` 없이 `contacts/` 직하 배치 — `common/` 이 공용 단일 소스.)
- `webhard-api/src/contacts/contacts.service.ts:590-647` `create`, 876 `updateProcessStage`, 1189 `updateInquiryType` — 기존 폴더 생성 훅 호출처.
- **`updateInquiryType` 는 이미** `$transaction` 내부에서 `renameInquiryFolderForContact → ensureInquiryFolder → relocateContactFiles` 를 수행한다 (line 1255-1264). 따라서 "분류 확정 시 폴더 생성 보강" 이 아니라 **단순히 이 3 단계 호출을 `ContactFolderSyncService.onInquiryTypeClassified` 로 위임**하면 된다.
- `webhard-api/src/integration/orders/auto-contact.service.ts:181-335` `createNewContact` — 별도 경로로 ensureInquiryFolder 직접 호출. `finalInquiryType=null` 이어도 현재 `ensureInquiryFolder` 는 호출 (relocate 만 skip). Phase 2 전환 시 **미분류 Contact 의 폴더 생성 시점이 분류 확정 시점까지 지연된다** — 의도된 변경 (Phase 0 spec § contact-webhard-folder.md).
- `webhard-api/prisma/schema.prisma` — `Contact` 모델은 `source` (default "website"), `inquiryTitle`, `inquiryNumber`, `workNumber` 등 전 필드 존재. `WebhardFolder`, `WebhardFile`, `DrawingRevision` 모델 참조.

## 작업 내용

### 1. `webhard-api/src/common/inquiry-filename.util.ts` 확장

`buildInquiryFolderName` 시그니처에 패키지명 라벨과 파일명 fallback 매개변수를 추가한다.

시그니처:

```ts
export interface BuildInquiryFolderNameInput {
  inquiryNumber: string | null;
  workNumber: string | null;
  /** 공개 폼의 inquiry_title(패키지명). 있으면 폴더명에 우선 사용. */
  packageLabel?: string | null;
  /** packageLabel 이 null 일 때 fallback 으로 쓸 첫 번째 첨부 파일명. 확장자 제거 후 slug 화. */
  filenameFallback?: string | null;
}

/**
 * 폴더명 생성 규칙:
 * 1. inquiryNumber 없으면 null (기존 동작 유지)
 * 2. packageLabel || filenameFallback 이 있으면 → `{slug}-{inquiryNumber}[_{workNumber}]`
 * 3. 둘 다 없으면 → `문의-{inquiryNumber}[_{workNumber}]` (기존 동작)
 */
export function buildInquiryFolderName(input: BuildInquiryFolderNameInput): string | null;
```

slug 규칙:

- NFKC 정규화
- 특수문자 `/\:*?"<>|` 제거 (파일시스템 금지 문자)
- 연속 공백 → 단일 `_` 로 치환
- 선행/후행 공백 trim
- 최대 길이 50 자 (초과 시 truncate)
- 빈 문자열 결과 시 null 반환 (호출처에서 fallback 경로 타도록)

slug 유틸은 동일 파일 내 헬퍼 `slugifyPackageLabel(raw: string): string | null` 로 추출.

### 2. `webhard-api/src/contacts/contact-folder-sync.service.ts` (신규)

Contact 상태 변화에 따른 폴더 생성/rename/파일 이동의 **단일 진입점** 서비스를 만든다.

시그니처:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FoldersService } from '../../folders/folders.service';

export interface ContactFolderSyncContext {
  contactId: string;
  /** Prisma.TransactionClient | PrismaService. $transaction 내에서 호출 가능해야 함. */
  client?: Prisma.TransactionClient;
}

@Injectable()
export class ContactFolderSyncService {
  private readonly logger = new Logger(ContactFolderSyncService.name);

  constructor(private readonly foldersService: FoldersService) {}

  /**
   * Contact 신규 생성 직후 호출. inquiryType 이 확정되어 있으면 폴더 생성 + 파일 relocate.
   * inquiryType = null 이면 no-op (분류 확정 시 onInquiryTypeClassified 가 처리).
   */
  async onContactCreated(ctx: ContactFolderSyncContext): Promise<void>;

  /**
   * 미분류 → 분류 확정(inquiryType 설정) 시 호출.
   * 반드시 폴더 생성 + 파일 relocate 를 실행. null 반환 시 silent skip 금지 → 예외 throw.
   */
  async onInquiryTypeClassified(ctx: ContactFolderSyncContext): Promise<void>;

  /**
   * processStage 변경 시 호출 (특히 drawing_confirmed 로 전환 시 workNumber 생성 후 폴더 rename).
   * workNumber 가 이미 존재하더라도 rename 을 skip 하지 않는다 (이슈 4 의 silent fail 원인).
   */
  async onProcessStageChanged(
    ctx: ContactFolderSyncContext & {
      previousStage: string | null;
      nextStage: string;
    }
  ): Promise<void>;
}
```

내부 구현 규칙:

- `client` 인자는 `$transaction` 의 tx 를 전달받아 사용. 없으면 `PrismaService` 직접 사용 (하위 호환).
- `FoldersService` 호출 인수 순서는 **`(contactId, tx?)`** — client 가 두 번째 optional. `relocateContactFiles` 는 `(contactId, folderId, tx?)`.
- `FoldersService.ensureInquiryFolder` 호출 후 `null` 반환 시:
  - `onContactCreated` / `onInquiryTypeClassified`: **warn 로그 후 조용히 skip** (기존 best-effort 유지). Company 미등록 업체의 분류 자체를 실패시키지 않음 — UX 회귀 방지.
  - `onProcessStageChanged`: `nextStage='drawing_confirmed'` 로 전환되는데 null 이면 **throw** (Phase 5). 그 외 stage 는 warn+skip.
- `relocateContactFiles` 결과 `movedIds` 를 로그에 기록.
- `packageLabel` 계산: `contact.inquiryTitle ?? null`. 빈 문자열도 null 취급. (Prisma 필드는 camelCase `inquiryTitle`.)
- `filenameFallback` 계산: `DrawingRevision` 의 최신 버전의 첫 번째 `webhardFileIds[0]` 에 해당하는 `WebhardFile.name` 조회 후 확장자 제거. Auto-contact 경로에서 주로 사용.

### 3. `webhard-api/src/folders/folders.service.ts` 수정

`ensureInquiryFolder` 호출 흐름에서 `buildInquiryFolderName` 에 `packageLabel`, `filenameFallback` 을 전달한다.

기존 1380-1388:

```ts
const folderName = buildInquiryFolderName({
  inquiryNumber: contact.inquiryNumber,
  workNumber: contact.workNumber,
});
if (!folderName) {
  this.logger.warn({ contactId }, 'NO_INQUIRY_NUMBER');
  return null;
}
```

→ 수정:

```ts
const packageLabel = contact.inquiry_title ?? null;
const filenameFallback = await this.loadFirstAttachedFilename(client, contactId);
const folderName = buildInquiryFolderName({
  inquiryNumber: contact.inquiryNumber,
  workNumber: contact.workNumber,
  packageLabel,
  filenameFallback,
});
if (!folderName) {
  this.logger.warn(
    { contactId, reason: 'NO_INQUIRY_NUMBER' },
    'buildInquiryFolderName returned null'
  );
  return null;
}
```

`loadFirstAttachedFilename` 헬퍼:

- 최신 `DrawingRevision.webhardFileIds[0]` 조회
- 해당 `WebhardFile.name` 에서 확장자 제거 후 반환
- 없으면 null

### 4. `webhard-api/src/contacts/contacts.module.ts` 업데이트

`ContactFolderSyncService` 를 providers 에 등록하고 export. `AutoContactModule` 에서도 import 가능하도록 `webhard-api/src/integration/orders/` 에 의존성 주입.

### 5. 기존 호출처 위임

- `ContactsService.create` (현재 `ensureInquiryFolder` 직접 호출) → `ContactFolderSyncService.onContactCreated` 로 교체.
- `ContactsService.updateInquiryType` (이미 `$transaction` 내부에서 rename→ensure→relocate 3 단계를 수행 중) → 동일 3 단계를 수행하는 `ContactFolderSyncService.onInquiryTypeClassified` 로 **단순 위임 교체**. 동작 변경 없음.
- `AutoContactService.createNewContact` → `ContactFolderSyncService.onContactCreated` 로 교체.
  - **동작 변경 주의**: 현재 `finalInquiryType=null` (외부동기화 미분류) 이어도 `ensureInquiryFolder` 는 호출해왔다. `onContactCreated` 는 `inquiryType=null` 이면 no-op 이므로, **미분류 Contact 의 폴더 생성 시점이 분류 확정(`onInquiryTypeClassified`) 까지 지연**된다. Phase 0 spec § contact-webhard-folder.md 의 의도된 변경. docs-diff 에 명시.
- **`ContactsService.updateProcessStage` 는 이 phase 에서는 기존 로직 유지**. Phase 5 에서 silent fail 수정 시 `ContactFolderSyncService.onProcessStageChanged` 로 교체 (드로잉 확정 전환에서만 throw).

## Acceptance Criteria

백엔드 phase 이므로 아래 커맨드로 검증:

```bash
cd webhard-api && pnpm build
```

```bash
cd webhard-api && pnpm test
```

두 커맨드 모두 통과해야 한다. 기존 task 20, 21, 22 의 테스트가 깨지면 리팩토링이 동작을 바꾼 것 — 원인 파악 후 수정 (동작 보존 원칙).

### 유닛 테스트 (핵심 유틸)

`webhard-api/src/common/inquiry-filename.util.spec.ts` (기존 파일) **확장**:

- `buildInquiryFolderName`:
  - (a) `packageLabel='샘플A', inquiryNumber='O123'` → `'샘플A-O123'`
  - (b) `packageLabel=null, filenameFallback='도면.dxf', inquiryNumber='O123'` → `'도면-O123'`
  - (c) `packageLabel='a/b:c*', inquiryNumber='O123'` → slug sanitize 확인 (`'abc-O123'` 또는 `'a_b_c-O123'` 등 규칙 일관)
  - (d) `packageLabel=null, filenameFallback=null, inquiryNumber='O123'` → `'문의-O123'` (현행 유지)
  - (e) `inquiryNumber=null, workNumber=null` → null

### 통합 테스트 (실제 Supabase dev DB)

`webhard-api/src/contacts/contact-folder-sync.service.spec.ts` **신규**:

- `onInquiryTypeClassified`:
  - inquiry_title 있는 Contact 분류 확정 → `{업체명}/문의/{패키지명}-{O}` 폴더 생성 확인 (실제 DB 조회)
  - `ensureInquiryFolder` null 반환 케이스(예: Company 미등록 + fallback 실패) → throw 확인
- `onContactCreated`:
  - inquiryType=null Contact → no-op
  - inquiryType 확정 Contact → 폴더 생성 + 파일 relocate 확인

통합 테스트는 `beforeEach` 에서 트랜잭션 시작, `afterEach` 에서 롤백 패턴 사용. dev DB 실데이터 오염 방지.

## AC 검증 방법

위 2 커맨드를 **병렬 실행** 하여 모두 통과 시 phase 2 status `"completed"`.

3 회 이상 실패 시 `"error"` + `error_message`.

## 주의사항

- **기존 `ensureInquiryFolder` / `relocateContactFiles` 시그니처를 바꾸지 마라**. 내부 호출만 `buildInquiryFolderName` 확장 버전을 사용하도록 수정.
- `packageLabel` 과 `filenameFallback` 은 Optional. 기존 호출처가 아무것도 전달하지 않아도 기존 동작(`문의-{O}`) 유지.
- `ContactFolderSyncService` 는 `FoldersService` 를 주입받되, `FoldersService` 내부 로직을 중복 구현하지 말 것. 얇은 orchestration 레이어로 유지.
- `onInquiryTypeClassified` 의 throw 는 트랜잭션 롤백 유도용. `ContactsService.updateInquiryType` 는 이 호출을 `$transaction` 내에서 수행하여 DB 정합성 보장.
- `loadFirstAttachedFilename` 은 N+1 주의. 가능하면 `ensureInquiryFolder` 진입 시점에 이미 로드된 contact 데이터를 재사용.
- 한글 커밋: `feat(qa-contact-worker-v1): phase 2 — contact-folder-hook`.
