# Phase 3: NestJS folder-aliases admin endpoint

## 사전 준비

- `docs/specs/features/external-sync-company-folder.md` (Phase 0) §"API 엔드포인트", §"admin 승인" — 본 phase 는 이 §의 endpoint 4개 + service 를 구현한다.
- `docs/specs/api/nestjs-endpoints.md` 또는 `docs/specs/api/endpoints/integration.md` — 기존 admin auth + companies controller 패턴.
- `tasks/24-external-sync-company-folder/docs-diff.md`.
- `tasks/24-external-sync-company-folder/phase1.md` 산출물 — `CompanyFolderAlias` 모델 (Prisma Client 의 `prisma.companyFolderAlias.*` 메서드 사용).
- `tasks/24-external-sync-company-folder/phase2.md` 산출물 — `ContactFolderSyncService.relocateAfterAliasApproved(folderName, companyId, client?)` 시그니처. `cascadeBackfill: true` 시 호출 대상.
- `webhard-api/src/companies/companies.controller.ts` line 32-237 — 기존 endpoint 패턴(DTO + ValidationPipe + AdminAuthGuard).
- `webhard-api/src/companies/companies.module.ts` — provider 등록 패턴.
- `webhard-api/src/companies/companies.service.ts` — service 구조 참고.
- `webhard-api/src/auth/admin-auth.guard.ts` (또는 admin auth 가 정의된 위치) — admin 인증 가드 + request 확장 (`req.adminUser` 또는 동등 필드) 정확한 이름 확인.
- `webhard-api/src/contacts/contacts.module.ts` — `ContactFolderSyncService` 가 export 되는지 확인. 안 되어 있으면 export 추가 필요.

## 작업 내용

### 1. `webhard-api/src/companies/dto/folder-alias.dto.ts` 신규

```ts
import { IsBoolean, IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class ListFolderAliasesDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected';

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number = 50;
}

export class ApproveFolderAliasDto {
  @IsOptional()
  @IsBoolean()
  cascadeBackfill?: boolean = false;
}
```

`@Type` 변환 (`class-transformer`) 이 기존 코드에서 `Query()` DTO 에 적용되어 있다면 동일 패턴 적용 (number 변환).

### 2. `webhard-api/src/companies/folder-alias.service.ts` 신규

```ts
@Injectable()
export class FolderAliasService {
  private readonly logger = new Logger(FolderAliasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contactFolderSync: ContactFolderSyncService
  ) {}

  async list(
    query: ListFolderAliasesDto
  ): Promise<{ items: any[]; total: number; page: number; pageSize: number }> {
    const where = query.status ? { status: query.status } : {};
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.companyFolderAlias.findMany({
        where,
        include: { company: { select: { id: true, companyName: true, isApproved: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.companyFolderAlias.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async approve(
    id: number,
    dto: ApproveFolderAliasDto,
    approvedBy: string
  ): Promise<{ alias: any; backfill?: { relocated: number; skipped: number } }> {
    return await this.prisma.$transaction(async (tx) => {
      const alias = await tx.companyFolderAlias.findUnique({ where: { id } });
      if (!alias) throw new NotFoundException(`FolderAlias ${id} not found`);

      // 멱등 — 이미 approved 면 그대로 반환 (다른 pending 까지 다시 rejected 처리하는 부작용 방지)
      if (alias.status === 'approved') {
        return { alias };
      }

      // 동일 folderName 의 다른 pending → rejected
      await tx.companyFolderAlias.updateMany({
        where: { folderName: alias.folderName, id: { not: id }, status: 'pending' },
        data: { status: 'rejected' },
      });

      // 본 alias → approved
      const updated = await tx.companyFolderAlias.update({
        where: { id },
        data: { status: 'approved', approvedBy, approvedAt: new Date() },
      });

      // cascadeBackfill: true 면 외부 미통합 Contact 일괄 통합
      let backfill: { relocated: number; skipped: number } | undefined;
      if (dto.cascadeBackfill) {
        backfill = await this.contactFolderSync.relocateAfterAliasApproved(
          alias.folderName,
          alias.companyId,
          tx as any
        );
      }

      return { alias: updated, backfill };
    });
  }

  async reject(id: number) {
    const alias = await this.prisma.companyFolderAlias.findUnique({ where: { id } });
    if (!alias) throw new NotFoundException(`FolderAlias ${id} not found`);
    return this.prisma.companyFolderAlias.update({
      where: { id },
      data: { status: 'rejected' },
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.companyFolderAlias.delete({ where: { id } });
  }
}
```

**핵심 규칙**:

- `approve` 의 동일 folderName pending → rejected + 본 alias → approved + (옵션) backfill 은 단일 트랜잭션. 부분 실패 시 전체 rollback.
- `approve` 멱등성 — 이미 approved 인 alias 에 다시 approve 호출 시 NoOp. 다른 pending 을 다시 rejected 처리하는 부작용 차단.
- `reject` 는 트랜잭션 미사용 (단일 update). 멱등 — 이미 rejected 면 그대로 update 실행 (no-op).
- `delete` 는 hard delete. 운영자가 alias 자체를 제거할 때 사용.

### 3. `webhard-api/src/companies/companies.controller.ts` endpoint 4개 추가

기존 controller 의 마지막 endpoint 뒤에 추가. `AdminAuthGuard` (또는 본 프로젝트의 admin 가드 클래스명) 으로 모든 endpoint 보호:

```ts
@UseGuards(AdminAuthGuard)
@Get('folder-aliases')
async listFolderAliases(@Query() query: ListFolderAliasesDto) {
  return this.folderAliasService.list(query);
}

@UseGuards(AdminAuthGuard)
@Post('folder-aliases/:id/approve')
async approveFolderAlias(
  @Param('id', ParseIntPipe) id: number,
  @Body() dto: ApproveFolderAliasDto,
  @Req() req: Request,
) {
  // admin 사용자명 추출 — admin auth guard 의 request 확장 필드명을 정확히 확인하여 일치시킬 것
  const approvedBy = (req as any).adminUser?.username ?? 'admin';
  return this.folderAliasService.approve(id, dto, approvedBy);
}

@UseGuards(AdminAuthGuard)
@Patch('folder-aliases/:id/reject')
async rejectFolderAlias(@Param('id', ParseIntPipe) id: number) {
  return this.folderAliasService.reject(id);
}

@UseGuards(AdminAuthGuard)
@Delete('folder-aliases/:id')
async deleteFolderAlias(@Param('id', ParseIntPipe) id: number) {
  await this.folderAliasService.delete(id);
  return { ok: true };
}
```

`approvedBy` 추출 — admin auth 가드의 request 확장 필드명 (`req.adminUser`, `req.user`, `req.session.admin`) 을 `webhard-api/src/auth/admin-auth.guard.ts` 에서 직접 확인하여 정확히 매칭시킨다. fallback 으로 `'admin'` 문자열 사용.

`Controller` prefix 는 기존 `companies.controller.ts` 의 `@Controller('companies')` 그대로 따라간다 — endpoint 경로가 자동으로 `/api/v1/companies/folder-aliases/...` 가 된다.

### 4. `webhard-api/src/companies/companies.module.ts` provider 추가 + dependency 정리

```ts
@Module({
  imports: [
    ,
    /* 기존 imports */ ContactsModule, // ContactFolderSyncService 주입을 위함. 이미 import 되어 있으면 skip.
  ],
  controllers: [CompaniesController],
  providers: [, /* 기존 providers */ FolderAliasService],
  exports: [
    /* 기존 + (필요시) FolderAliasService */
  ],
})
export class CompaniesModule {}
```

`ContactFolderSyncService` 가 `ContactsModule` 에서 export 되지 않았다면 `webhard-api/src/contacts/contacts.module.ts` 의 `exports` 배열에 `ContactFolderSyncService` 추가. 순환 의존(`ContactsModule` ↔ `CompaniesModule`) 발생 시 `forwardRef` 사용.

### 5. 테스트 — `webhard-api/src/companies/folder-alias.service.spec.ts` B1~B7 신규

기존 `companies.service.spec.ts` 의 jest.fn() 패턴 그대로. PrismaService mock + ContactFolderSyncService mock:

| ID  | 시나리오                                                                                            | 검증                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| B1  | `approve(id, { cascadeBackfill: false }, 'admin')` → status='approved' + approvedBy/approvedAt 기록 | `update` 호출 1회 + dto 검증                                                                                    |
| B2  | `approve(id)` 시 동일 folderName 의 다른 pending → 자동 rejected                                    | `updateMany` 호출 1회. where 조건 검증 (`folderName: alias.folderName`, `id: { not: id }`, `status: 'pending'`) |
| B3  | `approve(id, { cascadeBackfill: true })` → relocateAfterAliasApproved 호출                          | mock 호출 횟수 1 + (folderName, companyId) 인자 정확 + tx 인자 전달 검증                                        |
| B4  | `approve(id, { cascadeBackfill: false })` → relocateAfterAliasApproved 미호출                       | mock 호출 횟수 0                                                                                                |
| B5  | `approve(id)` 멱등 — 이미 approved 인 alias                                                         | updateMany / update / relocate 모두 호출 0회 (다른 pending 까지 다시 rejected 처리되지 않음을 검증)             |
| B6  | `reject(id)` → status='rejected'                                                                    | update 호출 1회. data 검증                                                                                      |
| B7  | `delete(id)` → row 삭제                                                                             | delete 호출 1회                                                                                                 |
| B8  | `list({ status: 'pending', page: 2, pageSize: 25 })` → skip + take 정확                             | findMany 인자의 skip=25, take=25 검증                                                                           |

mock 패턴 예시:

```ts
const prismaMock = {
  companyFolderAlias: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn().mockImplementation(async (cb) => cb(prismaMock)),
};
const contactFolderSyncMock = {
  relocateAfterAliasApproved: jest.fn().mockResolvedValue({ relocated: 0, skipped: 0 }),
};
const service = new FolderAliasService(prismaMock as any, contactFolderSyncMock as any);
```

### 6. spec 갱신 — `docs/specs/api/nestjs-endpoints.md` (있으면)

신규 endpoint 4개를 endpoint index 에 추가. 메서드/경로/auth/요약 1줄씩.

## Acceptance Criteria

병렬 실행:

```bash
cd webhard-api && pnpm build
```

```bash
cd webhard-api && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 단일 메시지에 Bash 병렬로 발사하라. 모두 통과하면 `tasks/24-external-sync-company-folder/index.json` 의 phase 3 status 를 `"completed"` 로 변경하라. 수정 3회 이상 시도해도 실패하면 status 를 `"error"` 로 변경하고 에러 내용을 `"error_message"` 필드로 기록하라.

## 주의사항

- **endpoint 위치**: `companies/` 모듈 내부. `integration/` 모듈에 만들지 마라 — 기존 `LaserOnlyMapping` 과 대칭성 유지.
- **`ContactsModule` export**: `ContactFolderSyncService` 가 export 되어 있어야 `FolderAliasService` 가 주입받을 수 있다. export 추가 시 다른 import 자에 영향 없는지 확인. 순환 의존 발생 시 `forwardRef`.
- **트랜잭션**: `approve` 의 모든 단계 단일 트랜잭션. 부분 실패 시 전체 rollback.
- **권한**: 모든 endpoint AdminAuthGuard. company auth 나 worker auth 통과 안 됨.
- **idempotent approve**: 이미 approved 인 alias 에 다시 approve 호출 시 NoOp + 본 alias 정보만 반환. 다른 pending 까지 rejected 처리하는 부작용을 다시 일으키지 마라.
- **Frontend / E2E 변경 금지**: 본 phase 는 backend 만. UI 는 Phase 4. E2E 시나리오는 Phase 5.
- **logger 사용**: `console.log` 금지. NestJS `Logger` 사용 (서비스 내 `private readonly logger = new Logger(FolderAliasService.name);`).
- **하드코딩된 SystemSetting/SecretKey 금지**: admin 가드는 기존 가드 그대로 사용.
