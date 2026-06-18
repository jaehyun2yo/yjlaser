import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { logger } from '@/lib/utils/logger';
import { FaCalendarAlt, FaClock } from 'react-icons/fa';
import Link from 'next/link';
import { serverGetBookings } from '@/lib/api/nestjs-server-client';

interface TodayBooking {
  id: number;
  visit_date: string;
  visit_time_slot: string;
  company_name: string;
  status: string;
}

// 시간 슬롯 포맷팅
function formatTimeSlot(slot: string): string {
  const times: Record<string, string> = {
    slot1: '09:00~10:00',
    slot2: '10:00~11:00',
    slot3: '11:00~12:00',
    slot4: '13:00~14:00',
    slot5: '14:00~15:00',
    slot6: '15:00~16:00',
    slot7: '16:00~17:00',
  };
  return times[slot] || slot;
}

/**
 * 대시보드 오늘 예약 - 비동기 서버 컴포넌트
 * Suspense 경계 내에서 사용하여 점진적 로딩 지원
 */
export async function DashboardBookings() {
  const adminLogger = logger.createLogger('DASHBOARD_BOOKINGS');

  let todayBookings: TodayBooking[] = [];

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const data = await serverGetBookings({
      date: todayStr,
      status: 'confirmed',
    });

    todayBookings = (data || []) as unknown as TodayBooking[];
  } catch (error) {
    adminLogger.error('Error in DashboardBookings', error);
  }

  return (
    <div
      className={`${BG_COLOR.card} rounded-xl shadow-sm border ${BORDER_COLOR.default} overflow-hidden`}
    >
      <div
        className={`flex items-center justify-between px-4 py-3 border-b ${BORDER_COLOR.light} ${BG_COLOR.success}`}
      >
        <div className="flex items-center gap-2">
          <FaCalendarAlt className={TEXT_COLOR.success} />
          <span className={`font-medium ${TEXT_COLOR.primary}`}>오늘 예약</span>
          <span className={`text-sm ${TEXT_COLOR.success} font-bold`}>
            {todayBookings.length}건
          </span>
        </div>
        <Link
          href="/admin/integration/bookings"
          className="text-xs text-orange-500 hover:underline"
        >
          전체보기
        </Link>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {todayBookings.length === 0 ? (
          <div className="p-6 text-center text-gray-400">
            <FaCalendarAlt className="mx-auto text-2xl mb-2 opacity-30" />
            <p className="text-sm">오늘 예약이 없습니다</p>
          </div>
        ) : (
          todayBookings.map((booking) => (
            <div
              key={booking.id}
              className={`flex items-center gap-3 px-4 py-3 ${BG_COLOR.hoverMuted}/30`}
            >
              <div className="flex items-center gap-2 min-w-[90px]">
                <FaClock className="text-green-500 text-sm" />
                <span className={`text-sm font-medium ${TEXT_COLOR.primary}`}>
                  {formatTimeSlot(booking.visit_time_slot)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${TEXT_COLOR.secondary} truncate`}>{booking.company_name}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
