# Phase 1: 백엔드 — 공정 이동 로직 수정

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/laser-only-company-inquiry.md` (Phase 0에서 업데이트됨)
- `CLAUDE.md` (프로젝트 컨벤션)
- `/tasks/8-laser-only-flow/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 반드시 다음 파일들을 꼼꼼히 읽어라:

- `webhard-api/src/contacts/contacts.service.ts` (공정 이동 핵심 로직 — `updateProcessStage` 메서드, `OFFICE_STAGES`, `FIELD_STAGES` 상수)
- `webhard-api/src/integration/orders/auto-contact.service.ts` (자동 문의 생성 — 레이저 전용 분기)
- `src/app/api/admin/contacts/[id]/process-stage/route.ts` (공정 이동 API)

## 배경

레이저 전용 업체의 문의(`inquiry_type = 'laser_cutting'`)는 레이저 가공만 수행한다.
현재는 레이저가공 완료 후 일반 문의와 동일하게 칼작업 → 오시작업 → 납품을 거치지만,
레이저 전용은 레이저가공 완료 = 문의 종료여야 한다.

완료 상태: `status = 'delivered'`, `processStage = null`

## 작업 내용

### 1. `contacts.service.ts` — `updateProcessStage` 메서드 수정

파일: `webhard-api/src/contacts/contacts.service.ts`

`updateProcessStage` 메서드를 찾아라. 이 메서드는 공정 단계를 이동시키는 핵심 로직이다.

다음 로직을 추가하라:

- Contact를 DB에서 조회할 때 `inquiryType` 필드도 함께 select하라
- 조회된 contact의 `inquiryType === 'laser_cutting'`이고, 현재 `processStage === 'laser'`이며, 요청된 다음 단계가 `cutting`, `creasing`, 또는 `delivery`인 경우:
  - `cutting`/`creasing`/`delivery`로 이동하는 대신 **바로 완료 처리**
  - `status = 'delivered'`, `processStage = null` 로 업데이트
  - Timeline에 "레이저가공 완료 (레이저 전용 업체)" 기록
  - 완료 처리 후 return (이후 로직 실행하지 않음)

또한 **새로운 메서드**를 추가하라:

```typescript
/**
 * 레이저 전용 문의를 즉시 완료 처리
 * laser_cutting 문의가 레이저가공 완료 시 칼작업/오시작업 스킵하고 바로 delivered
 */
async completeLaserOnlyContact(id: string, actor?: TimelineActor): Promise<{...}>
```

이 메서드의 동작:

1. Contact 조회 (id, inquiryType, processStage, status 확인)
2. `inquiryType !== 'laser_cutting'`이면 예외 throw
3. `status = 'delivered'`, `processStage = null`, `updatedAt = new Date()` 로 업데이트
4. Timeline 기록: changeType='completed', note='레이저가공 완료 (레이저 전용 업체)'
5. 실시간 이벤트 발행
6. 업데이트된 contact 반환

### 2. `contacts.controller.ts` — 레이저 전용 완료 API 추가

파일: `webhard-api/src/contacts/contacts.controller.ts`

새 엔드포인트를 추가하라:

```
POST /contacts/:id/complete-laser
```

- `@UseGuards(ApiKeyGuard)`로 보호 (관리자/API Key만 호출 가능)
- `this.contactsService.completeLaserOnlyContact(id, actor)` 호출
- 성공 시 업데이트된 contact 반환

### 3. Next.js API 라우트 추가

파일: `src/app/api/admin/contacts/[id]/complete-laser/route.ts` (신규)

- `requireAdmin()` 인증 체크
- NestJS `/contacts/:id/complete-laser`로 프록시
- 성공/실패 응답 반환

### 4. 공정 이동 API에서 레이저 전용 처리

파일: `src/app/api/admin/contacts/[id]/process-stage/route.ts`

기존 공정 이동 API에서도 레이저 전용 문의의 laser → 다음 단계 이동 시 `complete-laser` API를 호출하도록 분기 처리하라.
또는, 프론트엔드에서 직접 `complete-laser` API를 호출하도록 하고 여기는 수정하지 않아도 된다.
두 방법 중 코드 변경이 적은 쪽을 선택하라.

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/8-laser-only-flow/index.json`의 phase 1 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- `updateProcessStage`의 기존 로직을 깨뜨리지 마라. 레이저 전용 분기를 **추가**하는 것이지 기존 흐름을 변경하는 것이 아니다.
- `inquiryType` 필드 조회를 위해 기존 select에 `inquiryType: true`를 추가해야 할 수 있다. 기존 select 구조를 확인하고 최소한의 변경만 하라.
- 기존 테스트를 깨뜨리지 마라.
- NestJS DTO에 class-validator 데코레이터를 적절히 사용하라.
- `completeLaserOnlyContact`에서 `inquiryType !== 'laser_cutting'`인 contact에 대해 호출하면 `BadRequestException`을 throw하라.
