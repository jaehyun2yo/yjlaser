# Central Log Ingestion API Shell

Status: implemented API/auth shell, no production persistence
Date: 2026-06-22

## Scope

`webhard-api` exposes `POST /api/v1/integration/log-events` as the first shell for
YJLaser-wide structured log ingestion.

This phase intentionally does not add a production database table, migration,
production secret, or deployment setting. It uses an in-memory repository and
an empty default key store, so production acceptance still requires a later
explicit key/config and persistence task.

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
- optional in-memory abuse disable after repeated invalid signatures

Configured clients are loaded from `LOG_INGESTION_CLIENT_KEYS_JSON` as a JSON
array. Each item must include `clientId`, `keyId`, `secret`, `allowedProjects`,
and `hashKeyVersion`. Secrets must be at least 32 bytes. If the variable is not
set, no client is accepted. `LOG_INGESTION_MAX_AUTH_FAILURES` can enable the
in-memory repeated-invalid-signature disable threshold for this shell.

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

## CSRF And Existing Auth Separation

This endpoint does not use the existing `X-API-Key` integration guard. The global
CSRF guard skips only this exact route when all `x-log-*` HMAC headers are
present. The same headers do not bypass CSRF on any other route.

## Persistence Phase Boundary

Current storage is in-memory:

- identical `(client_id, event_id, server-calculated event payload hash)` returns duplicate
- same `(client_id, event_id)` with a different server-calculated event payload hash returns conflict

Production persistence, secret rotation, Redis-backed nonce/rate limit, and
operational dashboards remain separate follow-up tasks.
