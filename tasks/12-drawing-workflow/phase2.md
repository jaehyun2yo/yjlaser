# Phase 2: 백엔드 — 자동화 로직 (파일명 프리픽스 + DXF 매칭)

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션, 하드 룰)
- `docs/specs/features/drawing-workflow.md` (이번 기능 전체 스펙)
- `/tasks/12-drawing-workflow/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/src/contacts/drawing-revision.service.ts` (Phase 1에서 확장됨)
- `webhard-api/src/contacts/dto/drawing-revision.dto.ts` (Phase 1에서 확장됨)

그리고 아래 기존 코드를 반드시 읽어라:

- `webhard-api/src/integration/orders/auto-contact.service.ts` (자동 문의 생성 — 핵심)
- `webhard-api/src/integration/orders/utils/filename-parser.ts` (파일명 파싱)
- `webhard-api/src/integration/drawing-revisions/drawing-revisions.controller.ts` (기존 Integration API)
- `webhard-api/src/integration/integration.module.ts` (모듈 구조)
- `webhard-api/prisma/schema.prisma` (WebhardFile 모델 확인)

## 작업 내용

### 1. AutoContactService — 파일명 프리픽스 추가

`webhard-api/src/integration/orders/auto-contact.service.ts`의 `createNewContact()` 메서드 수정:

문의 생성 완료 후, 해당 문의와 연결된 웹하드 파일의 표시명(name)을 업데이트한다.

```typescript
// createNewContact()에서 Contact 생성 후 추가할 로직:
// 1. inquiryNumber 또는 workNumber가 있으면 프리픽스 구성
// 2. WebhardFile.name을 "{프리픽스} {originalName}" 형식으로 업데이트
// 3. WebhardFile.originalName은 변경하지 않음 (중복 체크용 보존)
```

**구체적 로직:**

- `dto.folderId`와 `dto.fileName`으로 WebhardFile을 조회 (folderId + originalName)
- 조회 실패 시 로그만 남기고 skip (파일명 변경은 핵심 기능이 아님)
- 프리픽스: inquiryNumber가 있으면 `"260416-O-001"`, workNumber가 있으면 `"260416-F-001"`
- 업데이트: `prisma.webhardFile.update({ where: { id }, data: { name: "{prefix} {originalName}" } })`

**핵심 규칙:**

- 이 작업은 fire-and-forget이다. 실패해도 문의 생성은 완료된다.
- WebhardFile.originalName은 절대 변경하지 않는다.
- folderId가 없거나 WebhardFile을 찾을 수 없으면 silent skip + 로그.

### 2. DXF 자동 매칭 Integration API

새 컨트롤러 파일 생성: `webhard-api/src/integration/dxf-match/dxf-match.controller.ts`
새 서비스 파일 생성: `webhard-api/src/integration/dxf-match/dxf-match.service.ts`
새 모듈 파일 생성: `webhard-api/src/integration/dxf-match/dxf-match.module.ts`

#### 2.1 DTO

```typescript
class DxfMatchUploadDto {
  @IsString()
  fileName: string; // DXF 파일명 (예: "260416-F-001 삼성포장 박스_목형의뢰 2절.DXF")

  @IsString()
  fileUrl: string; // R2에 업로드된 파일 URL

  @IsOptional()
  @IsString()
  actorName?: string; // 수행 프로그램명 (기본: "관리프로그램")
}
```

#### 2.2 Service 로직

```typescript
class DxfMatchService {
  /**
   * DXF 파일명에서 workNumber 파싱
   * 패턴: YYMMDD-F-NNN (예: 260416-F-001)
   * 파일명 앞부분에서 추출
   */
  parseWorkNumber(fileName: string): string | null;

  /**
   * DXF 파일 매칭 + DrawingRevision 등록
   * 1. 파일명에서 workNumber 파싱
   * 2. Contact.workNumber로 매칭
   * 3. DrawingRevision 생성 (reason: laser_processing, source: integration, actorType: external)
   * 4. Contact.drawingFileUrl 업데이트
   * 5. 타임라인 기록
   */
  async matchAndUpload(dto: DxfMatchUploadDto): Promise<{
    matched: boolean;
    contactId?: string;
    workNumber?: string;
    revisionVersion?: number;
    error?: string;
  }>;
}
```

**핵심 규칙:**

- workNumber 파싱 실패 → `{ matched: false, error: "workNumber를 파싱할 수 없습니다" }` 반환
- Contact 매칭 실패 → `{ matched: false, error: "해당 workNumber의 문의를 찾을 수 없습니다" }` 반환
- 매칭 성공 → DrawingRevision 생성 + Contact.drawingFileUrl 업데이트 + `{ matched: true, ... }` 반환
- HTTP 상태코드: 매칭 성공=201, 파싱 실패/매칭 실패=400

#### 2.3 Controller

```typescript
@Controller('integration/dxf-match')
@UseGuards(ApiKeyGuard)
class DxfMatchController {
  @Post('upload')
  async matchAndUpload(@Body() dto: DxfMatchUploadDto)
}
```

#### 2.4 Module 등록

- `DxfMatchModule`을 생성하고 `IntegrationModule`의 imports에 등록
- `DrawingRevisionService`, `ContactsService`, `ContactTimelineService` 의존성 필요
- ContactsModule을 import해야 할 수 있음 — 기존 패턴 참고 (`IntegrationDrawingRevisionsModule`이 `ContactsModule`에서 `DrawingRevisionService`를 어떻게 사용하는지 확인)

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/12-drawing-workflow/index.json`의 phase 2 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- AutoContactService의 기존 로직(문의 생성, 중복 체크, laserOnly 분기)을 변경하지 마라. 파일명 프리픽스는 문의 생성 "후" 추가 동작이다.
- workNumber 파싱은 파일명 앞부분에서만 찾아라. 파일명 중간이나 끝에 우연히 날짜 패턴이 있을 수 있다.
- workNumber 파싱 정규식: `/^(\d{6}-F-\d{3})/` (파일명 시작 부분)
- DxfMatchService에서 Contact를 조회할 때 soft delete된 Contact(deletedAt != null)는 제외하라.
- 기존 `integration/drawing-revisions` 엔드포인트를 변경하지 마라.
- 기존 테스트를 깨뜨리지 마라.
