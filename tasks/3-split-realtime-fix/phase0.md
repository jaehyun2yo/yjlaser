# Phase 0: 문서 업데이트

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션)
- `docs/specs/features/contact-split.md` (분할 문의 스펙)
- `docs/specs/api/nestjs-endpoints.md` (API 엔드포인트 인덱스)
- `docs/changelog/CHANGELOG.md`

## 작업 내용

### 1. `docs/specs/features/contact-split.md` 업데이트

"그룹 진행 방식" 섹션 하단에 아래 내용을 추가:

#### 실시간 업데이트

- `toggleStageCompleted` 완료 후 부모 Contact(children 포함)를 재조회하여 `contact:updated` 소켓 이벤트 발행
- `advanceSplitGroupStage` 완료 후 동일하게 부모 Contact를 `contact:updated`로 발행 (기존 `contact:group-stage-advanced` 유지)
- Admin/Worker 프론트엔드 모두 `contact:group-stage-advanced`, `contact:split` 이벤트 구독

#### 타임라인 기록 규칙

- `toggleStageCompleted` 시 자식 contactId + 부모 contactId 양쪽에 타임라인 기록
- `advanceSplitGroupStage` 시 각 자식 contactId + 부모 contactId에 타임라인 기록
- 부모 타임라인의 metadata에 어떤 자식/어떤 변경인지 기록

#### 작업완료 확인 모달

- 분할 하위 문의의 개별 "작업완료" 버튼 클릭 시 확인 모달 표시
- 모달 메시지에 해당 하위 문의 번호 포함 (예: "260413-O-001-1 작업완료 처리하시겠습니까?")

### 2. `docs/specs/api/nestjs-endpoints.md` 업데이트

contacts 섹션에 아래 WebSocket 이벤트 설명이 없다면 추가:

| Event                          | Payload                              | 설명                                |
| ------------------------------ | ------------------------------------ | ----------------------------------- |
| `contact:updated`              | Contact (with children)              | 문의 업데이트 (분할 하위 완료 포함) |
| `contact:group-stage-advanced` | `{ parentId, childIds, nextStage }`  | 그룹 일괄 단계 이동                 |
| `contact:split`                | `{ parentId, splitCount, children }` | 문의 분할                           |

### 3. `docs/changelog/CHANGELOG.md` 업데이트

최상단에 엔트리 추가:

```
## 2026-04-14

### Fixed
- 분할 문의 작업완료 시 다른 탭/사용자에게 실시간 반영되지 않던 문제 수정
- 분할 문의 타임라인이 부모 문의에 기록되지 않던 문제 수정

### Added
- 분할 하위 문의 작업완료 시 확인 모달 추가
```

## Acceptance Criteria

```bash
# 문서 파일만 수정하므로 lint 정도면 충분
echo "Docs updated"
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/3-split-realtime-fix/index.json`의 phase 0 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 코드 파일은 수정하지 마라. 문서 파일만 수정.
- 기존 문서의 구조와 포맷을 유지하라.
- CHANGELOG 날짜는 `2026-04-14`로 기록하라.
