# Phase 5: 문서 동기화 + CHANGELOG

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (루트 + yjlaser_website)
- `/tasks/6-laser-only/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이번 task에서 변경/생성된 모든 파일을 읽어라:

**Phase 1 (백엔드):**

- `webhard-api/prisma/schema.prisma` — LaserOnlyMapping 모델
- `webhard-api/src/companies/laser-only-mapping.service.ts`
- `webhard-api/src/companies/dto/laser-only-mapping.dto.ts`
- `webhard-api/src/companies/companies.controller.ts` — 신규 엔드포인트
- `webhard-api/src/companies/companies.module.ts`
- `webhard-api/src/integration/orders/auto-contact.service.ts` — isLaserOnlyFolder 체크 추가
- `webhard-api/src/integration/orders/orders.module.ts`
- `webhard-api/src/companies/__tests__/laser-only-mapping.service.spec.ts`

**Phase 2 (타입+뱃지):**

- `src/lib/types/contact.ts` — InquiryType, ContactStatus, StatusCounts
- `src/app/(admin)/admin/contacts/_components/InquiryTypeBadge.tsx`
- `src/app/(admin)/admin/contacts/_lib/utils.ts`

**Phase 3 (웹하드 UI):**

- `src/app/(admin)/admin/integration/webhard/_components/LaserOnlyCompanySettings.tsx`
- `src/app/(admin)/admin/integration/webhard/_components/index.ts`
- `src/app/(admin)/admin/integration/webhard/page.tsx`

**Phase 4 (거래처 대시보드):**

- `src/app/company/dashboard/types.ts`
- `src/app/company/dashboard/components/shared/ContactList.tsx`
- `src/app/company/dashboard/hooks.ts`
- `e2e/laser-only-company.spec.ts`

## 작업 내용

### 1. 문서 정합성 검증 및 수정

아래 문서들을 읽고, 이번 task의 실제 구현과 비교하여 불일치를 수정하라:

#### `docs/specs/features/laser-only-company-inquiry.md`

- 완료 기준 체크리스트의 모든 항목을 실제 구현과 대조
- 구현된 항목은 `[x]`로 체크
- API 엔드포인트, 데이터 모델, 프론트엔드 변경사항이 실제 코드와 일치하는지 확인
- 불일치 시 스펙 문서를 실제 구현에 맞게 수정

#### `docs/specs/features/contact-order-unification.md`

- Phase 0에서 작성한 내용이 Phase 1의 실제 구현과 일치하는지 확인
- 불일치 시 수정

#### `docs/specs/db/prisma-tables.md`

- LaserOnlyMapping 테이블이 실제 스키마와 일치하는지 확인

#### `docs/specs/api/nestjs-endpoints.md`

- laser-only-mappings 엔드포인트가 실제 구현과 일치하는지 확인

#### `docs/API.md`

- 레이저가공 관련 API가 실제 구현과 일치하는지 확인

### 2. CHANGELOG 업데이트

`docs/changelog/CHANGELOG.md`에 이번 변경사항을 기록하라:

```markdown
## [날짜] - 레이저가공 전용 업체 문의 기능

### 추가

- 레이저가공 전용 업체 매핑 시스템 (LaserOnlyMapping 테이블)
  - 업체 미등록 상태에서도 폴더명으로 레이저가공 매핑 가능
  - 추후 업체 등록 시 수동 연결 기능
- 웹하드 관리 페이지 `/admin/integration/webhard`에 "레이저가공 업체 관리" 섹션
- 문의 카드에 "레이저가공" 회색 뱃지 표시
- 거래처 대시보드에서 레이저가공 문의 확인 가능
- Contact/Order 통합 설계 문서 작성

### 변경

- AutoContactService: LaserOnlyMapping 1차 체크 + Company.laserOnly 하위호환 2차 체크
- InquiryTypeBadge: laser_cutting 유형 뱃지 추가
- ContactStatus 타입에 'completed' 추가
- InquiryType 타입에 'laser_cutting' 추가

### API

- GET /api/v1/companies/laser-only-mappings — 매핑 목록 조회
- POST /api/v1/companies/laser-only-mappings — 매핑 추가
- DELETE /api/v1/companies/laser-only-mappings/:id — 매핑 삭제
- PATCH /api/v1/companies/laser-only-mappings/:id/link — 업체 연결
```

날짜는 오늘 날짜를 사용하라. 기존 CHANGELOG 항목 위에 추가하라.

### 3. 최종 빌드 검증

모든 문서 수정 후 빌드가 정상인지 최종 확인.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test && cd webhard-api && pnpm build && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/6-laser-only/index.json`의 phase 5 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 이 phase에서 코드를 수정하지 마라. 문서만 수정한다.
- 유일한 예외: 문서 검증 중 발견한 사소한 타입/빌드 에러는 이 phase에서 수정할 수 있다.
- CHANGELOG는 기존 항목 위에 추가하라 (최신 항목이 위).
- 문서 불일치 발견 시, 코드가 아닌 문서를 수정하라 (코드가 실제 동작이므로 문서를 코드에 맞춘다).
- 기존 테스트를 깨뜨리지 마라.
