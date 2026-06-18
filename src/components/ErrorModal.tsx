'use client';

import { ConfirmModal } from './modals/ConfirmModal';
import { BG_COLOR, TEXT_COLOR } from '@/lib/styles';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
}

export default function ErrorModal({
  isOpen,
  onClose,
  title = '오류가 발생했습니다',
  message = '다시 시도해주세요.',
}: ErrorModalProps) {
  return (
    <ConfirmModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onClose}
      title={title}
      message={message}
      confirmLabel="확인"
      icon={
        <svg
          className={`h-7 w-7 ${TEXT_COLOR.error}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      }
      iconBgColor={BG_COLOR.errorMedium}
    />
  );
}
