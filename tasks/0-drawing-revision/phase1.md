# Phase 1: DB 스키마 + Prisma 모델

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/drawing-revision-history.md` (이번 기능 스펙)
- `docs/specs/db/prisma-tables.md`
- `/tasks/0-drawing-revision/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- Phase 0에서 생성/수정된 문서 파일들

현재 Prisma 스키마를 반드시 읽어라:

- `webhard-api/prisma/schema.prisma` — 전체 파일. 특히 Contact 모델(line 442-582)과 ContactStatusHistory 모델(line 584-608) 구조를 완전히 이해하라.
- `webhard-api/prisma/migrations/manual/` — 기존 마이그레이션 파일 패턴 확인

## 작업 내용

### 1. Prisma 스키마에 DrawingRevision 모델 추가

`webhard-api/prisma/schema.prisma` 파일에서 ContactStatusHistory 모델(`@@map("contact_status_history")`) 다음에 새 모델을 추가:

```prisma
model DrawingRevision {
  id            String   @id @default(uuid())
  contactId     String   @map("contact_id") @db.Uuid
  version       Int
  processStage  String?  @map("process_stage") @db.VarChar(30)
  reason        String   @db.VarChar(30)
  reasonDetail  String?  @map("reason_detail")
  files         Json     @default("[]")
  actorType     String   @map("actor_type") @db.VarChar(20)
  actorName     String?  @map("actor_name") @db.VarChar(100)
  source        String   @db.VarChar(30)
  isPublic      Boolean  @default(false) @map("is_public")
  note          String?
  createdAt     DateTime @default(now()) @map("created_at")

  contact Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@index([contactId, createdAt])
  @@index([contactId, version])
  @@map("drawing_revisions")
}
```

### 2. Contact 모델에 관계 추가

Contact 모델 내의 관계 섹션(현재 `statusHistory`와 `workerNotes` 있는 곳, line 578-579 부근)에 추가:

```prisma
drawingRevisions DrawingRevision[]
```

### 3. SQL 마이그레이션 파일 생성

`webhard-api/prisma/migrations/manual/005_add_drawing_revisions.sql`:

```sql
-- DrawingRevision: 도면 수정 히스토리
CREATE TABLE drawing_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  process_stage VARCHAR(30),
  reason VARCHAR(30) NOT NULL,
  reason_detail TEXT,
  files JSONB NOT NULL DEFAULT '[]'::jsonb,
  actor_type VARCHAR(20) NOT NULL,
  actor_name VARCHAR(100),
  source VARCHAR(30) NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_drawing_revisions_contact_created ON drawing_revisions(contact_id, created_at);
CREATE INDEX idx_drawing_revisions_contact_version ON drawing_revisions(contact_id, version);
```

### 4. Prisma Client 재생성

```bash
cd webhard-api && npx prisma generate
```

## Acceptance Criteria

```bash
cd webhard-api && npx prisma generate && pnpm build
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/0-drawing-revision/index.json`의 phase 1 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- Contact 모델의 기존 필드(`drawingFileUrl`, `drawingFileName` 등)를 삭제하거나 수정하지 마라. 새 관계만 추가.
- `ContactStatusHistory` 모델을 수정하지 마라. 이건 Phase 2에서 처리.
- 기존 인덱스나 다른 모델의 코드를 건드리지 마라.
- `npx prisma migrate dev`는 실행하지 마라 (운영 DB와 동기화 이슈). `prisma generate`만 실행.
- 마이그레이션 SQL 파일의 번호(005)가 기존 파일과 겹치지 않는지 `webhard-api/prisma/migrations/manual/` 디렉토리를 확인하라.
