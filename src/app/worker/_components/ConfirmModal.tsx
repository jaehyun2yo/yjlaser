'use client';

import { useEffect, useCallback } from 'react';
import type { FC } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';

type ConfirmModalType = 'confirm' | 'alert' | 'error';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: ConfirmModalType;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ICONS: Record<ConfirmModalType, FC<{ className?: string }>> = {
  confirm: CheckCircle,
  alert: Info,
  error: AlertTriangle,
};

const ICON_COLORS: Record<ConfirmModalType, string> = {
  confirm: 'text-[#ED6C00] bg-orange-50',
  alert: 'text-blue-600 bg-blue-50',
  error: 'text-red-600 bg-red-50',
};

const CONFIRM_BUTTON_COLORS: Record<ConfirmModalType, string> = {
  confirm: 'bg-[#ED6C00] hover:bg-[#d15f00]',
  alert: 'bg-blue-600 hover:bg-blue-700',
  error: 'bg-red-600 hover:bg-red-700',
};

export const ConfirmModal: FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  type = 'confirm',
  confirmText = '확인',
  cancelText = '취소',
  onConfirm,
  onCancel,
}) => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [onConfirm, onCancel]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const IconComponent = ICONS[type];

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
        {/* Icon + Content */}
        <div className="p-6 text-center">
          <div
            className={`w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center ${ICON_COLORS[type]}`}
          >
            <IconComponent className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
          <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
        </div>

        {/* Buttons */}
        <div className="flex border-t border-gray-200">
          {type !== 'alert' && (
            <button
              onClick={onCancel}
              className="flex-1 py-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-r border-gray-200"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`flex-1 py-3.5 text-sm font-bold text-white transition-colors ${CONFIRM_BUTTON_COLORS[type]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
