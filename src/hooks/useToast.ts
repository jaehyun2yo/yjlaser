'use client';

import { useCallback } from 'react';
import { useToastContext } from '@/components/toast/ToastProvider';
import type { ToastOptions } from '@/components/toast/types';

export function useToast() {
  const { addToast, removeToast } = useToastContext();

  const toast = useCallback(
    (options: ToastOptions) => {
      return addToast(options);
    },
    [addToast]
  );

  // 편의 메서드들
  const success = useCallback(
    (
      title: string,
      description?: string,
      options?: Omit<ToastOptions, 'title' | 'description' | 'color'>
    ) => {
      return addToast({ title, description, color: 'success', ...options });
    },
    [addToast]
  );

  const error = useCallback(
    (
      title: string,
      description?: string,
      options?: Omit<ToastOptions, 'title' | 'description' | 'color'>
    ) => {
      return addToast({ title, description, color: 'danger', ...options });
    },
    [addToast]
  );

  const warning = useCallback(
    (
      title: string,
      description?: string,
      options?: Omit<ToastOptions, 'title' | 'description' | 'color'>
    ) => {
      return addToast({ title, description, color: 'warning', ...options });
    },
    [addToast]
  );

  const info = useCallback(
    (
      title: string,
      description?: string,
      options?: Omit<ToastOptions, 'title' | 'description' | 'color'>
    ) => {
      return addToast({ title, description, color: 'default', ...options });
    },
    [addToast]
  );

  return {
    toast,
    success,
    error,
    warning,
    info,
    remove: removeToast,
  };
}
