# 검증 매트릭스

변경한 경로에 따라 실행할 검증 명령을 선택한다. 여러 경로를 건드리면 해당
검증을 조합한다. 명령은 각 하위 프로젝트 디렉터리에서 실행하는 것을 기본으로
한다. `package-lock.json`과 `pnpm-lock.yaml`이 함께 있는 프로젝트는 최근
문서/스크립트/사용자 지시를 확인해 기존 실행 방식에 맞춘다.

## 루트

| 변경 경로 | 필수 검증 | 선택 검증 |
|---|---|---|
| `scripts/**` | 관련 스크립트 dry-run 또는 구문 검사 | `npm run generate:types` |
| `docs/**`, `README.md`, `CLAUDE.md`, `AGENTS.md` | 아래 "문서 검증 표준" 명령 실행, 링크/내용 직접 확인 | 관련 코드 변경이 있으면 해당 프로젝트 검증 |
| `package.json`, `package-lock.json` | `npm install --package-lock-only` 필요 여부 검토 | `npm run generate:types` |

## yjlaser_website

작업 디렉터리: `yjlaser_website`

| 변경 경로 | 필수 검증 | 선택 검증 |
|---|---|---|
| `yjlaser_website/**` 일반 변경 | `npm run lint`, `npm run test` | `npm run build` |
| `yjlaser_website/app/**`, `components/**` UI 변경 | `npm run lint`, 관련 테스트 | 브라우저 QA, screenshot 확인 |
| `yjlaser_website/webhard-api/**` | API `package.json` 기준 `test`/`build` 명령 확인 후 실행 | Prisma generate/migrate dry-run |
| Prisma schema/migration | migration diff 검토, 개발 DB 기준 검증 | 프로덕션 deploy는 사용자 승인 필요 |
| `yjlaser_website/agent-office/**` | 해당 `package.json` 스크립트 확인 후 관련 검증 | 브라우저/통합 확인 |

## 외부웹하드동기화프로그램

작업 디렉터리: `외부웹하드동기화프로그램`

| 변경 유형 | 필수 검증 | 선택 검증 |
|---|---|---|
| TypeScript/Electron 일반 변경 | `npm run typecheck`, `npm run test` | `npm run lint`, `npm run build` |
| 동기화 엔진/DB/파일 처리 | `npm run test`, 관련 integration test | `npm run test:integration` |
| UI/E2E | `npm run typecheck`, 관련 테스트 | `npm run test:e2e` |

## 유진레이저목형 관리프로그램

주요 작업 디렉터리: `유진레이저목형 관리프로그램/invoice_manager`

| 변경 유형 | 필수 검증 | 선택 검증 |
|---|---|---|
| Python 로직 변경 | `pytest` | marker 기반 unit/integration 분리 실행 |
| Popbill 연동 | mock/unit test | 실제 발송/real API는 사용자 승인 필요 |
| Excel/파일명 파싱 | 관련 fixture 테스트 | 샘플 파일 dry-run |

## 레이저네스팅프로그램

작업 디렉터리: `레이저네스팅프로그램`

| 변경 유형 | 필수 검증 | 선택 검증 |
|---|---|---|
| Python 로직 변경 | `pytest` | `pytest -m "not slow"` |
| 네스팅 알고리즘 | 관련 unit/integration test | benchmark/fixture 비교 |
| UI 변경 | 관련 UI 테스트 또는 수동 확인 | Windows 실행 확인 |

## computeroff

| 변경 유형 | 필수 검증 | 선택 검증 |
|---|---|---|
| 서버/FastAPI | 해당 requirements 설치 확인 후 pytest 또는 app import check | 로컬 서버 smoke test |
| agent/installer | 구문 검사, 패키징 스크립트 dry-run | Windows 작업 스케줄러 수동 확인 |

## 검증 실패 또는 미실행 시 보고

검증을 실행하지 못하면 다음 형식으로 보고한다.

```text
실행하지 못한 검증: <command>
이유: <환경/의존성/시간/외부 시스템 제약>
남은 리스크: <사용자에게 실제로 남는 위험>
대체 확인: <실행한 부분 검증>
```

## 문서 검증 표준

루트 문서만 수정한 경우 최소한 아래를 실행한다.

```powershell
Select-String -Path 'AGENTS.md','CLAUDE.md','docs\*.md' -Pattern '[ \t]+$'
git diff --check -- AGENTS.md CLAUDE.md docs
rg -n "TODO|TBD|PLACEHOLDER|FIXME|확인 필요|운영 확인 필요" AGENTS.md CLAUDE.md docs
```

새 링크를 추가했으면 `Test-Path`로 대상 파일 존재를 확인한다. 하위 프로젝트 문서에
링크를 추가한 경우 해당 프로젝트 디렉터리 기준 상대 경로도 확인한다.
