### Task 3: Bearer prepare/ack and response-loss recovery

**Files:**

- Create: `webhard-api/src/integration/device-auth/device-rotation-request-shape.guard.ts`
- Create: `webhard-api/src/integration/device-auth/device-rotation-request-shape.guard.spec.ts`
- Create: `webhard-api/src/integration/device-auth/device-rotation-bearer.guard.ts`
- Create: `webhard-api/src/integration/device-auth/device-rotation-bearer.guard.spec.ts`
- Modify: `webhard-api/src/integration/device-auth/device-credential-rotation.service.ts`
- Modify: `webhard-api/src/integration/device-auth/device-credential-rotation.service.spec.ts`
- Modify: `webhard-api/src/integration/device-auth/device-credential-rotation.controller.ts`
- Modify: `webhard-api/src/integration/device-auth/device-credential-rotation.controller.spec.ts`
- Modify: `webhard-api/src/integration/device-auth/device-token-exchange.service.ts`
- Modify: `webhard-api/src/integration/device-auth/device-token-exchange.service.spec.ts`
- Modify: `webhard-api/src/integration/device-auth/device-token-exchange.controller.ts`
- Modify: `webhard-api/src/integration/device-auth/device-token-exchange.controller.spec.ts`
- Modify: `webhard-api/src/integration/device-auth/device-auth.types.ts`
- Modify: `webhard-api/src/common/middleware/device-auth-bearer-transport.middleware.ts`
- Modify: `webhard-api/src/common/middleware/device-auth-bearer-transport.middleware.spec.ts`

**Interfaces:**

```ts
prepare({ principal, rotationId, refreshCredential, candidateCredential, now }): Promise<{
  status: 'prepared'; rotationId: string; deadlineAt: string
}>

ack({ principal, rotationId, candidateCredential, now }): Promise<{
  status: 'acknowledged'; rotationId: string; credentialVersion: number; accessToken: string
}>
```

- [ ] **Step 1: Write strict transport/shape RED tests**

Reserve prepare/ack aliases before generic parser; exact canonical JSON under 4 KiB; reject query, cookie, static/API/recovery/session/CSRF, Origin/Referer, duplicate Authorization, compression and Transfer-Encoding. Prepare body is exactly `refreshCredential,candidateCredential`; ACK body is exactly `candidateCredential`. Rotation ID is a canonical lowercase UUID. Both credentials are exactly 32 decoded bytes in canonical unpadded Base64URL, must differ, are HMACed before persistence, and are compared timing-safely. Malformed, padded, oversized, reused or equal proofs are rejected before any write.

- [ ] **Step 2: Write service and recovery RED tests**

Cover requested→prepared→acknowledged, same candidate idempotency, different candidate conflict, concurrent prepare/ack, deadline before/equal/after, safe_canary, device revoke during transaction, current proof mismatch, candidate reuse, candidate persistence before response, exact version increment, old credential/exchange revoke, audit, raw-value redaction and zero business writes.

Run the same structural forbidden-key/value scan against prepare/ack success, errors, security logger calls and serialized audit fixtures.

ACK response-loss test must prove:

```ts
const first = await ack(firstOldVersionBearerAndCandidate);
const retry = await ack(retrySameOldVersionBearerAndCandidate);
expect(retry).toMatchObject({
  status: first.status,
  rotationId: first.rotationId,
  credentialVersion: first.credentialVersion,
});
await expect(verify(retry.accessToken)).resolves.toMatchObject({
  sub: deviceId,
  credential_version: first.credentialVersion,
});
await expect(heartbeat(oldVersionBearer)).rejects.toMatchObject({
  code: "device_revoked",
});
```

The recovery guard accepts only `status=acknowledged`, same device/rotation, `claims.credential_version === device.credentialVersion - 1`, within `rotationAckRecoverySeconds`, and matching candidate proof. A retry may receive a newly signed JWT with the same safe claims; raw access tokens are never persisted. It never authorizes heartbeat, token, canary or business routes.

- [ ] **Step 3: Implement prepare/ack and token directive**

While live rotation exists, ordinary `/token` returns `keep_current` plus `{id,deadlineAt}` and does not create a successor exchange. After ACK it returns a token for the new version and no live directive.

- [ ] **Step 4: Verify**

```powershell
pnpm exec jest --runInBand --no-cache src/common/middleware/device-auth-bearer-transport.middleware.spec.ts src/integration/device-auth/device-rotation-request-shape.guard.spec.ts src/integration/device-auth/device-rotation-bearer.guard.spec.ts src/integration/device-auth/device-credential-rotation.service.spec.ts src/integration/device-auth/device-credential-rotation.controller.spec.ts src/integration/device-auth/device-token-exchange.service.spec.ts src/integration/device-auth/device-token-exchange.controller.spec.ts src/integration/device-auth/device-bearer.guard.spec.ts src/common/logging/request-redaction.spec.ts
pnpm exec tsc --noEmit --pretty false
pnpm build
```

Expected: all transitions and response-loss recovery pass with no external I/O. Fresh security review required.

---
