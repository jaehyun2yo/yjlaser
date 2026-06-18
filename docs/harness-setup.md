# AI 하네스 셋업 가이드

## 필수 설치

| 도구            | 설치 방법              | 확인 커맨드        |
| --------------- | ---------------------- | ------------------ |
| **Claude Code** | https://claude.ai/code | `claude --version` |
| **Python 3**    | https://python.org     | `python --version` |
| **Node.js 20+** | https://nodejs.org     | `node --version`   |
| **pnpm**        | `npm install -g pnpm`  | `pnpm --version`   |
| **Git**         | https://git-scm.com    | `git --version`    |

## 선택 설치

| 도구     | 용도                  | 설치 방법                   |
| -------- | --------------------- | --------------------------- |
| `gh` CLI | PR 자동 생성 (Step 7) | `winget install GitHub.cli` |

## 사용법

```bash
# 기능 논의 + 자동 구현
/plan-and-build <요구사항>

# 수동 실행 (task 파일이 이미 있을 때)
python scripts/run-phases.py <task-dir>

# 에러 복구 후 재실행
# → tasks/{task-dir}/index.json에서 "error" → "pending" 수정 후
python scripts/run-phases.py <task-dir>
```

## 테스트 커맨드

```bash
# Frontend
pnpm build && npx tsc --noEmit && pnpm test

# Backend
cd webhard-api && pnpm build && pnpm test
```
