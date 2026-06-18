# 부모 검토 보완 지시 작성 규칙

작성일: 2026-06-18

## 목적

부모 프로젝트에서 전체 현황을 보다가 발견한 부족점, 운영 리스크, 우선 보완 과제를 각 하위 프로젝트가 실행 가능한 지시 문서로 관리하기 위한 규칙이다.

부모 문서는 전체 조망과 우선순위 색인만 맡고, 실제 보완 지시는 각 하위 프로젝트의 `docs/parent-review/` 아래에 둔다.

## 폴더 규칙

각 활성 프로젝트는 아래 폴더를 가진다.

```text
<project>/docs/parent-review/
  README.md
  YYYY-MM-DD-<slug>.md
```

예시:

```text
yjlaser_website/docs/parent-review/2026-06-18-improvement-directives.md
```

## 역할 분리

| 역할 | 담당 문서 | 책임 |
| --- | --- | --- |
| 부모 프로젝트 | `docs/company-project-overview.md`, `docs/parent-review-index.md` | 부족점 발견, 우선순위 판단, 전체 색인 |
| 하위 프로젝트 | `<project>/docs/parent-review/*.md` | 실행 지시, 완료 기준, 검증 결과 기록 |
| 원천 문서 | 각 프로젝트 README, CHANGELOG, PROJECT_STATUS, todo, roadmap | 실제 기능/상태의 근거 |

## 지시와 실행 흐름

사용자는 부모 프로젝트에서 지시한다. 부모 프로젝트는 어떤 지시사항을 먼저 진행할지
선정하고, 대상 하위 프로젝트의 보완 지시 문서를 기준으로 작업을 시작한다.

실행 흐름:

1. 부모 프로젝트에서 `docs/parent-review-index.md`, `docs/todo.md`,
   `docs/company-project-overview.md`를 확인한다.
2. 실행할 하위 프로젝트와 지시 문서를 고른다.
3. 해당 하위 프로젝트에 존재하는 `AGENTS.md`, `CLAUDE.md`, README, 테스트 문서,
   `PROJECT_STATUS.md`, `docs/parent-review/*.md`를 확인한다. 일부 파일이 없으면
   존재하는 원천 문서와 설정/테스트 파일을 기준으로 진행하고, 빠진 진입점은
   완료 보고에 남긴다.
4. 작업은 하위 프로젝트 규칙과 검증 기준으로 진행한다.
5. 완료 결과는 하위 지시 문서에 기록한다.
6. 부모 `docs/parent-review-index.md`, `docs/todo.md`, 필요한 경우
   `docs/company-project-overview.md`를 갱신한다.

서로 독립적인 하위 프로젝트 작업은 병렬로 검토할 수 있다. 단, 공유 API/DB/파일
계약, 운영 외부 서비스, 배포, 실제 발송/동기화, 부모 종합 문서 갱신은 병렬로
처리하지 않고 직렬로 조율한다.

## 작성 원칙

- 하나의 보완 지시 문서는 한 번의 부모 검토 결과를 담는다.
- 민감 정보, API 키, 운영 비밀번호, 거래처 개인정보, 실제 고객 도면 내용은 쓰지 않는다.
- 코드/운영 확인 없이 문서만 보고 판단한 내용은 `문서 기준`으로 표시한다.
- 실제 운영 검증이 필요한 항목은 `운영 확인 필요`로 남긴다.
- 완료 기준은 실행 가능한 형태로 쓴다. 예: "운영 PC 로그 8시간 확보", "회귀 테스트 1개 추가", "실패 건 수동 재발송 절차 문서화".
- 보완 지시가 완료되면 해당 프로젝트 `PROJECT_STATUS.md`, 루트 `docs/todo.md`, 필요한 경우 `docs/roadmap.md`를 함께 갱신한다.

## 상태 값

| 상태 | 의미 |
| --- | --- |
| proposed | 부모 검토에서 제안됨. 아직 실행 착수 전 |
| accepted | 하위 프로젝트에서 작업 범위로 채택 |
| in_progress | 구현/검증 진행 중 |
| done | 완료 기준과 검증 기록 충족 |
| blocked | 외부 조건 또는 사용자 결정 없이는 진행 불가 |
| superseded | 다른 지시 문서로 대체 |

## 문서 양식

```markdown
# YYYY-MM-DD 부모 검토 보완 지시

상태: proposed
부모 색인: ../../../docs/parent-review-index.md
근거: PROJECT_STATUS.md, 루트 docs/company-project-overview.md, 루트 docs/todo.md

## 요약

한 문단으로 이번 보완 지시의 목적을 쓴다.

## 지시 목록

| ID | 우선순위 | 부족한 점 | 지시사항 | 완료 기준 | 검증 |
| --- | --- | --- | --- | --- | --- |
| PR-001 | P0 | 무엇이 부족한가 | 무엇을 해야 하는가 | 끝났다고 볼 기준 | 실행할 검증 |

## 실행 순서

1. 가장 먼저 할 일
2. 다음 할 일
3. 완료 후 갱신할 문서

## 문서 갱신 규칙

- 완료 시 이 문서의 상태를 `done`으로 바꾼다.
- 프로젝트 `PROJECT_STATUS.md`의 부족한 점/다음 우선순위를 갱신한다.
- 루트 `docs/todo.md`와 `docs/company-project-overview.md`에 영향이 있으면 같이 갱신한다.
```
