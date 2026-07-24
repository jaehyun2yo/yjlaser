# C-01 review package

이 worktree의 Task 3 파일은 선행 작업부터 untracked 상태여서 standard Git range diff가
task-only 변경을 표현하지 못한다. 아래 구현 전/후 SHA-256과 명시적 파일 목록을 사용하고,
reviewer는 세 현재 파일을 직접 읽어 brief/report와 대조한다. index/HEAD는 변경하지 않았다.

| 파일 | 구현 전 SHA-256 | 구현 후 SHA-256 |
| --- | --- | --- |
| `webhard-api/src/integration/device-auth/device-bootstrap-rate-store.ts` | `90DBF9F6A774A665E19C63FD97CE8BDCA494C720D1A89080E0A0FCD75AB9BEC6` | `03476DF3BC78B918233415044A54BAAFFFD4F102C5A8EF619B2BE008B5AFB1A0` |
| `webhard-api/src/integration/device-auth/device-bootstrap-rate-store.spec.ts` | `DA82D639CB19EA2EA73506CC4F31AF8C76E5FDF74D67C89EF65327E99FED687B` | `EB4433A783AFEC18F4772C4116147C5F0CC626BC59D12AFDC382C430AC8C765B` |
| `webhard-api/src/integration/device-auth/device-token-exchange.controller.spec.ts` | `C7E8BC5E55EB520DF08357BB9670254EE3A000D3110C51AD79E142C229F05D17` | `838A36CD0ADE62AA51FE0D57AB3CA2843B3C4680593A2B6499766DC0584206A7` |

주요 변경 위치:

- rate-store constant/parser/use sites: `device-bootstrap-rate-store.ts:10,406-407,484,681-690`
- real-store quota/release regression: `device-bootstrap-rate-store.spec.ts:340-399`
- HTTP actual-store boundary regression: `device-token-exchange.controller.spec.ts:242-326`

Fix 1은 reviewer Important finding을 반영해 acquire/release 동일 HMAC replay key·nonce,
compare-and-delete/no-DECR, raw-proof safe boolean assertion, UTF-8 4096/4097-byte acquire/release
대칭 경계를 추가했다. 최신 검증은 focused 2 suites / 49 tests, 전체 지정 7 suites / 135 tests다.

검토 입력:

- 요구사항: `.superpowers/sdd/token-bearer-task-3-p1-fix-brief.md`
- 구현 보고: `.superpowers/sdd/token-bearer-task-3-p1-fix-report.md`
- 원 finding: `.superpowers/sdd/token-bearer-task-3-review.md`

검토 시 raw proof가 HMAC-derived Redis key 밖의 EVAL argument/response/error/log에 남는지,
4 KiB bound의 UTF-8 byte semantics, acquire/release parser 대칭, 기존 enroll/status parser 불변,
quota 보존 및 finally release, 테스트가 real store boundary를 실제로 통과하는지를 확인한다.
