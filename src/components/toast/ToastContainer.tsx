'use client';

import { AnimatePresence } from 'framer-motion';
import { ToastItem } from './ToastItem';
import type { Toast } from './types';

interface ToastContainerProps {
  toasts: Toast[];
  onClose: (id: string) => void;
  placement?:
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right';
  toastOffset?: number;
}

export function ToastContainer({
  toasts,
  onClose,
  placement = 'bottom-right',
  toastOffset = 0,
}: ToastContainerProps) {
  if (toasts.length === 0) return null;

  // Tailwind의 동적 클래스 문제를 피하기 위해 인라인 스타일 사용
  const getPlacementStyle = () => {
    // 상단 위치일 때는 네비게이션바를 피하기 위해 더 큰 마진 사용
    const isTop = placement.startsWith('top');
    const defaultOffset = isTop ? '80px' : '16px';
    const offset = toastOffset > 0 ? `${toastOffset}px` : defaultOffset;

    switch (placement) {
      case 'top-left':
        return { top: offset, left: offset };
      case 'top-center':
        return { top: offset, left: '50%', transform: 'translateX(-50%)' };
      case 'top-right':
        return { top: offset, right: offset };
      case 'bottom-left':
        return { bottom: offset, left: offset };
      case 'bottom-center':
        return { bottom: offset, left: '50%', transform: 'translateX(-50%)' };
      case 'bottom-right':
      default:
        return { bottom: offset, right: offset };
    }
  };

  return (
    <div
      className="fixed z-[9999] flex flex-col gap-2 pointer-events-none"
      style={getPlacementStyle()}
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast, index) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} onClose={onClose} placement={placement} index={index} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
