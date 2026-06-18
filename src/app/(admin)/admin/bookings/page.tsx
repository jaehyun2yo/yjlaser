import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { logger } from '@/lib/utils/logger';
import { BookingsCalendar } from './BookingsCalendar';
import { serverGetBookings } from '@/lib/api/nestjs-server-client';

const adminLogger = logger.createLogger('ADMIN_BOOKINGS');

export default async function AdminBookingsPage() {
  // 인증은 layout에서 처리됨

  interface Contact {
    id: number; // BIGSERIAL
    company_name: string;
    name: string;
    phone: string;
    email: string;
    inquiry_number: string | null;
  }

  interface Booking {
    id: number;
    visit_date: string;
    visit_time_slot: string;
    company_name: string;
    contact_id: string | null; // Contact.id (UUID)
    status: string;
    notes: string | null;
    created_at: string;
    contacts: Contact | null;
  }

  let bookings: Booking[] = [];
  let hasError = false;
  let errorMessage = '';

  try {
    const data = await serverGetBookings({ status: 'confirmed' });
    bookings = (data || []) as unknown as Booking[];
  } catch (error) {
    adminLogger.error('Unexpected error in bookings page', error);
    hasError = true;
    errorMessage = error instanceof Error ? error.message : '예기치 않은 오류가 발생했습니다.';
    bookings = [];
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className={`text-3xl font-bold ${TEXT_COLOR.primary} mb-2`}>예약 관리</h1>
        <p className={TEXT_COLOR.secondary}>방문 예약을 캘린더 형태로 확인할 수 있습니다.</p>
      </div>

      {hasError && (
        <div className={`mb-4 p-4 ${BG_COLOR.warning} border ${BORDER_COLOR.warning} rounded-lg`}>
          <p className={`${TEXT_COLOR.warningDeep} text-sm`}>
            ⚠️ {errorMessage}
            {(errorMessage.includes('relation') || errorMessage.includes('does not exist')) && (
              <span className="block mt-2">
                visit_bookings 테이블이 존재하지 않을 수 있습니다. 데이터베이스 설정을 확인해주세요.
              </span>
            )}
          </p>
        </div>
      )}

      <BookingsCalendar initialBookings={bookings} />
    </div>
  );
}
