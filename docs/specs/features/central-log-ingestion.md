# Central Log Ingestion API Shell

Status: implemented API/auth shell and Prisma persistence migration
Date: 2026-06-23

## Scope

`webhard-api` exposes `POST /api/v1/integration/log-events` as the first shell for
YJLaser-wide structured log ingestion.

This phase adds a `log_events` Prisma model, migration, and database-backed
repository. Runtime behavior is:

- `NODE_ENV=test`: in-memory repository by default
- `LOG_EVENT_PERSISTENCE=memory`: force in-memory repository
- `LOG_EVENT_PERSISTENCE=database` or unset production runtime: Prisma
  repository

The Docker start command already runs `npx prisma migrate deploy` before
starting the NestJS app, so production deployment applies the table before the
database repository is used. Production acceptance still requires
`LOG_INGESTION_CLIENT_KEYS_JSON` and a stable `LOG_IDENTIFIER_HASH_SECRET` or
`LOG_HASH_SECRET` value in the secret manager. Do not write those values to git,
docs, chat, or logs.

## Authentication

Clients must send all headers below:

- `X-Log-Client-Id`
- `X-Log-Key-Id`
- `X-Log-Timestamp`
- `X-Log-Nonce`
- `X-Log-Signature`

Signature contract:

```text
base64url(hmac_sha256(secret, timestamp + "." + nonce + "." + sha256(rawBody)))
```

The verifier enforces:

- active `(client_id, key_id)` lookup
- client project allowlist
- timestamp clock-skew window
- nonce replay rejection
- per-client/IP in-memory rate limit
- timing-safe signature comparison
- explicit disabled-key rejection without automatic lockout

Configured clients are loaded from `LOG_INGESTION_CLIENT_KEYS_JSON` as a JSON
array. Each item must include `clientId`, `keyId`, `secret`, `allowedProjects`,
and `hashKeyVersion`. Secrets must be at least 32 bytes. If the variable is not
set, no client is accepted. Repeated invalid signatures are recorded by the key
store boundary for later audit, but this shell does not automatically disable
keys. Client key disablement is an explicit operator/configuration action.

Identifier fields such as `actor_id_hash` and `target_id_hash` are generated
with HMAC-SHA256. The preferred key is `LOG_IDENTIFIER_HASH_SECRET`; the
compatibility key is `LOG_HASH_SECRET`; `SESSION_SECRET` can be used only when it
is at least 32 bytes. If no configured key exists, this no-persistence shell uses
a process-local random key, which is safe against raw value disclosure but does
not provide cross-restart hash correlation. Explicit `LOG_IDENTIFIER_HASH_SECRET`
or `LOG_HASH_SECRET` values shorter than 32 bytes fail closed.

## Payload

The request body is:

```json
{
  "events": [
    {
      "schema_version": 1,
      "event_id": "evt-...",
      "timestamp": "2026-06-22T00:00:00.000Z",
      "level": "info",
      "project": "company_site",
      "component": "ExampleClient",
      "feature": "log_collection",
      "event": "example_event",
      "action": "collect",
      "status": "success",
      "channel": "audit",
      "correlation_id": "log-20260622-100000-abcdef",
      "duration_ms": 12,
      "count": 1,
      "metadata": { "safe_count": 1 },
      "hash_key_version": "v1"
    }
  ]
}
```

Batch limit is 100 events and returns `413 LOG_BATCH_TOO_LARGE` when exceeded.
The route-specific JSON body limit is 256 KiB.

## Sensitive Data Gate

Raw payload is scanned before DTO validation. The API rejects sensitive keys,
emails, phone numbers, presigned URLs, raw authorization/cookie/token strings,
local filesystem paths, UNC paths, and metadata nesting deeper than 6 levels.
Sensitive key detection normalizes snake_case, kebab-case, and camelCase forms
so keys such as `userPassword`, `passwordHash`, `secretValue`,
`authorizationHeader`, `emailAddress`, `phoneNumber`, and `contactName` are
rejected before storage.

Rejection responses use safe codes only, for example:

- `LOG_RAW_SENSITIVE_VALUE`
- `LOG_METADATA_TOO_DEEP`
- `LOG_INVALID_REQUEST`

Authentication happens before this payload scan inside the controller, so a
missing or invalid HMAC request still returns `401` even when the body contains
raw sensitive values. Authenticated requests with raw sensitive payloads return
`400` and log only safe rejection codes/metadata.

## CSRF And Existing Auth Separation

This endpoint does not use the existing `X-API-Key` integration guard. The global
CSRF guard skips only this exact route and delegates missing or invalid
`x-log-*` HMAC headers to the log-ingestion auth verifier, so the API/Auth layer
returns `401` for unauthenticated ingestion attempts. The same headers do not
bypass CSRF on any other route.

## Persistence

Current production storage is Prisma-backed when the deployed process is not in
test mode and `LOG_EVENT_PERSISTENCE` is not set to `memory`:

- identical `(client_id, event_id, server-calculated event payload hash)` returns duplicate
- same `(client_id, event_id)` with a different server-calculated event payload hash returns conflict
- raw `client_id` and `key_id` are never stored; only HMAC short hashes are
  stored
- retention expiry is calculated by channel and stored in `retention_expires_at`

Redis-backed nonce/rate limit, credential rotation, retention delete jobs, and
operational dashboards remain separate follow-up tasks.
