# Phase 1: 백엔드 — LaserOnlyMapping DB 모델 + API + 테스트

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (루트 + yjlaser_website)
- `docs/specs/features/laser-only-company-inquiry.md`
- `docs/specs/db/prisma-tables.md`
- `docs/API.md`
- `/tasks/6-laser-only/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 아래 기존 코드를 반드시 읽고 설계 의도를 이해하라:

- `webhard-api/prisma/schema.prisma` — Company 모델 (laserOnly 필드, line 51)
- `webhard-api/src/integration/orders/auto-contact.service.ts` — 자동 문의 생성 (laserOnly 분기, line 170-195)
- `webhard-api/src/companies/companies.controller.ts` — 기존 Company API
- `webhard-api/src/companies/companies.service.ts` — 기존 Company 서비스
- `webhard-api/src/companies/dto/company.dto.ts` — 기존 DTO (UpdateLaserOnlyDto 등)
- `webhard-api/src/integration/orders/__tests__/auto-contact.service.spec.ts` — 기존 laserOnly 테스트 (§12, §13)

## 작업 내용

### 1. Prisma 스키마 — LaserOnlyMapping 모델 추가

`webhard-api/prisma/schema.prisma`에 추가:

```prisma
model LaserOnlyMapping {
  id          Int       @id @default(autoincrement())
  folderName  String    @unique @map("folder_name")
  companyId   Int?      @map("company_id")
  company     Company?  @relation(fields: [companyId], references: [id], onDelete: SetNull)
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @default(now()) @map("updated_at")

  @@index([folderName])
  @@index([companyId])
  @@map("laser_only_mappings")
}
```

Company 모델에 관계 추가:

```prisma
model Company {
  // ... 기존 필드 ...
  laserOnlyMappings LaserOnlyMapping[]
}
```

### 2. Prisma Migration 실행

```bash
cd webhard-api && npx prisma migrate dev --name add-laser-only-mapping
```

### 3. LaserOnlyMapping 서비스

`webhard-api/src/companies/laser-only-mapping.service.ts` 신규 생성.

**메서드 시그니처:**

```typescript
@Injectable()
export class LaserOnlyMappingService {
  constructor(private prisma: PrismaService) {}

  /** 전체 매핑 조회 (company 정보 포함) */
  async getMappings(): Promise<LaserOnlyMappingDto[]>;

  /** 매핑 추가. companyId가 있으면 Company.laserOnly=true 동기화 */
  async addMapping(folderName: string, companyId?: number): Promise<LaserOnlyMappingDto>;

  /** 매핑 삭제. 연결된 Company가 있으면 Company.laserOnly=false 동기화 */
  async removeMapping(id: number): Promise<void>;

  /** 미연결 매핑에 업체 연결. Company.laserOnly=true 동기화 */
  async linkCompany(mappingId: number, companyId: number): Promise<LaserOnlyMappingDto>;

  /** 폴더명이 레이저 전용 매핑에 존재하는지 확인 */
  async isLaserOnlyFolder(folderName: string): Promise<boolean>;
}
```

**핵심 비즈니스 규칙:**

- `addMapping`: folderName 중복 시 BadRequestException. companyId가 있으면 해당 Company의 laserOnly=true로 설정.
- `removeMapping`: 연결된 Company가 있으면 해당 Company의 laserOnly=false로 설정. 단, 다른 LaserOnlyMapping이 같은 Company를 참조하고 있으면 laserOnly 변경하지 않음.
- `linkCompany`: mappingId가 존재하지 않으면 NotFoundException. companyId의 Company가 없으면 NotFoundException. Company.laserOnly=true 동기화.
- `isLaserOnlyFolder`: folderName으로 isActive=true인 매핑을 조회. 존재하면 true.

### 4. DTO

`webhard-api/src/companies/dto/laser-only-mapping.dto.ts` 신규 생성:

```typescript
export class CreateLaserOnlyMappingDto {
  @IsString()
  folderName: string;

  @IsOptional()
  @IsInt()
  companyId?: number;
}

export class LinkCompanyDto {
  @IsInt()
  companyId: number;
}
```

응답 DTO는 인터페이스로:

```typescript
export interface LaserOnlyMappingDto {
  id: number;
  folder_name: string;
  company_id: number | null;
  company_name: string | null; // company가 연결된 경우 company.companyName
  is_active: boolean;
  created_at: string;
}
```

### 5. Controller 엔드포인트

`webhard-api/src/companies/companies.controller.ts`에 추가:

```typescript
@Get('laser-only-mappings')
async getLaserOnlyMappings()

@Post('laser-only-mappings')
async addLaserOnlyMapping(@Body() dto: CreateLaserOnlyMappingDto)

@Delete('laser-only-mappings/:id')
async removeLaserOnlyMapping(@Param('id', ParseIntPipe) id: number)

@Patch('laser-only-mappings/:id/link')
async linkCompanyToMapping(@Param('id', ParseIntPipe) id: number, @Body() dto: LinkCompanyDto)
```

**주의**: 이 엔드포인트들은 기존 `@Controller('companies')` + `@UseGuards(ApiKeyGuard)` 하에 추가한다. 라우트 순서에 주의하라 — `laser-only-mappings`가 `:id` 파라미터 라우트보다 앞에 와야 한다.

### 6. Module 업데이트

`webhard-api/src/companies/companies.module.ts`에 `LaserOnlyMappingService` 추가 (providers, exports).

### 7. AutoContactService 수정

`webhard-api/src/integration/orders/auto-contact.service.ts` 수정:

**의존성 추가:**

- constructor에 `LaserOnlyMappingService` 주입

**`createNewContact()` 메서드 수정 (line 174 부근):**

기존:

```typescript
const companyInfo = await this.matchCompanyInfo(dto.companyName);
const isLaserOnly = companyInfo?.laserOnly ?? false;
```

변경:

```typescript
// 1차: LaserOnlyMapping 테이블 체크
const isMappedLaserOnly = await this.laserOnlyMappingService.isLaserOnlyFolder(dto.companyName);
// 2차: Company.laserOnly 체크 (하위호환)
const companyInfo = await this.matchCompanyInfo(dto.companyName);
const isLaserOnly = isMappedLaserOnly || (companyInfo?.laserOnly ?? false);
```

나머지 로직은 변경 없음. `isLaserOnly` 변수 이후의 분기는 동일하게 동작.

**OrdersModule 업데이트:**
`webhard-api/src/integration/orders/orders.module.ts`의 imports에 CompaniesModule을 추가하여 LaserOnlyMappingService를 사용할 수 있게 한다. 순환 의존성이 발생하면 forwardRef를 사용하라.

### 8. 단위 테스트 — LaserOnlyMappingService

`webhard-api/src/companies/__tests__/laser-only-mapping.service.spec.ts` 신규 생성.

기존 테스트 파일 `webhard-api/src/integration/orders/__tests__/auto-contact.service.spec.ts`의 패턴을 참고하라 (makePrisma, makeWebhardConfigService 등의 mock 패턴).

**테스트 케이스:**

```
describe('LaserOnlyMappingService', () => {
  describe('addMapping', () => {
    it('폴더명만으로 매핑 생성 — companyId=null')
    it('폴더명 + companyId로 매핑 생성 — Company.laserOnly=true 동기화')
    it('중복 폴더명 → BadRequestException')
  })

  describe('removeMapping', () => {
    it('매핑 삭제 — Company.laserOnly=false 동기화')
  })

  describe('linkCompany', () => {
    it('미연결 매핑에 업체 연결 — Company.laserOnly=true')
  })

  describe('isLaserOnlyFolder', () => {
    it('존재하는 폴더명 → true')
    it('존재하지 않는 폴더명 → false')
  })
})
```

### 9. 단위 테스트 — AutoContactService 확장

`webhard-api/src/integration/orders/__tests__/auto-contact.service.spec.ts`에 추가:

```
// 14. LaserOnlyMapping 기반 laser_cutting
describe('AutoContactService.detectAndCreate — LaserOnlyMapping', () => {
  it('LaserOnlyMapping 존재 + Company 미등록 → laser_cutting 생성')
  it('LaserOnlyMapping 미존재 + Company.laserOnly=true → 하위호환 laser_cutting')
  it('LaserOnlyMapping 존재 + 샘플 폴더 → 샘플 로직 우선')
})
```

AutoContactService의 constructor에 LaserOnlyMappingService가 추가되었으므로, 기존 테스트의 beforeEach에서도 mock을 추가해야 한다. `isLaserOnlyFolder`가 기본적으로 `false`를 반환하도록 mock하여 기존 테스트가 깨지지 않게 하라.

## Acceptance Criteria

```bash
cd webhard-api && npx prisma migrate dev --name add-laser-only-mapping && pnpm build && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/6-laser-only/index.json`의 phase 1 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- **프론트엔드 코드는 수정하지 마라.** 이 phase는 백엔드만 다룬다.
- **기존 auto-contact 테스트 12개가 모두 통과해야 한다.** LaserOnlyMappingService mock을 기본 `isLaserOnlyFolder → false`로 설정하여 기존 테스트에 영향 없도록 하라.
- Company.laserOnly 필드는 삭제하지 마라. 하위호환을 위해 유지한다.
- Migration 이름은 `add-laser-only-mapping`으로 한다.
- 순환 의존성 주의: OrdersModule → CompaniesModule 의존이 추가된다. 필요 시 forwardRef 사용.
- env 파일은 수정하지 마라. 기존 DATABASE_URL을 그대로 사용.
