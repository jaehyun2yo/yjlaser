# Phase 3: 시드 데이터 스크립트

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션)
- `docs/architecture.md` (환경 분리 섹션, 인증 방식)
- `/tasks/5-env-separation/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `.env.example` (Phase 1에서 생성 — 환경변수 구조 참조)
- `webhard-api/package.json` (Phase 2에서 prisma seed 설정 추가됨)
- `webhard-api/prisma/migrations/0_init/migration.sql` (Phase 2에서 생성 — 테이블 구조 참조)

그리고 아래 파일들을 반드시 읽어라:

- `webhard-api/prisma/schema.prisma` — 전체 모델 정의, 필드 타입, 관계, 기본값
- `webhard-api/src/auth/auth.service.ts` 또는 인증 관련 파일 — 비밀번호 해시 방식 (bcrypt 사용 여부)
- `webhard-api/src/common/guards/api-key.guard.ts` — API 키 검증 방식

## 작업 내용

### 1. `webhard-api/prisma/seed.ts` 생성

아래 요구사항에 맞는 시드 스크립트를 작성하라.

**핵심 원칙:**

- **upsert 사용**: 이미 데이터가 있어도 에러 없이 동작해야 한다 (멱등성)
- **Prisma Client 사용**: raw SQL 금지
- **실제적인 데이터**: 한국어 업체명, 실제적인 연락처 형식 사용
- **관계 데이터 정합성**: FK 관계가 있는 모델은 순서에 맞게 생성

**시드 데이터 모델별 요구사항:**

#### Company (3건)

```
- 테스트거래처A: username="test_company_a", 비밀번호="test1234" (bcrypt 해시)
- 테스트거래처B: username="test_company_b", 비밀번호="test1234"
- 테스트거래처C: username="test_company_c", 비밀번호="test1234"
- 모든 필수 필드 채우기: companyName, managerName, businessRegistrationNumber, representativeName, businessAddress, managerPosition, managerPhone, managerEmail, username, passwordHash
- isApproved: true, status: "active", webhardAccess: true
```

비밀번호 해시는 `bcrypt`를 사용하라. bcrypt가 devDependencies에 없으면 `@types/bcrypt`와 함께 설치:

```bash
pnpm add -D bcrypt @types/bcrypt
```

또는 이미 프로젝트에 bcrypt가 있으면 그것을 사용하라.

#### WebhardFolder (~10건)

```
- 각 거래처별 루트 폴더 (companyId로 연결)
- 루트 폴더 하위에 "올리기전용", "내리기전용" 서브폴더
- 최소 1개의 중첩 폴더 (depth 테스트용)
- materializedPath 필드가 있다면 올바르게 설정
```

schema.prisma에서 WebhardFolder 모델의 정확한 필드명과 관계를 확인한 뒤 작성하라.

#### WebhardFile (10건)

```
- 각 폴더에 2-3개씩 분배
- 다양한 파일 타입: .pdf, .dxf, .png, .xlsx
- 다양한 파일 크기 (1KB ~ 50MB)
- R2 키는 "dev/seed/" prefix 사용 (실제 R2에 파일은 없어도 됨)
```

#### Contact (5건)

```
- 상태별 1건씩: PENDING, IN_PROGRESS, DESIGN_REVIEW, CONFIRMED, COMPLETED
- companyId로 거래처 연결 (null 가능 — 비회원 문의도 포함)
- 다양한 inquiryType 값
```

#### ContactStatusHistory (5건)

```
- 각 Contact에 대한 상태 변경 이력 1건씩
```

#### ErpWorker (3명)

```
- 사무실 작업자: name="김테스트", workerType="office", pin="1234" (해시)
- 현장 작업자: name="이테스트", workerType="field", pin="5678"
- 관리자: name="박테스트", workerType="admin", pin="0000"
```

PIN 해시 방식은 `webhard-api/src/erp/workers/` 내 서비스 코드를 확인하여 동일 방식 사용.

#### ApiKey (2건)

```
- 동기화프로그램용: name="sync-dev", key="yjl_dev_sync_test_key_1234567890"
- 테스트용: name="test-dev", key="yjl_dev_test_key_0987654321"
```

API 키 저장 방식(평문 vs 해시)은 `webhard-api/src/integration/` 또는 `webhard-api/src/common/guards/api-key.guard.ts`를 확인하라.

#### SystemSetting (4건)

```
- 기본 시스템 설정값 (schema.prisma의 SystemSetting 모델 참조)
```

#### NumberCounter (6건)

```
- 각 카운터 타입별 초기값 (schema.prisma의 NumberCounter 모델 참조)
- startValue와 currentValue를 동일하게 설정 (초기 상태)
```

### 2. 스크립트 구조

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 순서: 독립 모델 → 의존 모델
  await seedCompanies();
  await seedWebhardFolders();
  await seedWebhardFiles();
  await seedContacts();
  await seedContactStatusHistory();
  await seedErpWorkers();
  await seedApiKeys();
  await seedSystemSettings();
  await seedNumberCounters();

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

각 `seed*` 함수는 `prisma.*.upsert()`를 사용하라. where 조건은 unique 필드(id 또는 unique 컬럼)를 사용.

## Acceptance Criteria

```bash
cd webhard-api && pnpm build
```

참고: `npx prisma db seed`는 개발 Supabase 프로젝트가 준비된 후 수동으로 실행한다.
시드 스크립트의 타입 정합성은 `pnpm build`로 간접 검증한다 (Prisma Client 타입 참조).

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/5-env-separation/index.json`의 phase 3 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- `prisma db seed`를 이 phase에서 실행하지 마라. 개발 DB가 아직 준비되지 않았을 수 있다.
- schema.prisma에서 모델의 정확한 필드명을 확인하라. 추측하지 마라.
- bcrypt 해시 생성 시 salt rounds는 기존 코드와 동일하게 맞춰라 (보통 10 또는 12).
- seed.ts에서 `console.log`는 허용한다 (실행 시 진행상황 표시 목적).
- R2에 실제 파일을 업로드하지 마라. WebhardFile의 r2Key는 가상 경로만 설정.
- 기존 테스트를 깨뜨리지 마라.
- `im_*` 테이블(관리프로그램 연동)은 시드하지 마라 — 별도 프로그램에서 관리.
