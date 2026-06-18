# Phase 3: initial-revision-fix

## 사전 준비

- `tasks/18-drawing-consistency/phase0.md` — 문서의 "initial revision 트랜잭션화" 결정 배경.
- `tasks/18-drawing-consistency/docs-diff.md`.
- `docs/specs/features/drawing-workflow.md` §타임라인 신뢰성 보장 §Fire-and-forget 금지 — 이 phase 가 준수해야 할 원칙.
- `webhard-api/src/contacts/contacts.service.ts:589~601` — 현재 fire-and-forget `.catch()` 위치. 이 phase 에서 교체할 지점.
- `webhard-api/src/contacts/drawing-revision.service.ts` `createInitialRevision` 시그니처 — 현재 `prisma` 직접 사용. tx 전달을 위한 signature 확장이 필요한지 확인.
- `webhard-api/src/integration/orders/auto-contact.service.ts:225~283` — `$transaction` 내 `createInitialRevision` 호출 패턴. 이 phase 에서 `contacts.service` 도 동일 패턴으로.
- `webhard-api/src/contacts/contact-timeline.service.ts:133~244` (getTimeline) + `:255~333` (buildFallbackTimeline) — Fallback 이 "양 테이블 모두 비어있을 때만" 동작하는 조건. 이 phase 에서 DB 에 v1 이 제대로 쌓이게 만들어서 Fallback 의존을 줄인다.
- `webhard-api/src/contacts/contact-timeline.service.spec.ts` — 기존 F1~F7 케이스. "원본 + 수정본 공존" 은 누락되어 있음. 이 phase 에서 회귀 테스트 추가.

이유: 원본 v1 누락은 "Fire-and-forget 금지" 원칙 위반이 근본 원인. 백필은 이미 쌓인 레거시 복구용.

## 작업 내용

### 1. `ContactsService.createContact` 트랜잭션 범위 확장

`webhard-api/src/contacts/contacts.service.ts` 의 contact 생성 경로(현재 L589 부근) 를 아래 패턴으로 재작성:

```ts
const created = await this.prisma.$transaction(async (tx) => {
  const contact = await tx.contact.create({ data: ... });

  // 기존 timeline 기록 (recordChange('created')) 도 tx 로
  await this.timelineService.recordChange(contact.id, {
    changeType: 'created',
    actorType: ...,
    actorName: ...,
  }, tx);

  // 초기 도면이 있을 때만
  if (contact.drawingFileUrl) {
    await this.drawingRevisionService.createInitialRevision(
      contact.id,
      contact.drawingFileUrl,
      contact.drawingFileName,
      { tx },
    );
  }

  return contact;
});
```

`createInitialRevision` 의 signature 에 optional 4번째 인자 `{ tx?: Prisma.TransactionClient, createdAt?: Date, skipInitial?: boolean }` 을 추가한다 (이미 내부에 skipInitial 플래그는 있음 — phase 3 은 tx 전달 추가).

`registerFilesToWebhard` 는 **트랜잭션 밖** 에서 기존처럼 fire-and-forget 유지 (phase 4·5 에서 단계적으로 정리). 이 phase 는 **initial revision 만** 원자화.

기존 `.catch((err) => this.logger.error(...))` 무음 처리 구문은 **제거**. 실패 시 throw 되어 Contact 생성 자체 롤백.

### 2. `DrawingRevisionService.createInitialRevision` 시그니처 확장

```ts
async createInitialRevision(
  contactId: string,
  fileUrl: string,
  fileName: string | null,
  options?: { tx?: Prisma.TransactionClient; createdAt?: Date; skipInitial?: boolean },
): Promise<DrawingRevision>;
```

`options.tx` 가 있으면 해당 트랜잭션 client 로 DrawingRevision.create 수행. `options.createdAt` 이 있으면 `createdAt` 필드에 그 값 사용 (백필 스크립트에서 Contact.createdAt 재사용용). `options.skipInitial` 는 기존대로 WebhardFile 자동 등록 skip.

기존 호출처 (`auto-contact.service.ts:272` 등) 는 options 없이 호출해도 동작하도록 디폴트 유지 (또는 명시적으로 `{ tx }` 전달하도록 호출 업데이트).

### 3. 백필 스크립트 신규

`webhard-api/scripts/backfill-initial-revisions.ts`:

```ts
// CLI: npx tsx scripts/backfill-initial-revisions.ts [--apply]
// 기본: dry-run (집계만 출력)
// --apply: 실제 삽입

async function main() {
  const apply = process.argv.includes('--apply');
  const targets = await prisma.contact.findMany({
    where: {
      drawingFileUrl: { not: null },
      drawingRevisions: { none: { reason: 'initial' } },
    },
    select: { id: true, drawingFileUrl: true, drawingFileName: true, createdAt: true },
  });

  console.log(`[backfill-initial-revisions] found ${targets.length} contacts`);

  if (!apply) {
    console.log('dry-run: --apply 로 실행 시 아래 contact 들에 initial revision 삽입');
    targets.forEach((c) => console.log(`  - ${c.id} (${c.drawingFileName})`));
    return;
  }

  let success = 0;
  let failed = 0;
  for (const c of targets) {
    try {
      await drawingRevisionService.createInitialRevision(
        c.id,
        c.drawingFileUrl!,
        c.drawingFileName,
        { createdAt: c.createdAt, skipInitial: true }
      );
      success++;
    } catch (err) {
      failed++;
      console.error(`failed ${c.id}:`, err);
    }
  }
  console.log(`done. success=${success} failed=${failed}`);
}
```

Nest DI 없이 바로 `PrismaClient` + `DrawingRevisionService` 를 수동 생성해 사용. 또는 Nest standalone application 부트 방식(기존 `webhard-api/scripts/` 패턴 따라).

### 4. 회귀 테스트

`webhard-api/src/contacts/contact-timeline.service.spec.ts` 에 새 describe 블록 추가:

```ts
describe('[regression] original v1 + revision v2 공존', () => {
  it('DB 에 initial 및 domuson_fit revision 이 모두 있을 때 타임라인에 둘 다 표시된다', async () => {
    // given: contact + drawing_revisions (reason=initial, version=1) + (reason=domuson_fit, version=2)
    // when: getTimeline(contactId, { forCompany: false })
    // then: merged 결과에 drawing_revision kind 가 2건 포함, version=1 과 version=2 모두 존재
  });

  it('Fallback 은 DB 에 실데이터 있을 때 비활성 (기존 F4 재확인)', async () => { ... });
});
```

`webhard-api/src/contacts/contacts.service.spec.ts`:

```ts
it('createContact 가 트랜잭션 내에서 initial revision 을 생성하고, revision 실패 시 Contact 도 롤백된다', async () => {
  // given: drawingRevisionService.createInitialRevision 를 mock 해서 throw
  // when: contactsService.create(...)
  // then: 예외 전파 + Contact 테이블에 row 미삽입
});
```

`webhard-api/scripts/__tests__/backfill-initial-revisions.spec.ts` (또는 `scripts/` 하위 테스트 패턴이 없으면 `webhard-api/src/contacts/__tests__/backfill-initial-revisions.spec.ts`):

```ts
it('dry-run 모드는 DB 변경 없이 대상 건수만 출력', async () => { ... });
it('--apply 모드는 대상 contact 에 initial revision v1 을 삽입', async () => { ... });
```

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test -- --testPathPattern="contacts|backfill"
```

## AC 검증 방법

위 커맨드 통과 시 phase 3 status `"completed"`. 3회 실패 시 `"error"`.

## 주의사항

- `contacts.service.ts` 의 `registerFilesToWebhard` fire-and-forget 은 **이 phase 에서 건드리지 마라**. 그건 별도 RFC 로 빠졌다 (Q3 B안). 이 phase 는 **`createInitialRevision` 만** 원자화.
- `DrawingRevisionService` 의 기존 API 호환성 유지 — `options` 는 optional 이어야 기존 호출처가 깨지지 않음.
- 백필 스크립트는 idempotent 해야 함: 재실행 시 `drawingRevisions: { none: { reason: 'initial' } }` 필터로 자동 skip.
- `--apply` 플래그 없이는 절대 DB 를 건드리지 마라. dry-run 이 기본.
- phase 5 에서 사용할 `ensureInquiryFolder` hook 은 이 phase 의 트랜잭션 안에 포함시키지 마라. phase 5 의 책임.
- `createInitialRevision` 내부의 `WebhardFile` 자동 등록(`syncRevisionToWebhard`) 은 `skipInitial=true` 로 이미 건너뛰도록 되어 있음. 백필도 마찬가지로 `skipInitial=true` 로 호출 — **이미 존재하는 WebhardFile 을 중복 생성하지 않기 위함**.
