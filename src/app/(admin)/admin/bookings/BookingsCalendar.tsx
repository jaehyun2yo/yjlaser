'use client';

import { BG_COLOR, BORDER_COLOR, RING_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useState, useMemo, useEffect } from 'react';
import { FaClock, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { ContactDetailModal } from '@/app/(admin)/admin/contacts/ContactDetailModal';
import { socketManager } from '@/lib/socket/socket-manager';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { logger } from '@/lib/utils/logger';
import { Button } from '@/components/ui/button';
import { BookingEditModal } from './BookingEditModal';

const bookingsLog = logger.createLogger('BookingsCalendar');

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

interface BookingsCalendarProps {
  initialBookings: Booking[];
}

export function BookingsCalendar({ initialBookings }: BookingsCalendarProps) {
  const [dayOffset, setDayOffset] = useState(0); // 오늘 기준으로 며칠 뒤인지
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [actionPendingId, setActionPendingId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const patchBookingStatus = async (id: number, status: 'confirmed' | 'cancelled') => {
    setActionPendingId(id);
    try {
      const response = await fetch(`/api/admin/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        bookingsLog.error('Booking status update failed', { id, status, code: response.status });
        alert('예약 상태 변경에 실패했습니다.');
      }
    } catch (err) {
      bookingsLog.error('Booking status update error', err);
      alert('예약 상태 변경 중 오류가 발생했습니다.');
    } finally {
      setActionPendingId(null);
    }
  };

  const handleApprove = (booking: Booking) => patchBookingStatus(booking.id, 'confirmed');

  const handleCancel = (booking: Booking) => {
    if (!confirm('이 예약을 취소 처리하시겠습니까?')) return;
    return patchBookingStatus(booking.id, 'cancelled');
  };

  const openEditModal = (booking: Booking) => setEditBooking(booking);
  const closeEditModal = () => setEditBooking(null);

  // Socket.IO 실시간 업데이트 구독
  useEffect(() => {
    const socket = socketManager.connect('bookings', (status) => {
      bookingsLog.info('Bookings socket status', { status });
    });

    const handleBookingChange = async () => {
      bookingsLog.info('Booking change detected via Socket.IO');
      try {
        const response = await fetch('/api/admin/bookings');
        if (response.ok) {
          const data = await response.json();
          setBookings(data.bookings || []);
          queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
        }
      } catch (error) {
        bookingsLog.error('Error refreshing bookings', error);
      }
    };

    socket.on('booking:created', handleBookingChange);
    socket.on('booking:updated', handleBookingChange);
    socket.on('booking:deleted', handleBookingChange);

    return () => {
      socket.off('booking:created', handleBookingChange);
      socket.off('booking:updated', handleBookingChange);
      socket.off('booking:deleted', handleBookingChange);
      socketManager.disconnect('bookings');
    };
  }, [queryClient]);

  // bookings가 변경되면 bookingsByDate도 업데이트

  // 날짜별로 예약 그룹화
  const bookingsByDate = useMemo(() => {
    const grouped: Record<string, Booking[]> = {};
    bookings.forEach((booking) => {
      const date = booking.visit_date;
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(booking);
    });
    return grouped;
  }, [bookings]);

  // 기준 날짜로부터 3일 생성
  const calendarDays = useMemo(() => {
    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);
    baseDate.setDate(baseDate.getDate() + dayOffset);

    const days: Array<{
      date: Date;
      dateString: string;
      bookings: Booking[];
    }> = [];

    for (let i = 0; i < 3; i++) {
      const date = new Date(baseDate);
      date.setDate(baseDate.getDate() + i);
      const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      days.push({
        date: new Date(date),
        dateString,
        bookings: bookingsByDate[dateString] || [],
      });
    }

    return days;
  }, [dayOffset, bookingsByDate]);

  // 이전 3일
  const goToPrevious3Days = () => {
    setDayOffset(dayOffset - 3);
  };

  // 다음 3일
  const goToNext3Days = () => {
    setDayOffset(dayOffset + 3);
  };

  // 오늘로 이동
  const goToToday = () => {
    setDayOffset(0);
  };

  // 태그 클릭 핸들러
  const handleBookingClick = (booking: Booking) => {
    // contact_id가 있고, booking.contacts가 있는 경우에만 모달 열기
    // booking.contacts가 null이면 해당 contact가 삭제되었거나 존재하지 않음
    if (booking.contact_id && booking.contacts) {
      setSelectedContactId(booking.contact_id);
      setIsModalOpen(true);
    } else if (booking.contact_id && !booking.contacts) {
      // contact_id는 있지만 조인된 contact 정보가 없는 경우
      alert('해당 문의 정보를 찾을 수 없습니다.\n문의가 삭제되었거나 존재하지 않을 수 있습니다.');
    } else {
      alert('예약 정보에 문의 ID가 없습니다.');
    }
  };

  // 모달 닫기 핸들러
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedContactId(null);
  };

  const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div className={`${BG_COLOR.card} rounded-lg shadow-md overflow-hidden`}>
      {/* 네비게이션 버튼 */}
      <div
        className={`flex items-center justify-between px-6 py-4 border-b ${BORDER_COLOR.default}`}
      >
        <button
          onClick={goToPrevious3Days}
          className={`flex items-center gap-2 px-4 py-2 ${BG_COLOR.light} ${BG_COLOR.hoverDark} rounded-lg transition-colors ${TEXT_COLOR.secondary}`}
        >
          <FaChevronLeft />
          <span>이전 3일</span>
        </button>
        <button
          onClick={goToToday}
          className={`px-4 py-2 ${BG_COLOR.light} ${BG_COLOR.hoverDark} rounded-lg transition-colors ${TEXT_COLOR.secondary} text-sm`}
        >
          오늘
        </button>
        <button
          onClick={goToNext3Days}
          className={`flex items-center gap-2 px-4 py-2 ${BG_COLOR.light} ${BG_COLOR.hoverDark} rounded-lg transition-colors ${TEXT_COLOR.secondary}`}
        >
          <span>다음 3일</span>
          <FaChevronRight />
        </button>
      </div>

      {/* 캘린더 그리드 */}
      <div className="p-6">
        {/* 날짜 셀 - 3일 모두 표시 */}
        <div className="grid grid-cols-3 gap-6">
          {calendarDays.map((day, index) => {
            const isToday = day.date.toDateString() === new Date().toDateString();
            const hasBookings = day.bookings.length > 0;

            return (
              <div
                key={index}
                className={`min-h-[600px] border rounded-lg p-6 ${
                  hasBookings
                    ? `${BORDER_COLOR.orangeMedium} bg-[#ED6C00]/80`
                    : `${BORDER_COLOR.default} ${BG_COLOR.card}`
                } ${isToday ? `ring-2 ${RING_COLOR.grayMedium}` : ''}`}
              >
                {/* 날짜 정보 */}
                <div
                  className={`text-xl font-bold mb-5 pb-4 border-b ${
                    hasBookings
                      ? 'text-white border-orange-400'
                      : `${TEXT_COLOR.primary} ${BORDER_COLOR.default}`
                  }`}
                >
                  <div
                    className={`text-base mb-2 ${
                      hasBookings ? 'text-white' : `${TEXT_COLOR.secondary}`
                    }`}
                  >
                    {weekDays[day.date.getDay()]}
                  </div>
                  {day.date.getMonth() + 1}월 {day.date.getDate()}일
                  {isToday && (
                    <span
                      className={`ml-2 text-sm ${hasBookings ? 'text-white' : `${TEXT_COLOR.secondary}`}`}
                    >
                      (오늘)
                    </span>
                  )}
                </div>

                {/* 예약 태그들 - 모두 표시 */}
                <div className="space-y-3">
                  {day.bookings.length === 0 ? (
                    <div
                      className={`text-base text-center py-12 ${hasBookings ? 'text-white' : `${TEXT_COLOR.disabled}`}`}
                    >
                      예약 없음
                    </div>
                  ) : (
                    day.bookings.map((booking) => {
                      const pending = actionPendingId === booking.id;
                      return (
                        <div
                          key={booking.id}
                          data-testid={`booking-card-${booking.id}`}
                          className={`px-4 py-3 ${BG_COLOR.gray}/50 rounded-lg border ${BORDER_COLOR.default}`}
                          title={`${booking.company_name} - ${booking.visit_time_slot}`}
                        >
                          <button
                            type="button"
                            onClick={() => handleBookingClick(booking)}
                            className={`w-full text-left ${TEXT_COLOR.primary} cursor-pointer`}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <FaClock className="text-base flex-shrink-0" />
                              <span className="font-bold text-base">{booking.company_name}</span>
                            </div>
                            <div className={`text-base ${TEXT_COLOR.secondary} font-medium`}>
                              {booking.visit_time_slot}
                            </div>
                            <div className={`text-xs mt-1 ${TEXT_COLOR.secondary}`}>
                              상태: {booking.status}
                            </div>
                          </button>
                          <div className="flex gap-2 mt-2">
                            {booking.status !== 'confirmed' && (
                              <Button
                                size="sm"
                                variant="primary"
                                disabled={pending}
                                onClick={() => handleApprove(booking)}
                              >
                                승인
                              </Button>
                            )}
                            {booking.status !== 'cancelled' && (
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={pending}
                                onClick={() => handleCancel(booking)}
                              >
                                취소
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={pending}
                              onClick={() => openEditModal(booking)}
                            >
                              수정
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 문의 상세보기 모달 */}
      {isModalOpen && (
        <ContactDetailModal
          contactId={selectedContactId}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
      )}

      {/* 예약 수정 모달 */}
      <BookingEditModal
        booking={editBooking}
        open={editBooking !== null}
        onClose={closeEditModal}
      />

      {/* 디버깅 정보 */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 right-4 bg-black/80 text-white p-2 text-xs rounded z-50">
          <div>Modal Open: {isModalOpen ? 'Yes' : 'No'}</div>
          <div>Contact ID: {selectedContactId || 'None'}</div>
        </div>
      )}
    </div>
  );
}
