# Phase 2: NestJS — 분할 API + 하위 조회

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/contact-split.md` (이번 기능 스펙)
- `docs/specs/api/nestjs-endpoints.md`
- `/tasks/2-contact-split/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/prisma/schema.prisma` — Phase 1에서 추가된 Contact 분할 필드 4개와 자기참조 관계 확인

현재 코드를 반드시 읽어라:

- `webhard-api/src/contacts/contacts.service.ts` — 전체 파일. 기존 CRUD 메서드 패턴, 특히 `create()`, `updateStatus()`, `updateProcessStage()` 메서드의 구현 방식을 이해하라.
- `webhard-api/src/contacts/contacts.controller.ts` — 전체 파일. 엔드포인트 패턴, 가드, 데코레이터 사용 방식을 이해하라.
- `webhard-api/src/contacts/dto/` — 모든 DTO 파일. 기존 DTO 작성 패턴(class-validator 데코레이터 등)을 이해하라.
- `webhard-api/src/contacts/contact-timeline.service.ts` — 타임라인 기록 방식 이해.
- `webhard-api/src/contacts/contacts.gateway.ts` — WebSocket 이벤트 발행 방식 이해.
- `webhard-api/src/number/number.service.ts` — 문의번호 생성 로직 이해.

## 작업 내용

### 1. DTO 생성: `webhard-api/src/contacts/dto/split-contact.dto.ts`

```typescript
// SplitContactDto
// - count: number (2~10, @IsInt, @Min(2), @Max(10))
// - items: optional array of { subject?: string, description?: string }
//   - 배열 길이가 count와 일치하지 않아도 됨 (부족하면 자동 생성)

// SplitContactItemDto
// - subject: optional string (@IsOptional, @IsString, @MaxLength(255))
// - description: optional string (@IsOptional, @IsString)
```

### 2. ContactsService에 분할 메서드 추가

`webhard-api/src/contacts/contacts.service.ts`에 아래 메서드들을 추가한다.

#### `splitContact(id: string, dto: SplitContactDto): Promise<Contact[]>`

핵심 비즈니스 규칙 (반드시 준수):

1. **유효성 검증**:
   - 대상 Contact가 존재해야 한다 (NotFoundException)
   - `parentContactId`가 null이어야 한다 (이미 하위 문의이면 분할 불가, BadRequestException: "하위 문의는 분할할 수 없습니다")
   - `splitCount`가 null이어야 한다 (이미 분할된 원본이면 재분할 불가, BadRequestException: "이미 분할된 문의입니다")
   - `processStage`가 null 또는 `'drawing'`이어야 한다 (BadRequestException: "도면작업 단계 이전에만 분할할 수 있습니다")

2. **하위번호 생성**:
   - 원본의 `inquiryNumber` 또는 `workNumber` 중 존재하는 것에 `-{splitIndex}` suffix 추가
   - 예: `260413-O-001` → `260413-O-001-1`, `260413-O-001-2`
   - inquiryNumber가 있으면 inquiryNumber에, workNumber가 있으면 workNumber에 suffix 추가
   - 둘 다 있으면 (가능성 낮지만) 둘 다 suffix 추가

3. **자식 Contact 생성** (Prisma $transaction 내에서):
   - `dto.count`개의 새 Contact을 생성
   - 복사할 필드: `companyName`, `email`, `phone`, `position`, `inquiryType`, `contactType`, `source`, `orderType`, `isUrgent`, `boxShape`, `material`, `length`, `width`, `height`, `deliveryMethod`, `deliveryAddress`, `deliveryName`, `deliveryPhone`, `deliveryType`, `deliveryCompanyName`, `deliveryCompanyPhone`, `deliveryCompanyAddress`, `deliveryNote`, `receiptMethod`
   - 각 자식의 고유 값:
     - `id`: 새 UUID
     - `parentContactId`: 원본의 id
     - `splitIndex`: 1, 2, 3, ...
     - `inquiryNumber` / `workNumber`: 하위번호
     - `subject`: dto.items[i]?.subject 또는 `"{원본 subject} ({splitIndex})"` 자동 생성
     - `description`: dto.items[i]?.description 또는 null
     - `status`: 원본과 동일
     - `processStage`: 원본과 동일
     - `stageCompleted`: false
     - `drawingFileUrl`, `drawingFileName`: null (관리자가 각각 업로드)
     - `createdAt`: now
   - 원본 업데이트: `splitCount = dto.count`

4. **타임라인 기록** (트랜잭션 후):
   - 원본에 `changeType: 'split'` 기록 (metadata에 `{ splitCount: N, childIds: [...] }`)
   - 각 자식에 `changeType: 'created'` 기록 (metadata에 `{ parentContactId, splitIndex }`)

5. **WebSocket 이벤트**: 분할 완료 후 `contact:split` 이벤트 발행

#### `getChildren(parentId: string): Promise<Contact[]>`

- parentContactId가 일치하는 Contact 목록을 splitIndex ASC로 정렬하여 반환
- workerNotes, drawingRevisions 포함 (include)

### 3. ContactsController에 엔드포인트 추가

`webhard-api/src/contacts/contacts.controller.ts`에 추가:

```
POST /contacts/:id/split
  - @Body() dto: SplitContactDto
  - 반환: { parent: Contact, children: Contact[] }

GET /contacts/:id/children
  - 반환: Contact[]
```

기존 컨트롤러의 패턴(가드, 파이프, 데코레이터 등)을 정확히 따를 것.

### 4. ContactsModule에 등록

새 DTO를 사용하는 서비스/컨트롤러가 이미 모듈에 등록되어 있으므로, 별도 등록 필요 없을 수 있다. 하지만 확인하라.

## Acceptance Criteria

```bash
cd webhard-api && pnpm build
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/2-contact-split/index.json`의 phase 2 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- NumberService는 수정하지 마라. 하위번호는 NumberService를 통해 새로 채번하는 것이 아니라, 원본 번호에 suffix를 붙이는 방식이다.
- 기존 `create()`, `update()`, `findAll()` 메서드를 수정하지 마라. 그룹 쿼리 로직은 Phase 3에서 처리한다.
- 반드시 `$transaction`으로 원자적으로 실행하라. 자식 하나 생성 실패 시 전부 롤백.
- 기존 테스트를 깨뜨리지 마라.
- 타임라인 기록은 fire-and-forget으로 처리하라 (기존 `recordChange` 패턴 참고). 타임라인 실패가 분할 자체를 롤백시키면 안 된다.
- ContactStatusHistory의 `changeType`에 `'split'` 값이 새로 추가된다. 기존 changeType enum/validation이 있다면 확장하라.
