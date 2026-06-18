# Phase 2: 트랜잭션 보장 (tx-guarantee) — C안

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `yjlaser_website/CLAUDE.md`
- `docs/specs/features/drawing-workflow.md` — "타임라인 신뢰성 보장 > 트랜잭션 보장"
- `docs/specs/features/drawing-revision-history.md` — 실패 처리 정책
- `docs/specs/api/nestjs-endpoints.md`
- `/tasks/14-timeline-reliability/docs-diff.md`

그리고 Phase 1 산출물:

- `webhard-api/src/contacts/contact-timeline.service.ts` — `getTimeline` fallback 로직
- `webhard-api/src/contacts/dto/timeline-item.dto.ts` — `fallback?: boolean` 필드

수정 대상 파일:

- `webhard-api/src/integration/orders/auto-contact.service.ts` — `createNewContact` L178-295
- `webhard-api/src/contacts/contact-timeline.service.ts` — `recordChange` L89-113
- `webhard-api/src/contacts/drawing-revision.service.ts` — `createInitialRevision` L245-295, `createRevision` L26-97
- `webhard-api/src/contacts/contacts.service.ts` — `recordChange` 호출부 다수

## 배경

fire-and-forget 패턴(`.catch(err => logger.warn(...))`) 때문에 타임라인 기록 실패가 조용히 삼켜져 Contact만 생성되고 timeline/drawing_revision이 비는 문제.

Phase 1에서 fallback 응답으로 UI 상 최소한의 이벤트는 보이지만, 실제 DB 일관성 보장이 더 근본적이다.

## 작업 내용

### 1. `AutoContactService.createNewContact` 트랜잭션화

**파일**: `webhard-api/src/integration/orders/auto-contact.service.ts`

**핵심 변경**:

- L268-277의 `timelineService.recordChange({ changeType:'created', ... })` — fire-and-forget 제거 → await 전환.
- L287-293의 `drawingRevisionService.createInitialRevision(...)` — fire-and-forget 제거 → await 전환.
- Contact 생성 + 두 사이드 이펙트를 **단일 `prisma.$transaction`**으로 감싸기. 실패 시 Contact 생성도 롤백.

의사 시그니처:

```ts
async createNewContact(input: ...): Promise<Contact> {
  return this.prisma.$transaction(async (tx) => {
    const contact = await tx.contact.create({ ... });

    await this.timelineService.recordChange({
      contactId: contact.id,
      changeType: 'created',
      source: 'webhard_auto',
      actorType: 'system',
      tx,  // 트랜잭션 컨텍스트 전달
    });

    if (hasDrawingFile) {
      await this.drawingRevisionService.createInitialRevision({
        contactId: contact.id,
        drawingFileUrl: input.drawingFileUrl,
        ...
        tx,  // 트랜잭션 컨텍스트 전달
      });
    }

    return contact;
  }, { timeout: 10000 });  // Prisma transaction timeout 확장 필요시
}
```

### 2. `ContactTimelineService.recordChange` 시그니처 확장

**파일**: `webhard-api/src/contacts/contact-timeline.service.ts`

- 현재 내부 try/catch에서 warning만 남기는 구조 → **throw로 변경**.
- 선택적 `tx?: Prisma.TransactionClient` 파라미터 추가. 주어지면 그걸 사용, 아니면 `this.prisma` 사용.
- try/catch 블록 자체 제거. 호출자가 에러 처리 책임.

시그니처:

```ts
async recordChange(params: {
  contactId: string;
  changeType: string;
  fromValue?: string | null;
  toValue?: string | null;
  actorType: 'admin' | 'worker' | 'system' | 'external' | 'company';
  actorName?: string | null;
  source?: string;
  metadata?: Record<string, unknown>;
  tx?: Prisma.TransactionClient;
}): Promise<ContactStatusHistory> {
  const client = params.tx ?? this.prisma;
  return client.contactStatusHistory.create({ data: { ... } });
}
```

### 3. `DrawingRevisionService.createInitialRevision` / `createRevision` — tx 지원

**파일**: `webhard-api/src/contacts/drawing-revision.service.ts`

- `createInitialRevision(params)`: `tx?: Prisma.TransactionClient` 파라미터 추가. 트랜잭션 있으면 그걸 사용.
- `createRevision(...)`: 기존 내부 `prisma.$transaction` 블록 유지. 단 호출자가 tx를 넘길 수 있다면 재사용. (외부 tx와 중첩 방지를 위해 실용적으로: tx 있으면 그대로 사용, 없으면 새 트랜잭션 시작)
- task 13에서 추가한 `syncRevisionToWebhard` 호출은 트랜잭션 내부에서 일관되게 유지 — 실패 시 DrawingRevision도 롤백되도록.

### 4. `ContactsService`의 `recordChange` 호출부 갱신

**파일**: `webhard-api/src/contacts/contacts.service.ts`

기존 `this.timelineService.recordChange(...)` 호출부 20여 군데가 async 컨텍스트에서 호출되고 있는지 확인:

- 이미 `await`이 붙어있고 catch 처리가 없다면 이제 throw 되므로 호출자의 에러 흐름에 자연스럽게 반영됨 — 코드 변경 최소.
- Fire-and-forget(`.catch()`) 패턴 사용 호출부 있으면 await으로 변경.
- 트랜잭션이 필요한 경우(예: contact update + recordChange 원자성 필요)는 `prisma.$transaction`으로 감싸기. 단 기존 비즈니스 로직 깨뜨리지 않는 범위로 제한.

### 5. `OrdersService`, 기타 호출부

**파일**: `webhard-api/src/integration/orders/orders.service.ts:434` 등

- `recordChange` 호출부 throw에 적응 — 기존 `await` + try/catch 없는 코드는 throw가 상위로 전파되는 게 자연스러움.
- 필요 시 개별 try/catch를 호출자 레벨에 최소한만 추가.

### 6. Sentry 에러 보고 (옵션)

- 만약 Sentry가 NestJS 측에 설정돼 있다면(`SENTRY_DSN`), throw 시 `Sentry.captureException` 자동 캐치. 별도 작업 불필요.
- 없으면 `logger.error`로 충분. 단 throw는 유지.

### 7. Inngest 재시도 큐 (스코프 밖)

- 본 task에서는 Inngest 도입하지 않음. throw + 상위 에러 처리로 충분. 장기적으로 Inngest 도입은 별도 task.

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test
```

빌드 성공 + 기존 테스트 통과. 신규 테스트는 Phase 3 담당.

## AC 검증 방법

위 AC 커맨드 실행. 통과하면 `/tasks/14-timeline-reliability/index.json`의 phase 2 status를 `"completed"`로 변경.
3회 실패 시 `"error"` + `error_message`.

## 주의사항

- **기존 테스트 깨지지 않게 주의.** 특히 task 13에서 만든 `contact-timeline.service.spec.ts`, `drawing-revision.service.spec.ts`, `contacts.service.spec.ts`.
- `recordChange`의 throw 전환으로 **일부 테스트에서 Mock 설정 변경 필요**할 수 있음. 기존 테스트를 유지하면서 mock을 resolve하도록.
- Prisma 트랜잭션 timeout 기본 5초. createInitialRevision에서 R2 업로드가 포함되면 10초로 확장 필요.
- 트랜잭션 내부에서 외부 I/O(R2 업로드) 최소화 — R2 presigned URL 발급은 트랜잭션 밖, 파일 업로드는 클라이언트 후 metadata 등록 시점에. 기존 설계 확인 후 그대로 유지.
- `this.prisma` vs `tx` 일관성 — `tx ?? this.prisma` 패턴으로 통일.
- 기존 `.catch(err => logger.warn(...))` 삭제 시 각 호출부마다 동작 유지되는지 재검토. 삭제하면서 await 추가하면 호출자 async/sync 시그니처 영향도 확인.
- 프론트엔드는 이 phase에서 건드리지 말 것. 응답 shape 변경 없음.
