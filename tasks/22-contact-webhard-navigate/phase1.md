# Phase 1: Backend — 탐색 정책 통일 + DTO 확장 (backend-relocate-unify)

## 사전 준비

먼저 아래 문서들을 반드시 읽어라:

- `docs/specs/features/drawing-workflow.md` §W.1 불변 규칙 — **이번 phase 가 구현하는 정책의 최종 정의**. `resolveCompanyRoot` 유틸 명세, `relocateContactFiles` silent bail-out 제거 규칙이 여기 있다.
- `docs/specs/api/endpoints/webhard.md` — Contact 응답 DTO 에 추가되는 `webhardFileId` 필드 명세.
- `/tasks/22-contact-webhard-navigate/docs-diff.md` — Phase 0 이 남긴 문서 변경 기록. Phase 0 의 의사결정이 이 phase 의 작업 근거이므로 먼저 읽고 맥락을 파악하라.

그리고 이전 phase 의 작업물을 반드시 확인하라:

- Phase 0 에서 수정된 위 4 개 문서 — 이번 phase 의 규칙 근거.

이어서 관련 코드를 읽고 현재 구조를 이해하라:

- `webhard-api/src/folders/folders.service.ts` — `ensureInquiryRootFolder`, `ensureInquiryFolder`, `relocateContactFiles` 현재 구현. company 탐색 로직이 세 함수에 분산되어 있음.
- `webhard-api/src/folders/_lib/company-name-match.util.ts` — task 21 에서 추가된 정규화 매칭 유틸. `resolveCompanyRoot` 내부에서 재사용한다.
- `webhard-api/src/contacts/contacts.service.ts` — Contact 응답 변환 로직. `webhardFileId` 필드를 채워넣어야 한다.
- `webhard-api/src/contacts/dto/` 디렉토리 — 응답 DTO 파일들. `webhardFileId` 추가 위치 결정.
- `webhard-api/prisma/schema.prisma` — `DrawingRevision.webhardFileIds`, `WebhardFolder.contactId`, `Contact` 모델 관계 확인용.
- `src/lib/types/contact.ts` — 프론트엔드 Contact 타입. 같은 phase 에서 `webhardFileId` 필드 추가 (프론트 빌드 깨짐 방지).

## 작업 내용

### 1. `webhard-api/src/folders/_lib/resolve-company-root.util.ts` (신규)

세 함수가 공유할 company 탐색 유틸을 단일 파일로 추출한다.

시그니처:

```ts
export type CompanyRootReasonCode = 'NO_COMPANY_ROOT' | 'NO_FALLBACK_MATCH';

export interface ResolveCompanyRootResult {
  rootFolderId: string | null;
  companyId: string | null; // 정식 Company row 매칭 성공 시만 채움. fallback 성공 시 null
  reasonCode?: CompanyRootReasonCode;
}

export async function resolveCompanyRoot(
  client: Prisma.TransactionClient | PrismaService,
  companyName: string | null | undefined
): Promise<ResolveCompanyRootResult>;
```

탐색 3 단계 (docs/specs/features/drawing-workflow.md §W.1 Phase 0 업데이트 규칙 준수):

1. `companyName` 이 있으면 `client.company.findFirst({ where: { companyName }, select: { id: true } })` 시도 → 매칭 성공 시 그 `company_id` 로 `webhardFolder.findFirst({ where: { companyId, folderKind: 'root' } })` 조회 → `{ rootFolderId, companyId, reasonCode: undefined }` 반환
   - Company 는 찾았으나 루트 폴더 없으면 `{ rootFolderId: null, companyId, reasonCode: 'NO_COMPANY_ROOT' }`
2. 1 실패 시 `webhardFolder.findFirst({ where: { parentId: null, name: companyName, folderKind: 'root' } })` (완전 일치 fallback)
3. 2 실패 시 `company-name-match.util.ts` 의 정규화 매칭 (NFKC + 공백/특수문자 제거 + 소문자화) 로 업체 루트 후보 조회
4. 모두 실패 시 `{ rootFolderId: null, companyId: null, reasonCode: 'NO_FALLBACK_MATCH' }`

`client` 인자는 `$transaction` 내에서 사용할 수 있어야 하므로 `Prisma.TransactionClient` 또는 `PrismaService` 를 모두 받을 수 있도록 타입 유니온.

### 2. `webhard-api/src/folders/folders.service.ts` 리팩토링

`ensureInquiryRootFolder(companyId, tx?)` 및 `ensureInquiryFolder(contactId, tx?)` 및 `relocateContactFiles(contactId, targetFolderId, tx?)` 가 **모두 `resolveCompanyRoot` 를 사용하도록 수정**한다. 중복된 company 탐색 로직은 제거.

핵심 변경점 — `relocateContactFiles`:

현재 코드 (folders.service.ts:1703-1709 부근):

```ts
const company = await client.company.findFirst({
  where: { companyName: contact.companyName },
  select: { id: true },
});
if (!company) {
  return { movedIds: [] };
}
```

→ **제거**하고 `resolveCompanyRoot` 결과 사용:

```ts
const { rootFolderId, companyId, reasonCode } = await resolveCompanyRoot(
  client,
  contact.companyName
);
if (!rootFolderId) {
  logger.warn(
    { reasonCode, contactId, companyName: contact.companyName },
    '[relocateContactFiles] no root folder'
  );
  return { movedIds: [] };
}
```

OR 절 두 갈래(`revision.webhardFileIds` / `companyId + inquiryNumber`) 는 그대로 유지하되, `companyId` 가 null 일 때는 두 번째 OR 절은 skip (companyId 기반 조회가 무의미하므로). 즉:

```ts
const orClauses: Prisma.WebhardFileWhereInput[] = [];
if (revisionFileIds.length > 0) orClauses.push({ id: { in: revisionFileIds } });
if (companyId && contact.inquiryNumber) {
  orClauses.push({ companyId, inquiryNumber: contact.inquiryNumber });
}
if (orClauses.length === 0) return { movedIds: [] };
```

단, companyId 없어도 `revision.webhardFileIds` 경로로는 파일을 찾을 수 있으므로 이동 시도 자체는 유효하다. fallback rootFolder 로는 `targetFolderId` 결정과 관련되므로 이동 자체는 `webhardFileIds` 존재 시 성공한다.

`ensureInquiryRootFolder` 와 `ensureInquiryFolder` 는 현재도 유사한 3 단계 탐색을 이미 수행하고 있다면, 이 phase 에서 모두 `resolveCompanyRoot` 로 **단일화**한다. 기존 동작이 바뀌지 않도록 주의 — 통일 후 동등성을 테스트로 확인한다 (Phase 2).

### 3. `webhard-api/src/contacts/contacts.service.ts` — Contact 응답 DTO 에 `webhardFileId` 추가

Contact 를 응답 shape 로 변환하는 지점(`findAll`, `findOne`, 기타 `toResponseDto` 또는 inline map) 에 아래 로직 추가:

```ts
const latestRevision = contact.drawingRevisions?.sort((a, b) => b.version - a.version)[0];
const webhardFileId = latestRevision?.webhardFileIds?.[0] ?? null;
```

응답 DTO 에 `webhardFileId: webhardFileId` 필드 포함. 기존 `drawingRevisions` 포함 여부와 무관하게 응답에 이 필드는 항상 포함되도록 `include: { drawingRevisions: true }` 가 아닌 경우라면 별도 쿼리 또는 `select` 로 필요한 필드만 조회해도 된다 (성능 고려).

성능 노트: N+1 을 피하기 위해 리스트 쿼리에서 `include: { drawingRevisions: { orderBy: { version: 'desc' }, take: 1, select: { webhardFileIds: true } } }` 형태로 1 건만 조회하여 webhardFileId 계산. 단, 기존 쿼리에 이미 drawingRevisions 전체가 포함되어 있다면 그 결과를 재사용해도 무방.

### 4. DTO 파일 업데이트

`webhard-api/src/contacts/dto/` 디렉토리의 응답 DTO 에 `webhardFileId?: string | null` 필드 추가. class-validator 데코레이터 (`@IsOptional() @IsString() @IsUUID()`) 는 응답 DTO 라 필수 아니지만, Swagger 사용 중이면 `@ApiProperty({ nullable: true })` 추가.

### 5. `src/lib/types/contact.ts` (프론트엔드 타입 동기화)

Contact 타입에 아래 필드 추가:

```ts
webhardFileId?: string | null;
```

snake_case 필드와 camelCase 중 프로젝트 컨벤션에 따라 정확히 일치시킨다. 기존 `webhard_folder_id` / `webhardFolderId` 중 어느 쪽을 쓰는지 파일을 읽고 판단. 일반적으로 NestJS 응답은 snake_case 가 아닌 camelCase 이므로 `webhardFileId` 가 맞다.

## Acceptance Criteria

이 phase 는 backend + 프론트 타입 동기화이므로 양쪽 모두 검증.

```bash
cd webhard-api && pnpm build && pnpm test
```

```bash
npx tsc --noEmit
```

두 커맨드 모두 통과해야 한다.

## AC 검증 방법

위 두 커맨드를 **병렬로 실행**하라 (단일 assistant 메시지 + Bash 2 개). 모두 통과하면 `/tasks/22-contact-webhard-navigate/index.json` 의 phase 1 status 를 `"completed"` 로 변경. 수정 3 회 이상 실패 시 `"error"` + `error_message` 기록.

백엔드 테스트 중 기존 task 20 · 21 테스트가 깨지면 리팩토링이 동작을 바꾼 것이다. Phase 2 가 테스트를 확장하지만, 이 phase 의 리팩토링 자체는 기존 동작을 보존해야 한다.

## 주의사항

- **정책만 통일하고 동작은 보존**. `ensureInquiryFolder` / `ensureInquiryRootFolder` 의 기존 호출처 · 반환값은 바뀌지 않아야 한다 (task 20 · 21 회귀 금지).
- `relocateContactFiles` 에서 silent bail-out 제거는 **의도된 동작 변경**. 기존 테스트가 이 silent bail-out 에 의존하고 있으면 Phase 2 에서 해당 테스트를 수정한다. 이 phase 에서는 리팩토링만.
- Prisma `$transaction` 내부 호출 시 `client` 타입이 `Prisma.TransactionClient` 이므로, `resolveCompanyRoot` 가 받는 client 타입이 유니온인지 확인.
- `drawingRevisions` 를 응답에 포함시키지 말 것 — `webhardFileId` 단일 필드만 노출. 기존 응답 shape 에 `drawingRevisions` 가 있었다면 유지, 없었다면 새로 추가하지 않는다.
- 프론트엔드 `src/lib/types/contact.ts` 만 손대고, UI 컴포넌트는 건드리지 말 것. UI 수정은 Phase 3 · 4.
- 로거 규칙: `logger.createLogger('...')` 또는 기존 파일의 로거 인스턴스 재사용. `console.log` 금지.
- 한글 커밋 메시지: `feat(contact-webhard-navigate): phase 1 — backend-relocate-unify`.
