# 2026-06-24 운영 데이터 연동 통합 지시

상태: in_progress
부모 색인: `../../../docs/parent-review-index.md`
근거 문서: `../../../docs/operational-data-integration-design-v2.md`, `../../../docs/superpowers/plans/2026-06-24-operational-data-integration-v2.md`, `../../../docs/reports/2026-06-24-operational-integration-v2-rebase-audit.md`, `PROJECT_STATUS.md`

## 요약

회사사이트는 운영 중앙 원장이다. 빠른 운영 전환을 위해 `Contact`를 canonical work item으로 고정하고, 외부웹하드/관리프로그램/레이저네스팅프로그램이 같은 Contact를 찾고 같은 단계 변경 API를 쓰도록 계약을 잠근다.

진행 메모(2026-06-24):

- WEB-ODATA-001/002/003의 핵심 계약은 ODATA2-002~007 구현에서 회사사이트 API/Jest/Playwright E2E로 검증됐다.
- 등록 업체 직접 문의, 미등록 외부웹하드 업로드, 업체 매핑, 신규 업로드 라우팅, `drawing_confirmed -> laser -> cutting` 단계 전환은 `e2e/ui-operational-workflow-v2.spec.ts`에서 통과했다.
- ODATA2-007 리뷰 후 기존 API key 자동 권한 승격, 프로그램별 단계 건너뛰기, E2E 원격 URL 오작동, 중복/삭제 업체명 자동 매칭, Contact file sync fallback, stage race 역전이, R2 `문의/완료` Drive mutation 리스크를 차단했다.
- legacy `/integration/laser-completions`도 `nesting_program` 전용 공유 stage writer로 수렴했고, stage/완료 retry의 이벤트/타임라인 중복 발행을 차단했다.
- ODATA2-008 기존 데이터 백필 dry-run은 count-only 출력과 remote/unknown DB 승인 gate로 구현됐다.
- ODATA2-009 운영 trace와 ODATA2-010 Contact 중심 Order/Event read model 정렬까지 로컬/테스트 개발은 완료됐다.
- 2026-06-25 사용자 승인 후 운영 DB migration, migrate status, count-only dry-run, API health smoke를 완료했다.
- 남은 후속은 실제 백필 write 승인안과 P1 원격 NestingTask result bridge 정리다. 실제 백필 write는 별도 batch/rollback 계획과 재승인 전까지 금지한다.

## 지시 목록

| ID            | 우선순위 | 부족한 점                                            | 지시사항                                                               | 완료 기준                                             | 검증                                            |
| ------------- | -------- | ---------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| WEB-ODATA-001 | P0       | `Order.contactId` 숫자형과 `Contact.id` UUID가 혼재  | Contact 중심 조회/응답 계약을 테스트로 고정                            | 작업번호/문의번호/Contact ID 조회가 같은 문의를 반환  | `pnpm test -- contacts`                         |
| WEB-ODATA-002 | P0       | legacy Order status가 운영 단계와 충돌 가능          | legacy `file_classified`, `nesting_complete`를 운영 성공 기준에서 분리 | Contact 단계 변경은 Contact API만 성공 기준           | `pnpm test -- orders`, `pnpm test -- events`    |
| WEB-ODATA-003 | P0       | 외부웹하드 매핑 이후 과거/신규 파일 라우팅 회귀 위험 | 외부 허브 폴더 매핑과 새 업로드 라우팅 테스트 작성                     | 과거 파일과 새 파일이 매핑 업체에서 조회됨            | `pnpm test -- contact-folder-sync`, E2E         |
| WEB-ODATA-004 | P1       | NestingTask 결과와 Contact 단계 연결이 불명확        | task result 성공 시 Contact `cutting` 전환 경로 확정                   | remote task와 수동 완료가 같은 Contact 결과 생성      | `pnpm test -- nesting-tasks`                    |
| WEB-ODATA-005 | P1       | 새 JobEvent/JobFailure identity 컬럼 운영 적용 필요  | 승인된 migration과 count-only dry-run, smoke 검증                      | 운영 DB에 identity 컬럼 존재, count-only dry-run 정상 | 완료: 2026-06-25 migration/status/dry-run/smoke |

## 실행 순서

1. `Contact` API 응답과 조회 계약을 먼저 테스트로 고정한다.
2. legacy Order/event 경로가 Contact 단계에 영향을 주지 않도록 분리한다.
3. 외부웹하드 미등록 업체, 업체 매핑, 매핑 이후 새 업로드 E2E를 추가한다.
4. 레이저네스팅 task result bridge는 Contact 계약이 고정된 뒤 진행한다.

## 완료 후 갱신할 문서

- `../../../docs/operational-data-integration-design-v2.md`
- `../../../docs/superpowers/plans/2026-06-24-operational-data-integration-v2.md`
- `PROJECT_STATUS.md`
- `../../../docs/todo.md`

## 2026-06-25 상태

- P0 Contact 계약, 등록/미등록 접수 E2E, 외부웹하드 매핑, 관리/네스팅 단계 전환, legacy Order read model 정렬은 구현/검증됐다.
- 운영 DB migration과 count-only dry-run은 승인 후 완료됐다.
- 실제 고객 파일 mutation smoke, 백필 write, 원격 NestingTask result bridge는 별도 승인/후속 범위다.
