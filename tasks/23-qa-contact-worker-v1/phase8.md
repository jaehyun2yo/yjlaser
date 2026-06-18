# Phase 8: 방문 예약 Admin 승인/거절/수정 UI (booking-admin-actions)

## 사전 준비

먼저 아래 문서를 반드시 읽어라:

- `docs/specs/features/visit-booking-admin.md` (Phase 0 신규) — **이번 phase 의 스펙**. admin 승인/거절/수정 UI 정책, status enum 검증.
- `docs/specs/features/design-system.md` — 버튼 · 모달 UI 컨벤션 (`@/components/ui/Button` 사용 필수).
- `/tasks/23-qa-contact-worker-v1/docs-diff.md` — Phase 0 문서 변경 기록.

그리고 현재 구조를 이해하라:

- `webhard-api/prisma/schema.prisma:651-676` `VisitBooking` 모델 — `status String? @default("confirmed")`. enum 미지정.
- `webhard-api/src/bookings/dto/update-booking.dto.ts` **이미 존재** — `status: string` 에 `@IsString()` 만, `@IsIn(...)` 누락 (line 20-22). 이것을 enum 검증으로 교체.
- `webhard-api/src/bookings/bookings.controller.ts` **이미 PATCH/DELETE 구현됨** (line 93 `@Patch(':id')`, line 102 `@Delete(':id')`). controller-level `@UseGuards(ApiKeyGuard)` (line 23) — 모든 엔드포인트가 이미 API key 로 보호됨. **admin 전용 Guard 추가 불필요**.
- `webhard-api/src/bookings/bookings.service.ts:153-195 update`, 196-202 `delete` **이미 구현됨**. gateway `emitBookingUpdated` / `emitBookingDeleted` 도 이미 연결됨.
- `webhard-api/src/bookings/bookings.gateway.ts` — `booking:updated`, `booking:deleted` Socket 이벤트. 이미 구현됨.
- `src/app/(admin)/admin/bookings/page.tsx` + `BookingsCalendar.tsx` (디렉토리 바로 하위, `_components/` 없음) + `BookingsList.tsx` — 예약 목록 UI. 승인/거절 버튼 없음.
- `src/components/ui/button.tsx` (파일명 소문자). import 는 `@/components/ui/button` 으로.
- **admin 권한 검증**: NestJS 에 `AdminSessionGuard` 는 존재하지 않는다. Next.js 레이어에서 admin 세션 확인 후 `INTEGRATION_API_KEY` 로 NestJS 호출하는 기존 admin API route 패턴 (`src/app/api/admin/**/route.ts`) 을 따른다.

## 작업 내용

### 1. `UpdateBookingDto` status enum 검증

`webhard-api/src/bookings/dto/update-booking.dto.ts` (또는 기존 파일):

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

전역 `ValidationPipe` (whitelist + forbidNonWhitelisted) 가 이미 설정되어 있으므로 DTO 검증은 자동 적용.

### 2. `bookings.controller.ts` — 기존 엔드포인트 유지

**이미 구현되어 있다** (line 93 `@Patch(':id')`, line 102 `@Delete(':id')`). Guard 는 **controller-level `@UseGuards(ApiKeyGuard)`** 로 이미 보호됨. admin 세션은 Next.js 레이어에서 검증 후 API key 로 호출.

- **추가로 Guard 를 넣지 마라**. `AdminSessionGuard` 는 NestJS 에 존재하지 않음.
- PATCH 응답에서 `booking` 필드가 이미 `toSnakeCase` 처리되어 있는지 확인. `emitBookingUpdated` 도 service 내부에서 이미 호출 중인지 확인하고, 누락 시 추가.

### 3. `bookings.service.ts` update / delete — 기존 구현 확인만

**이미 구현되어 있다** (line 153-195 `update`, 196-202 `delete`, 내부에서 `bookingsGateway.emitBookingUpdated` / `emitBookingDeleted` 호출). 이 phase 에서는:

- update 가 `companyName` / `contactId` 변경도 허용하는지 검토 (admin 수정 UI 요구사항).
- delete 가 소프트 삭제가 아니라 hard delete 인지 확인 — 정책상 OK 인지 재확인 (현재는 hard delete).
- 변경 후 `emitBookingUpdated(updated)` 가 snake_case 로 변환된 payload 를 전달하는지 확인.

### 4. `BookingsCalendar.tsx` admin 액션 UI

예약 카드 컴포넌트에 버튼 추가:

```tsx
<div className="flex gap-2 mt-2">
  {booking.status !== 'confirmed' && (
    <Button size="sm" variant="primary" onClick={() => handleApprove(booking.id)}>
      승인
    </Button>
  )}
  {booking.status !== 'cancelled' && (
    <Button size="sm" variant="danger" onClick={() => handleCancel(booking.id)}>
      취소
    </Button>
  )}
  <Button size="sm" variant="secondary" onClick={() => openEditModal(booking)}>
    수정
  </Button>
</div>
```

핸들러:

```tsx
const handleApprove = async (id: string) => {
  await apiClient.patch(`/api/admin/bookings/${id}`, { status: 'confirmed' });
  // Socket 이벤트 수신으로 재조회됨 (기존 구조)
};

const handleCancel = async (id: string) => {
  if (!confirm('이 예약을 취소하시겠습니까?')) return;
  await apiClient.patch(`/api/admin/bookings/${id}`, { status: 'cancelled' });
};
```

`Button` 컴포넌트는 `@/components/ui/Button` 사용 (`BUTTON_STYLES` 문자열 상수 금지 — 프로젝트 Hard Rule).

### 5. 수정 모달 (BookingEditModal)

`src/app/(admin)/admin/bookings/_components/BookingEditModal.tsx` **신규 또는 기존 사용**:

```tsx
interface BookingEditModalProps {
  booking: VisitBooking;
  open: boolean;
  onClose: () => void;
}

export function BookingEditModal({ booking, open, onClose }: BookingEditModalProps) {
  const [visitDate, setVisitDate] = useState(booking.visitDate);
  const [visitTimeSlot, setVisitTimeSlot] = useState(booking.visitTimeSlot);
  const [adminNote, setAdminNote] = useState(booking.adminNote ?? '');

  const handleSubmit = async () => {
    await apiClient.patch(`/api/admin/bookings/${booking.id}`, {
      visitDate,
      visitTimeSlot,
      adminNote,
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="예약 수정">
      <Input label="방문 일자" type="date" value={visitDate} onChange={setVisitDate} />
      <Input label="시간 슬롯" value={visitTimeSlot} onChange={setVisitTimeSlot} />
      <Input label="관리자 메모" value={adminNote} onChange={setAdminNote} multiline />
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>
          취소
        </Button>
        <Button variant="primary" onClick={handleSubmit}>
          저장
        </Button>
      </div>
    </Modal>
  );
}
```

`BookingChangeModal` / `BookingCancelModal` 이 이미 있다면 재사용 여부 판단. Company 측 변경/취소 모달과는 별도 UX 이므로 분리가 나을 수 있음.

### 6. Next.js admin API 라우트 (admin 세션 검증 지점)

`src/app/api/admin/bookings/[id]/route.ts` **신규**:

프로젝트의 기존 admin API 라우트 패턴(`src/app/api/admin/**/route.ts`) 을 따른다. 보통 아래 구조:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.userType !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const apiUrl = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
  const apiKey = process.env.INTEGRATION_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'API key missing' }, { status: 500 });

  const response = await fetch(`${apiUrl}/api/v1/bookings/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 동일 admin 세션 검증 후 NestJS DELETE 호출
}
```

**이 route 가 admin 권한의 유일한 gate** 이다. 기존 admin 라우트 중 유사 구조(예: `src/app/api/admin/contacts/[id]/*`) 를 참조하여 일관성 유지.

## Acceptance Criteria

백엔드 + admin 프론트:

```bash
pnpm build
```

```bash
npx tsc --noEmit
```

```bash
pnpm test
```

```bash
cd webhard-api && pnpm build
```

```bash
cd webhard-api && pnpm test
```

### 테스트

`webhard-api/src/bookings/bookings.service.spec.ts` **확장**:

- `update`: status 값 변경 후 DB 확인, gateway emit spy
- `delete`: 레코드 제거 + gateway emit spy

`webhard-api/src/bookings/dto/update-booking.dto.spec.ts` **신규**:

- `@IsIn` 검증: 'confirmed' / 'cancelled' / 'pending' 통과, 'foo' 는 validation 실패

`src/__tests__/admin/bookings-calendar.test.tsx` **확장**:

- 예약 카드에 승인/취소/수정 버튼 렌더링 확인
- 승인 클릭 → API 호출 + 예상 body (`{ status: 'confirmed' }`)
- Socket `booking:updated` 수신 시 재조회 호출

## AC 검증 방법

위 5 커맨드 **병렬 실행** 하여 모두 통과 시 phase 8 status `"completed"`.

3 회 이상 실패 시 `"error"` + `error_message`.

### 수동 재현 확인

1. `pnpm dev:all` 실행
2. Admin 로그인, `/admin/bookings` 접근
3. 테스트 예약 생성(별도 탭에서 `/contact` Step 3 방문 예약)
4. Admin 캘린더에서 해당 예약에 승인/취소/수정 버튼 표시 확인
5. 버튼 클릭 → status 변경 + 실시간 재조회 확인

## 주의사항

- **기존 `POST /bookings` 및 `GET /bookings/available` 엔드포인트를 바꾸지 마라**. Phase 7 에서 `getAvailableSlots` 응답에 `maxCapacity` 추가한 것 외에는 유지.
- status enum 변경으로 기존 저장된 non-standard status 값(있다면) 이 검증 실패 가능성. 데이터 확인 후 필요 시 일회성 정규화 (이 task 에선 스코프 밖).
- admin 액션은 `AdminSessionGuard` 필수. Worker / Company 가 이 엔드포인트 호출 방지.
- `confirm()` 대신 Modal 기반 확인 UI 가 프로젝트 컨벤션이면 `confirm()` 을 `ConfirmDialog` 등으로 교체. 기존 admin 페이지 패턴 확인.
- Socket 이벤트 이름(`booking:updated`, `booking:deleted`) 기존 구조 재사용. 새 이벤트 만들지 말 것.
- 한글 커밋: `feat(qa-contact-worker-v1): phase 8 — booking-admin-actions`.
