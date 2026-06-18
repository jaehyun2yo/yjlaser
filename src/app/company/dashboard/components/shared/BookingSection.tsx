'use client';

import { useState, useEffect } from 'react';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('BookingSection');
import { FaCalendarAlt, FaClock, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import type { Booking, Company } from '@/app/company/dashboard/types';
import { BookingChangeModal } from './BookingChangeModal';
import { BookingCancelModal } from './BookingCancelModal';
import { ContactDetailModal } from '@/app/(admin)/admin/contacts/ContactDetailModal';
import ErrorModal from '@/components/ErrorModal';
import { getStatusInfo } from '@/app/company/dashboard/utils';
import { getCompanyInquiryDisplayTitle } from '@/app/company/dashboard/displayTitle';
import { BG_COLOR, BORDER_COLOR, DASHBOARD_STATUS_BADGE, TEXT_COLOR } from '@/lib/styles';
import {
  BookingChangeButton,
  BookingCancelButton,
  ActionButtonGroup,
} from '@/components/ui/DashboardButtons';

type Variant = 'mobile' | 'tablet' | 'desktop';

interface BookingSectionProps {
  bookings: Booking[];
  variant?: Variant;
  onBookingChange?: () => void;
  company?: Company;
}

export function BookingSection({
  bookings: initialBookings,
  variant = 'desktop',
  onBookingChange,
  company,
}: BookingSectionProps) {
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedCancelBooking, setSelectedCancelBooking] = useState<Booking | null>(null);
  const [errorModal, setErrorModal] = useState<{ isOpen: boolean; title: string; message: string }>(
    {
      isOpen: false,
      title: '',
      message: '',
    }
  );
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    setBookings(initialBookings);
  }, [initialBookings]);

  if (bookings.length === 0) {
    return null;
  }

  const handleChangeClick = (booking: Booking) => {
    setSelectedBooking(booking);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedBooking(null);
  };

  const handleSuccess = () => {
    if (onBookingChange) {
      onBookingChange();
    }
  };

  const handleCancelClick = (booking: Booking) => {
    setSelectedCancelBooking(booking);
    setIsCancelModalOpen(true);
  };

  const handleCancelModalClose = () => {
    setIsCancelModalOpen(false);
    setSelectedCancelBooking(null);
  };

  const handleBookingCardClick = (booking: Booking, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }

    if (booking.contact_id) {
      setSelectedContactId(booking.contact_id);
      setIsContactModalOpen(true);
    } else {
      log.warn('예약 정보에 문의 ID가 없습니다:', booking);
      setErrorModal({
        isOpen: true,
        title: '문의 정보 없음',
        message: '예약 정보에 문의 ID가 없습니다.\n이 예약은 문의와 연결되지 않았습니다.',
      });
    }
  };

  const handleContactModalClose = () => {
    setIsContactModalOpen(false);
    setSelectedContactId(null);
  };

  // 작업현황 태그 생성 함수 (공통 스타일 사용)
  const getSampleStatusTag = (booking: Booking) => {
    const processStage = booking.contacts?.process_stage;

    if (processStage === 'sample') {
      return {
        label: '샘플준비완료',
        className: DASHBOARD_STATUS_BADGE.sampleReady,
      };
    } else {
      return {
        label: '샘플 준비중',
        className: DASHBOARD_STATUS_BADGE.samplePending,
      };
    }
  };

  // 상태 뱃지 스타일 (공통 스타일 사용)
  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'completed':
      case 'delivered':
        return DASHBOARD_STATUS_BADGE.completed;
      case 'in_progress':
      case 'read':
      case 'delivering':
        return DASHBOARD_STATUS_BADGE.inProgress;
      case 'revision_in_progress':
        return DASHBOARD_STATUS_BADGE.revision;
      default:
        return DASHBOARD_STATUS_BADGE.pending;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className={`${BG_COLOR.gradientCard} rounded-2xl sm:rounded-3xl overflow-hidden border ${BORDER_COLOR.default}/50 shadow-2xl p-4 sm:p-6 relative`}
    >
      {/* 헤더 */}
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        aria-label={isExpanded ? '접기' : '펼치기'}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-[#ED6C00] rounded-lg flex items-center justify-center">
            <FaCalendarAlt className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
          </div>
          <div>
            <p className={`${TEXT_COLOR.primary} font-semibold text-xs sm:text-sm`}>예약 일정</p>
            <p className="text-gray-500 text-[10px] sm:text-xs">{bookings.length}건의 예약</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full animate-pulse" />
            <span className={`${TEXT_COLOR.success} text-[10px] sm:text-xs`}>Live</span>
          </div>
          <div className={`p-1.5 ${BG_COLOR.hoverCardChevron} rounded transition-colors`}>
            {isExpanded ? (
              <FaChevronUp className="text-gray-400 text-sm" />
            ) : (
              <FaChevronDown className="text-gray-400 text-sm" />
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-3 sm:space-y-4 pt-4">
              {bookings.map((booking, index) => (
                <motion.div
                  key={booking.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`bg-gradient-to-br from-gray-50 to-white dark:from-gray-800/80 dark:to-gray-800/50 rounded-xl sm:rounded-2xl p-3 sm:p-4 border ${BORDER_COLOR.default}/50 cursor-pointer hover:border-gray-300 dark:hover:border-gray-600/50 hover:from-gray-100 dark:hover:from-gray-800 hover:to-gray-50 dark:hover:to-gray-800/70 transition-all shadow-lg`}
                  onClick={(e) => handleBookingCardClick(booking, e)}
                >
                  <div className="flex flex-col gap-3">
                    {/* 상단: 상태 뱃지 + 샘플 상태 + 문의명 */}
                    <div className="flex items-center gap-2 sm:gap-3">
                      {booking.contacts?.status && (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-medium border flex-shrink-0 ${getStatusBadgeStyle(booking.contacts.status)}`}
                        >
                          {getStatusInfo(booking.contacts.status).label}
                        </span>
                      )}
                      <span className={getSampleStatusTag(booking).className}>
                        {getSampleStatusTag(booking).label}
                      </span>
                      <span
                        className={`${TEXT_COLOR.primary} font-semibold text-sm sm:text-base truncate`}
                      >
                        {getCompanyInquiryDisplayTitle({
                          inquiryTitle: booking.contacts?.inquiry_title,
                          alternateTitle: booking.contacts?.name,
                          companyName: booking.company_name,
                          fallbackTitle: '문의명 없음',
                        })}
                      </span>
                    </div>

                    {/* 중간: 방문 일정 카드 */}
                    <div
                      className={`${BG_COLOR.muted} rounded-lg sm:rounded-xl p-2.5 sm:p-3 border ${BORDER_COLOR.default}/30`}
                    >
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 sm:w-7 sm:h-7 bg-[#ED6C00]/20 rounded-lg flex items-center justify-center">
                            <FaCalendarAlt className="text-[#ED6C00] text-xs sm:text-sm" />
                          </div>
                          <span
                            className={`font-medium ${TEXT_COLOR.primary} text-sm sm:text-base`}
                          >
                            {new Date(booking.visit_date).toLocaleDateString('ko-KR', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              weekday: 'short',
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 sm:w-7 sm:h-7 bg-[#ED6C00]/20 rounded-lg flex items-center justify-center">
                            <FaClock className="text-[#ED6C00] text-xs sm:text-sm" />
                          </div>
                          <span
                            className={`font-medium ${TEXT_COLOR.primary} text-sm sm:text-base`}
                          >
                            {booking.visit_time_slot}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 하단: 버튼들 */}
                    <ActionButtonGroup>
                      <BookingChangeButton onClick={() => handleChangeClick(booking)} />
                      <BookingCancelButton onClick={() => handleCancelClick(booking)} />
                    </ActionButtonGroup>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 스캔라인 효과 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl sm:rounded-3xl">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent animate-scan" />
      </div>

      {/* 예약 변경 모달 */}
      {selectedBooking && (
        <BookingChangeModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          booking={selectedBooking}
          onSuccess={handleSuccess}
          variant={variant}
        />
      )}

      {/* 예약 취소 모달 */}
      {selectedCancelBooking && (
        <BookingCancelModal
          isOpen={isCancelModalOpen}
          onClose={handleCancelModalClose}
          booking={selectedCancelBooking}
          onSuccess={async (deliveryInfo) => {
            try {
              const response = await fetch(`/api/bookings/${selectedCancelBooking.id}`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  deliveryMethod: deliveryInfo.deliveryMethod,
                  deliveryName: deliveryInfo.name,
                  deliveryPhone: deliveryInfo.phone,
                  deliveryAddress: deliveryInfo.address,
                }),
              });

              if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '예약 취소에 실패했습니다.');
              }

              setIsCancelModalOpen(false);
              setSelectedCancelBooking(null);
              if (onBookingChange) {
                onBookingChange();
              }
            } catch (error) {
              log.error('Error cancelling booking:', error);
              setErrorModal({
                isOpen: true,
                title: '예약 취소 실패',
                message:
                  error instanceof Error ? error.message : '예약 취소 중 오류가 발생했습니다.',
              });
            }
          }}
          variant={variant}
          defaultName={company?.manager_name || ''}
          defaultPhone={company?.manager_phone || ''}
          defaultAddress={company?.business_address || ''}
        />
      )}

      {/* 문의 상세보기 모달 */}
      {isContactModalOpen && (
        <ContactDetailModal
          contactId={selectedContactId}
          isOpen={isContactModalOpen}
          onClose={handleContactModalClose}
          hideInquiryNumber={true}
          isCompanyView={true}
        />
      )}

      {/* 오류 모달 */}
      <ErrorModal
        isOpen={errorModal.isOpen}
        onClose={() => setErrorModal({ isOpen: false, title: '', message: '' })}
        title={errorModal.title}
        message={errorModal.message}
      />
    </motion.div>
  );
}
