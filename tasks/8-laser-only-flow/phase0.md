# Phase 0: 문서 업데이트

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/laser-only-company-inquiry.md` (레이저 전용 업체 문의 스펙)
- `docs/WEBHARD_ARCHITECTURE.md` (웹하드 아키텍처)
- `CLAUDE.md` (프로젝트 컨벤션)
- `src/lib/utils/processStages.ts` (공정 단계 정의)

## 배경

레이저 전용 업체(`inquiry_type = 'laser_cutting'`)의 문의는 레이저 가공만 수행하므로, 칼작업/오시작업을 거칠 필요가 없다.

현재 흐름: 접수 → 레이저가공 → **칼작업 → 오시작업 → 납품** (일반 문의와 동일)
변경 흐름: 접수 → 레이저가공 → **완료** (`status='delivered', processStage=null`)

업체 대시보드에서도 7단계가 아닌 3단계(접수 → 레이저가공 → 완료)만 표시해야 한다.

## 작업 내용

### 1. `docs/specs/features/laser-only-company-inquiry.md` 업데이트

기존 문서에 다음 내용을 추가/수정하라:

- **공정 흐름 섹션** 추가:
  - 일반 문의: 7단계 (drawing → sample → drawing_confirmed → laser → cutting → creasing → delivery)
  - 레이저 전용 문의: 접수 → 레이저가공 → 완료 (3단계)
  - 레이저가공 완료 시 `status='delivered', processStage=null`로 즉시 종료
  - 칼작업(cutting), 오시작업(creasing), 납품(delivery) 단계를 거치지 않음

- **업체 대시보드 표시**:
  - `inquiry_type='laser_cutting'` 문의는 OrderProgressBar에서 3단계만 표시
  - 단계: 접수 → 레이저가공 → 완료

- **관리자 공정보드**:
  - 레이저 전용 문의의 다음 단계로 cutting/creasing/delivery 대신 "완료" 옵션만 제공

- **작업자 앱**:
  - 레이저 전용 문의에 "레이저가공 완료" 버튼 표시

### 2. `docs/WEBHARD_ARCHITECTURE.md` 업데이트

자동 문의 생성 흐름에 레이저 전용 공정 단축 경로를 명시하라.
해당 섹션만 찾아서 수정. 전체를 다시 쓰지 마라.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/8-laser-only-flow/index.json`의 phase 0 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 이 phase는 문서만 수정한다. 코드를 수정하지 마라.
- 기존 문서 구조와 스타일을 유지하라.
