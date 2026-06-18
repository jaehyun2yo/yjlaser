# Phase 0: 문서 업데이트 (docs-update)

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `yjlaser_website/CLAUDE.md`
- `yjlaser_website/.claude/rules/spec-code-sync.md`
- `docs/specs/features/drawing-workflow.md` — "통합 타임라인" 섹션 (task 13에서 추가)
- `docs/specs/features/drawing-revision-history.md`
- `docs/specs/api/nestjs-endpoints.md` — `GET /contacts/:id/timeline` 응답 shape
- `docs/specs/features/contact-split.md`

그리고 아래 파일들의 현재 상태를 **반드시** 확인하라 (이 task의 수정 대상):

- `webhard-api/src/contacts/contact-timeline.service.ts`:
  - `getTimeline(contactId, options)` L128-221
  - `recordChange(...)` L89-113 (현재 try/catch에서 warning만 삼킴)
  - `backfillFromTimestamps(...)` L423-557 (기존 백필 엔드포인트)
- `webhard-api/src/integration/orders/auto-contact.service.ts`:
  - `createNewContact` L178-295
  - L268-277: `timelineService.recordChange({ changeType:'created', ... })` fire-and-forget
  - L287-293: `drawingRevisionService.createInitialRevision(...)` fire-and-forget `.catch()`
- `webhard-api/src/contacts/drawing-revision.service.ts`:
  - `createInitialRevision(...)` L245-295
- `webhard-api/src/contacts/contacts.service.ts`:
  - `recordChange` 호출부 20여 군데 (L532, 746, 852, 941, 958, 1023, 1118, 1192, 1251, 1781, 1797, 1857, 1874, 2072, 2092, 2959, 2974 등)

## 배경 (반드시 이해할 것)

문의 `260417-F-002` (레이저 가공)에서 통합 타임라인이 "타임라인 기록이 없습니다." 상태로 빔. 원인:

1. `auto-contact.service.ts:287-293`의 `createInitialRevision` 호출이 **fire-and-forget** (`.catch(err => logger.warn(...))`). 실패 시 warning 남기고 조용히 삼킴.
2. `contact-timeline.service.ts:89-113`의 `recordChange`도 내부 try/catch로 warning만 남기고 실패 삼킴.
3. 두 경로 중 하나가 실패하면 Contact는 만들어지는데 `contact_status_history`/`drawing_revisions` 테이블이 비어있음.

**해결책**: A (API fallback) + C (fire-and-forget 제거) 조합.

## 작업 내용

이 phase는 **문서만** 갱신. 코드 변경 없음. Phase 1~2에서 구현할 방향을 spec에 먼저 박아 넣어 코드-문서 괴리 방지.

### 1. `docs/specs/features/drawing-workflow.md`

섹션 "통합 타임라인" 아래에 신설 섹션 **"타임라인 신뢰성 보장"** 추가:

```markdown
## 타임라인 신뢰성 보장

### Fallback 응답 (A안)

`GET /api/v1/contacts/:id/timeline` 응답이 빈 배열인 경우, 서버는 `contacts` 테이블
자체를 읽어 최소 기본 이벤트를 파생하여 응답한다. 과거 누락분(경로 누락/실패) 및
신규 실패분 모두 UI에 최소한의 정보가 노출되도록 한다.

파생 규칙:

1. `kind: 'status_change'`, `changeType: 'created'` 이벤트 1개를 `contacts.created_at`
   기준으로 생성. `actorType`/`actorName`은 `contacts.source`에 따라:
   - `source='webhard_auto'` → actorType='system', actorName='웹하드 자동생성'
   - `source='admin_manual'` → actorType='admin', actorName='관리자'
   - 기본값 → actorType='system', actorName=null
2. `contacts.drawing_file_url`이 존재하면 `kind: 'drawing_revision'`, `reason: 'initial'`,
   `version: 1` 이벤트 1개 추가. 파일명 fallback: `original_filename` →
   `drawing_file_name` → `'initial-drawing'`.
3. 두 이벤트 모두 `contacts.created_at` 기준 동일 시각.
4. **실제 DB에 한 건이라도 존재하면 fallback 비활성**: 실데이터와 파생 데이터를
   섞지 않는다.

`forCompany=true`일 때도 동일 규칙 적용하되, 기존 마스킹 정책 준수.

### 트랜잭션 보장 (C안)

`contact_status_history` / `drawing_revisions` 기록이 Contact 생성과 함께 원자적으로
보장되도록 개선한다:

- `AutoContactService.createNewContact`: Contact 생성 + `recordChange('created')` +
  `createInitialRevision`을 **단일 Prisma 트랜잭션**에서 수행. 트랜잭션 실패 시
  Contact 생성 자체를 롤백한다.
- Contact 생성 이후 발생하는 변경 이벤트(`recordChange`)는 동기 await. 실패 시
  `Sentry.captureException`으로 에러 보고 + 호출부에 throw. 조용히 warning만 남기지
  않는다.
- 외부 업로드(`createRevision`, `company-drawing`, Worker, DXF)는 개별 요청 단위
  트랜잭션(`prisma.$transaction`) 안에서 `DrawingRevision.create` + `recordChange`
  - `WebhardFile.create`(task 13 syncRevisionToWebhard)를 함께 수행.

### Fire-and-forget 금지

`.catch(err => logger.warn(...))` 또는 `.catch(() => {})` 같은 무음 삼키기 패턴
사용 금지. 어쩔 수 없이 비동기 처리가 필요하면 Inngest 재시도 큐를 사용.
```

### 2. `docs/specs/features/drawing-revision-history.md`

섹션 "트리거 방식" 바로 아래에 **"실패 처리 정책"** 섹션 추가:

```markdown
## 실패 처리 정책

- `createInitialRevision`은 AutoContactService의 Contact 생성 트랜잭션 내부에서
  await 호출. 실패 시 Contact 생성 자체가 롤백된다.
- 외부 업로드(`createRevision`, `company-drawing` 등)는 요청 트랜잭션 내부에서
  await. 실패 시 호출자에게 예외 반환.
- 응답이 비어있는 타임라인은 `GET /contacts/:id/timeline`의 fallback으로 최소
  이벤트(`created` + initial drawing)를 파생 제공한다. 자세한 규칙은
  drawing-workflow.md의 "타임라인 신뢰성 보장" 섹션 참고.
```

### 3. `docs/specs/api/nestjs-endpoints.md`

`GET /api/v1/contacts/:id/timeline` 섹션에 한 단락 추가:

```markdown
**Fallback 동작**: 실제 `contact_status_history` / `drawing_revisions` 테이블이 모두
비어있을 때, 서버는 `contacts` 테이블 자체에서 최소 이벤트 2개(`created`,
필요 시 `drawing_revision initial`)를 파생하여 응답한다. 이는 과거 fire-and-forget
실패분에 대한 안전망이며, 실데이터가 한 건이라도 존재하면 비활성화된다.
```

## Acceptance Criteria

```bash
grep -c "타임라인 신뢰성 보장" docs/specs/features/drawing-workflow.md
grep -c "Fallback" docs/specs/features/drawing-workflow.md
grep -c "실패 처리 정책" docs/specs/features/drawing-revision-history.md
grep -c "Fallback 동작" docs/specs/api/nestjs-endpoints.md
```

각 결과가 1 이상.

## AC 검증 방법

위 4개 grep 모두 1 이상이면 통과. `/tasks/14-timeline-reliability/index.json`의 phase 0 status를 `"completed"`로 변경.
3회 실패 시 `"error"` + `error_message`.

## 주의사항

- **코드 건드리지 마라.** 이 phase는 문서 전용.
- CHANGELOG는 Phase 4에서. 이번 phase에서 건드리지 말 것.
- 기존 spec의 다른 섹션 구조/어조 유지.
- `docs-diff.md`는 `gen-docs-diff.py`가 자동 생성. 직접 작성 금지.
