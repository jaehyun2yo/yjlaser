# Phase 3: 테스트 (tests)

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `yjlaser_website/CLAUDE.md`
- `docs/testing.md` — 테스트 원칙
- `docs/specs/features/drawing-workflow.md` — "타임라인 신뢰성 보장"
- `/tasks/14-timeline-reliability/docs-diff.md`

Phase 1, 2 산출물:

- `webhard-api/src/contacts/contact-timeline.service.ts` — `getTimeline` fallback + `recordChange` throw 전환
- `webhard-api/src/integration/orders/auto-contact.service.ts` — `createNewContact` 트랜잭션화
- `webhard-api/src/contacts/drawing-revision.service.ts` — `createInitialRevision`/`createRevision` tx 지원

기존 spec 파일(Phase 1, 2에서 확장/수정):

- `webhard-api/src/contacts/contact-timeline.service.spec.ts` (task 13 산출물)
- `webhard-api/src/contacts/drawing-revision.service.spec.ts` (task 13 산출물)

## 작업 내용

### 1. Fallback 응답 테스트

**파일**: `webhard-api/src/contacts/contact-timeline.service.spec.ts` (확장)

신규 테스트 케이스:

| #   | 테스트                                                                                                                                             | 이유               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| F1  | `ContactStatusHistory`/`DrawingRevision` 모두 비어있고 `contacts.drawingFileUrl` 있을 때: 응답에 `created` + `drawing_revision initial` 2개 이벤트 | 핵심 fallback 동작 |
| F2  | 둘 다 비어있고 `contacts.drawingFileUrl` 없을 때: 응답에 `created` 1개만                                                                           | 도면 없는 경로     |
| F3  | Contact 자체가 없을 때: 빈 배열 반환                                                                                                               | 에지 케이스        |
| F4  | 실 데이터 1건이라도 있으면 fallback 비활성 (혼합 금지)                                                                                             | 실데이터 우선      |
| F5  | `contacts.source === 'webhard_auto'` → actorType='system', actorName='웹하드 자동생성'                                                             | 매핑               |
| F6  | `forCompany=true` 일 때: `created`는 포함, `drawing_revision initial`은 제외 (isPublic=false)                                                      | 거래처 보안        |
| F7  | fallback 이벤트의 payload에 `fallback: true` 플래그 포함                                                                                           | UI 구분용          |

환경: 실제 PostgreSQL (task 13과 동일). Contact만 생성하고 status_history/drawing_revision 레코드는 일부러 미삽입 시나리오.

### 2. 트랜잭션 보장 테스트

**파일**: `webhard-api/src/integration/orders/auto-contact.service.spec.ts` (신규 or 확장)

| #   | 테스트                                                                                                                    | 이유          |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------- |
| T1  | `createNewContact` 성공 시: `contact`, `contact_status_history(created)`, `drawing_revisions(initial)` 3건 모두 DB에 존재 | 정상 경로     |
| T2  | `recordChange` 내부에서 의도적 throw 시 (mock): Contact도 DB에 없음 (롤백)                                                | 트랜잭션 보장 |
| T3  | `createInitialRevision` 내부에서 throw 시: Contact, contact_status_history도 롤백                                         | 전체 롤백     |
| T4  | `drawingFileUrl` 없는 Contact: `createInitialRevision` 호출 안 됨, status_history만 1건                                   | 조건부        |

### 3. `recordChange` throw 동작 테스트

**파일**: `webhard-api/src/contacts/contact-timeline.service.spec.ts` (확장)

| #   | 테스트                                              | 이유           |
| --- | --------------------------------------------------- | -------------- |
| R1  | DB 에러 시 throw (warning 삼키지 않음)              | 근본 수정 검증 |
| R2  | `tx` 파라미터 제공 시 해당 트랜잭션 클라이언트 사용 | 트랜잭션 전파  |
| R3  | `tx` 미제공 시 `this.prisma` 사용 (기본값)          | 하위 호환      |

### 4. 기존 테스트 회귀

- task 13의 timeline 테스트 6건 + drawing-revision 12건 모두 통과 유지
- task 13 Phase 3에서 추가한 ContactTimeline frontend 7건도 회귀 없음 (프론트 변경 없으므로 건드리지 않음)

### 5. E2E (선택)

- Fallback 동작을 E2E로 검증할 필요는 낮음 — 단위 테스트로 충분. 본 task에서는 E2E 추가하지 않음.
- 기존 `e2e/drawing-timeline.spec.ts` (task 13)는 그대로 유지.

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test
```

- 빌드 성공
- 위 Phase 1~3에서 추가한 신규 테스트 (F1~F7 = 7건, T1~T4 = 4건, R1~R3 = 3건 = 총 14건) 모두 통과
- 기존 테스트 회귀 없음 (task 13의 18건 유지)

## AC 검증 방법

AC 커맨드 실행. 통과하면 `/tasks/14-timeline-reliability/index.json`의 phase 3 status를 `"completed"`로 변경.
3회 실패 시 `"error"` + `error_message`에 어느 테스트가 실패했는지 기록.

## 주의사항

- 테스트만 이 phase의 범위. 소스 코드 추가 변경 금지 (Phase 1, 2에서 완성).
- 만약 Phase 1/2 구현에 버그가 발견되면 해당 phase 파일/코드를 돌아가 수정하는 게 아니라, **이 phase 내에서 최소 수정으로 해결**하고 notes에 기록.
- 실제 PostgreSQL 사용 시 트랜잭션 격리 (`beforeEach` rollback 패턴). 테스트 간 데이터 오염 방지.
- Mock 과용 금지 — `docs/testing.md` 원칙. 핵심 분기 커버만.
- 기존 테스트 안 깨뜨리기.
