# Phase 1: DB 스키마 + Prisma 모델

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/contact-split.md` (이번 기능 스펙)
- `docs/specs/db/prisma-tables.md`
- `/tasks/2-contact-split/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- Phase 0에서 생성/수정된 문서 파일들

현재 Prisma 스키마를 반드시 읽어라:

- `webhard-api/prisma/schema.prisma` — 전체 파일. 특히 Contact 모델과 그 관계들을 완전히 이해하라.
- `webhard-api/prisma/migrations/manual/` — 기존 마이그레이션 파일 패턴 확인. 현재 최신은 `006_add_backup_logs.sql`이므로 새 파일은 `007`번이다.

## 작업 내용

### 1. Prisma 스키마에 Contact 분할 필드 추가

`webhard-api/prisma/schema.prisma` 파일의 Contact 모델에 4개 필드와 자기참조 관계를 추가한다.

**추가할 필드** (Contact 모델의 기존 필드 섹션 마지막, 관계 섹션 앞에 위치):

```prisma
// 분할 관련
parentContactId String?  @map("parent_contact_id") @db.Uuid
splitIndex      Int?     @map("split_index")
splitCount      Int?     @map("split_count")
stageCompleted  Boolean  @default(false) @map("stage_completed")
```

**추가할 관계** (Contact 모델의 관계 섹션, 기존 `statusHistory`, `workerNotes`, `drawingRevisions` 옆에):

```prisma
parent   Contact?  @relation("ContactSplit", fields: [parentContactId], references: [id], onDelete: SetNull)
children Contact[] @relation("ContactSplit")
```

**추가할 인덱스** (Contact 모델의 기존 `@@index` 섹션에 추가):

```prisma
@@index([parentContactId])
@@index([parentContactId, splitIndex])
```

### 2. SQL 마이그레이션 파일 생성

`webhard-api/prisma/migrations/manual/007_add_contact_split.sql`:

```sql
-- Contact Split: 문의 분할 기능
-- 한 문의에 여러 도면이 합쳐진 경우 개별 하위 문의로 분할

ALTER TABLE contacts ADD COLUMN parent_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE contacts ADD COLUMN split_index INTEGER;
ALTER TABLE contacts ADD COLUMN split_count INTEGER;
ALTER TABLE contacts ADD COLUMN stage_completed BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_contacts_parent_contact_id ON contacts(parent_contact_id);
CREATE INDEX idx_contacts_parent_split ON contacts(parent_contact_id, split_index);
```

### 3. Prisma Client 재생성

```bash
cd webhard-api && npx prisma generate
```

## Acceptance Criteria

```bash
cd webhard-api && npx prisma generate && pnpm build
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/2-contact-split/index.json`의 phase 1 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- Contact 모델의 기존 필드를 삭제하거나 수정하지 마라. 새 필드와 관계만 추가.
- 다른 모델(ContactStatusHistory, DrawingRevision, WorkerNote 등)을 수정하지 마라.
- 기존 인덱스를 건드리지 마라.
- `npx prisma migrate dev`는 실행하지 마라 (운영 DB와 동기화 이슈). `prisma generate`만 실행.
- 마이그레이션 번호가 007인지 확인하라. `webhard-api/prisma/migrations/manual/` 디렉토리에 이미 006까지 있다.
- Prisma의 자기참조 관계(self-relation)는 반드시 명시적 이름(`"ContactSplit"`)을 사용해야 한다. 이름 없이 하면 기존 관계와 충돌할 수 있다.
