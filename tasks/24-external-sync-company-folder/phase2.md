# Phase 2: NestJS 매칭 로직 강화 + relocateAfterAliasApproved

## 사전 준비

- `docs/specs/features/external-sync-company-folder.md` (Phase 0) §"매칭 강화 (3단계)" + §"불변 규칙 #1, #2, #6" — 본 phase 가 직접 구현하는 정책. 1차/2차 단계는 task 23 의 동작을 그대로 보존하고 0차 alias 우선·3차 pending 자동 등록만 신규로 추가한다는 점이 핵심.
- `docs/specs/api/endpoints/integration.md` §companyName 정규화 (Phase 0 에서 §확장됨) — `matchCompanyInfo` 3단계의 입출력 계약.
- `tasks/24-external-sync-company-folder/docs-diff.md` (Phase 0 후 자동 생성) — Phase 0 spec diff. 본 phase 의 코드가 이 diff 와 정합인지 검증.
- `tasks/24-external-sync-company-folder/phase1.md` 산출물 — `CompanyFolderAlias` 모델, Prisma Client 의 `prisma.companyFolderAlias.*` 메서드.
- `webhard-api/src/integration/orders/auto-contact.service.ts` line 156-186 (`matchCompanyInfo` 기존 2단계, task 23 hotfix). 본 phase 는 이를 0차/1차/2차/3차 4단계로 확장하되 1차/2차 결과를 보존한다.
- `webhard-api/src/integration/orders/__tests__/auto-contact.service.spec.ts` N1~N4 (task 23 의 2단계 매칭 케이스) — 본 phase 가 추가하는 A1~A7 케이스가 N1~N4 를 깨면 안 된다. 회귀 보장이 핵심.
- `webhard-api/src/folders/_lib/company-name-match.util.ts` `normalizeCompanyName(name)` — Phase 2 의 3차 단계에서 그대로 재사용. 본 유틸은 task 21 에서 도입.
- `webhard-api/src/contacts/contact-folder-sync.service.ts` 전체 — 단일 진입점 정책. 본 phase 는 새 메서드 `relocateAfterAliasApproved` 를 이 서비스 내부에 추가한다 (외부 호출자에서 직접 ensureInquiryFolder 호출 금지 — Phase 0 spec §"불변 규칙 #1").
- `webhard-api/src/contacts/contact-folder-sync.service.spec.ts` 의 P3-1~P3-10 - 기존 hook 테스트. C1~C3 추가 위치 학습.

## 작업 내용

### 1. `auto-contact.service.ts` `matchCompanyInfo` 4단계 확장

기존 시그니처 유지 (`(companyName: string, client: Prisma.TransactionClient) => Promise<{ companyId?: number; companyName: string } | null>`). 반환 타입 변경 금지 — 호출처(`createNewContact`) 와의 계약. 내부 로직만 재구성:

```ts
private async matchCompanyInfo(
  companyName: string,
  client: Prisma.TransactionClient,
): Promise<{ companyId?: number; companyName: string } | null> {
  const trimmed = companyName.trim();
  if (!trimmed) return null;

  // === 0차: CompanyFolderAlias status='approved' ===
  const approvedAlias = await client.companyFolderAlias.findFirst({
    where: { folderName: trimmed, status: 'approved' },
    include: { company: true },
  });
  if (approvedAlias?.company) {
    return { companyId: approvedAlias.companyId, companyName: approvedAlias.company.companyName };
  }

  // === 1차: Company.companyName insensitive equals + isApproved=true (task 23) ===
  const exactApproved = await client.company.findFirst({
    where: { companyName: { equals: trimmed, mode: 'insensitive' }, isApproved: true },
  });
  if (exactApproved) return { companyId: exactApproved.id, companyName: exactApproved.companyName };

  // === 2차: isApproved 무관 fallback (task 23 hotfix) ===
  const exactAny = await client.company.findFirst({
    where: { companyName: { equals: trimmed, mode: 'insensitive' } },
  });
  if (exactAny) return { companyId: exactAny.id, companyName: exactAny.companyName };

  // === 3차: 정규화 매칭 후보 자동 pending 등록 (Q8: 단일/다수 모두) ===
  const normalized = normalizeCompanyName(trimmed);
  if (normalized) {
    // 모든 Company 조회 후 in-memory 비교 (정규화 함수가 DB 인덱스 활용 불가)
    const allCompanies = await client.company.findMany({ select: { id: true, companyName: true } });
    const matched = allCompanies.filter(c => normalizeCompanyName(c.companyName) === normalized);

    if (matched.length > 0) {
      // 모든 후보를 pending 으로 upsert (멱등) — 기존 row status 보존
      await Promise.all(matched.map(c =>
        client.companyFolderAlias.upsert({
          where: { folderName_companyId: { folderName: trimmed, companyId: c.id } },
          update: {}, // 중요: status 변경 금지. admin 의 reject 결정 무효화 방지.
          create: { folderName: trimmed, companyId: c.id, status: 'pending' },
        })
      ));
    }
  }

  // 3차는 매칭 결과를 적용하지 않는다 — 폴더명 원본 fallback
  return null;
}
```

**핵심 규칙** (Phase 0 spec §"불변 규칙" 와 일치):

- 0차 `approvedAlias` 만 즉시 반환. `pending`/`rejected` alias 는 무시.
- 1차/2차 분리 (isApproved 우선) 는 task 23 hotfix 그대로 보존.
- 3차의 upsert 는 멱등 — 이미 `pending`/`approved`/`rejected` 인 row 가 있으면 status 를 덮어쓰지 않는다(`update: {}`). 이렇게 해야 admin 이 한 번 reject 한 후보가 다음 동기화에서 다시 pending 으로 살아나는 사고를 방지.
- 3차에서 매칭 후보가 있어도 본 함수는 `null` 반환 (폴더명 원본 fallback). admin 승인 전까지 외부웹하드 원본 폴더에 그대로.
- `normalizeCompanyName` 결과가 빈 문자열이면 3차 자체 skip (현재 동작 유지).

### 2. `contact-folder-sync.service.ts` `relocateAfterAliasApproved` 추가

서비스 내부에 새 메서드 추가. 단일 진입점 정책 유지 — 외부에서 `ensureInquiryFolder` 직접 호출 금지(Phase 0 spec §"불변 규칙 #1"). 새 메서드 내부에서는 기존 hook(`onContactCreated`) 을 재사용한다:

```ts
async relocateAfterAliasApproved(
  folderName: string,
  companyId: number,
  client?: Prisma.TransactionClient,
): Promise<{ relocated: number; skipped: number }> {
  const tx = client ?? this.prisma;

  // 매칭 대상: 외부 동기화 출처 + companyName 이 폴더명 원본인 미통합 Contact
  // (companyId 가 이미 채워진 Contact 는 이미 통합된 것으로 간주)
  const targets = await tx.contact.findMany({
    where: {
      OR: [
        { companyName: folderName },
        { companyName: { equals: folderName, mode: 'insensitive' } },
      ],
      companyId: null,
    },
  });

  const company = await tx.company.findUnique({ where: { id: companyId } });
  if (!company) {
    throw new NotFoundException(`Company ${companyId} not found`);
  }

  let relocated = 0;
  let skipped = 0;

  for (const contact of targets) {
    if (!contact.inquiryType) {
      // Q5 정책: 미분류 Contact 는 skip — 분류 확정 시 onInquiryTypeClassified 가 자동 처리
      skipped++;
      continue;
    }

    // companyName 정규형 + companyId 업데이트
    await tx.contact.update({
      where: { id: contact.id },
      data: { companyName: company.companyName, companyId: company.id },
    });

    // 폴더 생성 + 파일 이동 — 단일 진입점 hook 재사용
    await this.onContactCreated({ contactId: contact.id, client: tx as Prisma.TransactionClient });
    relocated++;
  }

  return { relocated, skipped };
}
```

**핵심 규칙**:

- 외부 미통합 식별 조건: `companyId: null` + `companyName` 일치 (insensitive). 이미 통합된 Contact (companyId 채워짐) 는 자동 skip.
- `inquiryType=null` 은 Q5 정책에 따라 skip — `onContactCreated` 호출하지 않음 (어차피 no-op 이지만 명시적 skip 으로 의도 명확화).
- `onContactCreated` 재호출 — 단일 진입점 정책 유지. 멱등성은 task 23 phase 2 에서 검증됨.
- `client` 가 전달되지 않으면 `this.prisma` 사용 (단일 작업). 트랜잭션 외부 호출은 atomicity 보장 안 됨.

### 3. 테스트 — `auto-contact.service.spec.ts` A1~A7 추가

기존 `auto-contact.service.spec.ts` 의 N1~N4 케이스(task 23 의 2단계 매칭 회귀) 는 그대로 유지하고, 같은 describe(`createNewContact — companyName 정규화`) 또는 새 describe(`matchCompanyInfo — 3단계 매칭 (task 24)`) 에 다음 추가:

| ID  | 시나리오                                                        | 검증                                                                                                 |
| --- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A1  | `CompanyFolderAlias status='approved'` 일치                     | matchCompanyInfo 가 `{companyId, companyName}` 반환 + `Company.findFirst` 호출 0회                   |
| A2  | alias 매칭 시 1차/2차 단계 skip                                 | `Company.findFirst` mock 호출 0회 (alias 우선순위 검증)                                              |
| A3  | 정규화 매칭 단일 후보 → `pending` upsert + null 반환            | `companyFolderAlias.upsert` 1회 호출, return null. Contact 의 companyName 은 폴더명 원본 (trim 적용) |
| A4  | 정규화 매칭 다수 후보 → 모두 `pending` upsert + null 반환       | upsert 호출 횟수 = 후보 수. 각 호출의 companyId 가 다름. return null                                 |
| A5  | 매칭 후보 0개 → null 반환 + upsert 미호출                       | 회귀 보장 — 기존 동작 유지                                                                           |
| A6  | 동일 (folderName, companyId) 재호출 → upsert 의 `update: {}`    | mock 의 upsert 인자 검증 — `update` 객체가 빈 객체                                                   |
| A7  | `status='rejected'` alias 가 있는 폴더 → 0차/3차 모두 매칭 skip | 0차 findFirst 결과 null + 3차 upsert 의 `update: {}` 로 status 변경 안 됨 (rejected 보존)            |

기존 `makePrisma()` 헬퍼에 다음 mock 메서드 추가:

```ts
companyFolderAlias: {
  findFirst: jest.fn(),
  findMany: jest.fn(),
  upsert: jest.fn(),
}
```

A1~A7 케이스 별로 mock 의 반환값을 다르게 셋업.

### 4. 테스트 — `contact-folder-sync.service.spec.ts` C1~C3 추가

기존 spec 의 mock 헬퍼(FoldersService mock + Prisma mock) 재사용:

| ID  | 시나리오                                                                  | 검증                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | 외부 미통합 Contact 일괄 통합 (`relocateAfterAliasApproved`)              | `prisma.contact.findMany` 호출 인자 (`companyId: null` + `OR: companyName insensitive`) + `contact.update` (companyName, companyId 업데이트) + `onContactCreated` 호출 횟수 = 매칭 Contact 수. return `{ relocated, skipped }` 정확. |
| C2  | 이미 통합된 Contact (`companyId != null`) → skip                          | findMany 결과에서 자동 제외 (where 조건). update / onContactCreated 호출 0회. relocated 카운트 0.                                                                                                                                    |
| C3  | `inquiryType=null` Contact → skipped 카운트 + onContactCreated 호출 안 함 | Q5 정책 검증. relocated 0, skipped > 0.                                                                                                                                                                                              |

C1 에서 트랜잭션 클라이언트 전파도 검증 — `tx` 인자 전달 시 `findMany`/`update`/`onContactCreated({client: tx})` 모두 같은 client 를 사용.

## Acceptance Criteria

병렬 실행 가능 (단일 메시지에 Bash 두 개):

```bash
cd webhard-api && pnpm build
```

```bash
cd webhard-api && pnpm test
```

빌드 + 테스트 통과 시 OK. 기존 N1~N4 + P3-1~P3-10 회귀가 깨지면 본 phase 의 변경이 잘못된 것이므로 수정.

## AC 검증 방법

위 AC 커맨드를 단일 메시지에 Bash 병렬로 발사하라. 모두 통과하면 `tasks/24-external-sync-company-folder/index.json` 의 phase 2 status 를 `"completed"` 로 변경하라. 수정 3회 이상 시도해도 실패하면 status 를 `"error"` 로 변경하고 에러 내용을 `"error_message"` 필드로 기록하라.

## 주의사항

- **task 23 회귀 방지**: N1~N4(matchCompanyInfo 2단계) 케이스가 깨지면 안 된다. A1~A7 추가 후 기존 케이스가 fail 하면 즉시 원인 파악 — 보통 mock 셋업 누락(`companyFolderAlias.findFirst` 미정의 등) 때문.
- **상태 보존**: 3차 upsert 의 `update: {}` 는 의도된 것 — 기존 row 의 status 를 변경하지 않는다. admin 의 reject 결정을 무효화하지 않기 위함. 이 부분이 잘못 구현되면 운영 사고 가능.
- **단일 진입점**: `relocateAfterAliasApproved` 외에서 `ensureInquiryFolder`/`relocateContactFiles` 직접 호출 추가 금지. 새 hook 도 ContactFolderSyncService 내부에만 추가.
- **컨트롤러·DTO 신설 금지**: 본 phase 는 service 레이어만. controller / DTO 는 Phase 3.
- **Frontend 변경 금지**: 본 phase 에서 `src/` 코드 손대지 마라. Phase 4.
- **쿼리 성능 주의**: 3차 정규화 매칭은 `Company.findMany()` 후 in-memory filter — 업체 수가 수천 단위면 성능 문제 가능. 본 task 24 범위에서는 단순 구현 우선. 향후 별도 task 에서 인덱스 컬럼(`normalized_company_name`) 추가 또는 raw SQL 최적화.
- **트랜잭션 전파**: `relocateAfterAliasApproved` 가 `client` 인자로 받은 tx 를 내부 update / hook 에 그대로 전달. tx 외부 호출 시 atomicity 보장 안 됨.
- **errors.notFound 처리**: company 가 없을 때 `NotFoundException` throw — 트랜잭션 롤백 트리거.
