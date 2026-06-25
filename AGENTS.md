# AGENTS.md

Codex-facing operating guide for the YJ Laser integrated web platform.

## Response Language

Respond in Korean. Keep code identifiers, file paths, commands, and error messages in their original language.

## Start Every Task

1. Check `git status --short` before editing.
2. Treat pre-existing dirty files as user-owned. Do not revert or stage them unless the user explicitly asks.
3. Read `docs/progress.txt`, `docs/features-list.md`, and the relevant file under `docs/specs/` before changing behavior.
4. If the request touches UI, also follow `.claude/skills/design-system/SKILL.md`.
5. If the request changes a shipped feature, decide up front which tests and docs must change.

## Root Cause First

Never patch symptoms as a default response. Investigate the producing code path, identify why the wrong state exists, and fix the source.

Avoid these patterns unless the source has already been fixed and the guard is still semantically required:

- fallback-to-empty data
- broad `try/catch` wrappers
- null guards that hide missing required data
- reload-based state recovery
- silent best-effort behavior in authoritative workflows

If the correct source fix is too large for the current request, stop and explain the root cause plus a scoped implementation plan.

## Project Architecture

- Frontend: Next.js 15 App Router under `src/`
- Backend: NestJS API under `webhard-api/`, prefix `/api/v1`
- Database: PostgreSQL through Prisma in `webhard-api/`
- Storage: Google Drive through the NestJS storage provider for new webhard files; Cloudflare R2 remains for portfolio images and legacy compatibility
- Deployment: Vercel frontend, Railway backend

Next.js must not access PostgreSQL directly. All database operations go through the NestJS API.

## Implementation Rules

- No `any`; use explicit types.
- No relative imports in `src/`; use `@/`.
- No `console.log`; use the project logger.
- No raw React Query keys; use `@/lib/react-query/queryKeys.ts`.
- No `dark:` Tailwind classes; CSS variables handle themes.
- New UI must prefer components from `@/components/ui/`.
- Do not use `window.location.reload()` for state repair; invalidate or update the relevant React Query state.
- Always return cleanup from realtime or subscription `useEffect` blocks.

## Security Rules

- Never print or commit `.env.local` values, session secrets, API keys, presigned URLs, password hashes, or tokens.
- File upload changes must preserve extension, MIME, size, storage provider identity, Drive file/folder ids or R2 keys, and path traversal protections.
- Webhard access changes must preserve `companyId` ownership, external-webhard visibility filtering, and admin/company/worker boundary checks.
- Admin, company, worker, and API-key auth paths must stay separate. Tests should name the actor being verified.
- Database migrations need a clear execution target, backup/drain plan, and rollback or recovery path.

## Testing Strategy And AI QA

Before behavior changes, choose the smallest reliable test layer and state it in
the plan or final report: unit, integration/API, component, E2E UI, AI browser
QA, or a deliberate combination.

- Prefer test-first development for auth, permission, `companyId` ownership,
  webhard visibility, upload/download, Google Drive/R2 storage, and bug fixes.
  The new or changed test should fail for the expected reason before the
  implementation fix.
- Use backend integration/API tests for admin/company/worker boundaries,
  storage provider metadata, presigned/download permissions, and DB ownership
  rules.
- Use frontend unit/component tests for form validation, role-gated controls,
  React Query invalidation/update behavior, and recoverable UI errors.
- Use Playwright E2E UI tests only for critical browser journeys: role login,
  webhard navigation, upload/download, dashboard refresh, worker delivery, and
  responsive overflow smoke.
- Use Codex Browser, GStack QA, or similar AI browser tools for exploratory QA,
  bug reproduction, screenshots, and interaction validation. They do not
  replace committed tests that can run again in CI.
- When AI browser QA finds a bug, capture repro steps and add a regression test
  at the lowest meaningful layer. Use E2E UI only when the failure depends on
  real browser/user interaction.

## Verification

Pick the narrowest verification that proves the change:

- Frontend type safety: `npx tsc --noEmit`
- Frontend unit tests: `pnpm test -- --testPathPattern="<path>"`
- Backend type safety: `cd webhard-api && npx tsc --noEmit`
- Backend unit tests: `cd webhard-api && pnpm test -- <pattern>`
- UI E2E inventory: `pnpm test:e2e:ui -- --list`
- UI E2E execution: `pnpm test:e2e:ui -- --reporter=line`
- E2E or browser validation for auth, webhard, upload/download, routing, and user-visible UI flows

If a verification command cannot be run, state why and what risk remains.

## Documentation Sync

After behavior changes, update the matching docs:

- Feature state: `docs/features-list.md`
- Session state: `docs/progress.txt`
- User-visible or operational changes: `docs/changelog/CHANGELOG.md`
- Feature/API/DB contract changes: `docs/specs/**`

Use `docs/workflows/codex-development-workflow.md` for the full development workflow.

## Parent Review Directives

When the parent project assigns a directive from `docs/parent-review/`, treat that
document as the task brief. Before editing, read `PROJECT_STATUS.md`,
`docs/parent-review/README.md`, the relevant directive file, and the normal
project context listed above. After completion, update the directive status and
any changed source status docs before reporting back to the parent project.

## Git

Before modifying code, create and switch to a new task branch from the current base branch. Use a short, descriptive branch name such as `codex/<task-summary>` or `fix/<bug-summary>`.

If the working tree already has user-owned dirty files, do not move, stage, or revert them. Create the branch only when it can be done without disturbing those changes; otherwise explain the blocker and keep the requested edit scoped.

Commit only when the user explicitly asks. Stage only files that belong to the current task. Leave unrelated dirty files untouched.

Commit messages are Korean:

```text
<type>: <제목>

- 변경사항
```

Use `docs:` for documentation-only workflow changes.
