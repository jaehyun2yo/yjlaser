# Supabase 보안 보완 Runbook

상태: 운영 RLS/grant 적용 완료, post-apply metadata 검증 완료
대상: Supabase project `ibsbcuumkdhwesrpaqeb`
관련 Advisor: `rls_disabled_in_public`, `sensitive_columns_exposed`

## 승인 전 금지

- 운영 DB row 조회
- 운영 migration deploy
- grant/policy/RLS 변경
- secret 출력 또는 문서 기록

## 1단계: read-only 확인

사용자 승인 후 Supabase SQL Editor 또는 승인된 read-only DB 세션에서
`docs/security/supabase-security-readonly-check-2026-06-24.sql`만 실행한다.

기록할 것:

- RLS disabled table 목록
- `anon`/`authenticated` grant 목록
- sensitive-looking column이 있는 table/view 목록
- prepared migration table coverage
- Advisor 재실행 전후 상태

기록하지 말 것:

- table row
- 고객/거래처/파일명 원문
- password/token/key 값

2026-06-24 재확인 결과:

- public table 77개, public view 7개
- public table 35개 RLS disabled
- `anon`/`authenticated` table/view grant 1106건
- `anon`/`authenticated` sequence grant 72건
- `anon`/`authenticated` function grant 260건
- sensitive-looking column 152개, 포함 relation/view 56개
- 기존 준비 migration 대상 47개 중 운영 존재 table 43개
- 기존 준비 migration 대상 중 운영 미존재 table 4개: `integration_runs`, `job_events`, `job_failures`, `nesting_tasks`
- 운영에 존재하지만 기존 준비 migration에 없는 table 34개
- RLS disabled이면서 기존 준비 migration에 없는 table 1개: `im_tax_invoice_audit_log`
- 상세 결과: `docs/security/supabase-security-readonly-result-2026-06-24.md`

## 2단계: 적용 판단

기존 47개 적용 후보는 보류했고, 현재 로컬 Prisma migration 후보는 운영 read-only 결과 기준 81개 table 범위로 갱신했다.

보류 이유:

- 기존 migration은 회사사이트 Prisma schema 중심 47개 table만 대상으로 한다.
- 운영에는 관리프로그램 `im_*` table 34개가 같은 public schema에 추가로 존재한다.
- `anon`/`authenticated`에 table/view DML grant, sequence usage grant, function execute grant가 광범위하게 열려 있다.
- 모바일 가격관리 웹은 제한 view/RPC/Edge Function 경로를 사용하므로, 단순 전체 revoke 전에 허용할 view/RPC 예외와 정책을 분리해야 한다.

재설계 초안:

- `docs/security/supabase-rls-grant-redesign-plan-2026-06-24.md`
- `docs/security/supabase-rls-grant-redesign-draft-2026-06-24.sql`
- `docs/security/supabase-security-postapply-check-2026-06-24.sql`

주의:

- draft SQL은 검토용 설계 사본이며, 운영 적용 대상은 아래 Prisma migration 후보다.
- `Supabase RLS/grant 운영 적용 승인` 없이 SQL Editor, Prisma migration, CLI에서 실행하지 않는다.

로컬 정적 점검 결과, 회사사이트 운영 런타임 코드의 Supabase direct API 사용은 확인되지 않았다.

- `@supabase/*` dependency 없음
- `supabase.from/auth/storage/rpc/channel` 사용 없음
- `NEXT_PUBLIC_SUPABASE_*` 런타임 의존 없음
- 남은 Supabase 문자열은 제거 검증 테스트와 문서 예시 범위

반복 점검:

```bash
npm run security:supabase-draft-readiness
npm run security:supabase-readiness
npm run security:check
npm run security:supabase-advisor
```

`security:supabase-draft-readiness`, `security:supabase-readiness`, `security:check`는 운영 DB에 접속하지 않는다.
`security:supabase-advisor`는 Supabase Management API `GET /v1/projects/{ref}/advisors/security`를 호출하므로 `SUPABASE_ACCESS_TOKEN`이 필요하다. 토큰은 `advisors_read` 또는 `database:read` 권한을 가져야 하며 출력/문서화하지 않는다.

- `security:supabase-draft-readiness`: 검토용 draft SQL과 적용 후 read-only SQL이 read-only expected list 81개와 일치하고, deny-by-default guard와 모바일 allowlist만 갖는지 확인한다. 2026-06-24 기준 통과해야 정상이다.
- `security:supabase-readiness`: 실제 Prisma migration 후보를 확인한다. 2026-06-24 현재 81개 migration 후보 기준 통과해야 정상이다. 실패는 운영 적용 차단 신호로 취급한다.
- `security:supabase-advisor`: Advisor 응답에서 `rls_disabled_in_public`, `sensitive_columns_exposed`가 남아 있으면 실패한다. 토큰이 없는 로컬 반복 점검은 `npm run security:supabase-advisor:optional`로 skip 여부만 확인한다.

두 명령 모두 read-only SQL과 적용 후 read-only SQL이 mutation/DDL/grant/revoke 없이 metadata-only `SELECT/WITH` 문장으로만 구성되는지 정적 검사한다.

`security:check`는 위 두 Supabase readiness와 회사사이트/webhard-api 보안 테스트 및 audit을 함께 실행한다.

예외가 필요한 경우:

- 모바일 가격관리 웹에서 의도적으로 사용하는 제한 view/RPC/Edge Function
- Realtime을 직접 쓰는 테이블
- authenticated role에 제한적 SELECT가 업무상 필요한 테이블

예외는 별도 policy/grant migration과 테스트로 분리한다.

## 3단계: 적용 후보

운영 적용 승인 문구:

```text
Supabase RLS/grant 운영 적용 승인
```

이 문구 없이 아래 SQL을 SQL Editor, Prisma migration, Supabase CLI, 자동화 스크립트에서 실행하지 않는다.

로컬 Prisma migration 후보:

```text
webhard-api/prisma/migrations/20260624093000_enable_public_table_rls/migration.sql
```

현재 상태:

- 2026-06-24 운영 적용 완료
- 회사사이트+관리프로그램 public table 81개 expected list 반영
- `anon` 직접 권한 제거, `authenticated` 모바일 view/RPC 최소 예외만 재부여
- 모바일 view/table/RPC 재부여 grant는 모두 `public.` schema-qualified 형태
- `PUBLIC` function execute revoke 포함
- `service_role` 보존 grant 포함
- `im_is_admin()`이 `service_role` 또는 admin user role을 허용하도록 보정
- `npm run security:supabase-readiness` 통과
- Prisma migration `20260624093000_enable_public_table_rls`는 수동 적용 후 `migrate resolve --applied`로 기록 완료

검토용 draft 사본:

```text
docs/security/supabase-rls-grant-redesign-draft-2026-06-24.sql
```

현재 상태:

- 운영 적용된 Prisma migration 후보와 같은 설계를 문서 검토용으로 보관
- Prisma migration 후보와 같은 deny-by-default 설계를 문서 검토용으로 보관
- 적용 전 desktop service_role RPC smoke 확인 필요

2026-06-24 로컬 Supabase 정적 검증:

- `npm run security:supabase-readiness` 통과
- `npm run security:supabase-draft-readiness` 통과
- migration table list가 read-only expected list 81개와 일치함
- draft table list가 read-only expected list 81개와 일치함
- 적용 후 read-only SQL의 target table list가 read-only expected list 81개와 일치함
- `GRANT ... TO anon` 없음
- `GRANT ... TO authenticated`는 `public.`으로 한정된 모바일 allowlist 4개만 존재함
- `PUBLIC` function execute revoke와 future default revoke가 존재함
- `im_is_admin()`에 fixed `search_path = public`, `service_role`, admin role guard가 존재함

재설계 시 포함할 범위:

- 회사사이트 Prisma public table
- 관리프로그램 `im_*` public table
- public view grant 처리
- public sequence/function grant 처리
- function `PUBLIC` default execute revoke
- 모바일 가격관리 view/RPC/Edge Function 허용 예외
- `_prisma_migrations` RLS 적용 후 Prisma migration 상태 확인 경로

## 4단계: rollback 기준

적용 직후 서버 측 Prisma 경로와 관리프로그램 Supabase 경로가 계속 동작해야 한다.

문제가 생기면:

1. 적용된 migration을 즉시 추가 SQL로 되돌리지 말고 실패 route와 role을 먼저 식별한다.
2. direct Supabase API가 필요한 경로라면 해당 view/RPC/table에 최소 grant/policy를 별도 추가한다.
3. 서버 측 Prisma 자체가 실패하면 DATABASE_URL 권한 또는 연결 role을 확인한다.
4. 관리프로그램 Supabase mode가 실패하면 사용 role이 service role인지, anon/authenticated인지 먼저 확인한다.
5. Prisma migration 상태 확인이 실패하면 `_prisma_migrations` 접근 role과 RLS bypass 여부를 먼저 확인한다.

## 5단계: 완료 기준

- Supabase Security Advisor Critical 0건 또는 intentional exception 문서화
- `anon`/`authenticated`가 민감 public table에 broad access 없음
- 필요한 모바일 view/RPC/Edge Function 예외만 최소 권한으로 동작
- 회사사이트 핵심 API 테스트 통과
- 관리프로그램 Supabase mode 핵심 smoke test 통과
- 운영 smoke test에서 로그인, 문의/웹하드 조회, 파일 목록, Worker 주요 화면 정상

## 6단계: 적용 후 read-only 재검증

2026-06-24 운영 RLS/grant migration 적용 후 실행했다.

적용 명령:

```powershell
doppler run --project yjlaser --config prd -- npx prisma db execute --file prisma/migrations/20260624093000_enable_public_table_rls/migration.sql --schema prisma/schema.prisma
doppler run --project yjlaser --config prd -- npx prisma migrate resolve --applied 20260624093000_enable_public_table_rls --schema prisma/schema.prisma
```

검증 결과:

- `failure_rls_disabled_target_tables`: 0건
- `failure_disallowed_relation_privileges`: 0건
- `failure_disallowed_function_execute_privileges`: 0건
- `failure_sensitive_columns_exposed_by_disallowed_privileges`: 0건
- `failure_im_is_admin_guard`: 0건
- `failure_security_definer_mobile_views`: 0건
- `failure_disallowed_column_privileges`: 0건
- `review_sensitive_columns_on_allowlisted_authenticated_surfaces`: 1건, `mobile_unpriced_dxf_view.state_token` 모바일 가격 변경 동시성 검증용 의도 예외로 문서화
- anon REST smoke: `mobile_unpriced_dxf_view`, `mobile_worker_status_view`, `im_dxf_files`, `im_mobile_price_update_requests` 모두 HTTP 401. 응답 본문/row 데이터는 출력하지 않음

주의:

- `pg_trgm` extension-managed 함수 93건은 `supabase_admin` grant이며 앱 public function failure에서 제외했다.
- `prisma migrate status`는 이번 RLS migration 적용 기록 후에도 기존 5개 migration이 production에 미적용 상태로 남아 있다. 이번 보안 적용 범위에는 포함하지 않았다.
- Supabase Dashboard Advisor에서 추가로 확인된 `Security Definer View` 2건은 `20260624161000_fix_mobile_security_invoker_views` migration으로 조치했다.
