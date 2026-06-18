# Phase 7: 방문 예약 슬롯 UX (booking-slot-ux)

## 사전 준비

먼저 아래 문서를 반드시 읽어라:

- `docs/specs/features/visit-booking-admin.md` (Phase 0 신규) — **이번 phase 의 스펙**. 슬롯 UI 로딩 상태, maxCapacity 응답 확장.
- `docs/specs/features/design-system.md` — 스켈레톤 · 로딩 인디케이터 UI 컨벤션.
- `/tasks/23-qa-contact-worker-v1/docs-diff.md` — Phase 0 문서 변경 기록.

그리고 현재 구조를 이해하라:

- `src/app/contact/ContactForm.tsx:193` — `bookingAvailability` state 초기값 `{}` (버그 지점 1).
- `src/app/contact/ContactForm.tsx:2329-2333` — 슬롯 렌더링의 기본값 로직: `availability?.available ?? true` (버그 지점 2 — 로딩 중에 "가용" 표시), `bookingCount >= 2` 하드코딩.
- `src/app/contact/ContactForm.tsx:2361-2375` — 자리수 숫자 렌더. 현재 3 분기: 정상(`({n}/2)`), 마감(`예약 마감 ({n}/2)`), 불가(`예약 불가`).
- `src/app/contact/ContactForm.tsx:~250` 부근 — `useEffect` fetch 트리거 (`currentStep === 3` 조건), 각 timeSlot 별 `/api/bookings/available?date=X&timeSlot=Y` 호출하여 응답의 `data.isAvailable`, `data.bookingCount` 를 `availability[slot]` 에 저장.
- `src/app/api/bookings/available/route.ts` — **Next.js 프록시 + 변환 계층**. NestJS `getAvailableSlots` 로부터 `{ date, slotCounts }` 를 받아 **슬롯별로 `{ bookingCount, availableSlots, isAvailable, maxBookings: 2 }` 로 재구성** (line 29-40). `maxBookings` 는 여기에 하드코딩. Phase 7 수정 대상.
- `webhard-api/src/bookings/bookings.service.ts:207-226` `getAvailableSlots`. 현재 **응답 shape: `{ date: string, slotCounts: Record<string, number> }`**. 단순 count 집계만, `maxCapacity`/`available` 없음.

## 작업 내용

### 1. `bookings.service.ts` 응답에 maxCapacity 포함

현재 (line 207-226):

```ts
async getAvailableSlots(date: string) {
  const bookings = await this.prisma.executeWithRetry(
    () => this.prisma.visitBooking.findMany({
      where: { visitDate: new Date(date), status: 'confirmed' },
      select: { visitTimeSlot: true },
    }),
    { operationName: 'bookings.getAvailableSlots' }
  );

  const slotCounts: Record<string, number> = {};
  for (const b of bookings) {
    slotCounts[b.visitTimeSlot] = (slotCounts[b.visitTimeSlot] || 0) + 1;
  }

  return { date, slotCounts };
}
```

→ 수정 (기존 `slotCounts` 유지 + `maxCapacity` 필드 추가 — 하위 호환):

```ts
async getAvailableSlots(date: string) {
  const bookings = /* ... 기존 그대로 ... */;

  const slotCounts: Record<string, number> = {};
  for (const b of bookings) {
    slotCounts[b.visitTimeSlot] = (slotCounts[b.visitTimeSlot] || 0) + 1;
  }

  return { date, slotCounts, maxCapacity: VisitBookingConstants.MAX_CAPACITY };
}
```

`VisitBookingConstants.MAX_CAPACITY = 2` 를 `webhard-api/src/bookings/constants.ts` (신규 또는 기존) 로 분리하여 controller / service / 향후 config 에서 공유.

응답 DTO (`BookingAvailabilityDto` 등) 가 있다면 `maxCapacity: number` 필드 추가. `{ date, slotCounts }` 기존 소비처 깨지지 않음.

### 2. `src/app/api/bookings/available/route.ts` 에서 maxCapacity 전파

현재 line 29-40 의 `maxBookings: 2` 하드코딩 제거, NestJS 응답의 `maxCapacity` 사용:

```ts
const result = await serverGetAvailableSlots(normalizedDate);
const maxCapacity = result.maxCapacity ?? 2; // fallback: 구버전 NestJS
const bookingCount = result.slotCounts[timeSlot.trim()] || 0;
const isAvailable = bookingCount < maxCapacity;
const availableSlots = Math.max(0, maxCapacity - bookingCount);

return NextResponse.json({
  date,
  timeSlot,
  bookingCount,
  availableSlots,
  isAvailable,
  maxBookings: maxCapacity, // 기존 필드명 유지 (ContactForm 호환)
});
```

`nestjs-server-client.ts` 의 `serverGetAvailableSlots` 반환 타입에도 `maxCapacity?: number` 필드 추가.

### 3. ContactForm 슬롯 UI — 로딩 상태 처리

`src/app/contact/ContactForm.tsx:193` 초기 상태 옆에 `bookingLoading` 추가:

```ts
const [bookingAvailability, setBookingAvailability] = useState<
  Record<string, { count: number; available: boolean; maxCapacity: number }>
>({});
const [bookingLoading, setBookingLoading] = useState<boolean>(false);
```

`useEffect` fetch 로직 (기존 위치, 쿼리 param 이름은 **`timeSlot`** — route.ts line 15 참조. `slot` 이 아님!):

```ts
useEffect(() => {
  if (currentStep !== 3 || receiptMethod !== 'visit' || !visitDate) return;

  setBookingLoading(true);
  const hours = [9, 10, 11, 13, 14, 15, 16, 17];
  const slots = hours.map((h) => `${h}:00~${h + 1}:00`);

  Promise.all(
    slots.map((slot) =>
      fetch(
        `/api/bookings/available?date=${encodeURIComponent(visitDate)}&timeSlot=${encodeURIComponent(slot)}`
      ).then((r) => r.json())
    )
  )
    .then((results) => {
      const map: Record<string, { count: number; available: boolean; maxCapacity: number }> = {};
      slots.forEach((slot, idx) => {
        const r = results[idx];
        map[slot] =
          r && typeof r.bookingCount === 'number'
            ? { count: r.bookingCount, available: r.isAvailable, maxCapacity: r.maxBookings ?? 2 }
            : { count: 2, available: false, maxCapacity: 2 };
      });
      setBookingAvailability(map);
    })
    .catch(() => {
      // fetch 실패 시 모든 슬롯 마감 처리
      const failMap: Record<string, { count: number; available: boolean; maxCapacity: number }> =
        {};
      slots.forEach((slot) => {
        failMap[slot] = { count: 2, available: false, maxCapacity: 2 };
      });
      setBookingAvailability(failMap);
    })
    .finally(() => {
      setBookingLoading(false);
    });
}, [currentStep, receiptMethod, visitDate]);
```

주의:

- Next.js route 쿼리 param 이름은 `timeSlot` (camelCase). `slot` 으로 보내면 400 에러.
- 기존 코드에 유사 fetch 가 있으면 **중복 생성 금지** — 기존 로직에 `bookingLoading` state 와 `maxCapacity` 파싱만 추가.

### 4. 슬롯 렌더링 로직 수정

Line 2329-2333 의 슬롯 버튼 렌더링 내부에서 로딩 상태 반영:

```tsx
{
  TIME_SLOTS.map((timeSlot) => {
    const availability = bookingAvailability[timeSlot];
    const bookingCount = availability?.count ?? 0;
    const maxCapacity = availability?.maxCapacity ?? 2;
    const isAvailable = availability?.available ?? false; // 기본값 false 로 변경 (핵심 수정)

    const isLoading = bookingLoading && !availability; // 로딩 중이고 아직 데이터 없음
    const isDisabled = isLoading || bookingCount >= maxCapacity || !isAvailable;

    return (
      <button
        key={timeSlot}
        type="button"
        disabled={isDisabled}
        onClick={() => handleSlotSelect(timeSlot)}
        className={isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
      >
        <div>{timeSlot}</div>
        {isLoading ? (
          <div className="h-4 w-8 bg-gray-200 animate-pulse rounded" />
        ) : bookingCount > 0 && isAvailable ? (
          <div className="text-xs text-[var(--text-secondary)]">
            ({bookingCount}/{maxCapacity})
          </div>
        ) : bookingCount >= maxCapacity ? (
          <div className="text-xs text-red-500">
            예약 마감 ({bookingCount}/{maxCapacity})
          </div>
        ) : null}
      </button>
    );
  });
}
```

핵심 변경:

- `isAvailable ?? false` — 로딩 중에 "가용" 으로 보이던 버그 수정
- `isLoading` 분기 추가 — 스켈레톤 표시
- `maxCapacity` 서버 응답 기반 (하드코딩 제거)
- 자리수 표시 조건을 명확히 세 단계로 분기: 로딩 / 정상(남은 자리) / 마감

### 5. 타입 정의

`src/lib/types/booking.ts` (없으면 신규 또는 ContactForm 내부):

```ts
export interface SlotAvailability {
  count: number;
  maxCapacity: number;
  available: boolean;
}

/** Next.js route `/api/bookings/available` 응답 shape (슬롯별). */
export interface SlotAvailabilityApiResponse {
  date: string;
  timeSlot: string;
  bookingCount: number;
  availableSlots: number;
  isAvailable: boolean;
  maxBookings: number;
}
```

## Acceptance Criteria

프론트 + 백엔드 혼합:

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

`src/__tests__/contact/booking-slot-ux.test.tsx` **신규**:

- 초기 렌더: Step 3 진입 직후 `bookingLoading=true`, 모든 슬롯 disabled + 스켈레톤 표시
- fetch 성공: 슬롯별 `(count/maxCapacity)` 표시 확인
- fetch 실패: 모든 슬롯 "예약 마감" 표시
- 날짜 변경: 재fetch 트리거되며 다시 loading 상태

`webhard-api/src/bookings/bookings.service.spec.ts` **확장**:

- `getAvailableSlots` 응답에 `maxCapacity: 2` 필드 포함 확인
- 기존 `slotCounts` 구조 유지 확인 (하위 호환)

`src/__tests__/api/bookings-available-route.test.ts` **신규**:

- NestJS mock 이 `{ date, slotCounts, maxCapacity: 3 }` 반환 시 route 응답의 `maxBookings: 3` 확인 (maxCapacity 전파 검증)
- NestJS mock 이 `maxCapacity` 누락 반환 시 route 응답의 `maxBookings: 2` (fallback) 확인

## AC 검증 방법

위 5 커맨드 **병렬 실행** 하여 모두 통과 시 phase 7 status `"completed"`.

3 회 이상 실패 시 `"error"` + `error_message`.

### 수동 재현 확인 (중요)

QA 에서 "자리수가 안 보인다" 고 제보한 증상을 실제로 재현해야 한다. Phase 실행 중 최소 1 회:

1. `pnpm dev` 로 Next.js 실행
2. 브라우저에서 `/contact` 진입, Step 3 까지 이동, 방문 예약 선택
3. 슬롯 UI 에서 (a) 로딩 중 스켈레톤 보이는지 (b) 로드 완료 후 자리수 보이는지 확인
4. 네트워크 탭에서 `/api/bookings/available` 호출 확인

재현 성공 후 phase 를 completed 로 표시. UI 가 여전히 자리수를 안 보여주면 근본 원인 재분석 (서버 응답 구조, state 업데이트 타이밍 등).

## 주의사항

- **`bookingAvailability` 의 모든 소비 지점**을 확인하여 로딩 상태 분기를 추가. 한 곳만 수정하면 다른 곳에서 여전히 기본값 `true` 가 사용될 수 있다.
- `isAvailable ?? true` → `?? false` 변경은 **로딩 중 UX 개선의 핵심**. 로드 완료된 슬롯은 명시적 `available: true/false` 값을 가지므로 이 변경이 정상 동작을 깨뜨리지 않는다.
- `maxCapacity` 하드코딩(2) 은 backend 에서 제거. 향후 슬롯별 정원 테이블로 확장 가능한 구조.
- 스켈레톤 스타일은 프로젝트 기존 스켈레톤 컴포넌트 사용. 없으면 `bg-gray-200 animate-pulse` 간단 구현.
- `useEffect` dependency 배열에 `visitDate` 포함 — 날짜 변경 시 재fetch.
- 한글 커밋: `feat(qa-contact-worker-v1): phase 7 — booking-slot-ux`.
