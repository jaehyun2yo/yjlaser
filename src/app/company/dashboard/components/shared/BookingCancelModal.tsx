'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaTruck, FaShippingFast, FaUser, FaPhone, FaMapMarkerAlt } from 'react-icons/fa';
import type { Booking } from '@/app/company/dashboard/types';
import { BG_COLOR, TEXT_COLOR, BORDER_COLOR } from '@/lib/styles';

interface BookingCancelModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  onSuccess: (deliveryInfo: {
    deliveryMethod: 'delivery' | 'quick';
    name: string;
    phone: string;
    address: string;
  }) => void;
  variant?: 'mobile' | 'tablet' | 'desktop';
  defaultName?: string;
  defaultPhone?: string;
  defaultAddress?: string;
}

export function BookingCancelModal({
  isOpen,
  onClose,
  booking,
  onSuccess,
  variant = 'desktop',
  defaultName = '',
  defaultPhone = '',
  defaultAddress = '',
}: BookingCancelModalProps) {
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'quick'>('delivery');
  const [name, setName] = useState<string>(defaultName);
  const [phone, setPhone] = useState<string>(defaultPhone);
  const [address, setAddress] = useState<string>(defaultAddress);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 기본값이 변경되면 상태 업데이트
  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
      setPhone(defaultPhone);
      setAddress(defaultAddress);
      setError(null);
    }
  }, [isOpen, defaultName, defaultPhone, defaultAddress]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 유효성 검사
    if (!name.trim()) {
      setError('이름을 입력해주세요.');
      return;
    }
    if (!phone.trim()) {
      setError('연락처를 입력해주세요.');
      return;
    }
    if (!address.trim()) {
      setError('주소를 입력해주세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      onSuccess({
        deliveryMethod,
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setError(null);
      onClose();
    }
  };

  // 버전별 스타일 클래스
  const modalClasses = {
    mobile: 'w-full max-w-sm',
    tablet: 'w-full max-w-md',
    desktop: 'w-full max-w-lg',
  };

  const titleClasses = {
    mobile: 'text-lg font-bold',
    tablet: 'text-xl font-bold',
    desktop: 'text-xl font-bold',
  };

  const inputClasses = {
    mobile: `w-full px-3 py-2 text-sm rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary} focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent`,
    tablet: `w-full px-4 py-2.5 text-sm rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary} focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent`,
    desktop: `w-full px-4 py-2.5 text-base rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary} focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent`,
  };

  const labelClasses = {
    mobile: `block text-sm font-medium ${TEXT_COLOR.secondary} mb-1.5`,
    tablet: `block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`,
    desktop: `block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`,
  };

  const buttonClasses = {
    mobile: 'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
    tablet: 'px-5 py-2.5 text-sm font-medium rounded-lg transition-colors',
    desktop: 'px-6 py-3 text-base font-medium rounded-lg transition-colors',
  };

  if (!booking) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 오버레이 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
            onClick={handleClose}
          />

          {/* 모달 */}
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className={`${modalClasses[variant]} ${BG_COLOR.card} rounded-xl shadow-2xl pointer-events-auto max-h-[90vh] overflow-y-auto`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div
                className={`flex items-center justify-between p-4 md:p-6 border-b ${BORDER_COLOR.default}`}
              >
                <h2 className={`${titleClasses[variant]} ${TEXT_COLOR.primary}`}>샘플 배송 정보</h2>
                <button
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className={`p-2 rounded-lg ${TEXT_COLOR.muted} ${BG_COLOR.hoverMuted} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                  aria-label="닫기"
                >
                  <FaTimes className="text-lg" />
                </button>
              </div>

              {/* 본문 */}
              <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4 md:space-y-5">
                <div className="space-y-2">
                  <p className={`text-sm ${TEXT_COLOR.secondary} leading-relaxed`}>
                    예약을 취소하시면 제작된 샘플을
                    <br />
                    배송 또는 퀵으로 받으실 수 있습니다.
                  </p>
                  <p className={`text-sm ${TEXT_COLOR.secondary} leading-relaxed`}>
                    배송 정보를 입력해주세요.
                  </p>
                </div>

                {/* 배송 방법 선택 */}
                <div>
                  <label className={labelClasses[variant]}>배송 방법</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setDeliveryMethod('delivery')}
                      className={`flex-1 flex items-center justify-center gap-2 ${buttonClasses[variant]} ${
                        deliveryMethod === 'delivery'
                          ? `${BG_COLOR.brandLight} ${TEXT_COLOR.brand} border-2 border-orange-500`
                          : `${BG_COLOR.muted} ${TEXT_COLOR.secondary} border-2 border-transparent ${BG_COLOR.hoverMuted}`
                      }`}
                    >
                      <FaTruck className="text-base" />
                      <span>배송</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryMethod('quick')}
                      className={`flex-1 flex items-center justify-center gap-2 ${buttonClasses[variant]} ${
                        deliveryMethod === 'quick'
                          ? `${BG_COLOR.brandLight} ${TEXT_COLOR.brand} border-2 border-orange-500`
                          : `${BG_COLOR.muted} ${TEXT_COLOR.secondary} border-2 border-transparent ${BG_COLOR.hoverMuted}`
                      }`}
                    >
                      <FaShippingFast className="text-base" />
                      <span>퀵</span>
                    </button>
                  </div>
                </div>

                {/* 이름 */}
                <div>
                  <label htmlFor="cancel-name" className={labelClasses[variant]}>
                    <FaUser className="inline mr-1.5" />
                    이름
                  </label>
                  <input
                    id="cancel-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClasses[variant]}
                    placeholder="이름을 입력하세요"
                    disabled={isSubmitting}
                    required
                  />
                </div>

                {/* 연락처 */}
                <div>
                  <label htmlFor="cancel-phone" className={labelClasses[variant]}>
                    <FaPhone className="inline mr-1.5" />
                    연락처
                  </label>
                  <input
                    id="cancel-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={inputClasses[variant]}
                    placeholder="연락처를 입력하세요"
                    disabled={isSubmitting}
                    required
                  />
                </div>

                {/* 주소 */}
                <div>
                  <label htmlFor="cancel-address" className={labelClasses[variant]}>
                    <FaMapMarkerAlt className="inline mr-1.5" />
                    받을 주소
                  </label>
                  <textarea
                    id="cancel-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className={`${inputClasses[variant]} min-h-[100px] resize-y`}
                    placeholder="주소를 입력하세요"
                    disabled={isSubmitting}
                    required
                  />
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
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isSubmitting}
                    className={`flex-1 ${buttonClasses[variant]} ${BG_COLOR.lightGray} ${TEXT_COLOR.secondary} ${BG_COLOR.hoverGray} disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`flex-1 ${buttonClasses[variant]} bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        <span>처리 중...</span>
                      </>
                    ) : (
                      '예약 취소 및 배송 신청'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
