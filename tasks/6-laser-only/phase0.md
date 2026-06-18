# Phase 0: 문서 업데이트

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (루트 + yjlaser_website)
- `docs/API.md`
- `docs/specs/features/laser-only-company-inquiry.md`
- `docs/specs/api/nestjs-endpoints.md`
- `docs/specs/db/prisma-tables.md`
- `webhard-api/prisma/schema.prisma` (Company, Contact, Order 모델)
- `webhard-api/src/integration/orders/orders.service.ts` (Order 시스템 이해)
- `webhard-api/src/integration/orders/auto-contact.service.ts` (자동 문의 생성)
- `webhard-api/src/contacts/contacts.service.ts` (Contact 시스템)

## 작업 내용

### 1. `docs/specs/features/laser-only-company-inquiry.md` 업데이트

기존 스펙 파일을 아래 내용으로 업데이트한다:

**데이터 모델 섹션에 LaserOnlyMapping 추가:**

```prisma
model LaserOnlyMapping {
  id          Int       @id @default(autoincrement())
  folderName  String    @unique @map("folder_name")  // 웹하드 폴더명 = 업체명
  companyId   Int?      @map("company_id")            // 연결된 업체 (nullable)
  company     Company?  @relation(fields: [companyId], references: [id], onDelete: SetNull)
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @default(now()) @map("updated_at")

  @@index([folderName])
  @@map("laser_only_mappings")
}
```

**핵심 설계 변경:**

- 기존: Company.laserOnly=true인 경우만 laser_cutting 처리
- 변경: LaserOnlyMapping 테이블이 1차 소스, Company.laserOnly는 하위호환용 2차 소스
- 업체가 미등록이어도 폴더명(업체명)으로 매핑 등록 가능
- 추후 업체 등록 시 관리자가 수동으로 연결 (자동 연결 아님)
- 매핑에 업체 연결 시 Company.laserOnly=true 자동 동기화
- 매핑 삭제 시 Company.laserOnly=false 자동 동기화

**API 섹션에 신규 엔드포인트 추가:**

| Method | Path                                           | 설명           | Auth        |
| ------ | ---------------------------------------------- | -------------- | ----------- |
| GET    | /api/v1/companies/laser-only-mappings          | 매핑 목록 조회 | ApiKeyGuard |
| POST   | /api/v1/companies/laser-only-mappings          | 매핑 추가      | ApiKeyGuard |
| DELETE | /api/v1/companies/laser-only-mappings/:id      | 매핑 삭제      | ApiKeyGuard |
| PATCH  | /api/v1/companies/laser-only-mappings/:id/link | 업체 연결      | ApiKeyGuard |

**AutoContactService 흐름 변경:**

```
파일 업로드 → companyName 추출
  → LaserOnlyMapping에 folderName 존재? → laser_cutting
  → Company.laserOnly=true? → laser_cutting (하위호환)
  → 둘 다 아님 → 기존 로직
```

**프론트엔드 변경사항 추가:**

- InquiryTypeBadge에 laser_cutting → BADGE.gray "레이저가공" 정적 뱃지
- 웹하드 관리 페이지(`/admin/integration/webhard`)에 "레이저가공 업체 관리" 섹션 추가
  - 폴더명 직접 입력 또는 등록 업체 드롭다운으로 매핑 등록
  - 미연결 매핑에 "업체 연결" 기능
- 거래처 대시보드에 inquiry_type 기반 뱃지 표시
- ContactStatus 타입에 completed 추가, InquiryType에 laser_cutting 추가

**완료 기준 체크리스트 업데이트:** 백엔드 완료 항목(1-10) 중 이미 구현된 것은 체크. 신규 항목 추가.

### 2. `docs/specs/features/contact-order-unification.md` 신규 작성

Contact/Order 통합 설계 문서를 작성한다. 아래 구조를 따라라:

```markdown
# Contact/Order 통합 설계 (Design Document)

## 현재 상태 분석

### 이원화 구조

- Contact (문의): 관리자 작업관리 (`/admin/contacts`), 웹하드 자동생성, 9단계 상태
- Order (주문): 거래처 포탈 (`/company/orders`), DXF 관리프로그램 연동, 17단계 상태
- 동일 개념(문의=주문)이 두 테이블로 중복

### 문제점

- 데이터 이중 관리, 동기화 코드 (updateOrderStatus → contact.update)
- Order.contactId(BigInt)와 Contact.id(UUID) 타입 불일치 → FK 불가
- inquiryNumber 문자열 매칭으로 연결 (취약)
- 상태 체계 중복 (9단계 vs 17단계)

### Contact에만 있는 것

(Contact의 주요 필드 나열)

### Order에만 있는 것

- dxfClassifiedCount, dxfTotalPrice, nestingSheetCount, nestingUtilization
- scheduledAutoCompleteAt
- OrderEvent (이벤트 로그)
- Task 관계 (Machine 연결)
- Delivery 관계 (배송 추적)

## 통합 전략

### 원칙

- Contact를 단일 소스로 통합
- Order 테이블은 단계적 폐기
- DXF 전용 필드는 Contact에 추가하되 거래처 포탈에는 노출 안 함

### 단계별 실행 방안

#### Phase A: API 래퍼 (하위호환)

- 기존 POST /api/v1/integration/orders 엔드포인트 유지
- 내부적으로 Contact에 쓰기 (Order 생성 중단)
- 관리프로그램은 API 변경 없이 동작

#### Phase B: Contact 스키마 확장

- DXF 관련 필드 Contact에 추가 (dxfClassifiedCount 등)
- OrderEvent → ContactStatusHistory로 통합
- Task, Delivery FK를 Contact로 변경

#### Phase C: 거래처 포탈 마이그레이션

- /company/orders 페이지를 Contact 기반으로 재작성
- Order 테이블의 기존 데이터를 Contact로 마이그레이션

#### Phase D: Order 폐기

- Order 테이블 deprecated → 삭제
- OrderEvent 테이블 삭제

### 영향 범위

- 백엔드: OrdersService 리팩토링, 관리프로그램 API 래퍼
- 프론트엔드: 거래처 주문 페이지 재작성
- 외부: DXF 관리프로그램(Python) — API 래퍼로 호환 유지

### 리스크

- 데이터 마이그레이션 중 정합성
- 관리프로그램 호환성
- 거래처 포탈 사용성 변화
```

### 3. `docs/API.md` 업데이트

레이저가공 매핑 관련 엔드포인트 4개 추가.

### 4. `docs/specs/api/nestjs-endpoints.md` 업데이트

엔드포인트 인덱스에 laser-only-mappings 4개 추가.

### 5. `docs/specs/db/prisma-tables.md` 업데이트

LaserOnlyMapping 테이블 스펙 추가.

## Acceptance Criteria

```bash
# 문서만 수정하므로 빌드 검증 불필요. 문서 파일 존재 확인만.
test -f docs/specs/features/laser-only-company-inquiry.md && test -f docs/specs/features/contact-order-unification.md && echo "PASS" || echo "FAIL"
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/6-laser-only/index.json`의 phase 0 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 코드는 수정하지 마라. 문서만 수정/생성한다.
- 기존 laser-only-company-inquiry.md의 내용을 덮어쓰지 말고, 기존 내용에 신규 내용을 추가/업데이트하라.
- contact-order-unification.md는 설계 문서이며, 구현은 별도 task에서 진행한다.
- 모든 문서는 영어로 작성한다 (CLAUDE.md 규칙: docs는 English only).
