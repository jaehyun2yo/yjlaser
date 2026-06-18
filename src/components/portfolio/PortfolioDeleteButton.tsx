'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { motion } from 'framer-motion';
import { logger } from '@/lib/utils/logger';
import { BG_COLOR, TEXT_COLOR } from '@/lib/styles';

const log = logger.createLogger('PortfolioDeleteButton');

interface PortfolioDeleteButtonProps {
  portfolioId: string; // UUID
  portfolioTitle: string;
  deletePortfolio: (formData: FormData) => Promise<{ success: boolean; error?: string }>;
}

export function PortfolioDeleteButton({
  portfolioId,
  portfolioTitle,
  deletePortfolio,
}: PortfolioDeleteButtonProps) {
  const router = useRouter();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteClick = () => {
    setShowConfirmModal(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      const formData = new FormData();
      formData.append('id', String(portfolioId));
      const result = await deletePortfolio(formData);

      if (result.success) {
        setShowConfirmModal(false);
        setIsDeleting(false);
        router.refresh();
      } else {
        const errorMessages: Record<string, string> = {
          invalid: '포트폴리오 ID가 유효하지 않습니다.',
          server: '서버 오류가 발생했습니다.',
        };
        alert(errorMessages[result.error || 'invalid'] || '삭제 중 오류가 발생했습니다.');
        setIsDeleting(false);
      }
    } catch (error) {
      log.error('Failed to delete portfolio:', error);
      alert('삭제 중 오류가 발생했습니다. 다시 시도해주세요.');
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setShowConfirmModal(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleDeleteClick}
        className={`px-3 py-1.5 rounded-md text-sm ${BG_COLOR.errorLight} ${TEXT_COLOR.errorStrong} ${BG_COLOR.hoverErrorMedium}`}
      >
        삭제
      </button>

      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title="포트폴리오 삭제"
        message={
          <>
            &quot;{portfolioTitle}&quot; 포트폴리오를 삭제하시겠습니까?
            <br />이 작업은 되돌릴 수 없습니다.
          </>
        }
        confirmLabel="삭제"
        cancelLabel="취소"
        isSubmitting={isDeleting}
        icon={
          <motion.svg
            className={`h-7 w-7 ${TEXT_COLOR.error}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: 'spring',
              stiffness: 200,
              damping: 15,
              duration: 0.5,
            }}
          >
            <motion.path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{
                pathLength: { duration: 0.6, ease: 'easeInOut', delay: 0.2 },
                opacity: { duration: 0.3, delay: 0.2 },
              }}
            />
          </motion.svg>
        }
        iconBgColor={BG_COLOR.errorMedium}
      />
    </>
  );
}
