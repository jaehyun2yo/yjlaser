### Task 2: Stable exchange digest, normal refresh service, and runtime configuration

**Files:**

- Create: yjlaser_website/webhard-api/src/integration/device-auth/device-token-exchange-hash.ts
- Create: yjlaser_website/webhard-api/src/integration/device-auth/device-token-exchange-hash.spec.ts
- Create: yjlaser_website/webhard-api/src/integration/device-auth/device-token-exchange.service.ts
- Create: yjlaser_website/webhard-api/src/integration/device-auth/device-token-exchange.service.spec.ts
- Modify: yjlaser_website/webhard-api/src/integration/device-auth/device-auth.types.ts
- Modify: yjlaser_website/webhard-api/src/integration/device-auth/device-auth.runtime-config.ts
- Modify: yjlaser_website/webhard-api/src/integration/device-auth/device-auth.runtime-config.spec.ts
- Modify: yjlaser_website/webhard-api/src/integration/device-auth/device-auth.tokens.ts
- Modify: yjlaser_website/webhard-api/src/integration/device-auth/device-auth.module.ts
- Modify: yjlaser_website/webhard-api/src/integration/device-auth/device-auth.module.spec.ts

**Consumes:** Task 1, DeviceAccessTokenService, server-derived DEFAULT_INTEGRATION_WORKER_PERMISSIONS.

**Produces:** normal replacement result, response-loss replay recovery, strict named configuration.

- [ ] **Step 1: Write failing tests**

Test all of these before implementation:

~~~ts
await expect(service.exchange(validInput)).resolves.toMatchObject({
  deviceId: DEVICE_ID,
  refreshCredentialAction: 'replace_with_candidate',
  credentialVersion: 2,
});
expect(accessTokenService.issue).toHaveBeenCalledWith(expect.objectContaining({
  deviceId: DEVICE_ID,
  environment: 'dev',
  capabilityProfile: 'standard',
  permissions: ['file/register', 'event/write'],
  credentialVersion: 2,
}));
~~~

Also test invalid shape/canonical IDs/base64 lengths, raw value reuse, pending/revoked/expired/wrong environment, live rotation conflict with zero writes, serializable P2034 retry twice, source CAS failure, same request ID plus same old/next recovery, same request ID plus changed old/next rejection, revoked exchange, signer/DB unavailable, and safe_canary empty permissions.

For runtime config require exactly these named values:

~~~text
DEVICE_AUTH_ACCESS_TOKEN_ISSUER
DEVICE_AUTH_ACCESS_TOKEN_AUDIENCE
DEVICE_AUTH_ACCESS_TOKEN_CURRENT_KID
DEVICE_AUTH_ACCESS_TOKEN_SIGNING_KEYRING_JSON
DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET
~~~

- [ ] **Step 2: Implement stable domain-separated request digest**

Define exact API:

~~~ts
const TOKEN_EXCHANGE_REQUEST_DOMAIN = 'yjlaser:device-auth:v1:token-exchange-request:';

export class DeviceTokenExchangeRequestHasher {
  constructor(environment: DeviceAuthEnvironment, secret: string) {}
  digest(requestId: string): string {}
  verify(requestId: string, digest: string): boolean {}
}
~~~

The constructor requires a nonblank UTF-8 secret of at least 32 bytes. digest validates 16–64-byte canonical Base64URL and returns lower hexadecimal HMAC-SHA256 of the domain plus selected environment plus request ID. verify uses timingSafeEqual and never returns a raw reason. The service must not call hashDeviceCredential for request IDs and must not use the credential pepper keyring for this digest.

- [ ] **Step 3: Implement the transactional normal refresh state machine**

Expose only:

~~~ts
export interface DeviceTokenExchangeInput {
  readonly deviceId: string;
  readonly refreshCredential: string;
  readonly nextRefreshCredential: string;
  readonly refreshRequestId: string;
}

export interface DeviceTokenExchangeResult {
  readonly deviceId: string;
  readonly environment: DeviceAuthEnvironment;
  readonly programType: DeviceAuthProgramType;
  readonly capabilityProfile: DeviceCapabilityProfile;
  readonly credentialVersion: number;
  readonly accessToken: string;
  readonly refreshCredentialAction: 'replace_with_candidate';
}
~~~

Parse exactly the four keys, canonical lower UUID, two 32-byte canonical Base64URL credentials, 16–64-byte canonical request ID, and distinct raw values. First look up an exchange by deviceId/requestIdDigest. If a completed exchange is past recoverableUntil, serializably set only that exchange to expired and return invalid without changing either credential. Otherwise recovery verifies raw predecessor and successor hashes, status completed, selected environment, active device, active successor, and version before minting a fresh JWT; it never persists or returns a previous JWT.

For a new exchange, execute a serializable transaction: re-read selected-environment active device/current credential/version/expiry; reject live requested/prepared rotation; CAS revoke predecessor; CAS increment device credentialVersion; create one active successor at now plus activeCredentialTtlMs; create completed exchange with successor version/recoverableUntil; create sanitized refresh_credential_replaced audit. If a conditional write misses, roll back and return conflict/invalid. Call DeviceAccessTokenService.issue only after transaction commit so signer failure remains recoverable through the exchange row.

Derive permissions server-side only: exact DEFAULT_INTEGRATION_WORKER_PERMISSIONS value for standard, [] for safe_canary. Never use hasIntegrationPermission because legacy all is not valid.

Use only these internal errors:

~~~ts
export type DeviceTokenExchangeErrorCode =
  | 'DEVICE_TOKEN_EXCHANGE_INVALID'
  | 'DEVICE_TOKEN_EXCHANGE_CONFLICT'
  | 'DEVICE_TOKEN_EXCHANGE_REVOKED'
  | 'DEVICE_TOKEN_EXCHANGE_UNAVAILABLE';
~~~

- [ ] **Step 4: Wire named configuration and one DI instance**

Extend DeviceAuthRuntimeConfig with accessTokenConfig and tokenExchangeRequestHasher. Parse signingKeyring JSON for selected environment with loadDeviceAccessTokenConfig. Register JwtModule without global signing defaults, provide DEVICE_ACCESS_TOKEN_SERVICE and DEVICE_TOKEN_EXCHANGE_SERVICE factories, and export symbol tokens only.

Reject blank issuer/audience, invalid current kid, signing secret under 32 UTF-8 bytes, missing key, more than one previous overlap, missing exchange HMAC secret, and all generic JWT/API-key/session-secret fallback names. Module tests assert errors/toJSON never serialize raw signing/HMAC material.

- [ ] **Step 5: Verify Task 2**

~~~powershell
cd yjlaser_website/webhard-api
pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-token-exchange-hash.spec.ts src/integration/device-auth/device-token-exchange.service.spec.ts src/integration/device-auth/device-auth.runtime-config.spec.ts src/integration/device-auth/device-auth.module.spec.ts src/integration/device-auth/device-access-token.service.spec.ts
pnpm exec tsc --noEmit --pretty false
~~~

Expected: service/config tests pass with no DB connection and no secret output.
