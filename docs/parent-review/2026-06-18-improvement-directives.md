# 2026-06-18 부모 검토 보완 지시

상태: in_progress
부모 색인: `../../../docs/parent-review-index.md`
근거: `PROJECT_STATUS.md`, `docs/task-board.md`, `docs/release-readiness.md`, 루트 `docs/todo.md`

## 요약

웹 플랫폼은 기본 기능과 배포 기반은 갖췄다. 2026-06-25 운영 DB migration과 Worker/Google Drive 회귀 테스트로 P0 안정화 항목은 해소했으며, 남은 범위는 실제 고객 파일 mutation smoke 승인 여부와 Worker/mobile 운영 QA다.

## 지시 목록

| ID         | 우선순위 | 부족한 점                                                  | 지시사항                                                                                               | 완료 기준                                                  | 검증                                                          |
| ---------- | -------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------- |
| YJW-PR-001 | P0       | Worker 작업 상태 변경 500 에러                             | 재현 조건, API route, NestJS service, DB 상태 전이를 추적해 원인을 확정한다                            | 재현 시나리오와 수정 근거, 회귀 테스트 또는 운영 확인 기록 | 완료: 2026-06-25 운영 DB migration/status 및 상태 변경 테스트 |
| YJW-PR-002 | P0       | Google Drive 웹하드 업로드 실패/토큰 오류/대용량 처리 기준 | 허용 용량, Drive upload proxy, resumable upload, token acquisition, 사용자 오류 메시지를 점검한다      | 대용량 샘플 업로드 기준과 실패 시 복구/재시도 기준 문서화  | 완료: 2026-06-25 Google Drive upload session 관련 테스트      |
| YJW-PR-003 | P1       | Worker/mobile 운영 QA 미완료                               | Worker 알림, 최신 도면 다운로드, 추가 도면 업로드, 납품증빙 모바일 흐름을 release checklist로 확인한다 | `docs/release-readiness.md`의 Worker 항목 상태 갱신        | 브라우저/모바일 QA 체크 기록                                  |
| YJW-PR-004 | P1       | API Rate Limiting/세션 경계                                | 운영 WebSocket/session cookie, API key scope, rate limit 정책을 정리한다                               | 운영 env 확인 항목과 실패 시 대응 기준 정리                | env checklist와 route guard 확인                              |

## 실행 순서

1. `YJW-PR-001`, `YJW-PR-002`는 2026-06-25 회귀 테스트와 운영 DB 스키마 적용으로 처리했다.
2. Worker/mobile QA를 release checklist 기준으로 진행한다.
3. 완료 시 `PROJECT_STATUS.md`, 루트 `docs/todo.md`, 필요 시 `docs/company-project-overview.md`를 갱신한다.
