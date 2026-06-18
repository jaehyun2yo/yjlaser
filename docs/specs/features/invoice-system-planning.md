# Invoice System Planning

최종 갱신일: 2026-05-13

## 목적

PRD의 미구현 항목 `ADM-004` 관리자 청구서 관리와 `CMP-003` 거래처 청구서 조회를 실제 구현 가능한 PRD/API/DB/UI/test 작업으로 분해한다.

## 현재 상태

- `/company/billing` 화면은 완료된 문의 목록을 기반으로 임시 청구서 형태를 보여준다.
- 관리자 청구서 관리 화면과 청구서 DB 모델은 아직 없다.
- 관리프로그램(`유진레이저목형 관리프로그램/invoice_manager/`)과의 계약은 운영 책임자 확인이 필요하다.

## 외부 계약 확인 필요

| 항목          | 확인 필요 내용                                                                         |
| ------------- | -------------------------------------------------------------------------------------- |
| 원천 데이터   | 관리프로그램이 청구서 번호, 공급가, 세액, 품목, 거래처, 발행일, 입금 상태를 제공하는지 |
| 동기화 방식   | push API, scheduled pull, CSV import 중 어느 방식인지                                  |
| 식별자        | company id, 사업자번호, 거래처명 alias, invoice number 중 authoritative key            |
| 수정 권한     | 웹에서 청구서를 수정할 수 있는지, 조회 전용인지                                        |
| 파일          | PDF/엑셀 원본이 있는지, R2 저장이 필요한지                                             |
| 개인정보/세무 | 보존 기간, 다운로드 권한, 삭제 정책                                                    |

## Task 분해

| Task         | 영역       | 범위                                            | 완료 기준                                             |
| ------------ | ---------- | ----------------------------------------------- | ----------------------------------------------------- |
| ADM-004-PRD  | Product    | 관리자 청구서 관리 요구사항 확정                | 발행/수정/조회/다운로드/입금상태 범위가 문서화됨      |
| ADM-004-API  | Backend    | invoice import/list/detail/status endpoints     | admin/API-key 인증 경계와 pagination/filter 계약 확정 |
| ADM-004-DB   | Database   | invoices, invoice_items, invoice_sync_logs 모델 | migration, unique key, rollback plan 작성             |
| ADM-004-UI   | Admin UI   | 청구서 목록, 상세, 동기화 상태, 오류 표시       | admin이 거래처/기간/상태로 조회 가능                  |
| CMP-003-API  | Backend    | company-scoped invoice list/detail/download     | company ownership 필터가 서버에서 강제됨              |
| CMP-003-UI   | Company UI | 거래처 청구서 목록/상세/PDF 다운로드            | 거래처가 자기 청구서만 조회                           |
| INV-TEST-001 | Tests      | admin/company/API-key 권한 matrix               | admin 허용, 다른 company 거부, unscoped key 거부      |
| INV-TEST-002 | Tests      | sync idempotency                                | 같은 invoice number 재동기화가 중복 생성하지 않음     |
| INV-OPS-001  | Operations | 운영 sync/rollback runbook                      | 실패 invoice 재처리와 원복 절차 문서화                |

## 권장 API 초안

| Method | Path                                        | Auth           | 설명                       |
| ------ | ------------------------------------------- | -------------- | -------------------------- |
| GET    | `/api/v1/invoices`                          | Admin/API key  | 청구서 목록                |
| GET    | `/api/v1/invoices/:id`                      | Admin/API key  | 청구서 상세                |
| POST   | `/api/v1/invoices/import`                   | Scoped API key | 관리프로그램 청구서 upsert |
| PATCH  | `/api/v1/invoices/:id/status`               | Admin          | 입금/취소 상태 변경        |
| GET    | `/api/v1/companies/:companyId/invoices`     | Company/Admin  | 거래처 scoped 청구서 목록  |
| GET    | `/api/v1/companies/:companyId/invoices/:id` | Company/Admin  | 거래처 scoped 청구서 상세  |

## 다음 단계

1. 관리프로그램의 실제 청구서 데이터 shape를 확인한다.
2. authoritative identifier와 idempotency key를 확정한다.
3. DB 모델과 API spec을 작성한 뒤 migration plan을 만든다.
4. company ownership 테스트를 먼저 작성하고 UI를 연결한다.
