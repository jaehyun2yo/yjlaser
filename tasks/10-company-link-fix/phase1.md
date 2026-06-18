# Phase 1: contact-link-backend

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 루트)
- `docs/specs/features/laser-only-company-inquiry.md`
- `/tasks/10-company-link-fix/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 아래 기존 코드를 반드시 읽어라:

- `webhard-api/src/companies/laser-only-mapping.service.ts` — 현재 `linkCompany()` 구현
- `webhard-api/src/companies/__tests__/laser-only-mapping.service.spec.ts` — 기존 테스트
- `webhard-api/src/contacts/contact-timeline.service.ts` — timeline 기록 패턴 참고
- `webhard-api/prisma/schema.prisma` — Contact, LaserOnlyMapping, ContactStatusHistory 모델

## 작업 내용

### 1. `laser-only-mapping.service.ts` — `linkCompany()` 수정

현재 `linkCompany(mappingId, companyId)` 메서드를 수정하여, 업체 연결 시 기존 Contact의 `companyName`을 동기화한다.

**추가할 로직** (Company.laserOnly=true 동기화 이후):

1. `mapping.folderName`과 `company.companyName`을 비교. 동일하면 contact 업데이트 스킵.
2. 다르면: `Contact` 테이블에서 `companyName = folderName AND status != 'deleting'` 인 레코드의 id 목록 조회.
3. 50건 단위로 batch 처리:
   - `prisma.contact.updateMany({ where: { id: { in: batchIds } }, data: { companyName: company.companyName, updatedAt: new Date() } })`
   - 각 contact에 대해 `ContactStatusHistory` 생성: `changeType='company_linked'`, `fromStatus=null`, `toStatus=null`, `actorType='system'`, `source='admin'`, `companyName=company.companyName`, `note='업체 연결로 인한 업체명 변경: {folderName} → {companyName}'`
4. 반환값에 `updatedContactCount: number`를 포함하도록 DTO 확장 (기존 `LaserOnlyMappingDto`에 optional 필드 추가).

**의존성 주입**: `PrismaService`는 이미 있으므로 추가 DI 불필요. `ContactStatusHistory`는 prisma로 직접 생성 (`createMany` 사용).

**시그니처 변경:**

```typescript
// laser-only-mapping.service.ts
async linkCompany(mappingId: number, companyId: number): Promise<LaserOnlyMappingDto>
// 반환 DTO에 updated_contact_count?: number 필드 추가
```

### 2. `dto/laser-only-mapping.dto.ts` — DTO 확장

`LaserOnlyMappingDto`에 `updated_contact_count?: number` optional 필드를 추가한다.

### 3. 테스트 추가 — `laser-only-mapping.service.spec.ts`

기존 `describe('linkCompany')` 블록에 아래 테스트를 추가:

**makePrisma()에 추가할 mock:**

- `prisma.contact.findMany` — id 목록 조회용
- `prisma.contact.updateMany` — 일괄 업데이트
- `prisma.contactStatusHistory.createMany` — 이력 기록

**추가 테스트 케이스:**

1. `'업체 연결 시 기존 Contact의 companyName을 업데이트한다'`
   - folderName='ABC', company.companyName='ABC포장'
   - Contact 3건 존재 → updateMany 호출 확인, updatedContactCount=3

2. `'folderName과 companyName이 동일하면 Contact 업데이트를 스킵한다'`
   - folderName='동일업체', company.companyName='동일업체'
   - contact.findMany 호출하지 않음 확인

3. `'deleting 상태 Contact는 제외한다'`
   - where 조건에 `status: { not: 'deleting' }` 포함 확인

4. `'기존 Contact이 없으면 updatedContactCount=0'`
   - findMany → 빈 배열 반환 → updateMany 호출하지 않음

5. `'ContactStatusHistory에 변경 이력을 기록한다'`
   - createMany 호출 확인, changeType='company_linked' 포함

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/10-company-link-fix/index.json`의 phase 1 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- `laser-only-mapping.service.ts`만 수정한다. `contacts.service.ts`는 건드리지 마라.
- `ContactTimelineService`를 DI하지 마라. 이 서비스는 contacts 모듈에 있고, companies 모듈에서 참조하면 순환 의존이 발생할 수 있다. `prisma.contactStatusHistory.createMany()`로 직접 기록하라.
- batch 크기는 50건으로 고정. 상수로 선언 (`CONTACT_UPDATE_BATCH_SIZE = 50`).
- 기존 테스트를 깨뜨리지 마라. 기존 `linkCompany` 테스트에 `contact.findMany`가 mock되어 있지 않으므로, 기존 테스트의 prisma mock에 누락된 메서드를 추가해야 할 수 있다.
- `linkCompany`의 기존 반환값 구조를 변경하지 마라. `updated_contact_count`는 optional 필드로만 추가.
