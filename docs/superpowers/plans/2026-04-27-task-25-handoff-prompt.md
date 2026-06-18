# task 25 새 세션 핸드오프 프롬프트

> 다음 텍스트를 새 Claude Code 세션의 첫 메시지로 그대로 붙여넣으세요.
> 워킹 디렉토리는 worktree 루트 (`.worktrees/task-25-webhard-fix/`) 로 시작하세요.

---

## 핸드오프 프롬프트 (복사해서 새 세션에 붙여넣기)

```
task 25 (웹하드 가시성 회복 + 외부 폴더명 alias 매핑 + 미가입 업체 문의 폴더 자동화) 의 구현을 이어서 진행한다.

이전 세션에서 spec + plan 작성 + dev DB 직접 진단 완료. 본 세션은 plan 실행만 담당.

## 컨텍스트

- 브랜치: `feat/task-25-webhard-fix` (worktree at `.worktrees/task-25-webhard-fix/`)
- 작업 디렉토리: `.worktrees/task-25-webhard-fix/` (이미 cd 되어 있어야 함; 아니면 cd)
- 마지막 commit: `91d34c20 docs(task 25): spec/plan 재작성 — Bug 2 진단 폐기 후 alias 매핑 정책으로 교체`

## 필독 문서

1. `docs/specs/features/webhard-visibility-and-external-inquiry-fix.md` — spec (180 줄, 정책 정의)
2. `docs/superpowers/plans/2026-04-27-webhard-visibility-and-external-inquiry-fix.md` — plan (5 phases / 16 tasks, 본 세션이 따라갈 작업표)

## 핵심 진단 결과 (이미 검증됨)

- dev DB 는 `.env.local` 의 DATABASE_URL 이 가리키는 Supabase project `fbtkoikwsytoamlddpms` 임 (MCP 가 가리키는 `ibsbcuumkdhwesrpaqeb` 가 아님 — MCP 는 더 이상 신뢰하지 말 것).
- PR #17 두 마이그레이션 (`20260427030703_add_company_folder_alias`, `20260427030704_add_contact_company_id`) 모두 dev DB 에 적용 완료. 마이그레이션 회복 작업 불필요.
- `대성목형` 가입 (Company.id=4, laser_only=true). 외부웹하드 폴더 `대성목형(2265-1295)` (id=`5019ab31-242f-406a-885a-bfe38cada1b4`) 와 정규화 후에도 매칭 안 됨 — 이게 Bug 2 의 진짜 원인.
- Bug 1 dev 재현: 폴더 `f78e1ea0-d4fc-4a19-9629-516e436db403` (`/대성목형`, companyId=4) 안에 file `9d7a229a-...` (`기타_테스트.DXF`, companyId=null).
- `.env.local` 은 worktree 루트에 이미 복사되어 있음 (gitignored).

## 실행 방식

`superpowers:subagent-driven-development` 스킬을 사용해 plan 의 task 를 task 1.1 부터 순서대로 dispatch.

각 task 마다:
1. implementer subagent dispatch (general-purpose)
2. spec compliance reviewer dispatch
3. code quality reviewer dispatch (oh-my-claudecode:code-reviewer 또는 superpowers:code-reviewer)
4. 두 리뷰 모두 ✅ 후 다음 task

## 작업 순서 (plan 의 phase 정의를 그대로 따름)

- Phase 1 (Bug 2 alias endpoint): Task 1.1 → 1.2 → 1.3 (대성목형 즉시 적용, 운영 1회)
- Phase 2 (Bug 1 companyId 상속 + 백필): Task 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 (commit)
- Phase 3 (Bug 3 회귀 가드 테스트): Task 3.1 → 3.2 → 3.3 → 3.4 (commit)
- Phase 4 (e2e + docs): Task 4.1 → 4.2 → 4.3
- Phase 5 (최종 검증 + PR): Task 5.1 → 5.2

## 주의사항

1. **MCP Supabase 사용 금지**: MCP 는 별개 DB 를 가리킴. dev DB 조회는 worktree 의 임시 tsx 스크립트로 (이전 세션의 `webhard-api/scripts/bug2-diagnose.ts` 패턴 — `import 'dotenv/config'; import {config} from 'dotenv'; config({path: '../.env.local'});` + `PrismaClient`).

2. **prisma generate 필수**: worktree 에서 처음 prisma client 사용 시 `cd webhard-api && npx prisma generate` 1회 실행 필요 (이전 세션에서 1회 실행했지만, branch 갱신 후 다시 필요할 수 있음).

3. **commit 메시지**: 한글, type prefix (feat/fix/docs/test/refactor/chore), `Co-Authored-By: Claude <noreply@anthropic.com>` 포함.

4. **lint-staged 자동 prettier**: 마크다운 stage 시 prettier 가 표 정렬 자동 정리. 정상 동작이므로 무시.

5. **Phase 1 Task 1.3 (대성목형 즉시 적용)** 은 운영 작업 — git commit 없음. 결과만 사용자에게 보고.

6. **Bug 1 백필 마이그레이션 (Task 2.4)** prod 적용은 사용자 협조 필요 — Railway shell 접근 또는 prod DATABASE_URL 임시 export. 시점 협의.

7. **PR 생성 (Task 5.2)** 전에 사용자에게 한 번 더 확인. `gh pr create` 는 explicit 승인 후만.

8. **사용자 응답 한글 필수** (CLAUDE.md 규칙). 코드/식별자만 영어.

## 시작 명령

위 컨텍스트를 모두 읽었으면 다음을 실행해서 시작:

1. `cd .worktrees/task-25-webhard-fix && git branch --show-current` (브랜치 확인: `feat/task-25-webhard-fix`)
2. plan 파일을 Read 로 한 번에 읽어 task 16개 추출 후 TodoWrite 로 등록
3. Task 1.1 부터 implementer subagent dispatch

스킬 호출: `Skill superpowers:subagent-driven-development`
```

---

## 새 세션 시작 시 권장 첫 발화

위 프롬프트를 그대로 붙여넣은 뒤, 사용자가 다음과 같이 명시적으로 시작 신호를 주면 됩니다:

> "위 컨텍스트로 task 25 plan 실행 시작해줘. subagent-driven-development 스킬 사용."
