# Phase 1: DB schema — CompanyFolderAlias

## 사전 준비

먼저 아래 문서·파일을 읽고 정책·기존 모델 패턴을 이해하라:

- `docs/specs/features/external-sync-company-folder.md` (Phase 0 신규) §"DB 모델 — `CompanyFolderAlias`" — 본 phase 가 구현해야 할 모델 시그니처(필드, unique, index, onDelete) 가 명시됨.
- `docs/specs/db/prisma-tables.md` (Phase 0 갱신) `company_folder_aliases` §과 `companies` 보정 §— spec 과 schema.prisma 가 일치해야 한다.
- `tasks/24-external-sync-company-folder/docs-diff.md` (Phase 0 후 자동 생성) — Phase 0 의 spec 변경 diff. 본 phase 는 이 diff 의 DB §과 schema 가 일치하는지 확인하기 위함.
- `webhard-api/prisma/schema.prisma` line 11-66 (`Company` 모델) — relation 추가 위치.
- `webhard-api/prisma/schema.prisma` line 951-963 (`LaserOnlyMapping` 모델) — 기존 회사 매핑 모델 패턴(relation, unique, index, @@map) 의 레퍼런스. 본 phase 의 `CompanyFolderAlias` 도 동일 형식.
- `webhard-api/prisma/migrations/` 디렉토리 — 기존 migration 파일들. 본 phase 의 migration 도 동일 형식(timestamp_name/migration.sql + Prisma 자동 생성) 을 따른다.

## 작업 내용

### 1. `webhard-api/prisma/schema.prisma` 모델 추가

`LaserOnlyMapping` 정의 직후에 다음 모델을 추가한다:

```prisma
model CompanyFolderAlias {
  id          Int       @id @default(autoincrement())
  folderName  String    @map("folder_name")
  companyId   Int       @map("company_id")
  company     Company   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  status      String    @default("pending") @map("status")
  approvedBy  String?   @map("approved_by")
  approvedAt  DateTime? @map("approved_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  @@unique([folderName, companyId])
  @@index([folderName])
  @@index([status])
  @@map("company_folder_aliases")
}
```

`Company` 모델의 relation 블록 (다른 `[]` 관계 옆) 에 reverse relation 1줄 추가:

```prisma
folderAliases CompanyFolderAlias[]
```

위치는 `Company` 모델 내부 다른 relation (예: `laserOnlyMappings` 같은 줄) 근처. 알파벳 또는 의미 순서에 맞게 배치.

### 2. Migration 생성·적용

다음 커맨드로 migration 파일을 생성·적용한다:

```bash
cd webhard-api && npx prisma migrate dev --name add_company_folder_alias
```

이 커맨드는:

1. `webhard-api/prisma/migrations/{timestamp}_add_company_folder_alias/migration.sql` 생성
2. dev DB 에 migration 적용
3. Prisma Client 재생성

### 3. Prisma Client 재생성 검증

```bash
cd webhard-api && npx prisma generate
```

Prisma Client(`@prisma/client`) 의 타입 정의에 `CompanyFolderAlias` 타입과 `prisma.companyFolderAlias.*` 메서드(`findFirst`, `findMany`, `findUnique`, `upsert`, `update`, `updateMany`, `delete`) 가 노출되는지 빌드로 확인.

## Acceptance Criteria

```bash
cd webhard-api && npx prisma migrate dev --name add_company_folder_alias && pnpm build
```

migration 적용 + 빌드 통과 시 OK. 테스트는 본 phase 에서 실행하지 않는다 — 모델만 추가했으므로 unit/통합 테스트 영향 없음. 기존 회귀가 발생한다면 본 phase 의 변경(스키마/relation) 이 잘못된 것이므로 수정.

## AC 검증 방법

위 AC 커맨드를 실행하라. 통과하면 `tasks/24-external-sync-company-folder/index.json` 의 phase 1 status 를 `"completed"` 로 변경하라. 수정 3회 이상 시도해도 실패하면 status 를 `"error"` 로 변경하고 에러 내용을 `"error_message"` 필드로 기록하라.

## 주의사항

- **schema 변경 외 다른 코드 건드리지 마라**: 본 phase 는 schema.prisma + migration + generate 만. service / controller / DTO 는 Phase 2/3.
- **migration 이름 고정**: `add_company_folder_alias` — 후속 phase 가 이 이름을 참조한다.
- **`onDelete: Cascade`**: Company 삭제 시 alias 자동 삭제. 운영 중인 alias 가 있는 Company 삭제는 운영자 책임.
- **unique 제약**: `[folderName, companyId]` — 동일 폴더명·동일 업체 매핑 중복 방지. 다수 후보 케이스(Q8) 는 동일 folderName 의 다른 companyId 로 row 가 여러 개 생기므로 이 unique 와 충돌하지 않는다.
- **partial unique index 미사용**: 승인된 alias 가 folderName 당 1개뿐임을 보장하는 partial unique 는 Prisma 가 직접 지원하지 않으므로 응용 단계 (Phase 3 의 `approve()` 트랜잭션) 에서 다른 pending → rejected 처리로 보장한다.
- **기존 `LaserOnlyMapping` 모델 보존**: 본 task 의 alias 와 별개로 운영. 향후 통합은 별도 task.
- **기존 마이그레이션 수정 금지**: prior migration 파일을 절대 수정하지 마라. 신규 migration 만 추가한다.
