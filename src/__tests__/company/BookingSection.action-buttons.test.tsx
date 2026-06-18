import { render, screen } from '@testing-library/react';
import { BookingSection } from '@/app/company/dashboard/components/shared/BookingSection';
import type { Booking } from '@/app/company/dashboard/types';

jest.mock('@/app/(admin)/admin/contacts/ContactDetailModal', () => ({
  ContactDetailModal: () => null,
}));

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 1,
    visit_date: '2026-05-20',
    visit_time_slot: '9:00~10:00',
    company_name: '테스트업체',
    status: 'pending',
    created_at: '2026-05-18T08:19:00.000Z',
    contact_id: 'contact-001',
    contacts: {
      process_stage: 'sample',
      name: '홍길동',
      status: 'in_progress',
      inquiry_title: '테스트업체 518테스트',
    },
    ...overrides,
  };
}

describe('BookingSection — 업체 대시보드 예약 액션 버튼', () => {
  it('예약일정 카드의 예약 버튼은 카드 액션 스타일을 사용한다', () => {
    render(<BookingSection bookings={[makeBooking()]} />);

    const bookingChangeButton = screen.getByRole('button', { name: '예약변경' });
    const bookingCancelButton = screen.getByRole('button', { name: '예약취소' });

    expect(bookingChangeButton).toHaveClass(
      'bg-white/90',
      'border',
      'border-gray-200',
      'shadow-sm'
    );
    expect(bookingCancelButton).toHaveClass(
      'bg-white/90',
      'border',
      'border-gray-200',
      'shadow-sm'
    );
  });
});
