# Supabase RLS/Grant 재설계 초안

상태: proposed
작성일: 2026-06-24
대상: Supabase project `ibsbcuumkdhwesrpaqeb`
범위: public schema metadata 기준, 운영 DB 변경 없음

## 목적

Supabase Advisor Critical `rls_disabled_in_public`, `sensitive_columns_exposed`를 해소하되, 회사사이트 서버 Prisma 경로, 관리프로그램 service_role 경로, 모바일 가격관리 제한 view/RPC 경로를 깨뜨리지 않는 최소 권한 적용안을 만든다.

## 현재 운영 증거

2026-06-24 운영 read-only metadata 재점검 결과:

| 항목                                        | 현재값 |
| ------------------------------------------- | -----: |
| public table                                |     77 |
| public view                                 |      7 |
| RLS disabled public table                   |     35 |
| `anon`/`authenticated` table/view grants    |   1106 |
| `anon`/`authenticated` sequence grants      |     72 |
| `anon`/`authenticated` function grants      |    260 |
| sensitive-looking column 포함 relation/view |     56 |

추가 read-only metadata 점검 결과:

- `im_*` table 중 RLS disabled: `im_tax_invoice_audit_log`
- `anon`에도 `im_*`, mobile view, web view, webhard relation grant가 존재함
- `authenticated`는 다수 relation에 `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE`를 보유함
- `anon` function grant에 `im_create_mobile_price_request`, `im_hard_delete_company`, `im_save_invoice_atomic` 등 mutation 가능 RPC가 포함됨
- 기존 회사사이트 47개 migration은 운영 `im_*` table 34개와 grant relation/view 36개를 누락함

## 로컬 코드 근거

회사사이트:

- 운영 런타임에서 Supabase direct API 사용 없음
- 서버 Prisma/NestJS 경로가 기본 접근 경계
- 따라서 `anon`/`authenticated` direct public table access는 기본 차단

관리프로그램:

- 데스크톱 앱은 `Settings.get_supabase_service_role_key()`로 service_role Supabase client를 생성함
- service_role은 RLS를 우회하므로, broad `anon`/`authenticated` table grant가 필요하지 않음
- `invoice_manager/scripts/supabase_rls_policies.sql`은 authenticated select/admin write 패턴을 갖고 있으나 운영 grant가 과하게 남아 있음

모바일 가격관리 웹:

- 브라우저는 anon key로 로그인 후 user access token을 붙여 호출함
- 직접 호출 경로:
  - `mobile_worker_status_view`
  - `mobile_unpriced_dxf_view`
  - `im_mobile_price_update_requests` own select
  - `rpc/im_create_mobile_price_request`
  - Edge Function `create-preview-signed-url`
- 브라우저가 직접 `im_dxf_files`, `im_dxf_previews`, Storage path, service_role을 다루면 안 됨

Edge Function:

- `create-preview-signed-url`은 user auth를 확인한 뒤 service role client로 preview metadata와 Storage signed URL을 처리함
- 이 경로는 DB table grant보다 function auth와 service role secret 안전성이 중요함

## 적용 원칙

1. `anon`은 public schema table/view/sequence/function에 직접 권한을 갖지 않는다.
2. `authenticated`는 모바일 가격관리와 명시된 제한 view/RPC만 갖는다.
3. 회사사이트 public table은 서버 Prisma/service DB credential 경유만 허용한다.
4. 관리프로그램 데스크톱은 service_role 경유를 유지한다.
5. service_role 권한은 제거하지 않는다.
6. public view는 RLS가 없으므로 grant 자체를 최소화한다.
7. function은 PostgreSQL 기본 `PUBLIC` EXECUTE가 남지 않게 `PUBLIC`, `anon`, `authenticated`를 함께 revoke한다.
8. SECURITY DEFINER RPC는 `search_path = public`과 role guard를 명시한다.
9. 적용 전후 모두 metadata-only SQL로 검증한다.

## 제안 권한 모델

### `anon`

모든 public schema direct 권한 제거:

- table/view: none
- sequence: none
- function: none

### `authenticated`

허용 후보:

| 종류     | 객체                                                          | 권한      | 근거                                                                    |
| -------- | ------------------------------------------------------------- | --------- | ----------------------------------------------------------------------- |
| view     | `mobile_unpriced_dxf_view`                                    | `SELECT`  | 모바일 가격 입력 목록                                                   |
| view     | `mobile_worker_status_view`                                   | `SELECT`  | 모바일 worker 상태 표시                                                 |
| table    | `im_mobile_price_update_requests`                             | `SELECT`  | own request 조회, RLS `request_select_own` 필요                         |
| function | `im_create_mobile_price_request(BIGINT, INTEGER, TEXT, TEXT)` | `EXECUTE` | 모바일 가격 요청 생성                                                   |
| function | `im_get_preview_signed_url_contract(BIGINT)`                  | 보류      | 현재 브라우저는 Edge Function을 호출하므로 직접 RPC grant 필요성 재확인 |

보류 또는 제거 후보:

- `authenticated` direct SELECT on `im_company_master`, `im_invoice_*`, `im_dxf_files`, `im_dxf_previews`
- `authenticated` write grant on any table
- `authenticated` EXECUTE on desktop-only mutation RPC
- mobile worker claim/finish/upsert RPC의 authenticated grant

### `service_role`

유지 후보:

- desktop app table access
- desktop app RPC access
- Edge Function metadata lookup and Storage signed URL
- worker claim/finish/upsert RPC

주의:

- 일부 worker RPC는 현재 `public.im_is_admin()`만 검사한다. service_role desktop worker 경로를 유지하려면 함수 guard가 `auth.role() = 'service_role' OR public.im_is_admin()` 형태인지 적용 전 확인해야 한다.

## 적용 migration 초안 구조

운영 적용 전 별도 승인 필요.

검토용 SQL 초안:

- `docs/security/supabase-rls-grant-redesign-draft-2026-06-24.sql`
- 이 파일은 운영 적용 파일이 아니라 리뷰/검증용 draft다.

1. `BEGIN`
2. public table 대상 RLS enable
   - 회사사이트 Prisma table
   - 관리프로그램 `im_*` table
   - `_prisma_migrations`
   - 존재하지 않는 table은 `to_regclass`로 skip
3. broad grant revoke
   - `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated`
   - `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated`
   - `REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated`
   - `REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC`
   - default privileges도 동일 revoke, function은 `PUBLIC`도 포함
4. service_role table/sequence/function 경로 보존
5. `im_is_admin()`이 `auth.role() = 'service_role'` 또는 기존 admin role을 허용하도록 보정
6. mobile/authenticated 최소 예외 재부여
7. desktop service_role RPC/table smoke 확인
8. `COMMIT`

## 적용 전 필수 보강

- 새 migration은 기존 `20260624093000_enable_public_table_rls`를 대체하거나 확장한다.
- `npm run security:supabase-readiness`가 새 migration table list와 read-only expected list 일치를 확인해야 한다.
- read-only SQL metadata-only guard가 통과해야 한다.
- migration의 `GRANT ... TO authenticated`는 모바일 allowlist만 허용해야 한다.
- migration의 `GRANT ... TO anon`은 없어야 한다.
- `im_is_admin()`은 fixed `search_path = public`과 `service_role OR admin` guard를 가져야 한다.
- 관리프로그램 모바일 계약 테스트에 다음 검증을 추가한다.
  - `anon` grant 금지
  - mobile view/RPC allowlist만 authenticated grant 허용
  - desktop-only RPC는 service_role 또는 admin guard 필요
- service_role desktop smoke가 불가능하면 운영 적용 보류.

## 적용 후 검증

운영 적용 승인 후:

1. metadata-only read-only SQL 재실행
2. 기대값:
   - RLS disabled public table 0 또는 의도 예외 문서화
   - `anon` table/view/sequence/function grant 0
   - `authenticated` broad DML grant 0
   - allowlisted mobile view/RPC grant만 존재
3. Supabase Advisor 재실행
4. 회사사이트 smoke:
   - 관리자 로그인
   - 거래처 로그인
   - 문의 상세
   - 웹하드 파일 목록
   - Worker 주요 화면
5. 관리프로그램 smoke:
   - Supabase mode 주요 조회
   - 가격 요청 worker claim/finish
   - 모바일 가격관리 로그인, 목록, 요청 생성, signed URL

## 명시 승인 전 금지

- 운영 migration deploy
- grant/RLS/policy 변경
- customer row 조회
- service_role/anon key 출력
- mobile user password 또는 customer file path 기록
- `docs/security/supabase-rls-grant-redesign-draft-2026-06-24.sql` 실행

## 다음 승인 문구

`Supabase RLS/grant 마이그레이션 범위 재설계 승인`
