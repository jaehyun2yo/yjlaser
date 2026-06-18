# YJLaser Project Agent Instructions

이 저장소에서는 글로벌 `global-orchestrator` 워크플로우가 활성화되어 있으면
그 흐름을 먼저 따른다. 글로벌 오케스트레이터가 비활성화된 세션에서는 이 파일과
`docs/agent-workflow.md`의 절차를 수동 기준으로 적용한다.
이 파일은 YJLaser에 특화된 어댑터다. 프로젝트 파일은 컨텍스트 로딩, 검증 명령,
위험 작업, 리뷰 라우팅을 정의한다.

## 답변과 커밋

- 모든 사용자 응답은 한글로 작성한다.
- 커밋 메시지는 한글로 작성한다.
- 코드 주석, 변수명, 기술 용어는 영어를 허용한다.

## 작업 전 컨텍스트

작업 전 아래 순서로 필요한 문서만 읽는다.

1. `CLAUDE.md`
2. `docs/context-map.md`
3. `docs/agent-workflow.md`
4. 변경 대상 하위 프로젝트의 README/설정/테스트 문서
5. 관련 업무 문서: `docs/workflow.md`, `docs/architecture.md`, `docs/conventions.md`

## 프로젝트 현황과 보완 지시 문서화

사용자가 전체 프로젝트 상황, 부족한 점, 개선사항, 작업 우선순위, 프로젝트 관리
상담을 요청하면 아래 문서를 먼저 확인한다.

1. `docs/company-project-overview.md`
2. `docs/parent-review-index.md`
3. `docs/parent-review-workflow.md`
4. `docs/todo.md`
5. `docs/roadmap.md`
6. 대상 하위 프로젝트의 `PROJECT_STATUS.md`
7. 필요한 경우 해당 프로젝트의 README, CHANGELOG, progress/work-log, release/QA 문서

`AGENTS.md`에는 변하기 쉬운 프로젝트별 진행률이나 현재 이슈를 직접 적지 않는다.
최신 상태는 위 원천 문서에서 확인하고, 이 파일에는 작업자가 따라야 할 절차만 둔다.

부모 프로젝트에서 부족점이나 개선사항을 발견하면 다음 원칙으로 문서화한다.

- 부모 프로젝트는 전체 판단, 우선순위, 색인만 소유한다.
- 실제 실행 지시는 각 하위 프로젝트의 `docs/parent-review/` 아래에 둔다.
- 새 지시 문서는 `<project>/docs/parent-review/YYYY-MM-DD-<slug>.md` 형식으로 만든다.
- 부모 색인 `docs/parent-review-index.md`에 새 지시 문서를 추가한다.
- 작성 양식과 상태 값은 `docs/parent-review-workflow.md`를 따른다.

보완 지시 문서에는 최소한 아래 항목을 포함한다.

- 상태: `proposed`, `accepted`, `in_progress`, `done`, `blocked`, `superseded` 중 하나
- 부모 색인 링크와 근거 문서 목록
- 요약
- 지시 목록 표: ID, 우선순위, 부족한 점, 지시사항, 완료 기준, 검증
- 실행 순서
- 완료 후 갱신할 문서 목록

우선순위는 다음 기준으로 판단한다.

- P0: 운영 장애, 데이터 유실, 고객/거래처 영향, 실제 발송/동기화 실패, 보안/권한 문제
- P1: 핵심 업무 안정화, 실패 대응, 운영 QA, 반복 수작업 감소, 현장 검증
- P2: 편의 기능, 장기 리팩토링, UI 개선, 리포트/확장 기능

문서 간 상태가 다르면 임의로 확정하지 않는다.
근거가 명확하면 원천 문서를 갱신하고, 운영 검증이 필요하면 `운영 확인 필요`로
표시한다. 완료된 보완 지시는 해당 하위 프로젝트 `PROJECT_STATUS.md`, 루트
`docs/todo.md`, 필요한 경우 `docs/roadmap.md`와 `docs/company-project-overview.md`를
함께 갱신한다.

민감 정보, API 키, 운영 비밀번호, 거래처 개인정보, 실제 고객 도면 내용은
현황/보완 지시 문서에 기록하지 않는다.

## 부모 프로젝트 비서 역할

사용자가 개발 일정관리, 사업 운영 피드백, 프로젝트 상담, 회의/보고 정리,
우선순위 조율을 요청하면 부모 프로젝트는 비서 역할로 동작한다.

비서 역할의 세부 기준은 `docs/assistant-operating-model.md`를 따른다. 이 역할은
새로운 최신 상태를 직접 기억하지 않고, 기존 현황 문서와 하위 프로젝트 원천
문서를 읽어 판단한다.

비서 역할 요청에서는 다음 순서로 답한다.

1. 현재 판단: 지금 가장 중요한 결론
2. 근거: 확인한 문서와 상태
3. 우선순위: P0/P1/P2 또는 실행 순서
4. 실행 지시: 다음에 실제로 할 일
5. 확인 필요: 운영 검증, 문서 불일치, 사용자 결정이 필요한 부분

일정관리와 운영 피드백은 `docs/todo.md`, `docs/roadmap.md`,
`docs/company-project-overview.md`, `docs/parent-review-index.md`, 각 프로젝트
`PROJECT_STATUS.md`를 기준으로 한다. 하위 프로젝트에 실제 실행 지시가 필요하면
`docs/parent-review-workflow.md` 양식에 따라 해당 프로젝트 `docs/parent-review/`
아래에 문서를 만든다.

사용자는 부모 프로젝트에서 지시한다. 예: "현재 P0 지시사항부터 실행해줘",
"외부웹하드동기화프로그램 parent-review 지시사항을 진행해줘"처럼 요청한다.
실제 작업은 대상 하위 프로젝트에 존재하는 `AGENTS.md`, `CLAUDE.md`, README, 테스트
문서, `PROJECT_STATUS.md`, `docs/parent-review/*.md`를 읽고 그 프로젝트 규칙으로
수행한다. 일부 파일이 없으면 존재하는 원천 문서와 설정/테스트 파일을 기준으로
진행하고, 빠진 진입점은 최종 보고의 남은 리스크에 적는다.
서로 독립적인 하위 프로젝트 작업은 병렬 검토할 수 있지만, 공유 API/DB/파일 계약,
운영 외부 서비스, 배포, 실제 발송/동기화, 부모 종합 문서 갱신은 직렬로 조율한다.

비서 역할은 판단, 정리, 문서화, 우선순위 제안을 담당한다. 프로덕션 배포, 운영 DB,
외부 발송, 실제 동기화, 고객 도면/거래처 정보/비밀값 처리, 인증/권한 변경은
`docs/risk-gates.md`에 따른 명시 승인 없이 실행하지 않는다.

## 글로벌 하네스 연결

- 사용자가 작업을 요청하면 기본적으로 계획 우선 흐름을 따른다. `global-orchestrator`
  가 활성화되어 있으면 그 하네스를 사용하고, 비활성화되어 있으면 같은 절차를
  수동으로 적용한다. 즉, 비 trivial 작업은 구현 전에 Plan mode에 해당하는
  `clarify/brainstorm → plan → plan-review gate` 단계를 먼저 거친다.
- 가벼운 수정은 예외다. 안전하고 국소적인 로컬 문서/코드 수정, 단일 명령 확인,
  명백한 오타/문구 수정, 기존 패턴이 분명한 작은 변경은 별도 Plan mode 전환 없이
  바로 수행할 수 있다.
- 비 trivial 작업은 `intake → prompt-quality-check → clarify/brainstorm → plan → recommend-plan-review → execute → verify → review → learning → final` 흐름을 따른다.
- 사용자가 작업 지시에 `간단한`을 명시하면 먼저 간단 작업 후보로 분류한다. 안전하고 국소적인 로컬 문서/코드 수정, 단일 명령 확인, 명백한 오타/문구 수정은 별도 fast path 승인 질문 없이 바로 수행한다.
- `간단한`이 없더라도 가벼운 수정으로 판단되면 바로 수행한다. 가벼운 수정은
  아니지만 작은 작업으로 판단되는 경우에는 fast path 제안 후 사용자 승인을 받는다.
- `간단한`은 아래 "절대 Fast Path 금지" 항목이나 `docs/risk-gates.md`의 위험 게이트를 우회하지 못한다.
- 계획이 필요한 작업은 구현 전에 `docs/agent-workflow.md` 기준으로 GStack 계획 리뷰를 추천하고 사용자 승인을 받는다.
- 구현 후에는 `docs/verification-matrix.md`에 맞는 검증을 실행한다.
- 비 trivial 작업은 구현자와 리뷰어 역할을 분리한다. 별도 reviewer agent를 쓸 수 없으면 fresh-context 리뷰 패스를 수행하고 그 한계를 보고한다.

## 절대 Fast Path 금지

아래 작업은 항상 full workflow와 명시적 사용자 승인 게이트를 사용한다.

- 프로덕션 배포, Railway/Vercel 설정 변경
- Supabase 프로덕션 DB, Cloudflare R2 프로덕션 버킷 작업
- Prisma migration deploy 또는 destructive migration
- Popbill FAX/MMS/Email 실제 발송
- LGU+ 외부웹하드 실제 업로드/삭제/동기화 변경
- 고객 도면, 거래처 정보, API 키, Doppler secret 처리
- 인증, 권한, 관리자 로그인, public API 변경

상세 기준은 `docs/risk-gates.md`를 따른다.

## 검증 기준

변경 경로별 필수 검증은 `docs/verification-matrix.md`를 따른다.
검증을 실행하지 못하면 최종 보고에 이유와 남은 리스크를 명시한다.

## 문서 동기화

- 코드 변경이 업무 흐름, 아키텍처, 운영 절차, 위험 작업 기준을 바꾸면 관련 문서를 함께 업데이트한다.
- 큰 기능이나 구조 변경은 구현 전 스펙/계획 문서를 남긴다.
- 반복 가능한 교훈은 글로벌 learning 또는 프로젝트 문서로 승격한다.
