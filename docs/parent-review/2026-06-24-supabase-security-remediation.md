# 2026-06-24 Supabase 보안 보완 지시

상태: in_progress
부모 색인: ../../../docs/parent-review-index.md
근거: Supabase Security Advisor 메일(2026-06-22), `webhard-api/prisma/schema.prisma`, `webhard-api/prisma/migrations/**`, `docs/security/supabase-security-readonly-result-2026-06-24.md`, `docs/security/supabase-rls-grant-redesign-plan-2026-06-24.md`, `docs/security/supabase-rls-grant-redesign-draft-2026-06-24.sql`, `docs/security/supabase-security-postapply-check-2026-06-24.sql`, 로컬 보안 스캔 산출물

## 요약

Supabase Advisor가 `rls_disabled_in_public`, `sensitive_columns_exposed` Critical 이슈를 보고했다. 2026-06-24 운영 read-only metadata 재점검에서 public table 77개, public view 7개가 확인됐고, table 35개가 RLS disabled 상태였다. `anon`/`authenticated`에는 table/view grant 1106건, sequence grant 72건, function grant 260건이 있었다. 기존 회사사이트 중심 47개 RLS/grant migration은 운영 public schema를 충분히 커버하지 못하므로 보류했고, 관리프로그램 `im_*` table과 모바일 가격관리 view/RPC 예외를 포함한 81개 table 범위로 갱신해 운영 적용했다. 이후 Dashboard에 남은 `Security Definer View` 2건은 `security_invoker=true` view와 최소 column grant/RLS policy로 추가 조치했다. post-apply metadata 검증에서 failure 7종은 모두 0건이고, 핵심 public REST 표면 4개는 anon key smoke에서 모두 HTTP 401로 차단됐다. 로컬 의존성 감사는 root npm과 `webhard-api` pnpm 모두 known vulnerability 0건까지 보정했다. Tracked secret scan에서 찾은 development fallback session secret/account recovery key도 production source에서 제거했다.

## 지시 목록

| ID          | 우선순위 | 부족한 점                                                                          | 지시사항                                                                                                          | 완료 기준                                                                                             | 검증                                                                                                                                                                                                                         |
| ----------- | -------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-SB-001  | P0       | public schema 77개 테이블 중 35개가 RLS disabled이고 broad API role grant가 확인됨 | 운영 read-only 결과를 기준으로 적용 범위와 예외 여부를 유지 관리한다                                              | 실제 Advisor hit 테이블과 현재 RLS/grant 목록이 문서화됨                                              | 완료: `docs/security/supabase-security-readonly-result-2026-06-24.md`, post-apply failure 0건                                                                                                                                |
| SEC-SB-002  | P0       | 기존 47개 migration이 운영 `im_*` table/view/RPC 범위를 커버하지 못함              | Supabase RLS/grant migration 후보를 회사사이트+관리프로그램 public schema 기준으로 유지하고 별도 승인 후 적용한다 | public API 역할이 민감 public table/view에 broad access를 갖지 않고, 모바일 예외만 최소 권한으로 남음 | 완료: `webhard-api/prisma/migrations/20260624093000_enable_public_table_rls/migration.sql`, `docs/security/supabase-security-postapply-check-2026-06-24.sql`, 운영 post-apply failure 0건, anon REST smoke 4개 표면 HTTP 401 |
| SEC-SB-002A | P0       | Dashboard Advisor 재실행 확인이 수동 UI에만 의존함                                 | Supabase Management API 기반 Advisor verifier를 유지한다                                                          | `SUPABASE_ACCESS_TOKEN`이 있는 환경에서 target rule 잔존 시 실패함                                    | `npm run security:supabase-advisor`, 로컬 토큰 미설정 시 `npm run security:supabase-advisor:optional` skip 확인                                                                                                              |
| SEC-SB-003  | P1       | 향후 직접 Supabase API 사용 시 정책 기준 불명확                                    | 직접 API가 필요한 테이블은 별도 tenant-safe policy와 테스트를 추가한다                                            | 직접 API 사용 테이블마다 정책/테스트/운영 의도 문서 존재                                              | RLS policy test 또는 수동 SQL 검증                                                                                                                                                                                           |
| SEC-SB-004  | P1       | 로컬 debug/sync API 노출 회귀 가능                                                 | sync read proxy, debug S3/R2 route, Sentry example route의 인증/환경 guard를 유지한다                             | 무인증 route 스캔에서 의도된 public route만 남음                                                      | API 테스트와 route guard 스캔                                                                                                                                                                                                |
| SEC-SB-005  | P1       | root npm과 `webhard-api` pnpm 의존성 감사에 high/moderate 취약점이 있었음          | root `package.json` overrides와 `webhard-api` Nest/nodemailer/multer/ws/dev 전이 의존성 보정을 적용한다           | root 전체 npm audit 0건, `webhard-api` 전체 pnpm audit 0건                                            | `npm audit --audit-level=moderate`, `pnpm audit`, tsc/build/핵심 테스트                                                                                                                                                      |
| SEC-SB-006  | P1       | production source에 development fallback secret/key가 있었음                       | `SESSION_SECRET`과 account recovery key 누락 시 고정값 fallback을 제거하고 fail-closed로 동작시킨다               | production source에 hardcoded dev secret/key literal 0건                                              | static gate, targeted Jest, `rg` literal scan, `npm run security:check`                                                                                                                                                      |

## 실행 순서

1. 완료: 사용자 승인 후 운영 Supabase read-only metadata 점검을 재실행했다.
2. 완료: 기존 로컬 준비 migration이 운영 table 34개와 grant relation/view 36개를 누락함을 문서화했다.
3. 완료: 회사사이트 Prisma table, 관리프로그램 `im_*` table, public view grant, 모바일 view/RPC/Edge Function 예외를 분리한 RLS/grant migration 후보를 만들었다.
4. 완료: rollback 계획과 적용 후 검증 SQL을 확인한 뒤 RLS/grant 마이그레이션을 운영 적용했다.
5. 완료: `docs/security/supabase-security-postapply-check-2026-06-24.sql`을 운영 DB metadata로 실행해 failure 0건을 확인했다.
6. 배포 전 root npm과 `webhard-api` pnpm lockfile 보정분을 포함해 빌드/스모크 테스트한다.
7. secret fallback static gate와 tracked secret scan을 보안 회귀 검증에 포함한다.
8. 완료 시 `PROJECT_STATUS.md`, 루트 `docs/todo.md`, 이 문서를 갱신한다.

## 문서 갱신 규칙

- 운영 확인 전에는 상태를 `done`으로 바꾸지 않는다.
- 운영 SQL 결과에는 실제 고객 데이터 row, secret, 토큰 값을 기록하지 않는다.
- 직접 API 허용이 필요한 예외는 테이블/역할/정책 의도를 별도 migration 주석이나 보안 문서에 남긴다.
