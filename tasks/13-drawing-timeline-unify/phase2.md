# Phase 2: 백엔드 — 통합 타임라인 API (timeline-api)

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `yjlaser_website/CLAUDE.md` — NestJS DTO/ValidationPipe, 한글 커밋, no any
- `docs/specs/features/drawing-workflow.md` — Phase 0에서 갱신된 "통합 타임라인" 섹션
- `docs/specs/features/drawing-revision-history.md` — 접근 권한 (거래처는 isPublic=true만)
- `docs/specs/features/contact-split.md` — contact 분할 관련 이벤트 타입
- `docs/specs/api/nestjs-endpoints.md` — Phase 0에서 갱신된 timeline 응답 shape
- `/tasks/13-drawing-timeline-unify/docs-diff.md`

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/src/contacts/drawing-revision.service.ts` (Phase 1에서 추가된 `syncRevisionToWebhard`, `webhardFileIds` 필드 사용)
- `webhard-api/prisma/schema.prisma` — `DrawingRevision.webhardFileIds` 필드 존재
- `webhard-api/src/contacts/contact-timeline.service.ts` — 현재 ContactStatusHistory만 조회하는 상태

이전 phase에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업 내용

### 1. DTO 정의

**파일**: `webhard-api/src/contacts/dto/timeline-item.dto.ts` (신규)

```ts
export type TimelineItemKind = 'status_change' | 'drawing_revision';

export interface TimelineItemDto {
  id: string;
  kind: TimelineItemKind;
  createdAt: string; // ISO 8601 — camelCase 고정
  actorType: 'admin' | 'worker' | 'system' | 'external' | 'company';
  actorName: string | null;
  color?: string;
  payload: StatusChangePayload | DrawingRevisionPayload;
}

export interface StatusChangePayload {
  changeType: string; // 'status' | 'type' | 'process_stage' | 'company' | 'drawing_revision' 등
  fromValue?: string | null;
  toValue?: string | null;
  metadata?: Record<string, unknown>;
}

export interface DrawingRevisionPayload {
  revisionId: string;
  version: number;
  processStage: string | null;
  reason: string;
  reasonDetail: string | null;
  files: Array<{ url: string; name: string; size: number; mimeType: string }>;
  isPublic: boolean;
  note: string | null;
}
```

### 2. `ContactTimelineService.getTimeline` 확장

**파일**: `webhard-api/src/contacts/contact-timeline.service.ts`

**핵심 변경**: ContactStatusHistory + DrawingRevision 두 테이블을 조회하여 시간순 인터리브.

시그니처:

```ts
async getTimeline(contactId: string, options: { forCompany?: boolean } = {}): Promise<TimelineItemDto[]>
```

**동작 규칙**:

1. Prisma로 두 테이블 병렬 조회:
   - `contact_status_history where contact_id = contactId`
   - `drawing_revisions where contact_id = contactId`
2. 각각을 `TimelineItemDto`로 변환:
   - status_change: `kind: 'status_change'`, payload 채움
   - drawing_revision: `kind: 'drawing_revision'`, payload 채움
3. `createdAt` ISO 8601 문자열로 직렬화 (camelCase 유지). Date 객체 그대로 내보내지 말 것.
4. 합쳐서 `createdAt DESC` 정렬.
5. **`options.forCompany === true`일 때 서버 필터링 (보안)**:
   - `kind === 'drawing_revision'` 중 `isPublic === false` 항목 제외
   - `actorType === 'admin' | 'system' | 'external'`이면 → `actorType: 'company'`로 치환하지 말고 별도 마스킹 필드 사용: `actorName = 'YJLaser'` 로 치환 (원본 admin 이름 제거)
   - drawing_revision payload에서 `note`는 null로 치환 (관리자 내부 메모)
   - `payload.metadata` 중 관리자 내부 이벤트 (예: `changeType === 'assignee'`, `changeType === 'admin_note'`)는 완전 제외 — 화이트리스트 방식: 거래처가 볼 수 있는 changeType만 포함. 허용 목록: `['status', 'process_stage', 'drawing_revision', 'type']`. 이외는 필터.
6. 기존 `drawing_revision` changeType을 쓰는 status_change 이벤트가 있다면 (Phase 3에서 제거 예정이나) 중복 방지를 위해 필터링: `kind === 'status_change' && payload.changeType === 'drawing_revision'` 이면 응답에서 제외한다. → drawing_revision은 drawings 테이블 조회로만 노출.

### 3. Controller

**파일**: `webhard-api/src/contacts/contacts.controller.ts`

- `GET /api/v1/contacts/:id/timeline` (기존 엔드포인트):
  - `forCompany`: 요청 컨텍스트(Guard)가 company 세션일 때 자동으로 true. admin/apiKey는 false.
  - 응답: `{ timeline: TimelineItemDto[] }` — 래핑 유지 (기존 Next route `src/app/api/contacts/[id]/timeline/route.ts:23`가 이미 `{ timeline }` 으로 래핑하여 받음 → 백엔드도 동일)
- Guard: 기존 `ApiKeyGuard` + `CompanyAccessGuard` 혼합 로직 유지. 거래처 세션이 자기 contactId만 조회 가능하도록 검증 (`contact.companyId === session.companyId`). 불일치 시 403.

### 4. 기존 `DrawingRevisionService.createRevision` 의 fire-and-forget 제거

**파일**: `webhard-api/src/contacts/drawing-revision.service.ts`

- L72-87 부근의 `this.timelineService.recordChange({ changeType: 'drawing_revision', ... })` 호출 **제거**.
- 이유: 통합 타임라인 API가 DrawingRevision을 직접 조회하므로 ContactStatusHistory에 중복 기록할 필요 없음. 기록 시 `NaN/NaN` + 중복 표시의 원인 중 하나.
- **단 Phase 1에서 추가한 `syncRevisionToWebhard` 호출은 유지.**

### 5. `NaN/NaN` 원인 제거 검증

- 응답이 반드시 `createdAt: string (ISO)` — Prisma Date → ISO string 변환 필수.
- 필드명 camelCase 유지. snake_case 혼용 금지.

### 6. 테스트

**파일**: `webhard-api/src/contacts/contact-timeline.service.spec.ts` (신규 or 확장)

**테스트 환경**: 실제 PostgreSQL (Phase 1과 동일 세팅).

**필수 테스트 케이스 (6개)**:

1. ContactStatusHistory만 있을 때: 응답 모두 `kind === 'status_change'`.
2. DrawingRevision만 있을 때: 응답 모두 `kind === 'drawing_revision'`.
3. 두 테이블 혼합 시: `createdAt DESC` 인터리브 정렬 확인.
4. `createdAt` 필드 타입 문자열(`typeof === 'string'`) + ISO 8601 형식 (`/^\d{4}-\d{2}-\d{2}T/`).
5. `drawing_revision` payload에 `version`, `files`, `reason`, `isPublic`, `processStage` 포함.
6. `forCompany: true` 호출 시:
   - `isPublic=false` drawing_revision 제외 확인
   - admin `actorName` → `YJLaser` 마스킹 확인
   - drawing_revision payload의 `note` null로 마스킹 확인
   - `changeType: 'drawing_revision'` 인 status_change 항목 제외 (중복 방지)

**Controller 레벨 테스트**: `contacts.controller.spec.ts`에 응답 shape `{ timeline: [...] }` 테스트 + 거래처 세션이 다른 companyId의 contact 요청 시 403 반환 테스트 1개.

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test
```

빌드 성공 + 전체 테스트 통과 + 위 6개 신규 테스트 + controller 2개 테스트 통과.

## AC 검증 방법

위 AC 커맨드 실행. 통과하면 `/tasks/13-drawing-timeline-unify/index.json`의 phase 2 status를 `"completed"`로 변경.
수정 3회 이상 시도해도 실패하면 `"error"` + `error_message` 기록.

## 주의사항

- **필드명 snake_case 사용 금지.** 응답은 `createdAt`, `actorType`, `actorName`, `isPublic` 등 전부 camelCase.
- `kind === 'status_change'` 중 `changeType === 'drawing_revision'`인 항목은 무조건 제외 (drawing_revision 테이블로 노출되므로 중복).
- 거래처 세션 화이트리스트: `['status', 'process_stage', 'drawing_revision', 'type']` 외 changeType은 제외. 이 목록은 소스 주석으로 명시.
- Guard는 기존 `CompanyAccessGuard` 재사용. 새 Guard 만들지 말 것.
- `forCompany` 파라미터는 **서버 내부 결정만** (Guard에서 세션 타입 보고 주입). 클라이언트가 쿼리로 넘기면 무시.
- 프론트엔드는 이 phase에서 건드리지 말 것. Phase 3 담당.
- 기존 `drawing-revisions` GET 엔드포인트는 **유지**. 거래처 공개 이력 전용 엔드포인트로 계속 사용 가능 (Phase 3에서 결정).
- Prisma 쿼리는 N+1 방지: `include` 또는 `select`로 필요한 필드만 조회. DrawingRevision의 `files` JSON 필드를 그대로 노출 OK.
- NestJS 기존 테스트 패턴(실 DB, mock 최소)을 따라라. docs/testing.md 원칙 존중.
- 기존 테스트를 깨뜨리지 마라.
