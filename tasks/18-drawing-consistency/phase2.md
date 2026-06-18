# Phase 2: schema-extend

## 사전 준비

먼저 아래 파일을 읽어 WebhardFolder 현재 스키마와 이번 phase 가 추가할 4 컬럼의 의미를 확인하라:

- `tasks/18-drawing-consistency/phase0.md` 의 "§3 prisma-tables.md" 섹션 — 추가될 4 컬럼의 역할.
- `tasks/18-drawing-consistency/docs-diff.md` — phase 0 문서 diff.
- `webhard-api/prisma/schema.prisma` 의 `WebhardFolder` 모델 — 현재 필드와 인덱스.
- `webhard-api/prisma/migrations/` — 기존 마이그레이션 파일들의 네이밍·SQL 패턴 참고.
- `webhard-api/src/folders/folders.service.ts:468~583` — `DEFAULT_FOLDER_TEMPLATE`. 이번 phase 는 스키마만 건드리지만, 다음 phase(5) 에서 어떤 값을 채워 넣을지 감안해서 default 값을 적절히 설정한다.

이유: 스키마 변경은 모든 후속 phase(5·7) 가 의존하므로 필드명·타입·기본값·인덱스를 정확히 설계해야 재마이그레이션 비용이 없다.

## 작업 내용

### 1. `webhard-api/prisma/schema.prisma` 수정

`WebhardFolder` 모델에 아래 4 필드 추가:

```prisma
model WebhardFolder {
  // ... 기존 필드 ...

  inquiryNumber String?  @map("inquiry_number")
  workNumber    String?  @map("work_number")
  contactId     String?  @map("contact_id") @db.Uuid
  folderKind    String   @default("generic") @map("folder_kind") @db.VarChar(20)

  // 기존 인덱스에 추가
  @@index([contactId], map: "webhard_folders_contact_id_idx")
}
```

`folderKind` 값 도메인 (enum 으로 만들지는 않고 문자열 상수로 관리):

- `"root"` — 업체 최상위 폴더 (`parentId == null`, name == companyName)
- `"template"` — 칼선의뢰 / 목형의뢰 / 완료 등 고정 템플릿
- `"inquiry"` — 문의별 서브폴더 (`문의-{번호}` 형식)
- `"generic"` — 그 외 (기본값, 마이그레이션으로 기존 행 전체가 여기로)

### 2. 마이그레이션 생성

```bash
cd webhard-api && npx prisma migrate dev --name webhard_folders_inquiry_link
```

생성된 SQL 이 대략 아래 형태가 되는지 확인 (Postgres):

```sql
ALTER TABLE "webhard_folders"
  ADD COLUMN "inquiry_number" TEXT,
  ADD COLUMN "work_number" TEXT,
  ADD COLUMN "contact_id" UUID,
  ADD COLUMN "folder_kind" VARCHAR(20) NOT NULL DEFAULT 'generic';

CREATE INDEX "webhard_folders_contact_id_idx" ON "webhard_folders"("contact_id");
```

기존 행은 `folder_kind = 'generic'` 으로 기본 채워지고 나머지 3 컬럼은 NULL. phase 7 의 마이그레이션 스크립트가 실제 분류(`root`/`template`/`inquiry`) 를 채우고 기존 `문의-{...}` 폴더의 contactId·번호를 역추적해서 백필한다. **이 phase 에서는 데이터 백필을 수행하지 않는다** (스키마만).

### 3. Prisma Client 재생성 검증

```bash
cd webhard-api && npx prisma generate
```

생성된 `@prisma/client` 의 `WebhardFolder` 타입에 새 4 필드가 반영되었는지 확인. IDE 타입 체크 통과.

### 4. 기존 코드 호환성

이 phase 는 **새 필드를 추가만** 한다. 기존 `folders.service.ts` / `syncRevisionToWebhard` / `registerFilesToWebhard` / LGU+ sync path 모두 **새 필드를 읽거나 쓰지 않음** — 후속 phase 에서 점진적으로 사용.

단 `FoldersService` 의 `WebhardFolder` 생성/수정 호출부가 새 필드를 **부분적으로** 받을 수 있도록 타입 정의만 맞춘다. 예를 들어 기존 `create({ data: {name, parentId, companyId, path} })` 가 그대로 동작하고, 추가로 optional 하게 `contactId`, `inquiryNumber`, `workNumber`, `folderKind` 를 받을 수 있으면 된다.

### 5. 유닛 테스트

- `webhard-api/src/folders/folders.service.spec.ts` 에 기존 테스트가 있다면, 새 필드를 optional 로 받는지 smoke test 1 개 추가.
- 신규 전용 테스트 파일은 만들지 않음 (스키마 변경만 있고 로직은 phase 5·7).

## Acceptance Criteria

```bash
cd webhard-api && npx prisma migrate dev --name webhard_folders_inquiry_link && npx prisma generate && pnpm build && pnpm test -- --testPathPattern="folders"
```

migrate 가 실패하면 `--create-only` 로 drafts 만 생성 후 내용 조정 재시도.

## AC 검증 방법

위 커맨드 통과 시 `tasks/18-drawing-consistency/index.json` 의 phase 2 status 를 `"completed"`. migrate 실패가 3회 이상이면 `"error"` + 에러 내용 기록.

## 주의사항

- **기존 데이터를 건드리지 마라**. phase 2 는 스키마만. 데이터 백필은 phase 7.
- `folderKind` 는 enum 타입으로 만들지 마라. Prisma 에서 enum 을 쓰면 migration 비용이 커지고, 문자열 상수가 더 유연하다 (유틸 상수로 관리).
- `contact_id` 는 FK 관계로 강제 연결하지 마라 — loose reference (문의 삭제 시 folder 는 남을 수 있음). `onDelete: SetNull` 도 적용하지 않는다. 그냥 UUID 컬럼만.
- 인덱스는 `contact_id` 에만. `inquiry_number` / `work_number` 는 개별 인덱스 없이도 조회 성능 문제 없음 (문의당 1개 폴더).
- 마이그레이션 이름은 반드시 `webhard_folders_inquiry_link`. 다른 이름 쓰지 마라 (phase 0 문서와 일치 필요).
- 마이그레이션 후 `npx prisma generate` 필수 — generated client 갱신 없으면 후속 phase 에서 타입 에러.
