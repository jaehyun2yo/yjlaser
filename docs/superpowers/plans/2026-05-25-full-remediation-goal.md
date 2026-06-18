# YJ Laser Full Remediation Goal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for parallel ticket work where write scopes are disjoint, or `superpowers:executing-plans` for inline execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the full security, performance, design, and maintainability remediation program for YJ Laser with tests first, clear success/failure gates, independent expert review, and no accidental changes to user-owned dirty files.

**Architecture:** Treat the work as one program but ship it through ordered release trains. Train 1 stabilizes identity, authorization, and mutation boundaries before side effects; Train 2 removes the highest-impact performance and user-facing correctness risks; Train 3 reduces future patch cost through smaller services/components, static gates, and docs sync.

**Tech Stack:** Next.js 15 App Router, React, Jest, React Query, NestJS, Prisma, PostgreSQL, Cloudflare R2, Socket.IO, PowerShell verification commands.

---

## GOAL Execution Objective

Use this exact objective when creating or resuming the Codex GOAL:

```text
In C:\Users\jaehy\OneDrive\Desktop\dev\projects\yjlaser\yjlaser_website, execute docs/superpowers/plans/2026-05-25-full-remediation-goal.md end-to-end. Preserve pre-existing user-owned dirty files. Use TDD for every behavior change. First make the existing RED security tests GREEN, then proceed through performance, design, maintainability, docs, and final independent review. Use team agents for security, performance, design, maintainability, and final review when available. Do not stage or commit unless the user explicitly asks.
```

## Non-Negotiable Rules

- Start each execution session with `git status --short`.
- Do not revert, stage, or overwrite these pre-existing user-owned dirty files unless the user explicitly asks: `docs/changelog/CHANGELOG.md`, `docs/progress.txt`, `src/components/home/ProcessSection.tsx`.
- Task 18 may merge verified progress/changelog entries into `docs/changelog/CHANGELOG.md` and `docs/progress.txt` only after re-reading the current files and preserving existing user edits. This is a merge-only docs sync allowance, not permission to discard or restage unrelated dirty content.
- Treat these current RED-test artifacts as current-task owned: `docs/workflows/security-remediation-test-plan.md`, `tests/security/middleware-auth-boundary.test.ts`, `src/__tests__/api/security-mutation-routes.test.ts`, `src/__tests__/api/portfolio/portfolio-api.test.ts`, `src/__tests__/lib/styles/literal-classname-static-gate.test.ts`, `webhard-api/src/auth/guards/admin.guard.spec.ts`, `webhard-api/src/integration/auth/api-key.guard.spec.ts`.
- Do not print secret values, API keys, password hashes, session cookies, presigned URLs, or tokens.
- Do not let a rejected auth path call NestJS, R2, push send, sync control, DB mutations, or websocket room joins.
- Do not use `window.location.reload()` for state repair.
- Do not add `any`; model actors and route contracts explicitly.
- Do not add raw React Query keys; use `src/lib/react-query/queryKeys.ts`.
- Do not add `dark:` Tailwind classes; use design tokens.
- Do not commit or stage unless the user explicitly asks.

## Team Agent Model

Use agents as independent workers/reviewers, not as duplicate investigators.

- Security worker/reviewer: owns Train 1 threat model, auth boundaries, API principal separation, worker ACL, and realtime room access.
- Performance worker/reviewer: owns Train 2 payload/query/memory tests and implementations.
- Design worker/reviewer: owns `className` interpolation, design-system gates, keyboard/focus/browser QA.
- Maintainability worker/reviewer: owns Train 3 split/refactor/static-gate/doc sync.
- Final review agent: fresh-context review after all trains; Critical/Important findings must be fixed and re-reviewed before completion.

When spawning coding workers, give each worker a disjoint write set. Every worker must report changed files and verification commands.

## Execution Locks

Do not run tasks that touch the same lock in parallel.

| Lock                   | Sequential tasks                       | Reason                                                                                                |
| ---------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `worker-dashboard-ui`  | Task 5, Task 10, Task 13, Task 14      | `src/app/worker/dashboard/page.tsx` and worker dashboard hooks/components overlap.                    |
| `worker-access-policy` | Task 4, Task 8, Task 10                | Worker-visible contact/file scope is reused by HTTP routes, realtime rooms, and dashboard payloads.   |
| `webhard-upload`       | Task 11, Task 12, Task 17              | Webhard list/upload UI and R2 presign policy can conflict.                                            |
| `contacts-controller`  | Task 4, Task 10, Task 12, Task 15      | `webhard-api/src/contacts/contacts.controller.ts` and related contact policy/service changes overlap. |
| `docs-sync`            | Task 18 only                           | User-owned dirty docs require merge-only edits after implementation is verified.                      |
| `auth-principal`       | Task 1, Task 2, Task 3, Task 4, Task 8 | Actor modeling must stabilize before downstream policy changes.                                       |

Parallel execution is allowed only across different locks, for example dependency audit triage can run beside design static-gate cleanup, but not beside code that changes the same package lockfile or UI files.

## Program Completion Gates

The GOAL is complete only when all of these are true:

- Train 1 actor matrix tests pass for anonymous, forged cookie, company session, worker session, integration API key, and admin session.
- Train 2 has measurable tests or static gates proving the largest performance and user-facing correctness risks are removed.
- Train 3 has behavior-preserving tests for refactors and docs that match current contracts.
- Frontend and backend type checks pass.
- `git diff --check` passes.
- Independent final review has no unresolved Critical or Important findings.
- Skipped checks, if any, are named with residual risk.

## Baseline Commands

- [ ] Run workspace status:

```powershell
git status --short
```

Expected: user-owned dirty files remain visible and are not modified unless explicitly in scope.

- [ ] Re-run current RED baseline:

```powershell
pnpm test -- --runTestsByPath tests/security/middleware-auth-boundary.test.ts src/__tests__/api/security-mutation-routes.test.ts src/__tests__/api/portfolio/portfolio-api.test.ts src/__tests__/lib/styles/literal-classname-static-gate.test.ts --runInBand
pnpm --dir webhard-api test -- src/auth/guards/admin.guard.spec.ts src/integration/auth/api-key.guard.spec.ts --runInBand
```

Expected before Train 1 implementation: FAIL for the known RED reasons documented in `docs/workflows/security-remediation-test-plan.md`.

---

## Train 1: P0 Security Gate

### Task 1: SEC-01 Edge-Safe Middleware Session Verification

**Files:**

- Create: `src/lib/auth/edge-session.ts`
- Modify: `middleware.ts`
- Modify: `src/lib/auth/session.ts`
- Modify: `src/lib/auth/erp-session.ts`
- Modify: `src/app/api/erp/session/route.ts`
- Test: `tests/security/middleware-auth-boundary.test.ts`

- [ ] Run the middleware RED test.

```powershell
pnpm test -- --runTestsByPath tests/security/middleware-auth-boundary.test.ts --runInBand
```

Expected before fix: forged `admin-session`, `company-session`, `erp-session`, or spoofed `x-forwarded-for` can pass.

- [ ] Implement `src/lib/auth/edge-session.ts` with an Edge-compatible HMAC verifier using `crypto.subtle.importKey`, `crypto.subtle.sign`, fixed-length hex comparison, and JSON payload extraction.

Required exported functions:

```ts
export type BrowserSessionKind = 'admin' | 'company';

export interface VerifiedBrowserSession {
  userType: BrowserSessionKind;
  userId: string | number;
}

export interface VerifiedWorkerSession {
  workerId: string;
  workerName: string;
  role?: string;
  workerType?: string | null;
}

export async function verifyBrowserSessionCookie(
  signedToken: string | undefined,
  expectedType: BrowserSessionKind
): Promise<VerifiedBrowserSession | null>;

export async function verifyWorkerSessionCookie(
  signedToken: string | undefined
): Promise<VerifiedWorkerSession | null>;
```

- [ ] Add session payload expiry tests before changing production code:
  - expired `exp` is rejected;
  - future `iat` beyond a small clock-skew window is rejected;
  - wrong `userType` or worker payload kind is rejected;
  - current legacy cookies without embedded `exp` are handled by a documented migration path and short-term compatibility window, not silently treated as permanent sessions;
  - rotated secret candidates can verify only during the configured rotation window.
- [ ] Modify `middleware.ts` so `/admin/*`, `/company/*`, and `/worker/*` validate signed cookies through `edge-session.ts` instead of checking only `token.signature` shape.
- [ ] Update `createSession()` and worker session creation so newly issued signed payloads include `iat`, `exp`, and expected actor kind. Keep runtime parsing backward compatible only for existing cookies that are still within the browser cookie max-age migration window.
- [ ] Remove the client-controlled `x-forwarded-for` bypass for `/admin/integration/workshop`; it must require a verified admin session like the rest of `/admin/*`.
- [ ] Re-run the middleware test.

Expected after fix: PASS. All rejected paths redirect before protected page rendering.

### Task 2: SEC-02 API Key Principal Must Not Be Admin

**Files:**

- Modify: `webhard-api/src/auth/auth.service.ts`
- Modify: `webhard-api/src/auth/guards/admin.guard.ts`
- Modify: `webhard-api/src/integration/auth/api-key.guard.ts`
- Modify tests as needed: `webhard-api/src/auth/guards/admin.guard.spec.ts`, `webhard-api/src/integration/auth/api-key.guard.spec.ts`

- [ ] Run the backend RED tests.

```powershell
pnpm --dir webhard-api test -- src/auth/guards/admin.guard.spec.ts src/integration/auth/api-key.guard.spec.ts --runInBand
```

Expected before fix: API key principal is modeled as `userType: 'admin'`, and `AdminGuard` accepts it.

- [ ] Extend the NestJS session user type so API key requests are modeled as an integration principal, for example:

```ts
type SessionUser =
  | { userType: 'admin'; userId: string | number; companyId?: number }
  | { userType: 'company'; userId: string | number; companyId: number }
  | {
      userType: 'worker';
      userId: string;
      workerId: string;
      workerName: string;
      workerType?: string | null;
    }
  | { userType: 'integration'; userId: string; programType: string; scopes?: string[] };
```

- [ ] Update `ApiKeyGuard` so a valid `X-API-Key` sets `request.user.userType = 'integration'` and keeps `request.apiKeyInfo`.
- [ ] Add scope/program tests before implementation:
  - revoked or unknown key returns 401 and does not set `request.user`;
  - valid key with the wrong `programType` or missing scope returns 403 on scoped endpoints;
  - integration websocket/API paths do not inherit admin-only room or controller access;
  - `request.apiKeyInfo` remains available for explicitly integration-scoped controllers.
- [ ] Update `AdminGuard` so it only accepts a verified admin session principal, not integration/API key principals.
- [ ] Run the backend tests again.

Expected after fix: PASS. Integration endpoints still accept valid API keys through `ApiKeyGuard`; admin-only guards reject them.

### Task 3: SEC-04 Next.js Mutation Routes Fail Closed Before Side Effects

**Files:**

- Modify: `src/app/api/_lib/route-authorization.ts`
- Modify: `src/app/api/push/send/route.ts`
- Modify: `src/app/api/push/subscribe/route.ts`
- Modify: `src/app/api/sync/control/route.ts`
- Modify: `src/app/api/portfolio/upload/route.ts`
- Test: `src/__tests__/api/security-mutation-routes.test.ts`
- Test: `src/__tests__/api/portfolio/portfolio-api.test.ts`

- [ ] Run the frontend mutation RED tests.

```powershell
pnpm test -- --runTestsByPath src/__tests__/api/security-mutation-routes.test.ts src/__tests__/api/portfolio/portfolio-api.test.ts --runInBand
```

Expected before fix: unauthenticated mutation routes can return 200 or call upstream side effects; company session can upload portfolio assets.

- [ ] Add route auth helpers that use existing session utilities:

```ts
export async function requireApiAdmin(): Promise<
  { ok: true; userId: string | number } | { ok: false; response: Response }
>;

export async function requireWorkerSelf(
  workerId: string
): Promise<{ ok: true; workerId: string; workerName: string } | { ok: false; response: Response }>;
```

- [ ] Apply route policy:
  - `/api/push/send`: admin-only.
  - `/api/push/subscribe` POST/DELETE: verified worker may mutate only its own `workerId`; admin maintenance is allowed only if explicitly modeled through `requireApiAdmin()`.
  - `/api/sync/control`: admin-only. Do not add an internal credential path in this train; if machine-to-machine sync control is later required, create a separate signed request contract with TTL, replay protection, env separation, and negative tests.
  - `/api/portfolio/upload`: admin-only; use `getSessionUser()` and require `userType === 'admin'` before parsing `formData()` or calling `createAndUploadVariants`.
- [ ] Re-run the mutation tests.

Expected after fix: PASS. Rejected requests do not call `serverGetPushSubscriptions`, `serverUpsertPushSubscription`, `nestjsFetch`, global `fetch`, or `createAndUploadVariants`.

### Task 4: SEC-03A/SEC-03B Worker Contact and Webhard ACL

**Files:**

- Create: `webhard-api/src/worker-access/worker-contact-access.service.ts`
- Create: `webhard-api/src/worker-access/worker-access.module.ts`
- Create: `webhard-api/src/contacts/contacts.worker-acl.spec.ts`
- Create: `webhard-api/src/files/files.worker-acl.spec.ts`
- Modify: `webhard-api/src/contacts/contacts.module.ts`
- Modify: `webhard-api/src/files/files.module.ts`
- Modify: `webhard-api/src/contacts/contacts.controller.ts`
- Modify: `webhard-api/src/contacts/drawing-revision.service.ts`
- Modify: `webhard-api/src/files/files.controller.ts`
- Modify: `webhard-api/src/files/files.service.ts`
- Modify if needed: `src/__tests__/api/worker-auth-boundary.test.ts`
- Modify worker proxy routes under `src/app/api/worker/**`

- [ ] Add backend tests for negative UUID access:

```powershell
pnpm --dir webhard-api test -- src/contacts/contacts.worker-acl.spec.ts src/files/files.worker-acl.spec.ts --runInBand
```

Expected before fix: FAIL if a verified worker can access unrelated contact/file/folder UUIDs, a valid UUID from another company, an external-webhard item outside worker visibility, or a file while stale admin/company cookies are also present.

- [ ] Implement `WorkerAccessModule` and export `WorkerContactAccessService`. Import this module into `ContactsModule` and `FilesModule`; the service should depend on `PrismaService` and policy helpers, not on `ContactsService`, so it does not create a Contacts/Files circular dependency.
- [ ] Implement `WorkerContactAccessService` as the single server-side policy. It must answer:

```ts
canReadContact(worker: SessionUser, contactId: string): Promise<boolean>
canMutateContact(worker: SessionUser, contactId: string): Promise<boolean>
canAccessFile(worker: SessionUser, fileId: string): Promise<boolean>
canAccessFolder(worker: SessionUser, folderId: string): Promise<boolean>
```

Policy source: reuse the same backend criteria that decide whether a contact appears in worker-facing lists. If a contact/file/folder is not reachable from that worker-visible contact set, return 403 before presigned URL creation, upload URL creation, status mutation, note creation, urgent toggle, inquiry classification, or split/stage completion.

- [ ] Test the real bypass matrix:
  - valid contact UUID from another company returns 403;
  - valid file/folder UUID under an external-webhard branch that is not worker-visible returns 403;
  - worker-visible contact but non-public/private company file outside that contact returns 403;
  - browser request with verified worker cookie plus stale admin/company cookies still resolves as worker and does not inherit admin/company access;
  - allowlisted worker contact/file access still returns 200.
- [ ] Wire contact read/mutation endpoints that allow worker sessions through the policy before calling service mutations.
- [ ] Wire file/folder read/download paths through the policy before presigned URL retrieval.
- [ ] Extend `src/__tests__/api/worker-auth-boundary.test.ts` with arbitrary UUID negative cases for worker file list/download and drawing revision upload URL paths.
- [ ] Run focused worker ACL tests.

Expected after fix: PASS. Worker can access only verified and visible contact/file/folder scope.

### Task 5: SEC-05 QA Mutation Surface Cannot Ship to Production Worker UI

**Files:**

- Create: `src/__tests__/actions/qa-test-auth.test.ts`
- Modify: `src/app/actions/qa-test.ts`
- Modify: `src/app/worker/_components/QATestPanel.tsx`
- Modify: `src/app/worker/dashboard/page.tsx`
- Inspect: `src/app/(admin)/admin/contacts/TestNewContactButton.tsx`
- Inspect: `src/app/api/admin/test-contacts/route.ts`
- Inspect: `src/app/api/admin/test-contacts/delete-all/route.ts`

- [ ] Add tests proving `createQATestContacts()` and `deleteQATestContacts()` fail closed in production for worker sessions.

```powershell
pnpm test -- --runTestsByPath src/__tests__/actions/qa-test-auth.test.ts --runInBand
```

Expected before fix: FAIL if production worker calls can create/delete QA contacts.

- [ ] Add a server-side production guard to `src/app/actions/qa-test.ts`. Production must return an explicit failure before any NestJS call.
- [ ] Hide `QATestPanel` from production worker dashboard. Development-only render is acceptable.
- [ ] If this task touches `QATestPanel`, fix only that component's literal class interpolation using `cn(...)` or style constants. Do not make the full repository literal-class static gate a Train 1 blocker.
- [ ] Keep admin test-contact controls admin-authenticated and development-gated where destructive.
- [ ] Re-run the QA action tests.

Expected after fix: PASS. Production worker UI cannot render or invoke QA mutation controls.

### Task 6: SEC-06 Secret Fallback Static Gate and Fail-Closed Env Paths

**Files:**

- Create: `tests/security/secret-fallback-static-gate.test.ts`
- Modify: `src/lib/utils/env.ts`
- Modify: `src/lib/api/nestjs/core.client.ts`
- Modify any route/client file reported by the new static gate.
- Docs: `docs/security/secret-rotation-runbook.md`

- [ ] Add the static gate to search production source for hardcoded secret fallback literals and development API-key fallbacks outside explicitly allowed test fixtures.

```powershell
pnpm test -- --runTestsByPath tests/security/secret-fallback-static-gate.test.ts --runInBand
```

Expected before fix: FAIL if production code contains hardcoded API key/session/recovery fallback literals.

- [ ] Make production/staging/test env-missing paths fail closed. Development-only fallbacks must be loopback-only and clearly named.
- [ ] Add `docs/security/secret-rotation-runbook.md` with rotation steps that name secret categories without printing values.
- [ ] Re-run the static gate.

Expected after fix: PASS. No secret literal leaks into production source or docs.

### Task 7: SEC-07 Dependency Audit Triage

**Files:**

- Create: `docs/security/dependency-audit-2026-05-25.md`
- Modify: `package.json`, `pnpm-lock.yaml`, `webhard-api/package.json`, or `webhard-api/pnpm-lock.yaml` only when a production-runtime fix requires it.

- [ ] Run production audits:

```powershell
pnpm audit --prod --audit-level high
pnpm --dir webhard-api audit --prod --audit-level high
```

- [ ] Classify each critical/high finding as `production-runtime`, `build-only`, or `dev-only`.
- [ ] Fix production-runtime critical/high findings by upgrading or replacing the package.
- [ ] Document non-runtime exceptions with package, advisory id, reachability, owner, and expiry date.

Expected after fix: production-runtime critical/high findings are zero, or a documented non-runtime exception exists.

### Task 8: SEC-08 Realtime Gateway Session Verification

**Files:**

- Modify/create specs for:
  - `webhard-api/src/contacts/contacts.gateway.spec.ts`
  - `webhard-api/src/events/__tests__/events.gateway.spec.ts`
  - `webhard-api/src/notifications/notifications.gateway.spec.ts`
  - `webhard-api/src/bookings/bookings.gateway.spec.ts`
  - `webhard-api/src/activity-logs/activity-logs.gateway.spec.ts`
  - `webhard-api/src/feedback/feedback.gateway.spec.ts`
  - `webhard-api/src/integration/gateway/integration.gateway.spec.ts`
- Modify gateway files where tests prove forged sessions can join rooms.

- [ ] Add or extend gateway tests so forged admin/company/worker cookies cannot join private rooms and cannot receive private events.

```powershell
pnpm --dir webhard-api test -- contacts.gateway.spec.ts events.gateway.spec.ts notifications.gateway.spec.ts bookings.gateway.spec.ts activity-logs.gateway.spec.ts feedback.gateway.spec.ts integration.gateway.spec.ts --runInBand
```

Expected before fix: any gateway that accepts cookie presence or wrong actor session fails.

- [ ] Fix gateway connection handling so every private room join uses verified sessions or scoped API credentials.
- [ ] Add cross-scope realtime tests before implementation:
  - valid company session cannot join another company room;
  - valid worker session cannot join another worker's private room;
  - valid worker session cannot join a contact/folder room outside `WorkerContactAccessService`;
  - integration credentials cannot join admin rooms unless an explicit scoped integration room is defined and tested.
- [ ] Define room ACL source per gateway in test names: admin session, company ownership, worker access policy, or integration scope.
- [ ] Reconcile the root backlog entry about Socket.IO ERP session verification with current `ContactsGateway` behavior. If the backlog entry is outdated, update docs/progress after verification; if not, fix `ContactsGateway` in this task.

Expected after fix: PASS. Realtime private room joins are scoped and forged cookies disconnect.

### Task 9: Train 1 Security Review Gate

**Files:**

- Review only. No default production file edits.

- [ ] Confirm every Train 1 route has a negative actor test and a positive allowed actor test.
- [ ] Confirm every Train 1 rejection happens before side effects.
- [ ] Confirm no full design-system/static cleanup is mixed into the security diff beyond files already touched by security tasks.
- [ ] Spawn an independent security reviewer and project-standards reviewer for the Train 1 diff.
- [ ] Fix every Critical or Important finding and re-run the affected focused tests.

Expected after fix: Train 1 is reviewable as a security release gate; full literal class cleanup remains in Train 3.

### Deferred UI-AUDIT-01 Note

The full repository `className` interpolation static gate is part of the full remediation program, but not a Train 1 security blocker. It is executed in Task 17 unless a Train 1 task modifies a reported file, in which case that file must be fixed locally while it is already open.

### Train 1 Final Verification

- [ ] Run all Train 1 focused tests:

```powershell
pnpm test -- --runTestsByPath tests/security/middleware-auth-boundary.test.ts src/__tests__/api/security-mutation-routes.test.ts src/__tests__/api/portfolio/portfolio-api.test.ts src/__tests__/actions/qa-test-auth.test.ts src/__tests__/api/worker-auth-boundary.test.ts tests/security/secret-fallback-static-gate.test.ts --runInBand
pnpm --dir webhard-api test -- src/auth/guards/admin.guard.spec.ts src/integration/auth/api-key.guard.spec.ts src/contacts/contacts.worker-acl.spec.ts src/files/files.worker-acl.spec.ts --runInBand
npx tsc --noEmit
pnpm --dir webhard-api exec tsc --noEmit
git diff --check
```

Expected: all commands PASS.

- [ ] Spawn independent security/code review agent for Train 1 diff. Fix Critical/Important findings and re-review.

---

## Train 2: P1 Performance and User-Facing Correctness

### Task 10: PERF-01/PERF-02 Worker Dashboard Payload and Delivered Search

**Files:**

- Create: `src/__tests__/actions/process-board-performance.test.ts`
- Modify: `src/app/actions/process-board.ts`
- Modify: `src/app/worker/_lib/hooks.ts`
- Modify: `src/app/worker/dashboard/page.tsx`
- Modify: `src/app/worker/delivery/page.tsx`
- Modify: `webhard-api/src/contacts/contacts.controller.ts`
- Modify: `webhard-api/src/contacts/contacts.service.ts`
- Modify: `webhard-api/src/contacts/contacts.service.spec.ts`

- [ ] Add tests proving first paint does not fetch all three worker lists with `limit: 1000`.
- [ ] Add tests proving delivered search uses server-side filtering, `limit: 20`, and a query key that includes the search string.
- [ ] Change `src/app/worker/_lib/hooks.ts` so the field, office, and unclassified queries accept an explicit `enabled`/`active` option and do not all run merely because `_hydrated && !!workerSession` is true.
- [ ] Change `src/app/worker/dashboard/page.tsx` so only the active tab's list query is enabled on first paint; counts use a lightweight endpoint or summary action.
- [ ] Implement active-tab fetch and lightweight counts.
- [ ] Implement delivered search payload reduction and timeline lazy fetch.
- [ ] Run:

```powershell
pnpm test -- --runTestsByPath src/__tests__/actions/process-board-performance.test.ts --runInBand
pnpm --dir webhard-api test -- contacts.service.spec.ts contacts.controller.spec.ts --runInBand
```

Expected: PASS. Worker dashboard avoids broad initial payloads.

### Task 11: PERF-03/PERF-06 Webhard Folder Metadata and Infinite Loading

**Files:**

- Create: `webhard-api/src/folders/folders.latest-metadata.spec.ts`
- Create or extend: `src/app/webhard/__tests__/webhard-infinite-loading.test.tsx`
- Modify: `webhard-api/src/folders/folders.service.ts`
- Modify: `webhard-api/src/folders/folders.controller.ts`
- Modify: `src/app/webhard/hooks/useWebhardFiles.ts` or the active file-query hook.
- Modify: `src/app/webhard/components/WebhardMain.tsx`
- Modify: `src/lib/react-query/queryKeys.ts`

- [ ] Add a backend test proving latest folder metadata is computed by summary/window query and does not load full descendant file sets per folder.
- [ ] Add a frontend test proving a 75+ item folder renders through pagination/infinite loading.
- [ ] Implement summary metadata query and infinite file/folder loading using `queryKeys.webhard.*`.
- [ ] Run:

```powershell
pnpm --dir webhard-api test -- folders.latest-metadata.spec.ts folders.service.spec.ts --runInBand
pnpm test -- --runTestsByPath src/app/webhard/__tests__/webhard-infinite-loading.test.tsx src/__tests__/lib/react-query/queryKeys.test.ts --runInBand
```

Expected: PASS. Webhard no longer depends on full-folder eager reads for normal views.

### Task 12: PERF-04/PERF-07 Latest Drawing and Large Upload Memory

**Files:**

- Create or extend: `webhard-api/src/contacts/drawing-revision.service.spec.ts`
- Create: `src/__tests__/app/actions/webhard-folder-upload.test.ts`
- Create: `src/__tests__/lib/utils/uploadQueue-security.test.ts`
- Modify: `webhard-api/src/contacts/drawing-revision.service.ts`
- Modify: `webhard-api/src/contacts/contacts.controller.ts`
- Modify: `src/app/actions/webhard-folder-upload.ts`
- Modify: `src/app/webhard/components/FolderUploadModal.tsx`
- Modify: `src/lib/r2/upload.ts`
- Modify: `src/lib/utils/uploadQueue.ts`
- Modify: `src/app/webhard/hooks/useFileUpload.ts`

- [ ] Add tests proving latest drawing retrieval fetches only the latest uploaded revision for the contact.
- [ ] Add static/unit tests blocking large-folder upload paths that call `file.arrayBuffer()` inside Server Actions.
- [ ] Add upload security tests before implementation:
  - unauthorized or wrong-actor folder upload requests create no presigned URL or multipart session;
  - company user can upload only into owned/visible company folders;
  - admin upload requires explicit target company/folder policy;
  - extension, MIME, size, and path traversal checks run before R2 key creation;
  - presigned URL TTL and R2 key prefix are scoped to the authorized folder/company;
  - rejected files never call R2 upload helpers or metadata creation.
- [ ] Rewire `FolderUploadModal.tsx` away from direct `uploadFolderFileAction` for large file content transfer. Reuse or extend `src/lib/utils/uploadQueue.ts` for presigned/multipart browser upload, then call a server action/API only to create folder structure and finalize metadata.
- [ ] Keep `uploadFolderFileAction` only for metadata/folder orchestration or small legacy compatibility after authz; it must not call `file.arrayBuffer()` for the large-folder path.
- [ ] Implement latest-only query and direct presigned/multipart upload queue for large folder uploads.
- [ ] Run:

```powershell
pnpm --dir webhard-api test -- drawing-revision.service.spec.ts contacts.controller.spec.ts --runInBand
pnpm test -- --runTestsByPath src/__tests__/app/actions/webhard-folder-upload.test.ts src/__tests__/lib/utils/uploadQueue-security.test.ts --runInBand
```

Expected: PASS. Large uploads do not force whole-file buffers through Server Actions.

### Task 13: A11Y-01/A11Y-02/A11Y-03 High-Traffic Interaction QA

**Files:**

- Create: `src/__tests__/a11y/keyboard-focus-contracts.test.tsx`
- Modify high-traffic components reported by the test, starting with worker dashboard, webhard modals, and admin process board controls.

- [ ] Add keyboard/focus tests for tab order, modal focus trap, Escape close, focus-visible rings, and button semantics.
- [ ] Fix components using `@/components/ui/` where possible.
- [ ] Run:

```powershell
pnpm test -- --runTestsByPath src/__tests__/a11y/keyboard-focus-contracts.test.tsx --runInBand
```

Expected: PASS. Keyboard and focus behavior is stable in high-traffic flows.

### Train 2 Final Verification

- [ ] Run focused Train 2 tests plus type checks:

```powershell
pnpm test -- --runTestsByPath src/__tests__/actions/process-board-performance.test.ts src/app/webhard/__tests__/webhard-infinite-loading.test.tsx src/__tests__/app/actions/webhard-folder-upload.test.ts src/__tests__/a11y/keyboard-focus-contracts.test.tsx --runInBand
pnpm --dir webhard-api test -- contacts.service.spec.ts contacts.controller.spec.ts folders.latest-metadata.spec.ts folders.service.spec.ts drawing-revision.service.spec.ts --runInBand
npx tsc --noEmit
pnpm --dir webhard-api exec tsc --noEmit
git diff --check
```

Expected: all commands PASS.

- [ ] Spawn performance and design review agents for Train 2 diff. Fix Critical/Important findings and re-review.

---

## Train 3: P2 Maintainability, Design System, Docs

### Task 14: ARCH-01 Split Oversized Frontend Surfaces Without Behavior Change

**Files:**

- Modify one surface at a time:
  - `src/app/contact/ContactForm.tsx`
  - `src/app/webhard/components/WebhardMain.tsx`
  - `src/app/worker/dashboard/page.tsx`
- Create or extend:
  - `src/app/contact/_lib/contactSubmission.ts`
  - `src/app/webhard/hooks/useWebhardContextMenuActions.ts`
  - `src/app/webhard/hooks/useWebhardUploadPrompt.ts`
  - `src/app/worker/_lib/useWorkerSearchResults.ts`
  - `src/app/worker/_lib/workerContactFilters.ts`
- Extend existing tests under `src/__tests__/**` and `src/app/**/__tests__/**`.

- [ ] Stop condition for `ContactForm.tsx`: submission payload creation, reference-photo promotion, and visit/delivery validation live in `contactSubmission.ts`/submit hook; if already true, add a characterization test and mark this surface no-op.
- [ ] Stop condition for `WebhardMain.tsx`: context-menu action handlers and upload-after-link prompt state are outside the main component; the main component remains responsible for layout/composition, not mutation orchestration.
- [ ] Stop condition for `worker/dashboard/page.tsx`: search-result assembly and tab/contact filtering live in `_lib` hooks/helpers; the page owns screen composition and passes active-tab state into query hooks.
- [ ] Pick one file per iteration and write a behavior-preserving characterization test before extracting.
- [ ] Extract only one responsibility per patch and do not combine frontend refactor with Train 1 auth changes.
- [ ] Run the affected test plus `npx tsc --noEmit`.

Expected: PASS with no route/UI behavior change.

### Task 15: ARCH-02 Split Backend Services by Use Case

**Files:**

- Modify one service group at a time:
  - `webhard-api/src/contacts/contacts.service.ts`
  - `webhard-api/src/folders/folders.service.ts`
  - `webhard-api/src/files/files.service.ts`
- Existing examples to follow:
  - `webhard-api/src/folders/folder-path.service.ts`
  - `webhard-api/src/files/badge-counts.service.ts`

- [ ] Stop condition for contacts: worker access policy exists in `webhard-api/src/worker-access/worker-contact-access.service.ts`, drawing revision access remains in `DrawingRevisionService`, and `ContactsController` no longer embeds multi-actor policy branches directly in handlers touched by Train 1.
- [ ] Stop condition for folders: latest file metadata logic introduced by Task 11 lives in a focused helper/service with tests; `FoldersService.getFolders` no longer performs per-folder descendant scans for the normal list path.
- [ ] Stop condition for files: worker file/folder ACL and upload/presign policy are delegated to policy services; `FilesService` public controller-facing methods stay stable.
- [ ] Add or extend use-case service specs before moving code.
- [ ] Extract one cohesive service at a time and stop once the above three stop conditions are met; do not continue extracting solely to reduce line count.
- [ ] Preserve controller-facing public method contracts.
- [ ] Run:

```powershell
pnpm --dir webhard-api test -- contacts.service.spec.ts folders.service.spec.ts files.service.spec.ts badge-counts.service.spec.ts folder-path.service.spec.ts --runInBand
pnpm --dir webhard-api exec tsc --noEmit
```

Expected: PASS. Refactors are behavior-preserving and reduce service coupling.

### Task 16: DX-01/TYPE-01 Static Gates for Imports, Query Keys, and `any`

**Files:**

- Create: `tests/static/import-boundary-static-gate.test.ts`
- Create: `tests/static/no-explicit-any-static-gate.test.ts`
- Extend: `src/__tests__/lib/styles/static-gate.test.ts`
- Modify production files reported by the gates.

- [ ] Add static gates:
  - `src/` production imports must use `@/` rather than relative cross-directory imports.
  - Production React Query keys must use `src/lib/react-query/queryKeys.ts`.
  - New or touched production code must not add explicit `any`.
- [ ] Run:

```powershell
pnpm test -- --runTestsByPath tests/static/import-boundary-static-gate.test.ts tests/static/no-explicit-any-static-gate.test.ts src/__tests__/lib/styles/static-gate.test.ts --runInBand
```

Expected: PASS. New debt is blocked; legacy exceptions are named and scoped if the project cannot clear all existing debt in one pass.

### Task 17: UI-AUDIT-02 Design System Debt Migration

**Files:**

- Test: `src/__tests__/lib/styles/literal-classname-static-gate.test.ts`
- Modify files reported by design static gates.
- Prefer components from `src/components/ui/`.
- Docs: `docs/specs/features/design-system.md`

- [ ] Run the literal class static gate.

```powershell
pnpm test -- --runTestsByPath src/__tests__/lib/styles/literal-classname-static-gate.test.ts --runInBand
```

Expected before fix: FAIL with the exact production source file/line list.

- [ ] Replace literal `className="...${...}"` or equivalent interpolation with `cn(...)`, existing style constants, or semantic token utilities.
- [ ] Do not change visual intent while fixing the static gate.
- [ ] Keep changed-file gate strict for `dark:` and raw brand hex.
- [ ] Migrate existing debt in small batches by surface: worker, company, admin, webhard, public.
- [ ] Browser QA each user-visible surface after migration.

Expected: literal class interpolation static gate passes, changed files have no `dark:` classes, no raw brand hex unless documented as token source, no nested card layouts, and no text overlap at desktop/mobile widths.

### Task 18: DOCS-01 Specs, Changelog, and Progress Sync

**Files:**

- Modify: `docs/features-list.md`
- Modify: `docs/progress.txt`
- Modify: `docs/changelog/CHANGELOG.md`
- Modify relevant specs:
  - `docs/specs/api/nextjs-routes.md`
  - `docs/specs/api/nestjs-endpoints.md`
  - `docs/specs/features/webhard-system.md`
  - `docs/specs/features/worker-hardening-roadmap.md`
  - `docs/specs/features/design-system.md`

- [ ] Update docs only after behavior is verified.
- [ ] Preserve user-owned doc edits by reading current file content before patching.
- [ ] For `docs/progress.txt` and `docs/changelog/CHANGELOG.md`, append or merge the new verified entry around existing content. Do not normalize unrelated formatting, delete prior user edits, or treat the whole file as current-task owned.
- [ ] Document exact verification commands and results.
- [ ] Run:

```powershell
git diff --check
```

Expected: docs match implemented behavior and contain no secret values.

### Train 3 Final Verification

- [ ] Run static gates, broad focused tests, and type checks:

```powershell
pnpm test -- --runTestsByPath tests/static/import-boundary-static-gate.test.ts tests/static/no-explicit-any-static-gate.test.ts src/__tests__/lib/styles/static-gate.test.ts src/__tests__/lib/styles/literal-classname-static-gate.test.ts --runInBand
npx tsc --noEmit
pnpm --dir webhard-api exec tsc --noEmit
git diff --check
```

Expected: all commands PASS.

- [ ] Spawn maintainability and project-standards review agents for Train 3 diff. Fix Critical/Important findings and re-review.

---

## Full Program Final Review

- [ ] Run all required checks:

```powershell
pnpm test -- --runInBand
pnpm --dir webhard-api test -- --runInBand
npx tsc --noEmit
pnpm --dir webhard-api exec tsc --noEmit
pnpm audit --prod --audit-level high
pnpm --dir webhard-api audit --prod --audit-level high
git diff --check
```

Expected: PASS, except audit findings documented as non-runtime exceptions with owner and expiry.

- [ ] Run browser QA for the affected user-visible flows:
  - Admin login and `/admin/*` redirect behavior.
  - Company login and `/company/dashboard`.
  - Worker login and `/worker/dashboard`.
  - Webhard list, upload, download, folder navigation.
  - Portfolio upload as admin and rejection as company.
  - Worker file/drawing access rejection for unrelated UUIDs.

- [ ] Spawn final review agents:
  - Security reviewer for auth/data exposure.
  - API contract reviewer for route and response compatibility.
  - Performance reviewer for payload/query/memory changes.
  - Design reviewer for UI/a11y surfaces.
  - Maintainability/project-standards reviewer for code structure and AGENTS compliance.

- [ ] Fix every Critical or Important review finding.
- [ ] Re-run only the affected focused tests after each fix, then rerun the full final check set.
- [ ] Produce a final report with changed files, verification evidence, review findings, unresolved risks, and docs updated.

## Completion Definition

This plan is not complete when only the first tests pass. It is complete when all trains are done, the full final review passes, and the final report names every verification command and residual risk.
