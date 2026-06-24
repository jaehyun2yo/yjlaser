# 2026-06-24 운영 데이터 연동 통합 지시

상태: proposed
부모 색인: `../../../docs/parent-review-index.md`
근거 문서: `../../../docs/operational-data-integration-design.md`, `../../../docs/superpowers/plans/2026-06-24-operational-data-integration.md`, `PROJECT_STATUS.md`

## 요약

회사사이트는 운영 중앙 원장이다. 빠른 운영 전환을 위해 `Contact`를 canonical work item으로 고정하고, 외부웹하드/관리프로그램/레이저네스팅프로그램이 같은 Contact를 찾고 같은 단계 변경 API를 쓰도록 계약을 잠근다.

## 지시 목록

| ID            | 우선순위 | 부족한 점                                            | 지시사항                                                               | 완료 기준                                            | 검증                                         |
| ------------- | -------- | ---------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------- |
| WEB-ODATA-001 | P0       | `Order.contactId` 숫자형과 `Contact.id` UUID가 혼재  | Contact 중심 조회/응답 계약을 테스트로 고정                            | 작업번호/문의번호/Contact ID 조회가 같은 문의를 반환 | `pnpm test -- contacts`                      |
| WEB-ODATA-002 | P0       | legacy Order status가 운영 단계와 충돌 가능          | legacy `file_classified`, `nesting_complete`를 운영 성공 기준에서 분리 | Contact 단계 변경은 Contact API만 성공 기준          | `pnpm test -- orders`, `pnpm test -- events` |
| WEB-ODATA-003 | P0       | 외부웹하드 매핑 이후 과거/신규 파일 라우팅 회귀 위험 | 외부 허브 폴더 매핑과 새 업로드 라우팅 테스트 작성                     | 과거 파일과 새 파일이 매핑 업체에서 조회됨           | `pnpm test -- contact-folder-sync`, E2E      |
| WEB-ODATA-004 | P1       | NestingTask 결과와 Contact 단계 연결이 불명확        | task result 성공 시 Contact `cutting` 전환 경로 확정                   | remote task와 수동 완료가 같은 Contact 결과 생성     | `pnpm test -- nesting-tasks`                 |

## 실행 순서

1. `Contact` API 응답과 조회 계약을 먼저 테스트로 고정한다.
2. legacy Order/event 경로가 Contact 단계에 영향을 주지 않도록 분리한다.
3. 외부웹하드 미등록 업체, 업체 매핑, 매핑 이후 새 업로드 E2E를 추가한다.
4. 레이저네스팅 task result bridge는 Contact 계약이 고정된 뒤 진행한다.

## 완료 후 갱신할 문서

- `../../../docs/operational-data-integration-design.md`
- `../../../docs/superpowers/plans/2026-06-24-operational-data-integration.md`
- `PROJECT_STATUS.md`
- `../../../docs/todo.md`
