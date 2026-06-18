'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useState } from 'react';
import {
  FaCalendarAlt,
  FaClock,
  FaBuilding,
  FaUser,
  FaPhone,
  FaEnvelope,
  FaTrash,
} from 'react-icons/fa';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('BookingsList');

interface Contact {
  id: number;
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
  contact_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  contacts: Contact | null;
}

interface BookingsListProps {
  initialBookings: Booking[];
}

export function BookingsList({ initialBookings }: BookingsListProps) {
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // 날짜별로 그룹화
  const groupedBookings = bookings.reduce(
    (acc, booking) => {
      const date = booking.visit_date;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(booking);
      return acc;
    },
    {} as Record<string, Booking[]>
  );

  const sortedDates = Object.keys(groupedBookings).sort();

  // 날짜 필터링
  const filteredBookings = selectedDate
    ? bookings.filter((b) => b.visit_date === selectedDate)
    : bookings;

  const handleDelete = async (id: number) => {
    if (!confirm('정말 이 예약을 취소하시겠습니까?')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/admin/bookings/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setBookings(bookings.filter((b) => b.id !== id));
      } else {
        alert('예약 취소에 실패했습니다.');
      }
    } catch (error) {
      log.error('Error deleting booking:', error);
      alert('예약 취소 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 필터 */}
      <div className={`${BG_COLOR.card} p-4 rounded-lg shadow-md`}>
        <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
          날짜 필터
        </label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className={`px-4 py-2 border ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.card} ${TEXT_COLOR.primary}`}
        />
        {selectedDate && (
          <button
            onClick={() => setSelectedDate('')}
            className={`ml-2 px-4 py-2 text-sm ${TEXT_COLOR.secondary} ${TEXT_COLOR.hoverPrimary}`}
          >
            필터 초기화
          </button>
        )}
      </div>

      {/* 예약 목록 */}
      {sortedDates.length === 0 ? (
        <div className={`${BG_COLOR.card} p-8 rounded-lg shadow-md text-center`}>
          <p className={`${TEXT_COLOR.secondary}`}>예약이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((date) => (
            <div key={date} className={`${BG_COLOR.card} rounded-lg shadow-md overflow-hidden`}>
              <div className="bg-orange-500 text-white px-6 py-3">
                <div className="flex items-center gap-2">
                  <FaCalendarAlt />
                  <h2 className="text-lg font-semibold">
                    {new Date(date).toLocaleDateString('ko-KR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      weekday: 'long',
                    })}
                  </h2>
                  <span className="ml-auto text-sm">{groupedBookings[date].length}건</span>
                </div>
              </div>

              <div className={`divide-y ${BORDER_COLOR.default}`}>
                {groupedBookings[date]
                  .sort((a, b) => a.visit_time_slot.localeCompare(b.visit_time_slot))
                  .map((booking) => (
                    <div
                      key={booking.id}
                      className={`p-6 ${BG_COLOR.hoverMuted} transition-colors`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-4 mb-3">
                            <div className={`flex items-center gap-2 ${TEXT_COLOR.orange}`}>
                              <FaClock />
                              <span className="font-semibold">{booking.visit_time_slot}</span>
                            </div>
                            <div className={`flex items-center gap-2 ${TEXT_COLOR.secondary}`}>
                              <FaBuilding />
                              <span>{booking.company_name}</span>
                            </div>
                          </div>

                          {booking.contacts && (
                            <div
                              className={`grid grid-cols-1 md:grid-cols-2 gap-3 text-sm ${TEXT_COLOR.secondary}`}
                            >
                              <div className="flex items-center gap-2">
                                <FaUser />
                                <span>{booking.contacts.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <FaPhone />
                                <span>{booking.contacts.phone}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <FaEnvelope />
                                <span>{booking.contacts.email}</span>
                              </div>
                              {booking.contacts.inquiry_number && (
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">문의번호:</span>
                                  <span>{booking.contacts.inquiry_number}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {booking.notes && (
                            <div
                              className={`mt-3 p-3 ${BG_COLOR.light} rounded text-sm ${TEXT_COLOR.secondary}`}
                            >
                              <strong>메모:</strong> {booking.notes}
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => handleDelete(booking.id)}
                            disabled={loading}
                            className={`p-2 text-red-600 ${BG_COLOR.hoverError} rounded transition-colors disabled:opacity-50`}
                            title="예약 취소"
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
