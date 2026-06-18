'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaExpand, FaBox, FaAlignLeft, FaSpinner, FaMousePointer } from 'react-icons/fa';
import {
  LogoLoading,
  PageLoading,
  ContainerLoading,
  InlineLoading,
  SpinnerLoading,
  ButtonLoading,
} from '@/components/ui/LogoLoading';

interface LoadingTestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type LoadingVariant = 'fullscreen' | 'container' | 'inline' | 'spinner' | 'button';

export function LoadingTestModal({ isOpen, onClose }: LoadingTestModalProps) {
  const [selectedVariant, setSelectedVariant] = useState<LoadingVariant | null>(null);
  const [showFullscreen, setShowFullscreen] = useState(false);

  // 모달 열릴 때 body 스크롤 차단
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const variants: {
    id: LoadingVariant;
    label: string;
    description: string;
    icon: typeof FaExpand;
  }[] = [
    {
      id: 'fullscreen',
      label: 'PageLoading',
      description: '전체 화면 로딩 (페이지 전환 시)',
      icon: FaExpand,
    },
    {
      id: 'container',
      label: 'ContainerLoading',
      description: '컨테이너 내 로딩 (레이아웃 유지)',
      icon: FaBox,
    },
    {
      id: 'inline',
      label: 'InlineLoading',
      description: '인라인 로딩 (섹션 내)',
      icon: FaAlignLeft,
    },
    {
      id: 'spinner',
      label: 'SpinnerLoading',
      description: '스피너만 (작은 영역용)',
      icon: FaSpinner,
    },
    {
      id: 'button',
      label: 'ButtonLoading',
      description: '버튼 내 로딩 상태',
      icon: FaMousePointer,
    },
  ];

  const handleVariantClick = (variant: LoadingVariant) => {
    if (variant === 'fullscreen') {
      setShowFullscreen(true);
      setTimeout(() => setShowFullscreen(false), 3000);
    } else {
      setSelectedVariant(selectedVariant === variant ? null : variant);
    }
  };

  const renderPreview = () => {
    switch (selectedVariant) {
      case 'container':
        return (
          <div className={`h-64 border ${BORDER_COLOR.default} rounded-lg overflow-hidden`}>
            <ContainerLoading />
          </div>
        );
      case 'inline':
        return (
          <div className={`border ${BORDER_COLOR.default} rounded-lg overflow-hidden`}>
            <InlineLoading text="데이터를 불러오는 중..." />
          </div>
        );
      case 'spinner':
        return (
          <div
            className={`flex items-center justify-center gap-8 p-8 border ${BORDER_COLOR.default} rounded-lg`}
          >
            <div className="flex flex-col items-center gap-2">
              <SpinnerLoading size="sm" color="primary" />
              <span className="text-xs text-gray-500">Small</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <SpinnerLoading size="md" color="primary" />
              <span className="text-xs text-gray-500">Medium</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <SpinnerLoading size="lg" color="primary" />
              <span className="text-xs text-gray-500">Large</span>
            </div>
            <div className="flex flex-col items-center gap-2 bg-gray-900 p-3 rounded-lg">
              <SpinnerLoading size="md" color="white" />
              <span className="text-xs text-gray-400">White</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <SpinnerLoading size="md" color="gray" />
              <span className="text-xs text-gray-500">Gray</span>
            </div>
          </div>
        );
      case 'button':
        return (
          <div
            className={`flex flex-wrap items-center justify-center gap-4 p-8 border ${BORDER_COLOR.default} rounded-lg`}
          >
            <button
              disabled
              className="flex items-center gap-2 px-6 py-3 bg-[#ED6C00] text-white rounded-lg opacity-80 cursor-not-allowed"
            >
              <ButtonLoading text="저장 중..." color="white" />
            </button>
            <button
              disabled
              className={`flex items-center gap-2 px-6 py-3 ${BG_COLOR.muted} ${TEXT_COLOR.secondary} rounded-lg opacity-80 cursor-not-allowed`}
            >
              <ButtonLoading text="처리 중..." color="primary" />
            </button>
            <button
              disabled
              className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg opacity-80 cursor-not-allowed"
            >
              <ButtonLoading text="삭제 중..." color="white" />
            </button>
          </div>
        );
      default:
        return (
          <div className={`flex items-center justify-center h-48 ${TEXT_COLOR.disabled}`}>
            <p>위에서 로딩 타입을 선택하세요</p>
          </div>
        );
    }
  };

  return (
    <>
      {/* 전체 화면 로딩 오버레이 */}
      <AnimatePresence>
        {showFullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100]"
          >
            <PageLoading />
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className={`fixed bottom-10 left-1/2 -translate-x-1/2 text-sm ${TEXT_COLOR.secondary}`}
            >
              3초 후 자동으로 닫힙니다...
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 메인 모달 */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* 오버레이 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={onClose}
            />

            {/* 모달 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={onClose}
            >
              <div
                className={`${BG_COLOR.card} rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col`}
                style={{ maxHeight: 'calc(90vh - 32px)' }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* 헤더 */}
                <div
                  className={`flex items-center justify-between px-6 py-4 border-b ${BORDER_COLOR.default} shrink-0`}
                >
                  <div>
                    <h2 className={`text-lg font-bold ${TEXT_COLOR.primary}`}>
                      로딩 컴포넌트 테스트
                    </h2>
                    <p className={`text-sm ${TEXT_COLOR.secondary}`}>
                      다양한 로딩 화면을 미리 확인하세요
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className={`p-2 rounded-lg ${BG_COLOR.hoverMuted} transition-colors`}
                  >
                    <FaTimes className="text-gray-500" />
                  </button>
                </div>

                {/* 바디 */}
                <div
                  className="p-6 overflow-y-auto overscroll-contain"
                  style={{ flex: '1 1 auto' }}
                >
                  {/* 버튼 그리드 */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                    {variants.map((variant) => {
                      const Icon = variant.icon;
                      const isSelected = selectedVariant === variant.id;
                      const isFullscreen = variant.id === 'fullscreen';

                      return (
                        <button
                          key={variant.id}
                          onClick={() => handleVariantClick(variant.id)}
                          className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                            isSelected
                              ? `border-[#ED6C00] ${BG_COLOR.brandLight}`
                              : `${BORDER_COLOR.default} ${BORDER_COLOR.hoverGray}`
                          }`}
                        >
                          <Icon
                            className={`text-xl ${isSelected ? 'text-[#ED6C00]' : 'text-gray-400'}`}
                          />
                          <span
                            className={`text-sm font-medium ${isSelected ? 'text-[#ED6C00]' : TEXT_COLOR.secondary}`}
                          >
                            {variant.label}
                          </span>
                          <span className={`text-xs ${TEXT_COLOR.secondary} text-center`}>
                            {isFullscreen ? '클릭하여 실행' : variant.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 미리보기 영역 */}
                  <div className="space-y-3">
                    <h3 className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>미리보기</h3>
                    {renderPreview()}
                  </div>

                  {/* LogoLoading 커스텀 옵션 */}
                  <div className={`mt-6 p-4 ${BG_COLOR.page}/50 rounded-xl`}>
                    <h3 className={`text-sm font-medium ${TEXT_COLOR.secondary} mb-3`}>
                      LogoLoading 커스텀 예시
                    </h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex flex-col items-center gap-2">
                        <div
                          className={`h-24 w-full flex items-center justify-center border ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.card}`}
                        >
                          <LogoLoading variant="inline" size="sm" transparent />
                        </div>
                        <span className="text-xs text-gray-500">Small</span>
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <div
                          className={`h-24 w-full flex items-center justify-center border ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.card}`}
                        >
                          <LogoLoading variant="inline" size="md" transparent />
                        </div>
                        <span className="text-xs text-gray-500">Medium</span>
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <div
                          className={`h-24 w-full flex items-center justify-center border ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.card}`}
                        >
                          <LogoLoading variant="inline" size="lg" transparent />
                        </div>
                        <span className="text-xs text-gray-500">Large</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 푸터 */}
                <div
                  className={`flex justify-end gap-3 px-6 py-4 border-t ${BORDER_COLOR.default} ${BG_COLOR.page}/50 shrink-0`}
                >
                  <button
                    onClick={onClose}
                    className={`px-4 py-2 text-sm font-medium ${TEXT_COLOR.secondary} ${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.hoverMuted} transition-colors`}
                  >
                    닫기
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
