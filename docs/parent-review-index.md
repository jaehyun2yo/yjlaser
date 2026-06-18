# 부모 검토 보완 지시 색인

작성일: 2026-06-18

이 문서는 부모 프로젝트에서 발견한 부족점과 하위 프로젝트에 내려간 보완 지시 문서를 한곳에서 찾기 위한 색인이다. 상세 실행 지시는 각 프로젝트의 `docs/parent-review/` 문서가 소유한다.

작성 규칙은 `docs/parent-review-workflow.md`를 따른다.

## 현재 보완 지시

| 프로젝트 | 지시 문서 | 상태 | 우선순위 요약 | 부모 판단 |
| --- | --- | --- | --- | --- |
| yjlaser_website | [2026-06-18 improvement directives](../yjlaser_website/docs/parent-review/2026-06-18-improvement-directives.md) | proposed | P0 Worker 500/R2 timeout, 운영 QA | 웹 운영 안정화가 먼저 |
| 외부웹하드동기화프로그램 | [2026-06-18 improvement directives](../외부웹하드동기화프로그램/docs/parent-review/2026-06-18-improvement-directives.md) | proposed | P0 v1.5.15 장시간 검증, DLQ/충돌 UI | 무인 동기화 신뢰성 확인이 먼저 |
| 유진레이저목형 관리프로그램 | [2026-06-18 improvement directives](<../유진레이저목형 관리프로그램/docs/parent-review/2026-06-18-improvement-directives.md>) | proposed | P1 Popbill FAILED 정책, 분류 정확도 | 발송 실패 대응과 분류 품질 보강 |
| 레이저네스팅프로그램 | [2026-06-18 improvement directives](../레이저네스팅프로그램/docs/parent-review/2026-06-18-improvement-directives.md) | proposed | P1 현장 DXF 벤치마크, 알고리즘 품질 기준 | 기능 추가보다 현장 검증 우선 |
| computeroff | [2026-06-18 improvement directives](../computeroff/docs/parent-review/2026-06-18-improvement-directives.md) | proposed | P1 미응답 알림, 주간 리포트 | 운영 보조 알림 체계 보강 |

## 운영 규칙

- 새 부모 검토가 있으면 먼저 하위 프로젝트 지시 문서를 만들고 이 색인에 추가한다.
- 완료된 항목은 이 색인의 상태를 `done`으로 바꾸되, 상세 검증 결과는 하위 프로젝트 문서에 남긴다.
- 상위 우선순위가 바뀌면 `docs/todo.md`와 `docs/company-project-overview.md`도 함께 갱신한다.
