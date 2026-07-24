### Task 4: Composite principal source and immutable endpoint policy registry

**Files:**

- Create: `webhard-api/src/integration/auth/integration-principal-source.guard.ts`
- Create: `webhard-api/src/integration/auth/integration-principal-source.guard.spec.ts`
- Create: `webhard-api/src/integration/auth/device-endpoint-policy.ts`
- Create: `webhard-api/src/integration/auth/device-endpoint-policy.spec.ts`
- Create: `webhard-api/src/integration/auth/device-endpoint-policy.guard.ts`
- Create: `webhard-api/src/integration/auth/device-endpoint-policy.guard.spec.ts`
- Create: `webhard-api/src/integration/auth/require-device-endpoint-policy.decorator.ts`
- Create: `webhard-api/src/integration/auth/legacy-compatibility-policy.ts`
- Create: `webhard-api/src/integration/auth/legacy-compatibility-policy.spec.ts`
- Modify: `webhard-api/src/integration/auth/api-key.guard.ts`
- Modify: `webhard-api/src/integration/auth/api-key.guard.spec.ts`
- Modify: `webhard-api/src/integration/auth/integration-permissions.ts`
- Modify: `webhard-api/src/integration/auth/integration-permissions.spec.ts`
- Modify: `webhard-api/src/integration/device-auth/device-access-token.service.ts`
- Modify: `webhard-api/src/integration/device-auth/device-access-token.service.spec.ts`
- Modify: `webhard-api/src/integration/device-auth/device-bearer.guard.ts`
- Modify: `webhard-api/src/integration/device-auth/device-bearer.guard.spec.ts`
- Modify: `webhard-api/src/integration/device-auth/device-auth.module.ts`
- Modify: `webhard-api/src/integration/device-auth/device-auth.module.spec.ts`
- Modify: `webhard-api/src/integration/integration.module.ts`
- Create: `webhard-api/src/integration/integration.module.device-auth.spec.ts`

**Interfaces:**

```ts
type PrincipalMode =
  | "device_bearer"
  | "legacy_api_key"
  | "admin_session"
  | "company_session"
  | "worker_session";

type DeviceEndpointPolicy =
  | {
      method: "GET" | "POST" | "PATCH" | "DELETE";
      pathTemplate: string;
      programType: DeviceAuthProgramType;
      principalMode: "device_bearer";
      disposition: "approved";
      permission: IntegrationPermission;
    }
  | {
      method: "GET" | "POST" | "PATCH" | "DELETE";
      pathTemplate: string;
      programType: DeviceAuthProgramType;
      principalMode: "device_bearer";
      disposition: "hard_hold" | "non_central";
    };

interface LegacyCompatibilityPolicy {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  pathTemplate: string;
  programType: DeviceAuthProgramType;
  apiKeyScope: string;
  environment: DeviceAuthEnvironment;
  graceDeadlineAt: string;
}
```

- [ ] **Step 1: Write RED source isolation tests**

Exactly one principal source is allowed. Bearer branch invokes `DeviceBearerGuard` and attaches only `deviceAuthInfo`; static branch invokes existing `ApiKeyGuard`; admin/company/worker sessions retain their existing actor types. Two session credentials or any session+Bearer/API-key mixture fails closed. Device branch never creates `request.user` or `apiKeyInfo`.

The existing `ApiKeyGuard` itself performs a raw source-ambiguity check before `@Public`, session verification, API-key validation, or any request-principal mutation. On every integration controller that still uses only the legacy guard, any `Authorization` header combined with `X-API-Key`, `admin-session`, `company-session`, `erp-session`, or `worker-session` is rejected; multiple named session cookies and API-key+session are also rejected. Duplicate/combined raw values fail closed. This makes no-bearer-to-static-fallback global for both touched and untouched legacy-only controllers instead of depending on controller migration to the composite guard.

- [ ] **Step 2: Write RED registry tests**

Unregistered device bearer route is hard-hold/default-deny. Registry keys include exact method, normalized path template and program type. `safe_canary` always denies. Every approved entry has a mandatory server-derived permission. Device guards never read `LegacyCompatibilityPolicy`; legacy remains behind `ApiKeyGuard` and the separate census-owned compatibility ledger.

- [ ] **Step 3: Add only required new permissions**

Add exact permissions `folder/read`, `folder/write`, `folder/move`, `file/read`, `file/write`, `file/move`. Introduce `DEFAULT_DEVICE_ACCESS_PERMISSIONS` separately from legacy `DEFAULT_INTEGRATION_WORKER_PERMISSIONS`: external receives only the six file/folder permissions, management receives `event/write`, `job/read`, `bank-notification/read`, `bank-notification/manage`, and nesting receives an empty list until a later reviewed policy. Device access token issue/verify and `DeviceBearerGuard` rederive only from the new map. Legacy API-key defaults remain backward compatible.

- [ ] **Step 4: Implement guards/registry and verify**

```powershell
pnpm exec jest --runInBand --no-cache src/integration/auth/api-key.guard.spec.ts src/integration/auth/integration-principal-source.guard.spec.ts src/integration/auth/device-endpoint-policy.spec.ts src/integration/auth/device-endpoint-policy.guard.spec.ts src/integration/auth/legacy-compatibility-policy.spec.ts src/integration/auth/integration-permissions.spec.ts src/integration/device-auth/device-access-token.service.spec.ts src/integration/device-auth/device-bearer.guard.spec.ts src/integration/device-auth/device-auth.module.spec.ts src/integration/integration.module.device-auth.spec.ts
pnpm exec tsc --noEmit --pretty false
```

Fresh security review must confirm class-level `ApiKeyGuard` cannot preempt the composite source and static/session principal is never promoted to device.

---
