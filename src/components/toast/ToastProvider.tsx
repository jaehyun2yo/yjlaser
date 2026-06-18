'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ToastContainer } from './ToastContainer';
import type { Toast, ToastOptions } from './types';

interface ToastContextType {
  addToast: (toast: ToastOptions) => string;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

interface ToastProviderProps {
  children: ReactNode;
  maxVisibleToasts?: number;
  placement?:
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right';
  toastOffset?: number;
}

export function ToastProvider({
  children,
  maxVisibleToasts = 3,
  placement = 'bottom-right',
  toastOffset = 0,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (options: ToastOptions): string => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newToast: Toast = {
        id,
        title: options.title,
        description: options.description,
        color: options.color || 'default',
        variant: options.variant || 'flat',
        radius: options.radius || 'md',
        icon: options.icon,
        timeout: options.timeout ?? 6000,
        action: options.action,
        onClick: options.onClick,
        onClose: options.onClose,
        hideIcon: options.hideIcon || false,
        hideCloseButton: options.hideCloseButton || false,
        shouldShowTimeoutProgress: options.shouldShowTimeoutProgress || false,
        promise: options.promise,
        loadingComponent: options.loadingComponent,
      };

      // Promise가 있으면 처리
      if (options.promise) {
        options.promise
          .then(() => {
            // 성공 시 토스트 업데이트 또는 새 토스트 추가
            setToasts((prev) => prev.filter((t) => t.id !== id));
          })
          .catch(() => {
            // 실패 시 토스트 업데이트 또는 새 토스트 추가
            setToasts((prev) => prev.filter((t) => t.id !== id));
          });
      }

      setToasts((prev) => {
        // 새로운 토스트를 맨 앞에 추가
        const updated = [newToast, ...prev];
        // 최대 개수 제한 (오래된 것부터 제거)
        const result = updated.slice(0, maxVisibleToasts);
        return result;
      });

      return id;
    },
    [maxVisibleToasts]
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastContainer
        toasts={toasts}
        onClose={removeToast}
        placement={placement}
        toastOffset={toastOffset}
      />
    </ToastContext.Provider>
  );
}

export function useToastContext() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToastContext must be used within ToastProvider');
  }
  return context;
}

// 편의 함수: 전역 addToast
export function addToast(_options: ToastOptions): string {
  // 이 함수는 ToastProvider 내부에서만 사용 가능
  // 직접 호출 시 에러 발생
  throw new Error('addToast must be used within ToastProvider. Use useToastContext() instead.');
}
