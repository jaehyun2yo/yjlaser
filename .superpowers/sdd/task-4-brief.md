### Task 4: Documentation and verification boundary

**Files:**

- Modify: `docs/contracts/device-auth-v1-desktop-integration.md`
- Modify: `yjlaser_website/docs/specs/api/endpoints/integration.md`
- Modify: `yjlaser_website/docs/changelog/CHANGELOG.md`

- [ ] **Step 1: Document terminal semantics**

Document the exact list/approve/revoke routes, safe field list, approval (`DeviceEnrollmentStatus`) and revoke (`ManagedDeviceSummary`) response distinction, admin+CSRF rule, zero-octet action-body requirement, 400/409/503 envelopes, and that a new enrollment code remains a separate one-time action. State that access-token immediate enforcement, token refresh, normal remote rotation, heartbeat, and desktop deployment remain blocked until the next control-plane plan.

- [ ] **Step 2: Run source-only verification**

Run:

```bash
cd yjlaser_website/webhard-api
pnpm exec jest --runInBand --no-cache src/integration/device-auth
pnpm exec tsc --noEmit --pretty false
pnpm build
$env:DATABASE_URL='postgresql://device_auth_validate:placeholder@127.0.0.1:5432/device_auth_validate?schema=public'; $env:DIRECT_URL=$env:DATABASE_URL; pnpm exec prisma validate
git diff --check
```

Expected: all source tests/typecheck/build/schema validation pass. No DB connection, migration deploy, secret lookup, actual device operation, or deployment occurs.

- [ ] **Step 3: Fresh-context review**

Review for raw secret/actor leakage, cross-environment lookup, revoked terminal-state race, credential-version handling, CSRF/API-key mixing, browser auto-retry, and accidental `computeroff` inclusion. Keep the reviewed diff unstaged until the user separately requests a commit.

## Spec Coverage Review

- Central manager list/approve/revoke: Tasks 1 and 2.
- Minimal data and environment separation: Global Constraints and Task 1.
- Admin session/CSRF/API-key separation: Global Constraints and Task 2.
- Company-site visibility and explicit remote action confirmation: Task 3.
- Source-only/no-operation boundary: Global Constraints and Task 4.
- Token exchange, bearer guard, access-token immediate revoke enforcement, normal remote rotation, heartbeat, and desktop version deployment are intentionally separate follow-on tasks because they require a distinct public transport protocol and client contract.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-20-company-device-admin-revoke-control.md`. The user directed autonomous agent execution, so use the recommended subagent-driven approach with fresh review after each task.
