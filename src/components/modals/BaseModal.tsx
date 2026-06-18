'use client';

import { useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes } from 'react-icons/fa';
import { BG_COLOR, TEXT_COLOR, BORDER_COLOR } from '@/lib/styles';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl';
  showCloseButton?: boolean;
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  showCancelButton?: boolean;
  isSubmitting?: boolean;
  disabled?: boolean;
  className?: string;
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
};

export function BaseModal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'md',
  showCloseButton = true,
  onConfirm,
  confirmLabel = '확인',
  cancelLabel = '취소',
  showCancelButton = true,
  isSubmitting = false,
  disabled = false,
  className = '',
}: BaseModalProps) {
  // ESC 키로 모달 닫기
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting && !disabled) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, isSubmitting, disabled]);

  // body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // 엔터 키로 확인 처리 (textarea 내부에서는 Shift+Enter로 줄바꿈 가능)
  useEffect(() => {
    if (!isOpen || !onConfirm) return;

    const handleEnter = (e: KeyboardEvent) => {
      // textarea나 input 내부에서 Shift+Enter는 줄바꿈이므로 무시
      const target = e.target as HTMLElement;
      const isTextarea = target.tagName === 'TEXTAREA';
      const isInput =
        target.tagName === 'INPUT' &&
        (target as HTMLInputElement).type !== 'submit' &&
        (target as HTMLInputElement).type !== 'button';

      if (e.key === 'Enter' && !e.shiftKey && !isSubmitting && !disabled) {
        // textarea나 input 내부에서는 Enter 키를 기본 동작으로 허용
        if (isTextarea || isInput) {
          // form 내부의 input/textarea에서는 form submit을 트리거
          const form = target.closest('form');
          if (form && !isTextarea) {
            e.preventDefault();
            const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
            form.dispatchEvent(submitEvent);
          }
          return;
        }

        e.preventDefault();
        onConfirm();
      }
    };

    document.addEventListener('keydown', handleEnter);
    return () => document.removeEventListener('keydown', handleEnter);
  }, [isOpen, onConfirm, isSubmitting, disabled]);

  if (!isOpen) return null;

  const handleBackdropClick = () => {
    if (!isSubmitting && !disabled) {
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      onClick={handleBackdropClick}
    >
      <div
        className={`${BG_COLOR.card} rounded-lg shadow-2xl border ${BORDER_COLOR.default} ${maxWidthClasses[maxWidth]} w-full mx-4 max-h-[80vh] flex flex-col ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 - 고정 */}
        {(title || showCloseButton) && (
          <div
            className={`flex items-center justify-between px-6 py-4 border-b ${BORDER_COLOR.default} flex-shrink-0`}
          >
            {title && (
              <div className="flex flex-col">
                <h2 className={`text-xl font-bold ${TEXT_COLOR.primary}`}>{title}</h2>
                {subtitle && <p className={`text-xs ${TEXT_COLOR.muted} mt-0.5`}>{subtitle}</p>}
              </div>
            )}
            {showCloseButton && (
              <IconButton onClick={onClose} disabled={isSubmitting || disabled} aria-label="닫기">
                <FaTimes />
              </IconButton>
            )}
          </div>
        )}

        {/* 내용 - 스크롤 가능 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">{children}</div>
        </div>

        {/* 버튼 - 고정 */}
        {(onConfirm || showCancelButton) && (
          <div
            className={`flex items-center justify-center gap-3 px-6 py-4 border-t ${BORDER_COLOR.default} flex-shrink-0`}
          >
            {showCancelButton && (
              <Button variant="secondary" onClick={onClose} disabled={isSubmitting || disabled}>
                {cancelLabel}
              </Button>
            )}
            {onConfirm && (
              <Button onClick={onConfirm} disabled={isSubmitting || disabled}>
                {isSubmitting ? '처리 중...' : confirmLabel}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
