# Visit Booking — 방문 예약 슬롯 UX 및 Admin 관리

## 개요

- 목적: 방문 예약 시스템의 슬롯 UX 로딩 상태, Admin 승인/취소/수정 UI, status enum 검증을 정의한다.
- 도메인: 방문 예약 > 공개 폼 슬롯 UI + Admin 예약 관리
- 배경: QA 에서 (1) 슬롯 UI 가 fetch 완료 전에 "예약 가능" 으로 오표시되는 문제, (2) Admin 예약 카드에 승인/거절/수정 버튼이 없는 문제, (3) `VisitBooking.status` 가 enum 검증 없이 임의 문자열 저장 가능한 문제가 제보되었다. (task 23 qa-contact-worker-v1)

## 슬롯 UI 로딩 상태

공개 폼 (`/contact` Step 3) 의 방문 예약 슬롯 버튼은 서버 응답이 도착하기 전까지 **로딩 상태** 를 명시적으로 표시해야 한다.

### 문제점 (기존 동작)

`bookingAvailability` state 초기값이 빈 객체 `{}` 이고, 슬롯 렌더링 시 `availability?.available ?? true` 로 기본값이 "가용" 으로 세팅되어 있어, fetch 완료 전 슬롯이 **실제 자리가 없을 때도 "예약 가능"** 으로 표시되는 버그가 있었다.

### 정책

1. `bookingLoading` state 추가. `currentStep === 3 && receiptMethod === 'visit' && visitDate` 조건 충족 시 `true`, fetch 완료/실패 시 `false`.
2. 슬롯 렌더링에서 `isAvailable` 기본값을 `?? false` 로 변경. 로딩 중에는 명시적 비활성 처리.
3. 로딩 중 슬롯 버튼은 **스켈레톤** (`bg-gray-200 animate-pulse` 블록) 또는 비활성 버튼으로 렌더. "예약 가능" 문자열 노출 금지.
4. fetch 실패 시 모든 슬롯을 `{ count: maxCapacity, available: false }` 로 세팅하여 "예약 마감" 으로 표시 (서버 오류가 가용으로 표시되는 회귀 방지).

### NestJS `getAvailableSlots` 응답 확장

기존 `{ date, slotCounts }` 응답에 `maxCapacity` 필드를 추가한다 (하위 호환 — 기존 소비처는 깨지지 않음):

```ts
{
  date: string;
  slotCounts: Record<string, number>; // 시간대별 현재 예약 수
  maxCapacity: number; // 슬롯당 정원 (현재 2)
}
```

`VisitBookingConstants.MAX_CAPACITY = 2` 를 `webhard-api/src/bookings/constants.ts` 로 분리하여 controller / service / 향후 config 에서 공유. 하드코딩 `2` 를 응답 페이로드로 노출하여 프론트에서 `>= maxCapacity` 비교 시 동일 상수 사용.

### Next.js 프록시 응답

`src/app/api/bookings/available/route.ts` 는 NestJS 응답의 `maxCapacity` 를 그대로 전파한다:

```json
{
  "date": "2026-05-01",
  "timeSlot": "9:00~10:00",
  "bookingCount": 1,
  "availableSlots": 1,
  "isAvailable": true,
  "maxBookings": 2
}
```

기존 `maxBookings` 필드명은 하위 호환을 위해 유지. 값은 `maxCapacity` 에서 전파.

## 예약 목록 문의 요약

NestJS `GET /api/v1/bookings`와 `GET /api/v1/bookings/:id` 응답은 `contact_id`가 있으면 연결 문의 요약을 `contacts` 필드로 함께 반환한다. Prisma `VisitBooking`에는 명시 relation이 없으므로 `BookingsService`가 예약 조회 후 `contact_id` 목록으로 `Contact`를 batch 조회해 병합한다. 병합은 예약의 `company_name`과 문의의 `companyName`이 일치할 때만 수행해 잘못 연결된 `contact_id`가 다른 업체 문의 요약을 노출하지 않게 한다.

```json
{
  "id": 1,
  "visit_date": "2026-05-20",
  "visit_time_slot": "9:00~10:00",
  "company_name": "테스트업체",
  "contact_id": "4f8eb880-1aec-44e5-87d3-7f5f7cd45b4c",
  "contacts": {
    "process_stage": "sample",
    "name": "홍길동",
    "status": "received",
    "inquiry_title": "테스트업체 518테스트"
  }
}
```

업체 대시보드 예약 일정 카드는 이 `contacts.inquiry_title`을 사용해 연결 문의명을 표시한다. 화면 표시 시에는 저장 제목을 변경하지 않고 앞쪽 업체명 접두사만 제거해 패키지명 중심으로 보여준다.

## Admin 예약 관리 UI

`src/app/(admin)/admin/bookings/_components/BookingsCalendar.tsx` 의 예약 카드에 액션 버튼을 추가한다.

### 추가되는 액션

| 버튼 | 조건                     | 동작                                                                      |
| ---- | ------------------------ | ------------------------------------------------------------------------- |
| 승인 | `status !== 'confirmed'` | `PATCH /api/admin/bookings/:id` with `{ status: 'confirmed' }`            |
| 취소 | `status !== 'cancelled'` | confirm 후 `PATCH /api/admin/bookings/:id` with `{ status: 'cancelled' }` |
| 수정 | 항상 표시                | `BookingEditModal` 오픈 → 일자 / 시간 / 관리자 메모 수정 → `PATCH`        |

### 실시간 갱신

PATCH 성공 시 NestJS `bookingsGateway.emitBookingUpdated` 가 `booking:updated` Socket 이벤트를 emit 한다. 프론트는 이 이벤트 수신 시 React Query `queryKeys.bookings.all` invalidate 하여 재조회. `window.location.reload()` 금지.

### 권한 검증

- **NestJS 레이어**: `@UseGuards(ApiKeyGuard)` 만 적용 (controller-level). 별도 `AdminSessionGuard` 를 추가하지 않는다 (프로젝트에 존재하지 않음).
- **Next.js 레이어**: `/api/admin/bookings/[id]` route 에서 admin 세션 검증 후 `INTEGRATION_API_KEY` 로 NestJS 호출. 기존 admin API route 패턴(`src/app/api/admin/**/route.ts`) 을 따름.
- Worker / Company 가 직접 `/api/v1/bookings/:id` 를 호출하지 못하도록 `/api/admin/bookings/[id]` 경로가 유일한 게이트.

## Worker 예약 일정 메뉴

Worker 대시보드 헤더는 `메뉴` 드롭다운에서 방문 예약 일정을 확인할 수 있다.

- 조회 경로는 `/api/worker/bookings` 이며, `getErpWorkerSession()` 으로 worker 세션을 먼저 검증한다.
- Worker UI는 `/api/admin/bookings` 또는 NestJS `/api/v1/bookings` 를 직접 호출하지 않는다.
- 기본 조회 범위는 오늘부터 14일이며, 취소된 예약은 메뉴에 표시하지 않는다.
- 메뉴에는 일자별 시간대, 업체명, 연결 문의명/문의번호, 예약 상태를 표시한다.
- 메뉴 새로고침은 React Query `queryKeys.bookings.workerUpcoming()` 으로 재조회하며 `window.location.reload()` 를 사용하지 않는다.

## Status Enum 검증

현재 `VisitBooking.status` 는 Prisma 에서 `String?` 로 선언되어 어떤 문자열이든 저장 가능하다. `UpdateBookingDto` 에 enum 검증을 추가한다.

```ts
import { IsIn, IsOptional, IsDateString, IsString } from 'class-validator';

export const BOOKING_STATUS_VALUES = ['pending', 'confirmed', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUS_VALUES)[number];

export class UpdateBookingDto {
  @IsOptional()
  @IsIn([...BOOKING_STATUS_VALUES])
  status?: BookingStatus;

  @IsOptional()
  @IsDateString()
  visitDate?: string;

  @IsOptional()
  @IsString()
  visitTimeSlot?: string;

  @IsOptional()
  @IsString()
  adminNote?: string;
}
```

전역 `ValidationPipe` (whitelist + forbidNonWhitelisted) 가 이미 활성화되어 있으므로 DTO 검증은 자동 적용된다. `CreateBookingDto` 에도 동일 검증 적용.

## 불변 규칙

1. **로딩 상태 기본값은 `false`**: 슬롯 `isAvailable` 의 기본값을 `?? true` 로 되돌리지 않는다. 로딩 중 "가용" 오표시 회귀 방지.
2. **`maxCapacity` 는 서버 응답 기반**: 프론트 하드코딩 `2` 를 되살리지 않는다. NestJS constants 의 `VisitBookingConstants.MAX_CAPACITY` 가 단일 소스.
3. **Admin 액션은 `/api/admin/bookings/:id` 경유**: NestJS `/api/v1/bookings/:id` 를 프론트에서 직접 호출하지 않는다. Next.js route 가 admin 세션 검증의 유일한 게이트.
4. **Status enum**: `'pending' | 'confirmed' | 'cancelled'` 외 값은 DTO 에서 거부된다. 확장 시 `BOOKING_STATUS_VALUES` 와 Prisma 마이그레이션을 동시에 갱신.
5. **Socket 이벤트 재사용**: `booking:updated` / `booking:deleted` 는 이미 존재. 새 이벤트 이름을 만들지 않는다.
6. **공개 문의 제출 예약 생성 body는 camelCase**: `submitContact` 에서 문의 저장용 snake_case 필드를 `POST /api/v1/bookings` 로 재사용하지 않는다. 예약 생성 요청은 `CreateBookingDto` 계약의 `visitDate`, `visitTimeSlot`, `companyName`, `contactId`, `createdBy` 를 사용한다.
7. **예약 카드 문의명은 API에서 연결한다**: 업체 대시보드가 예약 목록을 받은 뒤 별도 contacts 배열과 수동 병합하지 않는다. `/bookings` 응답의 `contact_id` 기반 `contacts` 요약이 단일 소스다.
8. **업체 예약 API는 세션 업체로 scope 고정**: `/api/bookings`와 `/api/bookings/:id`의 company session 호출은 body/query `companyName`을 신뢰하지 않고 signed session의 company id로 조회한 업체명과 예약 `company_name`을 대조한다. `contactId`가 있는 생성/수정/취소는 연결 문의의 `company_name`/`companyName`도 같은 업체인지 확인한 뒤 NestJS 서버 API key 호출을 수행한다.
9. **예약 조회 실패는 fail closed**: `serverGetBookings`와 `serverGetAvailableSlots`가 NestJS 오류를 받으면 빈 목록/빈 slotCounts로 흡수하지 않고 오류를 전파한다. 브라우저 UI는 오류 응답을 예약 불가로 표시해야 한다.

## 변경 이력

- 2026-04-24 — 슬롯 UI 로딩 상태, Admin 승인/취소/수정 UI, status enum 검증 도입 (task 23 qa-contact-worker-v1)
- 2026-04-27 — hotfix v2 R2: 가용 슬롯의 `(0/maxCapacity)` 빈 자리 자리수도 항상 표시 + 1자리 남으면 `text-orange-500 font-semibold` 강조. 사용자가 정원을 즉시 인지하도록 변경 (task 23 hotfix v2 R2). booking-slot-ux 회귀 테스트 갱신.
- 2026-04-27 — hotfix v2 R5: `submitContact` server action 에서 booking 생성 결과 (`bookingCreated` / `bookingError`) 를 응답 페이로드에 포함하도록 변경. ContactForm 이 booking 실패 시 별도 에러 모달로 사용자에게 명시. 슬롯 정원 비교를 하드코딩 `>= 2` 대신 `slotsInfo.maxCapacity` 로 일치시켜 정원 변경 시 회귀 방지. 직전 round 에서 booking 생성 실패가 silent log 였던 진단성 회귀 수정 (task 23 hotfix v2 R5).
- 2026-05-18 — 공개 문의 제출 후 예약 생성 호출이 snake_case body 를 보내 NestJS `CreateBookingDto` 검증에서 400으로 실패하던 문제 수정. `submitContact` 는 `/bookings` 생성 API에 camelCase body 를 전달하고, `serverCreateBooking` 입력 타입을 `CreateBookingPayload`로 좁힌다.
- 2026-05-18 — `/bookings` 조회 응답에 `contact_id` 연결 문의 요약(`contacts`)을 추가해 업체 대시보드 예약 일정 카드의 `문의명 없음` 표시를 수정. 업체 화면 제목은 저장값을 변경하지 않고 표시 시 업체명 접두사만 제거한다.
- 2026-05-18 — `/api/bookings`와 `/api/bookings/:id`의 company session 권한 검증을 보강해 예약 `company_name`뿐 아니라 연결 문의 `contactId`의 업체 소유권도 확인한다.

## 참조

- `webhard-api/src/bookings/bookings.service.ts` — `getAvailableSlots` 응답 확장
- `webhard-api/src/bookings/constants.ts` — `VisitBookingConstants` (task 23 신규 또는 기존)
- `webhard-api/src/bookings/dto/update-booking.dto.ts` — enum 검증
- `webhard-api/src/bookings/bookings.gateway.ts` — `booking:updated` / `booking:deleted` Socket 이벤트
- `src/app/contact/ContactForm.tsx` — 슬롯 UI (`bookingAvailability` state)
- `src/app/api/bookings/available/route.ts` — Next.js 프록시 (maxCapacity 전파)
- `src/app/(admin)/admin/bookings/_components/BookingsCalendar.tsx` — Admin 예약 카드
- `src/app/api/admin/bookings/[id]/route.ts` — admin 세션 gate (task 23 신규)
- `docs/specs/features/design-system.md` — 버튼 / 모달 UI 컨벤션
