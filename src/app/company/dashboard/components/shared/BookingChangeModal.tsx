'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaCalendarAlt, FaClock, FaSpinner } from 'react-icons/fa';
import type { Booking } from '@/app/company/dashboard/types';
import { BG_COLOR, TEXT_COLOR, BORDER_COLOR } from '@/lib/styles';

interface BookingChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  onSuccess: () => void;
  variant?: 'mobile' | 'tablet' | 'desktop';
}

// 예약 가능한 시간 슬롯 (9시부터 17시까지, 12시는 제외)
const TIME_SLOTS = [
  '9:00~10:00',
  '10:00~11:00',
  '11:00~12:00',
  '13:00~14:00',
  '14:00~15:00',
  '15:00~16:00',
  '16:00~17:00',
  '17:00~18:00',
];

export function BookingChangeModal({
  isOpen,
  onClose,
  booking,
  onSuccess,
  variant = 'desktop',
}: BookingChangeModalProps) {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [bookingAvailability, setBookingAvailability] = useState<
    Record<string, { count: number; available: boolean }>
  >({});

  // 모달이 열릴 때 초기값 설정
  useEffect(() => {
    if (isOpen && booking) {
      setSelectedDate(booking.visit_date);
      setSelectedTimeSlot(booking.visit_time_slot);
      setError(null);
      // 예약 가능 여부 조회
      fetchBookingAvailability(booking.visit_date);
    }
  }, [isOpen, booking]);

  // 날짜 변경 시 예약 가능 여부 조회
  useEffect(() => {
    if (selectedDate) {
      fetchBookingAvailability(selectedDate);
    }
  }, [selectedDate]);

  const fetchBookingAvailability = async (date: string) => {
    setIsLoadingAvailability(true);
    const availability: Record<string, { count: number; available: boolean }> = {};

    // 모든 시간 슬롯을 병렬로 조회하여 성능 개선
    const promises = TIME_SLOTS.map(async (timeSlot) => {
      try {
        const response = await fetch(
          `/api/bookings/available?date=${encodeURIComponent(date)}&timeSlot=${encodeURIComponent(timeSlot)}`
        );
        if (response.ok) {
          const data = await response.json();
          return {
            timeSlot,
            data: {
              count: data.bookingCount || 0,
              available: data.isAvailable || false,
            },
          };
        } else {
          return {
            timeSlot,
            data: { count: 2, available: false },
          };
        }
      } catch (_err) {
        return {
          timeSlot,
          data: { count: 2, available: false },
        };
      }
    });

    // 모든 요청을 병렬로 실행
    const results = await Promise.all(promises);

    // 결과를 availability 객체로 변환
    results.forEach((result) => {
      availability[result.timeSlot] = result.data;
    });

    setBookingAvailability(availability);
    setIsLoadingAvailability(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking || !selectedDate || !selectedTimeSlot) {
      setError('날짜와 시간을 선택해주세요.');
      return;
    }

    // 주말 체크
    const selectedDateObj = new Date(selectedDate);
    const dayOfWeek = selectedDateObj.getDay(); // 0 = 일요일, 6 = 토요일
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      setError('평일만 선택 가능합니다. (주말 제외)');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          visitDate: selectedDate,
          visitTimeSlot: selectedTimeSlot,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '예약 변경에 실패했습니다.');
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '예약 변경 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!booking) return null;

  // 버전별 스타일
  const modalClasses = {
    mobile: 'w-full max-w-md mx-4',
    tablet: 'w-full max-w-lg mx-4',
    desktop: 'w-full max-w-2xl mx-4',
  };

  const titleClasses = {
    mobile: 'text-lg font-bold',
    tablet: 'text-xl font-bold',
    desktop: 'text-xl font-bold',
  };

  const inputClasses = {
    mobile: 'text-sm px-3 py-2',
    tablet: 'text-base px-4 py-2.5',
    desktop: 'text-base px-4 py-2.5',
  };

  const buttonClasses = {
    mobile: 'text-sm px-4 py-2',
    tablet: 'text-base px-5 py-2.5',
    desktop: 'text-base px-6 py-3',
  };

  // 오늘 날짜 (YYYY-MM-DD 형식)
  const today = new Date().toISOString().split('T')[0];

  // 최소 날짜 (오늘)
  const minDate = today;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 배경 오버레이 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-[100]"
          />

          {/* 모달 */}
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`${modalClasses[variant]} ${BG_COLOR.card} rounded-xl shadow-2xl border ${BORDER_COLOR.default} max-h-[90vh] overflow-y-auto`}
            >
              {/* 헤더 */}
              <div
                className={`flex items-center justify-between p-4 md:p-6 border-b ${BORDER_COLOR.default}`}
              >
                <h2 className={`${titleClasses[variant]} ${TEXT_COLOR.primary}`}>예약 변경</h2>
                <button
                  onClick={onClose}
                  className={`p-2 rounded-lg ${BG_COLOR.hoverGray} ${TEXT_COLOR.muted} transition-colors`}
                  aria-label="닫기"
                >
                  <FaTimes className="text-lg" />
                </button>
              </div>

              {/* 현재 예약 정보 */}
              <div className={`p-4 md:p-6 border-b ${BORDER_COLOR.default} ${BG_COLOR.white}`}>
                <p className={`text-sm ${TEXT_COLOR.tertiary} mb-2`}>현재 예약</p>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <FaCalendarAlt className={`${TEXT_COLOR.tertiary} text-sm`} />
                    <span className={`text-sm font-medium ${TEXT_COLOR.primary}`}>
                      {new Date(booking.visit_date).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        weekday: 'long',
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FaClock className={`${TEXT_COLOR.tertiary} text-sm`} />
                    <span className={`text-sm font-medium ${TEXT_COLOR.primary}`}>
                      {booking.visit_time_slot}
                    </span>
                  </div>
                </div>
              </div>

              {/* 폼 */}
              <form onSubmit={handleSubmit} className="p-4 md:p-6">
                <div className="space-y-6">
                  {/* 날짜 선택 */}
                  <div>
                    <label
                      htmlFor="visitDate"
                      className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}
                    >
                      방문 날짜
                    </label>
                    <input
                      type="date"
                      id="visitDate"
                      value={selectedDate}
                      onChange={(e) => {
                        const selectedDateValue = e.target.value;
                        const selectedDateObj = new Date(selectedDateValue);
                        const dayOfWeek = selectedDateObj.getDay(); // 0 = 일요일, 6 = 토요일

                        // 주말 체크 (토요일=6, 일요일=0)
                        if (dayOfWeek === 0 || dayOfWeek === 6) {
                          setError('평일만 선택 가능합니다. (주말 제외)');
                          return;
                        }

                        // 주말이 아니면 날짜 설정 및 에러 초기화
                        setSelectedDate(selectedDateValue);
                        setError(null);
                      }}
                      min={minDate}
                      required
                      className={`${inputClasses[variant]} w-full border ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.white} ${TEXT_COLOR.primary} focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent`}
                    />
                  </div>

                  {/* 시간 슬롯 선택 */}
                  <div>
                    <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-3`}>
                      방문 시간
                      {isLoadingAvailability && (
                        <span className={`ml-2 text-xs ${TEXT_COLOR.muted}`}>(로딩 중...)</span>
                      )}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {isLoadingAvailability
                        ? // 로딩 중일 때 스켈레톤 UI 표시 (실제 버튼과 동일한 크기)
                          TIME_SLOTS.map((timeSlot) => (
                            <div
                              key={timeSlot}
                              className={`
                              ${inputClasses[variant]}
                              border-2 rounded-lg font-medium
                              ${BORDER_COLOR.default} ${BG_COLOR.lightGray} animate-pulse
                            `}
                            >
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-base opacity-0">{timeSlot}</span>
                                <span className="text-xs opacity-0">(2자리)</span>
                              </div>
                            </div>
                          ))
                        : // 데이터가 준비되면 한 번에 표시
                          TIME_SLOTS.map((timeSlot) => {
                            const availability = bookingAvailability[timeSlot];
                            const bookingCount = availability?.count ?? 0;
                            const isAvailable = availability?.available ?? true;
                            const isSelected = selectedTimeSlot === timeSlot;
                            const isDisabled = !isAvailable || bookingCount >= 2;

                            // 현재 예약의 시간 슬롯이면 항상 선택 가능
                            const isCurrentBooking =
                              booking.visit_date === selectedDate &&
                              booking.visit_time_slot === timeSlot;

                            return (
                              <button
                                key={timeSlot}
                                type="button"
                                onClick={() => {
                                  if (!isDisabled || isCurrentBooking) {
                                    setSelectedTimeSlot(timeSlot);
                                  }
                                }}
                                disabled={isDisabled && !isCurrentBooking}
                                className={`
                              ${inputClasses[variant]}
                              border-2 rounded-lg font-medium transition-all duration-200
                              ${
                                isSelected
                                  ? 'border-orange-500 bg-orange-500 text-white'
                                  : isDisabled && !isCurrentBooking
                                    ? `${BORDER_COLOR.default} ${BG_COLOR.lightGray} ${TEXT_COLOR.muted} cursor-not-allowed`
                                    : `${BORDER_COLOR.default} ${BG_COLOR.white} ${TEXT_COLOR.secondary} hover:border-orange-500 ${BG_COLOR.hoverOrangeSoft}`
                              }
                            `}
                              >
                                <div className="flex flex-col items-center gap-1">
                                  <span>{timeSlot}</span>
                                  {!isCurrentBooking && (
                                    <span
                                      className={`text-xs opacity-75 ${isSelected ? 'text-white' : ''}`}
                                    >
                                      {isAvailable ? `(${2 - bookingCount}자리)` : '(마감)'}
                                    </span>
                                  )}
                                  {isCurrentBooking && (
                                    <span
                                      className={`text-xs opacity-75 ${isSelected ? 'text-white' : ''}`}
                                    >
                                      (현재)
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                    </div>
                  </div>

                  {/* 에러 메시지 */}
                  {error && (
                    <div
                      className={`p-3 ${BG_COLOR.error} border ${BORDER_COLOR.default} rounded-lg`}
                    >
                      <p className={`text-sm ${TEXT_COLOR.error}`}>{error}</p>
                    </div>
                  )}

                  {/* 버튼 */}
                  <div className={`flex gap-3 justify-end pt-4 border-t ${BORDER_COLOR.default}`}>
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={isSubmitting}
                      className={`${buttonClasses[variant]} rounded-lg ${BG_COLOR.lightGray} ${TEXT_COLOR.primary} ${BG_COLOR.hoverGray} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !selectedDate || !selectedTimeSlot}
                      className={`${buttonClasses[variant]} rounded-lg ${BG_COLOR.brand} ${BG_COLOR.brandHover} text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
                    >
                      {isSubmitting ? (
                        <>
                          <FaSpinner className="animate-spin" />
                          변경 중...
                        </>
                      ) : (
                        '예약 변경'
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
