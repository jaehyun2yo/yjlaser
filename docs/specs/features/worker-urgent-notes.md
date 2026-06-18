# Worker Urgent Badge & Multi-Notes Spec

## Overview

Worker 페이지 2개 기능 개선: (1) 긴급 뱃지 및 우선 정렬 + 우클릭 메뉴, (2) 다건 메모/이슈 시스템(최대 3개, 메모+이슈 동시 표시).

---

## Feature 1: Worker 긴급 뱃지 시스템

### Current State (AS-IS)

- contacts 테이블에 긴급 관련 필드 없음
- Worker 대시보드에서 각 상태(processStage)별로 카드 표시, `createdAt desc` 정렬
- 정렬 로직은 백엔드 `contacts.service.ts`의 `sortBy=createdAt, sortOrder=desc` 기본값
- 우클릭 메뉴(context menu)는 Worker에 존재하지 않음 (웹하드에만 `WebhardContextMenu` 구현)
- 특정 문의를 긴급 처리해야 할 때 구분할 수 있는 시각적 표시 수단이 없음

### Requirements (TO-BE)

1. **DB**: contacts 테이블에 `is_urgent` (Boolean, default false) + `urgent_at` (DateTime?, 긴급 설정 시점) 필드 추가
2. **정렬**: 각 상태별 목록에서 긴급 건이 항상 최상단, 긴급 건 내에서는 `urgent_at desc`, 비긴급 건은 `createdAt desc`
3. **뱃지**: 카드 UI에 빨간색 "긴급" 배지 표시 (StaffContactCard, OfficeContactCard 모두)
4. **우클릭 메뉴**: Worker 카드에 우클릭(모바일: 길게 누르기) 시 컨텍스트 메뉴 표시, "긴급 배치" / "긴급 해제" 토글 기능
5. **API**: PATCH `/api/v1/contacts/:id` 를 통한 `isUrgent` 필드 업데이트 (기존 update endpoint 활용)

### Proposed Solution

#### DB Schema Change

```sql
ALTER TABLE contacts ADD COLUMN is_urgent BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN urgent_at TIMESTAMPTZ;
```

Prisma schema:

```prisma
isUrgent  Boolean?  @default(false) @map("is_urgent")
urgentAt  DateTime? @map("urgent_at")
```

#### 정렬 로직 (백엔드)

`contacts.service.ts`의 `findAll()`에서 orderBy를 복합 정렬로 변경:

```typescript
const orderBy: Prisma.ContactOrderByWithRelationInput[] = [
  { isUrgent: 'desc' }, // 긴급 건 우선 (true > false/null)
  { urgentAt: 'desc' }, // 긴급 건 내 최신 설정 순
  { [orderByField]: sortOrder }, // 기존 정렬 유지
];
```

#### 프론트엔드 컨텍스트 메뉴

- `WorkerContextMenu` 컴포넌트 신규 생성
- `useWorkerContextMenu` 훅 신규 생성 (모바일 long press + 데스크톱 right click)
- 메뉴 아이템: "긴급 배치" / "긴급 해제" (is_urgent 토글)
- 토글 시 서버 액션 `toggleUrgent()` 호출 → NestJS API PATCH 요청

#### 뱃지 UI

```tsx
{
  contact.is_urgent && (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">
      긴급
    </span>
  );
}
```

### Completion Criteria

- [ ] contacts 테이블에 `is_urgent`, `urgent_at` 컬럼 추가됨
- [ ] NestJS DTO에 `isUrgent`, `urgentAt` 필드 추가됨
- [ ] 백엔드 정렬 로직이 긴급 우선으로 변경됨
- [ ] StaffContactCard, OfficeContactCard에 빨간색 "긴급" 배지 표시됨
- [ ] Worker 카드 우클릭/롱프레스 시 컨텍스트 메뉴 표시됨
- [ ] 컨텍스트 메뉴에서 긴급 토글 시 즉시 반영됨 (optimistic update)
- [ ] 긴급 건이 각 상태 그룹 내 최상단에 정렬됨
- [ ] 관리자 페이지에서도 긴급 배지 확인 가능함

---

## Feature 2: Worker 다건 메모/이슈 시스템

### Current State (AS-IS)

- contacts 테이블에 단일 필드로 메모 저장:
  - `worker_memo` (String?): 메모 텍스트 1개만 저장
  - `worker_issue` (Boolean?): 이슈 여부 (true/false)
  - `worker_memo_at` (DateTime?): 작성 시각
  - `worker_memo_by` (String?): 작성자
- 메모 작성 후 이슈 작성 시 기존 메모가 덮어씌워져 사라짐
- WorkerMemoModal: 단일 텍스트 입력 + 메모/이슈 토글 (한 종류만 선택 가능)
- StaffContactCard: `worker_memo` 인라인 1줄 표시

### Requirements (TO-BE)

1. **DB**: `worker_notes` 테이블 신규 생성 (contact_id, type, content, created_by, created_at, updated_at)
2. **최대 3개**: 한 문의당 메모+이슈 합쳐서 최대 3개까지 작성 가능 (애플리케이션 레벨 제한)
3. **메모+이슈 동시 존재**: 메모 2개 + 이슈 1개 등 조합 가능
4. **모달 UI 개선**: 기존 노트 목록 표시 + 새 노트 추가 폼 + 개별 삭제 기능
5. **카드 UI 개선**: 카드에 메모/이슈 복수 인라인 표시 (접기/펼치기)
6. **하위 호환**: 기존 `worker_memo` 등 4개 필드는 deprecated 처리, 마이그레이션으로 기존 데이터 이전

### Proposed Solution

#### DB Schema — worker_notes 테이블

```prisma
model WorkerNote {
  id        Int      @id @default(autoincrement())
  contactId Int      @map("contact_id")
  type      String   // 'memo' | 'issue'
  content   String
  createdBy String   @map("created_by")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  contact   Contact  @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@index([contactId])
  @@map("worker_notes")
}
```

Contact 모델에 relation 추가:

```prisma
workerNotes WorkerNote[]
```

#### 데이터 마이그레이션

기존 `worker_memo`가 있는 레코드를 `worker_notes` 테이블로 이전:

```sql
INSERT INTO worker_notes (contact_id, type, content, created_by, created_at, updated_at)
SELECT id,
       CASE WHEN worker_issue = true THEN 'issue' ELSE 'memo' END,
       worker_memo,
       COALESCE(worker_memo_by, 'system'),
       COALESCE(worker_memo_at, NOW()),
       COALESCE(worker_memo_at, NOW())
FROM contacts
WHERE worker_memo IS NOT NULL AND worker_memo != '';
```

#### NestJS API

**새 엔드포인트 (worker-notes 모듈 또는 contacts 하위)**:

- `GET /api/v1/contacts/:id/notes` — 해당 문의의 노트 목록 (최대 3개)
- `POST /api/v1/contacts/:id/notes` — 노트 추가 (3개 초과 시 400 에러)
- `DELETE /api/v1/contacts/:id/notes/:noteId` — 노트 삭제

기존 `findAll()` 응답에 `workerNotes` relation include 추가.

#### 프론트엔드

**WorkerMemoModal 개선**:

- 상단: 기존 노트 목록 (type 아이콘 + content + 삭제 버튼)
- 하단: 새 노트 추가 폼 (3개 미만일 때만 활성화)
- 3개 이상이면 "최대 3개까지 작성 가능합니다" 안내

**카드 표시 개선**:

- 메모/이슈 아이콘과 함께 인라인 표시
- 2개 이상일 때 "외 N건" 접기/펼치기

### Completion Criteria

- [ ] `worker_notes` 테이블 생성됨
- [ ] 기존 `worker_memo` 데이터가 `worker_notes`로 이전됨
- [ ] NestJS 노트 CRUD API 구현됨 (3개 제한 포함)
- [ ] `findAll()` 응답에 `workerNotes` 포함됨
- [ ] WorkerMemoModal에서 기존 노트 목록 확인 + 새 노트 추가 + 삭제 가능
- [ ] StaffContactCard, OfficeContactCard에 복수 메모/이슈 표시됨
- [ ] 기존 4개 필드(`worker_memo` 등) deprecated 처리됨
- [ ] 최대 3개 제한이 백엔드+프론트엔드 모두에서 적용됨

---

## Non-Goals

- 관리자 페이지의 메모/이슈 UI 개선 (이 스펙 범위 외)
- 메모 수정(편집) 기능 (삭제 후 재작성으로 대체)
- 메모 첨부파일 (텍스트만 지원)
- 긴급 뱃지 알림/푸시 기능

---

## Technical Notes

- 모든 DB 접근: Next.js -> NestJS API -> Prisma (직접 DB 접근 금지)
- 스타일: `@/lib/styles.ts` 상수 사용, `dark:` 클래스 금지
- React Query: `queryKeys` 팩토리 사용, mutation 후 쿼리 무효화
- NestJS DTO: class-validator 데코레이터, ValidationPipe 적용
- 타입: `any` 금지, Contact 타입에 `is_urgent`, `urgent_at`, `worker_notes` 필드 추가

## Dependencies

- Prisma migration (schema change + data migration)
- Contact 타입 확장 (`src/lib/types/contact.ts`)
- contacts.service.ts 정렬 로직 수정
