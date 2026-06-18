import { ReactNode } from 'react';

export type ToastColor = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
export type ToastVariant = 'solid' | 'bordered' | 'flat' | 'faded' | 'shadow';
export type ToastRadius = 'none' | 'sm' | 'md' | 'lg' | 'full';

export interface ToastOptions {
  title?: ReactNode;
  description?: ReactNode;
  color?: ToastColor;
  variant?: ToastVariant;
  radius?: ToastRadius;
  icon?: ReactNode;
  timeout?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  onClick?: () => void; // 토스트 클릭 시 실행할 함수
  onClose?: () => void;
  hideIcon?: boolean;
  hideCloseButton?: boolean;
  shouldShowTimeoutProgress?: boolean;
  promise?: Promise<unknown>;
  loadingComponent?: ReactNode;
}

export interface Toast extends ToastOptions {
  id: string;
}
