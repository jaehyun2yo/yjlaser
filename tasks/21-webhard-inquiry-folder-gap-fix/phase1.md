# Phase 1: folders-service-extend

## 사전 준비

먼저 아래 문서·파일들을 반드시 읽고 설계 의도를 완전히 이해하라:

- `docs/specs/features/drawing-workflow.md` §W.1 — Phase 0 에서 업데이트된 확장 폴더 정책. 이번 phase 가 구현할 "2단계 fallback", "미분류 폴더 이름", "reason_code 로깅" 규칙.
- `tasks/21-webhard-inquiry-folder-gap-fix/docs-diff.md` — Phase 0 의 docs 변경 기록 (`scripts/gen-docs-diff.py` 자동 생성).
- `webhard-api/src/folders/folders.service.ts` — `ensureInquiryFolder`, `ensureInquiryRootFolder` 현재 구현. 특히 `9be443cc` 커밋에서 추가된 `webhard_folders.name` 완전 일치 fallback 부분 (이번 phase 에서 뒤에 정규화 fallback 을 추가).
- `webhard-api/src/folders/folders.service.spec.ts` — task 20 의 P1-1~P1-7 테스트 패턴. 기존 케이스는 회귀 보호 대상.
- `webhard-api/src/contacts/_lib/inquiry-filename.util.ts` — `buildInquiryFolderName` 현재 로직. 이번 phase 에서 inquiryNumber 만으로 이름 생성 가능하도록 수정.
- `webhard-api/src/contacts/contacts.service.ts` — `ensureInquiryFolder` 주요 호출 지점 (Phase 2·3 에서 추가 수정).
- `webhard-api/src/integration/orders/auto-contact.service.ts` — 동일 (Phase 3 에서 수정).

이유: 이번 phase 가 만드는 산출물 (`normalizeCompanyName` util, `buildInquiryFolderName` 확장, 2단계 fallback, reason_code 로깅) 은 Phase 2·3 이 모두 의존하는 기반이다. 기존 `9be443cc` fallback 로직을 정확히 재사용·확장해야 하므로 현재 구현을 꼼꼼히 읽어라.

## 작업 내용

### 1. 신규 util 파일: `webhard-api/src/folders/_lib/company-name-match.util.ts`

```typescript
/**
 * 외부웹하드 가상 업체 루트 폴더 매칭용 이름 정규화.
 * 기호·공백 차이를 흡수하여 동일 업체로 인식하기 위함.
 */
export function normalizeCompanyName(name: string): string {
  // 구현은 에이전트 재량.
  // 동작: NFKC 유니코드 정규화 → 공백 제거 → 괄호·대시·점·따옴표 등 특수문자 제거 → 소문자화.
}
```

**규칙** (필수):

- **순수 함수**: DB·IO·외부 호출 금지. 입력 문자열 → 출력 문자열만.
- **null-safe 아님**: 호출자가 null/undefined 체크 책임. 빈 문자열 입력 시 빈 문자열 반환.
- **NFKC 포함**: `String.prototype.normalize('NFKC')` 사용 — 한글 자모 분리 대응.
- **제거 대상**: 공백(`\s`), 괄호(`()[]{}`), 대시(`-_`), 점·쉼표(`.,`), 슬래시(`/\`), 따옴표(`'"`), 특수기호 (`&*#@!?`) 등. 한글·영문·숫자만 남김.
- **소문자화**: 영문 대소문자 차이 흡수.

### 2. 신규 테스트 파일: `webhard-api/src/folders/_lib/company-name-match.util.spec.ts`

아래 케이스 필수:

- **P1-util-1**: `normalizeCompanyName('ABC 회사')` === `'abc회사'`
- **P1-util-2**: `normalizeCompanyName('ABC-회사(본점)')` === `'abc회사본점'`
- **P1-util-3**: `normalizeCompanyName('abc  회사')` (공백 다수) === `'abc회사'`
- **P1-util-4**: `normalizeCompanyName('')` === `''`
- **P1-util-5**: NFKC 정규화 케이스 — 한글 자모 분리된 문자열 (예: `'ㄱㅏㄴㅏ회사'` 형태의 비정규) 과 완성형 `'가나회사'` 가 동일하게 정규화됨 (엔지니어가 적절한 샘플 작성).

mock 불필요 (순수 함수).

### 3. `webhard-api/src/contacts/_lib/inquiry-filename.util.ts` 확장

**현재 동작** (반드시 파일 읽어서 확인): `buildInquiryFolderName({ inquiryNumber, workNumber })`. task 20 구현에서는 둘 중 하나라도 있으면 이름 생성하는지, 둘 다 필요한지 확인.

**필수 동작** (이번 phase 이후):

- `inquiryNumber` truthy + `workNumber` falsy → `문의-{inquiryNumber}` 반환.
- `inquiryNumber` truthy + `workNumber` truthy → `문의-{inquiryNumber}_{workNumber}` 반환.
- `inquiryNumber` falsy → `null` 반환 (inquiryNumber 필수).
- 분할 Contact 케이스 (`문의-{O}-{N}`) 의 시그니처·반환 규칙 기존 그대로 유지 (task 20 에서 추가된 파라미터 있으면 회귀 금지).

### 4. `webhard-api/src/contacts/_lib/inquiry-filename.util.spec.ts` 테스트 추가

기존 케이스 **유지**. 아래 추가 (ID 는 기존과 겹치지 않게):

- **P1-1** (신규): `buildInquiryFolderName({ inquiryNumber: 'O-123', workNumber: null })` === `'문의-O-123'`
- **P1-2** (회귀): `buildInquiryFolderName({ inquiryNumber: 'O-123', workNumber: 'F-456' })` === `'문의-O-123_F-456'`
- **P1-3** (회귀): `buildInquiryFolderName({ inquiryNumber: null, workNumber: null })` === `null`
- **P1-3b** (회귀): `buildInquiryFolderName({ inquiryNumber: null, workNumber: 'F-456' })` === `null` — workNumber 만으로는 생성 불가.

### 5. `webhard-api/src/folders/folders.service.ts` — `ensureInquiryFolder` 확장

**현재 동작** (파일 읽어서 확인):

1. 중복 체크 (`contactId` + `folderKind='inquiry'` findFirst)
2. Contact 조회 (companyName / inquiryNumber / workNumber)
3. `buildInquiryFolderName` → 이름 결정
4. Company 매칭 → `company_id` 로 루트 폴더 조회. 없으면 `initializeCompanyFolders` 로 생성.
5. (`9be443cc`) Company 없거나 루트 폴더도 실패 시 `webhard_folders.name` 완전 일치 fallback.
6. `ensureInquiryRootFolder` → `문의/` 중간 폴더.
7. `webhardFolder.create(folderKind='inquiry')`.

**변경 사항**:

**5-1. 2단계 fallback 추가** (기존 5번 단계 이후에 6번 단계 삽입):

```typescript
// 의사코드 — 기존 name 완전 일치 fallback 뒤에 이 블록 추가
if (!rootFolder) {
  const normalized = normalizeCompanyName(contact.companyName ?? '');
  if (normalized) {
    const candidates = await tx.webhardFolder.findMany({
      where: {
        folderKind: { in: ['generic', 'root'] },
        deletedAt: null,
      },
      orderBy: [{ companyId: 'desc' }, { createdAt: 'asc' }],
    });
    rootFolder = candidates.find((f) => normalizeCompanyName(f.name) === normalized) ?? null;
  }
}
```

**규칙**:

- 완전 일치 fallback 을 먼저, 정규화 매칭은 그 뒤. **역순 금지** — 정확도 손실.
- `companyId desc` 정렬 유지 — companyId 있는 폴더가 가상 업체 (companyId=null) 보다 우선.
- 트랜잭션 컨텍스트 (`tx`) 그대로 사용.
- `import` 경로: `./_lib/company-name-match.util` 또는 프로젝트 tsconfig paths 에 맞춰 `@/folders/_lib/company-name-match.util`.

**5-2. reason_code logger.warn 추가**

`ensureInquiryFolder` 가 null 반환하는 모든 분기에 `logger.warn` 추가:

```typescript
// 의사코드
this.logger.warn(
  {
    reason_code:
      'NO_INQUIRY_NUMBER' | 'NO_COMPANY_ROOT' | 'NO_FALLBACK_MATCH' | 'FOLDER_CREATE_FAILED',
    contactId,
    companyName: contact?.companyName ?? null,
    inquiryNumber: contact?.inquiryNumber ?? null,
  },
  'ensureInquiryFolder returned null'
);
```

**분기별 reason_code**:

- `buildInquiryFolderName` 이 null 반환 → `NO_INQUIRY_NUMBER`
- Company 매칭 성공했으나 해당 `company_id` 루트 폴더 생성 실패 → `NO_COMPANY_ROOT`
- Company 없음 + 완전 일치 fallback 실패 + 정규화 fallback 실패 → `NO_FALLBACK_MATCH`
- `ensureInquiryRootFolder` 또는 `webhardFolder.create` 예외 → `FOLDER_CREATE_FAILED` (try/catch 로 감쌈, 예외를 다시 throw 하지 말고 null 반환)

**logger 인스턴스**: 기존 `FoldersService` 에 이미 `this.logger` 있으면 재사용. 없으면 NestJS `Logger` 주입 패턴으로 추가.

**5-3. 호출 시그니처 변경 금지**

`ensureInquiryFolder(contactId, tx?)` 시그니처 **그대로**. 리턴 타입 (`WebhardFolder | null`) 그대로. 호출자(contacts.service, auto-contact.service, drawing-revision.service) 가 Phase 2·3 에서 이 시그니처에 의존.

### 6. `webhard-api/src/folders/folders.service.spec.ts` 테스트 추가

task 20 의 기존 P1-1~P1-7 (또는 실제 번호) 는 **전부 유지·통과** 해야 함. 아래 테스트 추가:

- **P1-4** (미분류 상태 폴더 생성): Contact 에 `inquiryType=null`, `inquiryNumber='O-999'` 주고 `ensureInquiryFolder` 호출 → `문의-O-999` 이름의 `folderKind='inquiry'` 폴더 생성 성공. Prisma mock 의 `webhardFolder.create` 가 해당 name 으로 호출됨 확인.
- **P1-5b** (name 완전 일치 fallback 회귀): `9be443cc` 시나리오 — Company 테이블 빈 상태 + `webhard_folders.name = contact.companyName` 완전 일치 → rootFolder 로 사용되어 폴더 생성.
- **P1-6** (정규화 fallback 신규): `contact.companyName = 'ABC 회사'`, webhard_folders 에 `name = 'ABC회사'` (공백 차이) 만 존재 → 정규화 매칭으로 rootFolder 발견. `webhardFolder.findMany` mock 에 해당 레코드만 넣고 확인.
- **P1-7** (reason_code 로깅 신규): 모든 fallback 실패 상황 구성 → `logger.warn` spy 로 `{ reason_code: 'NO_FALLBACK_MATCH' }` 호출 확인. `jest.spyOn(service['logger'], 'warn')` 패턴.
- **P1-8** (멱등성 회귀): 같은 contactId 로 `ensureInquiryFolder` 두 번 호출 (기존 `findFirst` 가 기존 폴더 반환 보장) → `webhardFolder.create` 가 한 번만 호출됨 확인.
- **P1-9** (`NO_INQUIRY_NUMBER` 로깅 신규): `buildInquiryFolderName` 이 null 반환하는 케이스 (inquiryNumber 없음) → `logger.warn` spy 로 `{ reason_code: 'NO_INQUIRY_NUMBER' }` 확인.

**mock 전략**: 기존 spec 의 Prisma mock 패턴 그대로. logger 는 `jest.spyOn(service['logger'], 'warn')` 로 spy.

## Acceptance Criteria

백엔드 단독 phase:

```bash
cd webhard-api && pnpm build && pnpm test
```

빌드 + 전체 Jest 테스트 통과.

## AC 검증 방법

위 커맨드 통과 시 `tasks/21-webhard-inquiry-folder-gap-fix/index.json` 의 phase 1 status 를 `"completed"` 로 변경.

3 회 실패 시 `"error"` + error_message.

## 주의사항

- **Prisma 스키마 변경 금지**: 이 phase 는 마이그레이션 없이 완수해야 함. `WebhardFolder`, `Contact` 모델 수정 금지.
- **`ensureInquiryFolder` 시그니처 유지**: 호출자 의존. 인자·리턴 타입 변경 금지.
- **기존 Prisma 쿼리 순서 유지**: 완전 일치 fallback 을 먼저 시도, 정규화는 그 뒤.
- **logger.warn 예외 삼키기 금지**: `FOLDER_CREATE_FAILED` 분기 외에는 예외를 그대로 전파 (상위에서 try/catch 결정). `FOLDER_CREATE_FAILED` 는 예외를 잡아 logger.warn 후 null 반환.
- **`normalizeCompanyName` 의 순수성**: DB·IO 금지. 캐시·동기화 안 된 상태 사용 금지.
- **`import` 경로**: `_lib` prefix 준수 — 프로젝트 컨벤션.
- **테스트에서 실제 DB 접근 금지**: 기존 spec 패턴대로 Prisma mock.
- **task 20 의 기존 테스트 (P1-1, P1-2, P1-3, P1-5 등) 를 변형·삭제하지 말 것** — 회귀 보호.
- **`ensureInquiryRootFolder` 본체 수정 금지** (이미 task 20 phase 1 에서 완성됨). 이번 phase 는 `ensureInquiryFolder` 와 `_lib` 만 수정.
