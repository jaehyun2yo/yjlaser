# Phase 3: 백엔드 — 거래처 도면 업로드 + 문의 연결 API

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션, 하드 룰)
- `docs/specs/features/drawing-workflow.md` (이번 기능 전체 스펙)
- `/tasks/12-drawing-workflow/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/src/contacts/drawing-revision.service.ts` (Phase 1에서 확장됨)
- `webhard-api/src/contacts/dto/drawing-revision.dto.ts` (Phase 1에서 확장됨)
- `webhard-api/src/contacts/contacts.controller.ts` (Phase 1에서 수정됨)

그리고 아래 기존 코드를 반드시 읽어라:

- `webhard-api/src/auth/` (인증 가드 — CompanyGuard 확인)
- `webhard-api/src/files/files.controller.ts` (CompanyGuard 사용 패턴 참고)
- `webhard-api/src/contacts/contacts.service.ts` (findOne, update 등)
- `webhard-api/src/contacts/contact-timeline.service.ts` (타임라인 기록)

## 작업 내용

### 1. 거래처 도면 업로드 API (방법 A용)

`webhard-api/src/contacts/contacts.controller.ts`에 엔드포인트 추가:

```typescript
/**
 * POST /api/v1/contacts/:id/company-drawing
 * 거래처가 문의에 도면을 업로드한다.
 * Auth: CompanyGuard (거래처 세션 인증)
 */
@Post(':id/company-drawing')
@UseGuards(CompanyGuard)
async uploadCompanyDrawing(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: CompanyDrawingUploadDto
)
```

#### DTO

```typescript
class CompanyDrawingUploadDto {
  @IsString()
  @IsIn(['revision_submit', 'mold_request', 'other'])
  purpose: string; // 용도

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RevisionFileDto)
  files: RevisionFileDto[];

  @IsOptional()
  @IsString()
  note?: string;

  @IsString()
  companyName: string; // 권한 검증용
}
```

#### 로직

1. Contact 조회 → companyName 일치 검증 (다른 업체의 문의에 업로드 차단)
2. DrawingRevision 생성:
   - actorType: `'company'`
   - reason: purpose에 따라 매핑 (`revision_submit` → `'revision_request'`, `mold_request` → `'field_correction'`, `other` → `'other'`)
   - source: `'manual'`
3. purpose가 `mold_request`이면:
   - Contact.processStage → `'drawing_confirmed'` 업데이트
   - Contact.confirmedAt → 현재 시간 업데이트
   - 타임라인 기록 (changeType: 'stage_change')
4. Contact.drawingFileUrl → 새 파일로 업데이트

### 2. 웹하드 파일 → 문의 연결 API (방법 B용)

`webhard-api/src/contacts/contacts.controller.ts`에 엔드포인트 추가:

```typescript
/**
 * POST /api/v1/contacts/:id/link-webhard-file
 * 웹하드에 업로드된 파일을 문의에 연결한다.
 * Auth: CompanyGuard
 */
@Post(':id/link-webhard-file')
@UseGuards(CompanyGuard)
async linkWebhardFile(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: LinkWebhardFileDto
)
```

#### DTO

```typescript
class LinkWebhardFileDto {
  @IsString()
  fileId: string; // WebhardFile.id

  @IsString()
  @IsIn(['revision_submit', 'mold_request', 'other'])
  purpose: string;

  @IsString()
  companyName: string;
}
```

#### 로직

1. WebhardFile 조회 (fileId) → 존재 + 삭제되지 않았는지 확인
2. Contact 조회 → companyName 일치 검증
3. WebhardFile의 정보(url=path, name, size, mimeType)를 DrawingRevision files로 변환
4. company-drawing과 동일한 로직으로 DrawingRevision 생성 + processStage 업데이트
5. WebhardFile.inquiryNumber를 Contact.inquiryNumber로 업데이트 (연결 표시)

### 3. 관리자 수동 문의 연결 API

`webhard-api/src/contacts/contacts.controller.ts`에 엔드포인트 추가:

```typescript
/**
 * POST /api/v1/contacts/:id/merge-drawing-from/:sourceId
 * sourceId의 도면을 현재 문의(id)로 복사하고, sourceId를 soft delete한다.
 * Auth: AdminGuard
 */
@Post(':id/merge-drawing-from/:sourceId')
@UseGuards(AdminGuard)
async mergeDrawingFrom(
  @Param('id', ParseUUIDPipe) id: string,
  @Param('sourceId', ParseUUIDPipe) sourceId: string
)
```

#### 로직

1. 양쪽 Contact 존재 확인
2. sourceId의 drawingFileUrl/drawingFileName이 있으면:
   - id에 새 DrawingRevision 생성 (reason: `field_correction`, source: `manual`, actorType: `admin`, note: `"문의 {sourceId 번호}에서 연결"`)
   - id의 drawingFileUrl 업데이트
3. sourceId의 DrawingRevision들이 있으면:
   - 각각을 id의 새 DrawingRevision으로 복사 (contactId만 변경)
4. sourceId를 soft delete (deletedAt = now)
5. 타임라인 기록 (양쪽 모두)

### 4. DTO 파일 생성

새 DTO 파일: `webhard-api/src/contacts/dto/company-drawing.dto.ts`
위의 `CompanyDrawingUploadDto`와 `LinkWebhardFileDto`를 포함.

### 5. ContactsService에 헬퍼 메서드

필요시 `ContactsService`에 추가:

- `verifyCompanyOwnership(contactId, companyName)` — 해당 문의가 해당 업체 소유인지 확인
- `mergeDrawingsFromSource(targetId, sourceId)` — 도면 이동 로직

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/12-drawing-workflow/index.json`의 phase 3 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- CompanyGuard의 실제 사용 패턴을 기존 코드(files.controller.ts, folders.controller.ts 등)에서 반드시 확인하고 동일하게 적용하라. Guard가 request 객체에 어떤 정보를 넣는지 파악하라.
- companyName 검증은 반드시 수행하라. 거래처 A가 거래처 B의 문의에 도면을 올리는 것을 차단해야 한다.
- merge-drawing-from에서 sourceId를 삭제할 때, sourceId에 자식 Contact(분할)이 있으면 에러를 반환하라 (분할된 문의는 연결 대상이 아님).
- 기존 엔드포인트를 변경하지 마라.
- 기존 테스트를 깨뜨리지 마라.
