/**
 * Admin BookingsCalendar 테스트 (task 23 Phase 8: booking-admin-actions).
 *
 * - 예약 카드에 승인/취소/수정 버튼이 status 에 따라 렌더링
 * - 승인 클릭 → PATCH /api/admin/bookings/:id with { status: 'confirmed' }
 * - Socket booking:updated 수신 시 /api/admin/bookings 로 refresh fetch
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BookingsCalendar } from '@/app/(admin)/admin/bookings/BookingsCalendar';

// ============================================================
// Mocks
// ============================================================

const socketHandlers: Record<string, (data: unknown) => void> = {};
const mockSocket = {
  on: jest.fn((event: string, handler: (data: unknown) => void) => {
    socketHandlers[event] = handler;
  }),
  off: jest.fn((event: string) => {
    delete socketHandlers[event];
  }),
};

jest.mock('@/lib/socket/socket-manager', () => ({
  socketManager: {
    connect: jest.fn(() => mockSocket),
    disconnect: jest.fn(),
  },
}));

jest.mock('@/app/(admin)/admin/contacts/ContactDetailModal', () => ({
  ContactDetailModal: () => null,
}));

jest.mock('@/app/(admin)/admin/bookings/BookingEditModal', () => ({
  BookingEditModal: ({ open, booking }: { open: boolean; booking: { id: number } | null }) =>
    open && booking ? <div data-testid="booking-edit-modal">editing-{booking.id}</div> : null,
}));

// ============================================================
// Helpers
// ============================================================

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function makeBooking(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    visit_date: todayString(),
    visit_time_slot: '10:00~11:00',
    company_name: '테스트업체',
    contact_id: null,
    status: 'confirmed',
    notes: null,
    created_at: '2026-04-24T00:00:00Z',
    contacts: null,
    ...overrides,
  };
}

function renderCalendar(initialBookings: ReturnType<typeof makeBooking>[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(
    <Wrapper>
      <BookingsCalendar initialBookings={initialBookings as never} />
    </Wrapper>
  );
}

beforeEach(() => {
  Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
  jest.clearAllMocks();
});

// ============================================================
// 렌더링
// ============================================================

describe('BookingsCalendar — admin 액션 버튼 렌더링', () => {
  it('confirmed 예약 카드는 취소/수정 버튼을 표시, 승인 버튼은 숨김', () => {
    renderCalendar([makeBooking({ id: 1, status: 'confirmed' })]);

    const card = screen.getByTestId('booking-card-1');
    expect(card).toBeInTheDocument();
    expect(card.querySelector('button')).toBeTruthy();
    // 승인 버튼은 confirmed 상태에서 숨김
    expect(screen.queryByRole('button', { name: '승인' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument();
  });

  it('pending 예약 카드는 승인/취소/수정 모두 표시', () => {
    renderCalendar([makeBooking({ id: 2, status: 'pending' })]);

    expect(screen.getByRole('button', { name: '승인' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument();
  });

  it('cancelled 예약 카드는 승인/수정 버튼만 표시, 취소 버튼은 숨김', () => {
    renderCalendar([makeBooking({ id: 3, status: 'cancelled' })]);

    expect(screen.getByRole('button', { name: '승인' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument();
  });
});

// ============================================================
// 승인/취소 버튼 동작
// ============================================================

describe('BookingsCalendar — 승인/취소 버튼 PATCH 호출', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ booking: {} }),
    }) as unknown as typeof fetch;
  });

  it('승인 클릭 → PATCH /api/admin/bookings/:id body { status: "confirmed" }', async () => {
    renderCalendar([makeBooking({ id: 5, status: 'pending' })]);

    fireEvent.click(screen.getByRole('button', { name: '승인' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/bookings/5',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'confirmed' }),
        })
      );
    });
  });

  it('취소 클릭 → confirm 승인 시 PATCH body { status: "cancelled" }', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    renderCalendar([makeBooking({ id: 7, status: 'confirmed' })]);

    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/bookings/7',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'cancelled' }),
        })
      );
    });

    confirmSpy.mockRestore();
  });

  it('취소 클릭 → confirm 거절 시 PATCH 호출 없음', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    renderCalendar([makeBooking({ id: 8, status: 'confirmed' })]);

    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(global.fetch).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

// ============================================================
// 수정 모달 오픈
// ============================================================

describe('BookingsCalendar — 수정 버튼', () => {
  it('수정 클릭 → BookingEditModal 이 해당 booking 으로 오픈', () => {
    renderCalendar([makeBooking({ id: 11, status: 'confirmed' })]);

    fireEvent.click(screen.getByRole('button', { name: '수정' }));

    const modal = screen.getByTestId('booking-edit-modal');
    expect(modal).toBeInTheDocument();
    expect(modal.textContent).toContain('editing-11');
  });
});

// ============================================================
// Socket 이벤트 재조회
// ============================================================

describe('BookingsCalendar — Socket booking:updated 수신 시 refresh', () => {
  it('booking:updated 수신 → /api/admin/bookings fetch 호출', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ bookings: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderCalendar([makeBooking({ id: 20, status: 'confirmed' })]);

    await waitFor(() => {
      expect(socketHandlers['booking:updated']).toBeDefined();
    });

    await act(async () => {
      socketHandlers['booking:updated']({ id: 20 });
    });

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => c[0]);
      expect(calls).toContain('/api/admin/bookings');
    });
  });
});
