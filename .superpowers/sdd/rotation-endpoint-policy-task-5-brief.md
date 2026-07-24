### Task 5: Route adapters and exact policy matrix

**Files:**

- Modify/Test approved route controllers only after their current class guards are captured by RED HTTP tests:
  - Modify: `webhard-api/src/files/files.controller.ts`
  - Create: `webhard-api/src/files/files.controller.device-auth.spec.ts`
  - Modify: `webhard-api/src/files/files.service.ts`
  - Modify: `webhard-api/src/files/files.service.spec.ts`
  - Modify: `webhard-api/src/files/files.module.ts`
  - Create: `webhard-api/src/files/files.module.device-auth.spec.ts`
  - Modify: `webhard-api/src/folders/folders.controller.ts`
  - Create: `webhard-api/src/folders/folders.controller.device-auth.spec.ts`
  - Modify: `webhard-api/src/folders/folders.service.ts`
  - Modify: `webhard-api/src/folders/folders.service.spec.ts`
  - Modify: `webhard-api/src/folders/folders.module.ts`
  - Create: `webhard-api/src/folders/folders.module.device-auth.spec.ts`
  - Modify: `webhard-api/src/integration/events/events.controller.ts`
  - Create: `webhard-api/src/integration/events/events.controller.device-auth.spec.ts`
  - Modify: `webhard-api/src/integration/events/events.module.ts`
  - Modify: `webhard-api/src/integration/orders/orders.controller.ts`
  - Create: `webhard-api/src/integration/orders/orders.controller.device-auth.spec.ts`
  - Modify: `webhard-api/src/integration/orders/orders.module.ts`
  - Modify: `webhard-api/src/integration/bank-notifications/bank-notifications.controller.ts`
  - Modify: `webhard-api/src/integration/bank-notifications/bank-notifications.controller.spec.ts`
  - Modify: `webhard-api/src/integration/bank-notifications/bank-notifications.module.ts`
- Create: `webhard-api/src/integration/auth/current-integration-principal.decorator.ts`
- Create: `webhard-api/src/integration/auth/current-integration-principal.decorator.spec.ts`
- Modify: `webhard-api/src/auth/guards/company-access.guard.ts`
- Modify: `webhard-api/src/auth/guards/company-access.guard.spec.ts`
- Create: `webhard-api/src/integration/auth/device-endpoint-policy.scope.spec.ts` covering bearer-only negatives for contacts, inventory, nesting-tasks, laser-completions, programs, admin device management and rotation routes.
- Create: `webhard-api/src/integration/auth/device-endpoint-policy.wiring.spec.ts` compiling every touched sibling module with exported `DeviceAuthModule`/shared auth providers.
- Modify (parent root): `docs/reports/2026-07-16-desktop-api-contract-inventory.md`
- Modify (clean RC): `docs/specs/api/endpoints/integration.md`

**Locked initial matrix:**

| Program                 | Method/path                                            | Disposition | Required permission        |
| ----------------------- | ------------------------------------------------------ | ----------- | -------------------------- |
| `external_webhard_sync` | `GET /folders/children`                                | approved    | `folder/read`              |
| `external_webhard_sync` | `POST /folders`                                        | approved    | `folder/write`             |
| `external_webhard_sync` | `PATCH /folders/:id/rename`                            | approved    | `folder/write`             |
| `external_webhard_sync` | `PATCH /folders/:id/move`                              | approved    | `folder/move`              |
| `external_webhard_sync` | `GET /files`                                           | approved    | `file/read`                |
| `external_webhard_sync` | `POST /files/presigned-url`                            | approved    | `file/write`               |
| `external_webhard_sync` | `POST /files/confirm`                                  | approved    | `file/write`               |
| `external_webhard_sync` | `PATCH /files/:id/rename`                              | approved    | `file/write`               |
| `external_webhard_sync` | `PATCH /files/:id/move`                                | approved    | `file/move`                |
| `management_program`    | `POST /integration/events`                             | approved    | `event/write`              |
| `management_program`    | `GET /integration/orders`                              | approved    | `job/read`                 |
| `management_program`    | `GET /integration/bank-notifications`                  | approved    | `bank-notification/read`   |
| `management_program`    | `PATCH /integration/bank-notifications/mark-processed` | approved    | `bank-notification/manage` |
| `management_program`    | `POST /integration/bank-notifications/backup-batches`  | approved    | `bank-notification/manage` |
| `nesting_program`       | every business route in the current inventory          | hard hold   | none                       |

All file/folder delete, batch delete, multipart/admin mutation, management retention/contact/general-contact cleanup, and unregistered route are hard hold. Presigned storage PUT, LGU+ provider, browser download, task DXF URL and local/NAS I/O are non-central. Legacy grace exists only in the separate compatibility ledger.

- [x] **Step 1: Write one RED HTTP matrix per controller**

For every approved method/path test correct program/environment/permission/version, wrong program, missing permission, safe_canary, revoked device, stale version, bearer+static ambiguity and existing static/session behavior. For every hold/non-central route assert bearer is rejected before service/write. Include explicit bearer-only negatives for legacy `/integration/programs/heartbeat` and admin rotation/management routes. For each untouched legacy-only controller family (`inventory`, `nesting-tasks`, `laser-completions`, `programs`, contacts/cleanup and every remaining inventory row), add bearer+valid-static and bearer+named-session HTTP negatives and assert the controller service/write spy remains at zero.

- [x] **Step 2: Replace class-level source guards only where required**

Apply `IntegrationPrincipalSourceGuard` at the controller boundary and `DeviceEndpointPolicyGuard` per route. `CurrentIntegrationPrincipal` returns a discriminated union and never synthesizes `request.user` for a device. Files/folders services receive the device principal through explicitly named device-scoped methods that allow only the matrix above; existing `@CurrentUser`, company/admin methods and all destructive methods remain unchanged. Preserve existing static/session authorization tests.

- [x] **Step 3: Reconcile current contract conflicts**

- External file/folder device-scoped service methods must not reuse the current integration-principal denial branch or admin-only folder move branch; they apply exact program/permission policy before calling non-destructive persistence operations.
- Events/orders missing route permission declarations must be explicit.
- `management_program` and `nesting_program` default `contact/process-stage:write` cannot open held routes.
- `/contacts/by-work-number` documentation must remain held for initial nesting device bearer.
- Missing `claim-next`/lease/failure/cancel nesting routes are not invented in this task.

- [x] **Step 4: Verify**

Run:

```powershell
pnpm exec jest --runInBand --no-cache src/integration/auth/integration-principal-source.guard.spec.ts src/integration/auth/device-endpoint-policy.spec.ts src/integration/auth/device-endpoint-policy.guard.spec.ts src/integration/auth/current-integration-principal.decorator.spec.ts src/integration/auth/device-endpoint-policy.scope.spec.ts src/integration/auth/device-endpoint-policy.wiring.spec.ts src/files/files.controller.device-auth.spec.ts src/files/files.service.spec.ts src/files/files.module.device-auth.spec.ts src/folders/folders.controller.device-auth.spec.ts src/folders/folders.service.spec.ts src/folders/folders.module.device-auth.spec.ts src/integration/events/events.controller.device-auth.spec.ts src/integration/orders/orders.controller.device-auth.spec.ts src/integration/bank-notifications/bank-notifications.controller.spec.ts src/integration/programs/programs.controller.spec.ts src/integration/device-auth/device-management.controller.spec.ts src/integration/device-auth/device-credential-rotation.controller.spec.ts src/auth/guards/company-access.guard.spec.ts
pnpm exec tsc --noEmit --pretty false
pnpm build
```

Expected: every approved row passes only with its exact program/permission; wrong/missing/stale/revoked/mixed principal cases and all hard-hold routes produce zero service/write calls. Prettier and `git diff --check` pass. Reviewer reports each route disposition and confirms no destructive route became device-enabled.

---
