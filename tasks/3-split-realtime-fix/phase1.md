# Phase 1: Backend — 소켓 이벤트 발행 + 부모 타임라인 기록

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션)
- `docs/specs/features/contact-split.md` (분할 문의 스펙)
- `/tasks/3-split-realtime-fix/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 아래 파일들을 반드시 읽고 기존 코드의 패턴을 이해하라:

- `webhard-api/src/contacts/contacts.service.ts` — 특히 `toggleStageCompleted` (line ~1699), `advanceSplitGroupStage` (line ~1735), `findAll`의 children snake_case 변환 패턴 (line ~278-289)
- `webhard-api/src/contacts/contacts.gateway.ts` — 소켓 이벤트 발행 메서드들
- `webhard-api/src/contacts/contact-timeline.service.ts` — `recordChange` 인터페이스

## 작업 내용

### 1. `toggleStageCompleted` 수정 (contacts.service.ts)

현재 이 메서드는:

- 자식 Contact의 `stageCompleted`를 업데이트
- 자식 contactId로만 타임라인 기록
- 소켓 이벤트 미발행

아래 두 가지를 추가하라:

#### 1-1. 부모 타임라인 기록

기존 자식 타임라인 기록 코드 바로 아래에, 부모에 대한 타임라인도 기록:

```typescript
// 기존: 자식 타임라인 (유지)
this.timelineService.recordChange({
  contactId: id,
  changeType: 'stage_completed_toggle',
  ...
});

// 추가: 부모 타임라인
if (contact.parentContactId) {
  this.timelineService.recordChange({
    contactId: contact.parentContactId,
    changeType: 'stage_completed_toggle',
    actorType: 'admin',
    source: 'manual',
    companyName: contact.companyName || undefined,
    metadata: {
      childContactId: id,
      childInquiryNumber: contact.inquiryNumber || contact.workNumber || id,
      stageCompleted: dto.stageCompleted,
    },
  }).catch(err => {
    this.logger.error(`Timeline record failed for parent stage_completed_toggle: ${err instanceof Error ? err.message : String(err)}`);
  });
}
```

#### 1-2. 소켓 이벤트 발행

`return` 문 직전에, 부모 Contact를 children 포함하여 재조회한 뒤 `emitContactUpdated`를 호출:

```typescript
// 부모+children 재조회하여 소켓 이벤트 발행 (fire-and-forget)
if (contact.parentContactId) {
  this.prisma.contact
    .findUnique({
      where: { id: contact.parentContactId },
      include: {
        children: {
          where: { deletedAt: null },
          orderBy: { splitIndex: 'asc' },
        },
        workerNotes: { orderBy: { createdAt: 'desc' } },
      },
    })
    .then((parent) => {
      if (parent) {
        const parentResult = this.toSnakeCase(parent as unknown as Record<string, unknown>);
        if (Array.isArray((parent as unknown as Record<string, unknown>)['children'])) {
          parentResult['children'] = (
            (parent as unknown as Record<string, unknown>)['children'] as Record<string, unknown>[]
          ).map((child) => this.toSnakeCase(child));
        }
        this.contactsGateway.emitContactUpdated(parentResult);
      }
    })
    .catch((err) => {
      this.logger.error(
        `Socket emit failed for toggleStageCompleted: ${err instanceof Error ? err.message : String(err)}`
      );
    });
}
```

**핵심 규칙**: 이 조회+emit은 fire-and-forget 패턴이다. `.then()/.catch()` 체인으로 처리하고, 메인 return을 블로킹하지 마라.

### 2. `advanceSplitGroupStage` 수정 (contacts.service.ts)

현재 이 메서드는:

- 모든 자식의 processStage를 변경하고 stageCompleted를 false로 리셋
- 부모의 processStage도 동기화
- 각 자식 contactId로만 타임라인 기록
- `emitGroupStageAdvanced`만 발행 (프론트에서 미구독)

아래 두 가지를 추가하라:

#### 2-1. 부모 타임라인 기록

기존 자식 루프 타임라인 기록 (line ~1872) 아래에, 부모에 대한 타임라인 기록 추가:

```typescript
// 기존: 각 자식 타임라인 (유지)
for (const child of children) {
  this.timelineService.recordChange({ contactId: child.id, ... });
}

// 추가: 부모 타임라인
this.timelineService.recordChange({
  contactId: parentId,
  changeType: 'process_stage_change',
  fromStage: currentStage,
  toStage: dto.nextStage,
  actorType: (dto.actorType as 'admin' | 'company' | 'worker') || 'admin',
  actorName: dto.actorName,
  companyName: parent.companyName || undefined,
  source: 'manual',
  metadata: {
    groupAdvance: true,
    childCount: children.length,
    forceComplete: dto.forceComplete || false,
  },
}).catch(err => {
  this.logger.error(`Timeline record failed for parent group advance: ${err instanceof Error ? err.message : String(err)}`);
});
```

#### 2-2. 소켓 이벤트 발행

기존 `emitGroupStageAdvanced` 호출 (line ~1893) 바로 아래에, `emitContactUpdated`도 추가:

```typescript
// 기존 (유지)
this.contactsGateway.emitGroupStageAdvanced({
  parentId,
  childIds: children.map((c) => c.id),
  nextStage: dto.nextStage,
});

// 추가: 부모+children 재조회하여 contact:updated 발행
this.prisma.contact
  .findUnique({
    where: { id: parentId },
    include: {
      children: {
        where: { deletedAt: null },
        orderBy: { splitIndex: 'asc' },
      },
      workerNotes: { orderBy: { createdAt: 'desc' } },
    },
  })
  .then((updatedParent) => {
    if (updatedParent) {
      const parentResult = this.toSnakeCase(updatedParent as unknown as Record<string, unknown>);
      if (Array.isArray((updatedParent as unknown as Record<string, unknown>)['children'])) {
        parentResult['children'] = (
          (updatedParent as unknown as Record<string, unknown>)['children'] as Record<
            string,
            unknown
          >[]
        ).map((child) => this.toSnakeCase(child));
      }
      this.contactsGateway.emitContactUpdated(parentResult);
    }
  })
  .catch((err) => {
    this.logger.error(
      `Socket emit failed for advanceSplitGroupStage: ${err instanceof Error ? err.message : String(err)}`
    );
  });
```

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/3-split-realtime-fix/index.json`의 phase 1 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 프론트엔드 코드를 수정하지 마라. 이 phase는 `webhard-api/` 내부만 다룬다.
- 기존 `emitGroupStageAdvanced` 호출을 제거하지 마라. 유지하고, `emitContactUpdated`를 추가로 호출하라.
- fire-and-forget 패턴을 유지하라: `.then()/.catch()` 체인이고, await 하지 않는다. 메인 로직의 return을 블로킹하면 안 된다.
- `toSnakeCase`는 단일 contact용이다. children 배열은 별도로 변환해야 한다 (`findAll` 메서드의 line ~284-289 패턴 참고).
- 기존 테스트를 깨뜨리지 마라.
