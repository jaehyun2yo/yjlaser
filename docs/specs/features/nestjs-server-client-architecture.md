# NestJS Server Client Architecture

## Status

Implemented 2026-05-10 for AUDIT-15.

## Contract

- Existing imports from `@/lib/api/nestjs-server-client` remain valid.
- `nestjs-server-client.ts` is a compatibility barrel only.
- Shared auth, cookie forwarding, API key fallback, fetch cache options, retry behavior, and response shape live in `src/lib/api/nestjs/core.client.ts`.
- Domain functions live under `src/lib/api/nestjs/`:
  - `webhard.client.ts`
  - `contacts.client.ts`
  - `companies.client.ts`
  - `operations.client.ts`

## Rules

- Domain client functions call `nestjsFetch` from `core.client.ts`; they must not reimplement cookie/API key handling.
- New server-side NestJS API helpers should be added to the matching domain file and re-exported through the compatibility barrel.
- Existing public function names and return shapes must remain stable unless a separate migration PR updates all callers and tests.
- Domain client tests should verify endpoint, method, body, auth mode, cache options, and error shape for representative functions.

## Verification

- `src/__tests__/lib/api/nestjs-domain-clients.test.ts` covers barrel compatibility plus representative webhard, contacts, and companies client contracts.
- Full PR validation uses `pnpm test -- --testPathPatterns="api|client|nestjs-server-client" --runInBand` and `npx tsc --noEmit`.
