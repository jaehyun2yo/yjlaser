### Task 3: Cookie-less token transport, rate/replay lease, controller, and redaction

**Files:**

- Modify: yjlaser_website/webhard-api/src/common/middleware/device-auth-bootstrap-transport.middleware.ts
- Modify: yjlaser_website/webhard-api/src/common/middleware/device-auth-bootstrap-transport.middleware.spec.ts
- Modify: yjlaser_website/webhard-api/src/main.ts
- Modify: yjlaser_website/webhard-api/src/integration/device-auth/device-bootstrap-request-shape.guard.ts
- Modify: yjlaser_website/webhard-api/src/integration/device-auth/device-bootstrap-request-shape.guard.spec.ts
- Modify: yjlaser_website/webhard-api/src/integration/device-auth/device-bootstrap-rate-store.ts
- Modify: yjlaser_website/webhard-api/src/integration/device-auth/device-bootstrap-rate-store.spec.ts
- Modify: yjlaser_website/webhard-api/src/integration/device-auth/device-bootstrap-rate.guard.ts
- Modify: yjlaser_website/webhard-api/src/integration/device-auth/device-bootstrap-rate.guard.spec.ts
- Create: yjlaser_website/webhard-api/src/integration/device-auth/dto/device-token-exchange.dto.ts
- Create: yjlaser_website/webhard-api/src/integration/device-auth/device-token-exchange.errors.ts
- Create: yjlaser_website/webhard-api/src/integration/device-auth/device-token-exchange.errors.spec.ts
- Create: yjlaser_website/webhard-api/src/integration/device-auth/device-token-exchange.controller.ts
- Create: yjlaser_website/webhard-api/src/integration/device-auth/device-token-exchange.controller.spec.ts
- Modify: yjlaser_website/webhard-api/src/integration/device-auth/device-auth.module.ts
- Modify: yjlaser_website/webhard-api/src/common/logging/request-redaction.ts
- Modify: yjlaser_website/webhard-api/src/common/logging/request-redaction.spec.ts

**Consumes:** Task 2, current bootstrap source guard/error envelope, Upstash store.

**Produces:** POST /api/v1/integration/device-auth/token exact wire with no ambient/static credentials.

- [ ] **Step 1: Write failing HTTP and transport tests**

Require canonical token success with exact keys:

~~~ts
expect(Object.keys(response.body).sort()).toEqual([
  'accessToken', 'capabilityProfile', 'credentialVersion', 'deviceId',
  'environment', 'programType', 'refreshCredentialAction',
]);
~~~

Require query/alias/cookie/Authorization/API/recovery/CSRF/Origin/Referer/compression rejection before the service, 4 KiB 413, bad content type 415, invalid 401 device_refresh_invalid, revoked 401 device_revoked, conflict 409 device_refresh_in_progress, unavailable 503 device_auth_unavailable, rate 429 device_auth_rate_limited plus Retry-After, and no raw secret/JWT in response errors or logs.

- [ ] **Step 2: Extend strict public transport and exact shape guard**

Add DEVICE_AUTH_TOKEN_PATH to the same reserved public path logic. Keep enroll/status canonical behavior unchanged. Token accepts only one application/json content type with optional utf-8 charset, identity/absent content encoding, no query or ambient header, and a strict own-key Object.prototype body:

~~~ts
[
  'deviceId',
  'refreshCredential',
  'nextRefreshCredential',
  'refreshRequestId',
]
~~~

Every case-insensitive/trailing-slash/encoded alias is reserved before generic parsing and rejected as noncanonical.

- [ ] **Step 3: Add token quota plus replay lease**

Extend the dedicated store only, never a generic Redis config:

~~~ts
acquireTokenExchange(input: {
  peerAddress: string;
  refreshCredential: string;
  refreshRequestId: string;
}): Promise<DeviceBootstrapTokenExchangeRateDecision>
~~~

Use HMAC key namespace device-auth:<environment>:token, same no-redirect 3-second Upstash EVAL, global 120 per 60 seconds, socket peer 60 per 600 seconds, refresh proof 12 per 600 seconds, and a 60-second request-ID lease. Do not trust X-Forwarded-For. The controller releases the lease in finally on success and failure; quota remains consumed and database exchange idempotency handles recovery.

- [ ] **Step 4: Implement controller, error map, and redaction**

The controller has route base integration/device-auth, Post token, CsrfExempt, source/shape/rate guards, and public validation pipe. It passes only DTO four fields and projects only Task 2 result.

~~~ts
invalid     => UnauthorizedException({ code: 'device_refresh_invalid', message: 'Device refresh rejected' })
conflict    => ConflictException({ code: 'device_refresh_in_progress', message: 'Device refresh in progress' })
revoked     => UnauthorizedException({ code: 'device_revoked', message: 'Device revoked' })
unavailable => ServiceUnavailableException({ code: 'device_auth_unavailable', message: 'Device authentication temporarily unavailable' })
~~~

Rate guard sets Retry-After and returns generic device_auth_rate_limited. Add nextRefreshCredential, refreshRequestId, and Authorization bearer inputs to redaction tests. Do not return exchange ID, digest, predecessor/successor ID, actor, rotation, or stored token reference.

- [ ] **Step 5: Verify Task 3**

~~~powershell
cd yjlaser_website/webhard-api
pnpm exec jest --runInBand --no-cache src/common/middleware/device-auth-bootstrap-transport.middleware.spec.ts src/integration/device-auth/device-bootstrap-request-shape.guard.spec.ts src/integration/device-auth/device-bootstrap-rate-store.spec.ts src/integration/device-auth/device-bootstrap-rate.guard.spec.ts src/integration/device-auth/device-token-exchange.errors.spec.ts src/integration/device-auth/device-token-exchange.controller.spec.ts src/common/logging/request-redaction.spec.ts
pnpm exec tsc --noEmit --pretty false
~~~

Expected: public token source boundary passes without Redis/DB/network access.
