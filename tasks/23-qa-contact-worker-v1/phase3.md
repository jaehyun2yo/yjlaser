# Phase 3: Auto-contact companyName 정규화 + insensitive 조회 (auto-contact-normalize)

## 사전 준비

먼저 아래 문서를 반드시 읽어라:

- `docs/specs/api/endpoints/integration.md` (Phase 0 에서 업데이트됨) — **이번 phase 의 스펙**. Auto-contact companyName 정규화 + findByCompany insensitive match 정책.
- `docs/specs/features/auto-contact-exclude.md` — 자동 생성 Contact 제외 정책. companyName 정규화가 제외 조건과 충돌하지 않아야 함.
- `/tasks/23-qa-contact-worker-v1/docs-diff.md` — Phase 0 문서 변경 기록.
- Phase 2 산출물 (`ContactFolderSyncService`) — Auto-contact 경로가 이 서비스를 사용하므로 신규 호출 흐름 이해.

그리고 현재 구조를 이해하라:

- `webhard-api/src/integration/orders/auto-contact.service.ts:143-162` `matchCompanyInfo` — 기존 insensitive + equals 로 Company 찾음. **현재 select 는 `{ managerName, managerPhone, managerEmail, laserOnly }` 만 포함 — `id`, `companyName` 누락. Phase 3 에서 반드시 select 확장 필요** (아래 § 0 참조).
- `webhard-api/src/integration/orders/auto-contact.service.ts:181-335` `createNewContact` — Contact INSERT 시 `dto.companyName` (폴더명 원본) 사용.
- `webhard-api/src/integration/orders/auto-contact.service.ts:234` — 문제 지점. `dto.companyName` 을 `matchedCompany.companyName` 으로 교체해야 함.
- `webhard-api/src/contacts/contacts.service.ts:1453` `findByCompany` — `where.companyName = query.companyName` (exact match). 이것이 대성목형 대시보드 미노출의 근본 원인.
- `webhard-api/src/integration/orders/auto-contact.service.ts` 내 다른 Contact 조회 지점 — 일관된 필터링 정책 확인.

## 작업 내용

### 0. `matchCompanyInfo` select 확장 (**전제**)

현재 (line 143-162):

```ts
this.prisma.company.findFirst({
  where: { companyName: { equals: companyName, mode: 'insensitive' }, isApproved: true },
  select: { managerName: true, managerPhone: true, managerEmail: true, laserOnly: true },
});
```

→ 수정:

```ts
this.prisma.company.findFirst({
  where: { companyName: { equals: companyName, mode: 'insensitive' }, isApproved: true },
  select: {
    id: true,
    companyName: true,
    managerName: true,
    managerPhone: true,
    managerEmail: true,
    laserOnly: true,
  },
});
```

반환 타입 `MatchedCompanyInfo` (또는 유사) 도 `id: string`, `companyName: string` 을 포함하도록 확장. 기존 소비처(`createNewContact` 외) 의 타입 오류 확인 후 보정.

이 단계가 없으면 § 1 의 `matchedCompany.companyName`, `matchedCompany.id` 접근이 `undefined` 반환 — § 1 의 버그 수정이 불가능.

### 1. `AutoContactService.createNewContact` 수정 (이슈 5 근본 해결)

현재 (line 234):

```ts
const contact = await tx.contact.create({
  data: {
    companyName: dto.companyName, // 폴더명 원본 → 대시보드 미노출의 근본 원인
    // ...
  },
});
```

→ 수정:

```ts
const resolvedCompanyName = matchedCompany?.companyName ?? dto.companyName;
const contact = await tx.contact.create({
  data: {
    companyName: resolvedCompanyName,
    companyId: matchedCompany?.id ?? null,
    // ...
  },
});
```

핵심 규칙:

- `matchCompanyInfo` 가 Company 를 찾았으면 그 `companyName` 정규형 사용 (예: "대성목형").
- 못 찾았으면 fallback 으로 `dto.companyName` (폴더명 원본) 사용 — 기존 동작 보존.
- `companyId` 는 매칭 성공 시만 설정. 기존 코드가 이미 이렇게 되어 있다면 유지.

### 2. `ContactsService.findByCompany` insensitive 조회 (이슈 5 보강)

`webhard-api/src/contacts/contacts.service.ts:1453` 의 where 절 수정.

현재:

```ts
where.companyName = query.companyName;
```

→ 수정:

```ts
where.companyName = {
  equals: query.companyName,
  mode: 'insensitive',
};
```

이는 Phase 1 에서 정규화된 신규 데이터뿐 아니라 **기존 데이터(폴더명 원본 저장된 케이스)** 에 대해서도 대소문자·공백 유연성을 제공한다. 단, 완전히 다른 문자열(예: "대성목형" vs "대성목형(주)") 은 여전히 매칭 안 됨 — 사용자 결정에 따라 데이터 마이그레이션은 별도 작업(`tasks/24+` 또는 수동).

### 3. AutoContactService 에서 ContactFolderSyncService 사용 (Phase 2 연계)

Phase 2 에서 추가된 `ContactFolderSyncService.onContactCreated` 를 `AutoContactService.createNewContact` 트랜잭션 내에서 호출하도록 교체.

기존 (line 314-332 부근):

```ts
try {
  await this.foldersService.ensureInquiryFolder(contact.id, tx);
  await this.foldersService.relocateContactFiles(contact.id, ..., tx);
} catch (err) {
  this.logger.warn({ err, contactId: contact.id }, 'folder setup failed (best-effort)');
}
```

→ 수정:

```ts
await this.contactFolderSync.onContactCreated({ contactId: contact.id, client: tx });
```

`ContactFolderSyncService` 의 `onContactCreated` 는 `inquiryType=null` 이면 no-op 이므로, 외부웹하드 미분류 Contact 는 자연히 폴더 생성 skip. 분류 확정 시점에 `onInquiryTypeClassified` 가 처리.

### 4. 모듈 의존성 주입

`webhard-api/src/integration/orders/auto-contact.module.ts` (또는 integration.module.ts) 에 `ContactsModule` import 하여 `ContactFolderSyncService` 사용 가능하게 설정. 순환 의존성 주의 — 필요 시 `forwardRef` 사용.

## Acceptance Criteria

백엔드 phase 이므로:

```bash
cd webhard-api && pnpm build
```

```bash
cd webhard-api && pnpm test
```

### 유닛 테스트 (Prisma mock)

`webhard-api/src/integration/orders/auto-contact.service.spec.ts` **확장**:

- `createNewContact`:
  - Company 매칭 성공 시: `Contact.create` 의 `data.companyName` 이 `matchedCompany.companyName` 인지 검증 (jest spy)
  - Company 매칭 실패 시: `data.companyName` 이 `dto.companyName` 으로 fallback 되는지 검증
  - `companyId` 가 매칭 시만 세팅되는지 검증

`webhard-api/src/contacts/contacts.service.spec.ts` **확장**:

- `findByCompany`:
  - Prisma mock 이 `where.companyName.mode === 'insensitive'` 로 호출되는지 검증
  - "대성목형" 으로 질의 시 "대성목형(주)" 는 매칭 안 됨(여전히 — 정규화 스크립트 미포함이므로), "대성목형" 대문자/공백 변종은 매칭됨

### 통합 테스트 (실제 Supabase dev DB)

`webhard-api/src/integration/orders/auto-contact.integration.spec.ts` **신규 또는 기존 확장**:

- 테스트 업체 "대성목형" Company 레코드 미리 삽입.
- 폴더명 "대성목형" (정확 일치) 로 `batchConfirmUpload` 호출 → Contact 생성 후 `findByCompany({ companyName: '대성목형' })` 로 조회 가능한지 확인.
- 폴더명 "대성목형" 이지만 띄어쓰기/대소문자 변종 → `findByCompany` insensitive 로 조회 가능한지 확인.
- 테스트 후 트랜잭션 롤백.

## AC 검증 방법

위 2 커맨드 병렬 실행 후 모두 통과 시 phase 3 status `"completed"`.

3 회 이상 실패 시 `"error"` + `error_message`.

## 주의사항

- **기존 Auto-contact 생성 경로의 API 계약을 바꾸지 마라**. 외부 Electron 프로그램이 이 엔드포인트를 호출하므로, DTO 와 응답 shape 는 불변.
- `matchCompanyInfo` 가 현재 `mode: 'insensitive'` 로 Company 를 찾으므로, **그 결과의 `companyName` 을 쓰는 것이 핵심**. `dto.companyName`(폴더명 원본) 과 혼동 금지.
- `findByCompany` insensitive 전환으로 의도치 않은 과다 매칭 발생 가능성 검토. 특히 "가" 와 "가구" 같은 부분 일치는 `equals` + `insensitive` 조합에서는 발생 안 함 (`contains` 가 아님).
- `ContactFolderSyncService` 주입 시 순환 의존성: `ContactsModule` → `ContactsService` → `ContactFolderSyncService` → `FoldersService` → `ContactsModule` 경로가 없는지 확인. 있으면 `forwardRef` 또는 서비스 분리.
- 기존 데이터 정규화(일회성 마이그레이션)는 **이 task 범위 외**. 사용자 결정: 약식 insensitive 만 적용, 데이터는 그대로 둠.
- 한글 커밋: `feat(qa-contact-worker-v1): phase 3 — auto-contact-normalize`.
