# 컨텍스트 맵

작업별로 먼저 읽을 문서를 정리한다. 모든 문서를 매번 읽지 말고, 작업에 필요한
문서만 선택한다.

## 공통 문서

| 목적 | 문서 |
|---|---|
| 프로젝트 전체 규칙 | `AGENTS.md`, `CLAUDE.md` |
| 회사 프로젝트 종합 현황 | `docs/company-project-overview.md` |
| 부모 프로젝트 비서 역할 | `docs/assistant-operating-model.md` |
| 최신 정보 원천/문서 갱신 기준 | `docs/company-project-overview.md`의 `최신 정보 원천`, `변경사항 반영 규칙` |
| 문서 정합성/전수조사 결과 | `docs/company-project-overview.md`의 `전수조사 반영 결과`, 각 프로젝트 `PROJECT_STATUS.md` |
| 부모 검토 보완 지시 | `docs/parent-review-index.md`, `docs/parent-review-workflow.md`, 각 프로젝트 `docs/parent-review/` |
| 업무 흐름 | `docs/workflow.md` |
| 프로젝트 간 연동/인증/DB | `docs/architecture.md` |
| 개발 컨벤션/테스트 정책 | `docs/conventions.md` |
| 개발 환경 | `docs/dev-setup.md` |
| 환경변수/Doppler | `docs/doppler.md` |
| 로드맵/TODO | `docs/roadmap.md`, `docs/todo.md` |

## 하위 프로젝트별 시작점

| 작업 대상 | 먼저 확인할 것 |
|---|---|
| `yjlaser_website` | `yjlaser_website/PROJECT_STATUS.md`, `yjlaser_website/package.json`, 하위 README/설정 파일 |
| `yjlaser_website/webhard-api` | NestJS/Prisma 설정, schema/migration, API guard |
| `외부웹하드동기화프로그램` | `외부웹하드동기화프로그램/README.md`, `외부웹하드동기화프로그램/PROJECT_STATUS.md`, `package.json`, sync engine, DB/checkpoint 관련 문서 |
| `유진레이저목형 관리프로그램` | `유진레이저목형 관리프로그램/CLAUDE.md`, `유진레이저목형 관리프로그램/PROJECT_STATUS.md`, `invoice_manager/config/constants.py`, `invoice_manager/CHANGELOG.md`, `pytest.ini`, Popbill/Excel/파일명 파싱 코드 |
| `레이저네스팅프로그램` | `레이저네스팅프로그램/PROJECT_STATUS.md`, `pyproject.toml`, tests, 알고리즘/fixture/benchmark 관련 파일 |
| `computeroff` | `computeroff/AGENTS.md`, `computeroff/PROJECT_STATUS.md`, server/agent requirements, FastAPI/installer 관련 파일 |
| `dashboard` | `dashboard/package.json`, `server.js` |

## 업무 영역별 문서 선택

| 업무 | 읽을 문서 |
|---|---|
| 접수/웹하드 | `docs/workflow.md`, `docs/architecture.md`, 웹사이트/동기화 앱 문서 |
| 청구서/발송 | `docs/workflow.md`, `docs/risk-gates.md`, 관리프로그램 테스트 설정 |
| 네스팅/레이저가공 | `docs/workflow.md`, 네스팅프로그램 테스트/알고리즘 파일 |
| Worker/납품 | `docs/workflow.md`, 웹사이트 관련 코드/문서 |
| 배포/환경변수 | `docs/dev-setup.md`, `docs/doppler.md`, `docs/risk-gates.md` |
| 개발 일정관리/사업 운영 피드백 | `docs/assistant-operating-model.md`, `docs/company-project-overview.md`, `docs/todo.md`, `docs/parent-review-index.md` |

## 컨텍스트 기록 기준

- 프로젝트 고유 규칙은 `AGENTS.md` 또는 `docs/agent-workflow.md`에 반영한다.
- 검증 명령 변화는 `docs/verification-matrix.md`에 반영한다.
- 위험 작업 발견은 `docs/risk-gates.md`에 반영한다.
- 반복 실수나 재사용 가능한 교훈은 글로벌 learning 또는 프로젝트 문서에 남긴다.
