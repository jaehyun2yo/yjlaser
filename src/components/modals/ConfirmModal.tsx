'use client';

import { BaseModal } from './BaseModal';
import { BG_COLOR, TEXT_COLOR } from '@/lib/styles';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  icon?: React.ReactNode;
  iconBgColor?: string;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = '확인',
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  isSubmitting = false,
  icon,
  iconBgColor = BG_COLOR.orangeMedium,
}: ConfirmModalProps) {
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      isSubmitting={isSubmitting}
      showCloseButton={false}
      maxWidth="md"
    >
      <div className="text-center px-4">
        {icon && (
          <div
            className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full ${iconBgColor} mb-8`}
          >
            {icon}
          </div>
        )}
        {title && <h3 className={`text-base font-bold ${TEXT_COLOR.primary} mb-2`}>{title}</h3>}
        <div className={`text-sm ${TEXT_COLOR.secondary} mb-0`}>{message}</div>
      </div>
    </BaseModal>
  );
}
