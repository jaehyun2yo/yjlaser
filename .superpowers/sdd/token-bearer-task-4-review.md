# Task 4 independent security review

## Initial verdict

- Spec Compliance: **❌**
- Task Quality: **Not Ready**
- Critical: 0
- Important: 1
- Minor: 1

## Findings

### Important — absolute-form request-target parser bypass

`device-auth-bearer-transport.middleware.ts` reserved only origin-form paths beginning with `/`.
An absolute-form target such as
`POST http://service/api/v1/integration/devices/canary HTTP/1.1` could therefore skip the dedicated
4 KiB parser and the generic-parser skip while Express still routed the pathname to the canonical
controller. This violated the strict body, empty-canary and early no-store boundary and allowed the
generic 10 MiB JSON parser to run before authentication.

Required resolution: reserve every request-target form that Express can route to the two endpoints,
but reject any raw target other than the exact canonical origin-form path with 400/no-store. Add
absolute-form and absolute-form+query regression tests.

### Minor — non-canonical numeric prerelease

The SemVer expression accepted `1.2.3-01`. Canonical SemVer numeric prerelease identifiers must not
contain leading zeroes. Tighten the DTO/service validation and add a regression test.

## Initial testing gaps

- absolute-form route reservation had no regression coverage.
- active device/credential plus an independently revoked exchange was not tested fail-closed.
- full JWT-to-controller behavior is split between Task 2 token tests and mocked controller tests.
- non-device business routes were scope-checked by wiring/grep rather than actual HTTP bearer
  negative tests.
- actual Nest middleware ordering and no-store on all guard/validation failures lacked one integrated
  application test.

## Resolution and re-review

The implementer added eight RED assertions and resolved all findings:

- absolute-form and absolute-form+query targets are reserved, then rejected as non-canonical with
  400 and `no-store, private` before the generic parser;
- a matching revoked token exchange now makes the primary active-device query fail closed;
- numeric prerelease leading zeroes are rejected by DTO and service validation.

Final evidence: focused 4 suites / 61 tests, authority 9 suites / 121 tests, TypeScript, Nest build,
Prettier and `git diff --check` passed. Fresh security re-review returned **Spec Compliance ✅**,
**Task Quality Approved**, Critical 0, Important 0, Minor 0.

Actual Redis, PostgreSQL, reverse-proxy and device validation remains an operational gate.
