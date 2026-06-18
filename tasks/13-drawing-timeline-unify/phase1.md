# Phase 1: 백엔드 — DrawingRevision → WebhardFile 자동 동기화 (webhard-sync)

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `yjlaser_website/CLAUDE.md` — Hard Rules (no any, DB는 NestJS 경유, 한글 커밋), NestJS 모듈 구조
- `docs/specs/features/drawing-workflow.md` — 섹션 D/E/F/W (Phase 0에서 추가된 "웹하드 자동 저장" 정책)
- `docs/specs/features/drawing-revision-history.md` — DrawingRevision 데이터 모델 (`webhard_file_ids` 신규 필드)
- `docs/specs/api/endpoints/webhard.md`, `docs/specs/api/endpoints/integration.md`
- `docs/specs/db/prisma-tables.md` — WebhardFile / DrawingRevision 현재 스키마
- `docs/거래처-웹하드-폴더-안내.md` — 거래처 폴더 구조
- `docs/testing.md` — 테스트 원칙 (순수 로직 집중, mock 과잉 금지, 실 DB 통합테스트 허용)
- `/tasks/13-drawing-timeline-unify/docs-diff.md` — 이번 task의 문서 변경 기록 (Phase 0 완료 후 자동 생성)

그리고 이전 phase의 작업물을 반드시 확인하라:

- Phase 0에서 갱신된 위 spec 문서들 전체 (특히 drawing-workflow.md 섹션 W)

이전 phase에서 만들어진 문서를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업 내용

### 1. Prisma schema 변경

**파일**: `webhard-api/prisma/schema.prisma`

- `DrawingRevision` 모델에 필드 추가:
  ```prisma
  webhardFileIds String[] @default([]) @map("webhard_file_ids")
  ```
- 마이그레이션 생성:
  ```bash
  cd webhard-api && npx prisma migrate dev --name drawing_revisions_webhard_link
  ```

### 2. 공통 헬퍼 `syncRevisionToWebhard` 추가

**파일**: `webhard-api/src/contacts/drawing-revision.service.ts`

시그니처 (구현체는 재량):

```ts
private async syncRevisionToWebhard(params: {
  contactId: string;
  files: Array<{ url: string; name: string; size: number; mimeType: string }>;
  actorName: string | null;
  actorType: 'admin' | 'worker' | 'system' | 'external' | 'company';
  skipInitial?: boolean;  // source === 'auto_initial' 시 true 전달
}): Promise<string[]>  // 생성된 WebhardFile id 배열
```

**동작 규칙 (반드시 이대로)**:

1. `skipInitial === true`면 빈 배열 즉시 반환 (`registerFilesToWebhard`와 중복 방지).
2. Contact 조회 → `companyId`, `workNumber`, `inquiryNumber`, `Company.name` 획득. companyId 없으면 에러 없이 빈 배열 반환 (laser-only 등 회사 없는 문의).
3. 거래처 루트 폴더가 없으면 `FoldersService.initializeCompanyFolders(companyId)` 호출로 자동 생성. 기존 로직이 있다면 `ContactsService.registerFilesToWebhard` (현재 `contacts.service.ts:2656-2785`) 에서 쓰는 패턴을 동일하게 따라라.
4. 문의별 서브폴더: 폴더명 `문의-{workNumber || inquiryNumber}`. 없으면 생성, 있으면 재사용 (path 기준 조회).
5. 각 file마다 `prisma.webhardFile.create`:
   - `name`: `{workNumber} {originalName}` — 파일명 프리픽스 규칙 유지
   - `originalName`: 원본 그대로
   - `size`: BigInt 변환
   - `mimeType`, `path`, `folderId`, `companyId`, `uploadedBy`: 정확히 채움
   - `inquiryNumber`: contact의 inquiryNumber (없으면 workNumber)
6. 생성된 모든 WebhardFile.id 배열 반환.

### 3. 각 진입점에서 `syncRevisionToWebhard` 호출

**파일**: `webhard-api/src/contacts/drawing-revision.service.ts`

- `createRevision` (L26-97): R2 업로드/DB 트랜잭션 후 `syncRevisionToWebhard` 호출, 반환된 id 배열을 `DrawingRevision.webhardFileIds`에 업데이트. `source === 'auto_initial'`이면 `skipInitial: true`.
- `createInitialRevision` (L213-249): source가 `auto_initial`이므로 반드시 `skipInitial: true`. 단, 기존 `registerFilesToWebhard`가 호출된 경로인지 확인 후 중복 방지.

**파일**: `webhard-api/src/integration/dxf-match/dxf-match.service.ts`

- 내부에서 `createRevision` 호출하므로 자동 커버. 단 `actorType: 'external'`, `actorName: '관리프로그램'` 전달 확인.

**파일**: `webhard-api/src/contacts/contacts.service.ts`

- 기존 `registerFilesToWebhard` 함수는 유지 (Contact 생성 시 최초 파일용). 단 `createInitialRevision` 과의 중복 방지를 위해 `skipInitial` 플래그 흐름이 올바른지 검증.

### 4. Worker 경로 (D)

**파일**: `src/app/api/worker/drawing-revisions/route.ts`

- Worker 세션에는 `companyId`가 없다. NestJS 측에서 `contact.companyId`로 폴백해서 WebhardFile.companyId 채우는 로직이 `syncRevisionToWebhard` 안에 포함되어야 한다 (위 2번 단계 2 참고).
- Next 라우트는 기존 프록시 로직 그대로 유지. 수정 불필요.

### 5. DTO/응답 변경 없음

- 기존 `POST /contacts/:id/drawing-revisions` 응답에 `webhardFileIds` 포함. 단 프론트는 이번 phase에서는 미사용.

### 6. 테스트

**파일**: `webhard-api/src/contacts/drawing-revision.service.spec.ts` (신규 생성 or 기존 확장)

**테스트 환경**: 실제 PostgreSQL 연결 (dev DB). `docs/testing.md` 및 기존 `contacts.service.spec.ts` 패턴 참고. `.env` 로드 순서 확인. 필요 시 `beforeAll`에서 transaction rollback 패턴으로 격리.

**필수 테스트 케이스 (9개)**:

1. `createRevision` 호출 → `WebhardFile` 행이 files 배열 길이만큼 생성됨.
2. 거래처 루트 폴더 없을 때 자동 생성 (`FoldersService.initializeCompanyFolders` 호출 확인).
3. `문의-{workNumber}` 서브폴더 없을 때 생성, 있을 때 재사용.
4. `WebhardFile.name`이 `{workNumber} {originalName}` 포맷. `originalName`은 원본 유지.
5. `WebhardFile.companyId`, `inquiryNumber` 정확.
6. `DrawingRevision.webhardFileIds`에 생성된 id들이 저장됨.
7. `createInitialRevision` (source=auto_initial) 경로는 `skipInitial: true` 전달 → WebhardFile 추가 생성 안 함 (`registerFilesToWebhard`가 별도 처리).
8. Worker 경로: 세션에 companyId 없어도 `contact.companyId`로 폴백해서 `WebhardFile.companyId` 채움.
9. DXF 매칭 (integration) 경로: `actorType: 'external'`, `reason: 'laser_processing'` 유지하며 WebhardFile 생성.

**기존 테스트 회귀 확인**: `contacts.service.spec.ts`가 있다면 `registerFilesToWebhard` 관련 테스트가 여전히 통과하는지 확인.

## Acceptance Criteria

```bash
cd webhard-api && npx prisma migrate dev --name drawing_revisions_webhard_link && pnpm build && pnpm test
```

마이그레이션 성공 + 빌드 성공 + 전체 테스트 통과 + 위 9개 신규 테스트 모두 통과.

## AC 검증 방법

위 AC 커맨드를 실행하라. 통과하면 `/tasks/13-drawing-timeline-unify/index.json`의 phase 1 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고 `error_message`에 구체적 실패 로그를 기록하라.

## 주의사항

- **DB 스키마 변경 전에 반드시 사용자 확인 필요**이나, 이번은 task 논의에서 이미 승인됨 (`webhardFileIds String[]` 필드 추가). 마이그레이션 이름을 반드시 `drawing_revisions_webhard_link`로 사용.
- **dev DB에서만 migrate dev 실행하라.** 프로덕션 DB는 건드리지 않는다. `.env.local`의 `DATABASE_URL`/`DIRECT_URL`이 dev를 가리키는지 먼저 확인.
- `createInitialRevision`이 `registerFilesToWebhard`와 **이중 등록**되지 않도록 반드시 `skipInitial: true` 전달. 중복 등록 시 웹하드에 같은 파일 2개 생성 → 치명적 버그.
- R2 업로드 자체는 기존 presigned 플로우 유지. WebhardFile.path는 기존 업로드 URL과 별개로 `{폴더경로}/{파일명}` 형태로 저장 (기존 `registerFilesToWebhard` 패턴 그대로).
- `WebhardFile.uploadedBy` 필드는 actorType에 따라: admin→관리자명, worker→worker이름, company→회사명(company.name), external→"관리프로그램" (또는 actorName).
- `companyId` 없는 문의(laser-only 등)는 에러 던지지 말고 빈 배열 반환하고 DrawingRevision만 정상 생성 — 기존 동작 유지.
- 기존 테스트를 깨뜨리지 마라.
- Prisma client 재생성 잊지 마라 (migrate dev가 자동 수행하지만 확인).
- 프론트엔드는 건드리지 마라. 이 phase는 백엔드 전용.
- `docs/specs/` 문서는 건드리지 마라. Phase 0에서 이미 업데이트됨. 구현 중 spec과 괴리 발견 시 Phase 5에서 정리한다는 전제로 먼저 구현 진행.
