# Rotation endpoint policy Task 1 report

Status: complete, local unstaged source only.

## Delivered

- Additive `expired`/`revoked` rotation states and nullable legacy-compatible persistence fields.
- Same-device predecessor composite FK with Prisma/manual-DDL actions and names aligned.
- Explicit null/null legacy discriminator that rejects partial pairs under PostgreSQL three-valued CHECK semantics.
- Preserved one-live partial unique index and a PostgreSQL-safe predecessor index name.
- Named deadline, ACK recovery and default-disabled runtime configuration.
- Startup constraints bind ACK recovery to access-token TTL and active credential TTL to `deadline + recovery`.
- Compatibility helpers fail closed for legacy rows and invalid credential lifetimes.

## TDD and verification

- Initial RED: missing enum/columns/migration, rotation options and compatibility module.
- Review RED: missing module fixture values, invalid TTL cross-combination, partial-pair CHECK, FK drift and overlong index name.
- Final focused: 4 suites / 105 tests PASS.
- Full `src/integration/device-auth`: 31 suites / 511 tests PASS.
- Prisma validate and no-database schema diff: PASS.
- TypeScript, Prettier and `git diff --check`: PASS.
- Fresh correctness and data-migration re-reviews: Approved, Critical 0, Important 0.

## Remaining operational gate

No migration was applied and no PostgreSQL, Redis, secret, device, network, deploy, stage, commit or push operation occurred. An approved environment card must later verify existing-row counts, index predicate, enum/lock behavior, backup and rollback references before migration apply.
