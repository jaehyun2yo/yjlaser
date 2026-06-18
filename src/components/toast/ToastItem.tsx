'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FaTimes,
  FaCheckCircle,
  FaExclamationCircle,
  FaInfoCircle,
  FaExclamationTriangle,
} from 'react-icons/fa';
import type { Toast } from './types';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

interface ToastItemProps {
  toast: Toast;
  onClose: (id: string) => void;
  placement:
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right';
  index: number;
}

export function ToastItem({ toast, onClose, placement, index }: ToastItemProps) {
  const [progress, setProgress] = useState(100);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const progressRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const isRemovingRef = useRef(false);

  const handleClose = useCallback(() => {
    if (isRemovingRef.current) return;
    isRemovingRef.current = true;
    onClose(toast.id);
    toast.onClose?.();
  }, [toast, onClose]);

  // ...

  useEffect(() => {
    // 초기화
    isRemovingRef.current = false;
    setProgress(100);
    startTimeRef.current = Date.now();

    // 프로그레스 바 애니메이션
    if (toast.timeout && toast.timeout > 0) {
      const duration = toast.timeout;
      const interval = 50; // 50ms마다 업데이트

      progressRef.current = setInterval(() => {
        setProgress((_prev) => {
          const elapsed = Date.now() - startTimeRef.current;
          const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
          return remaining;
        });
      }, interval);

      // 자동 닫기
      timerRef.current = setTimeout(() => {
        handleClose();
      }, duration);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [toast.id, toast.timeout, handleClose]);

  const getDefaultIcon = () => {
    switch (toast.color) {
      case 'success':
        return <FaCheckCircle className="w-5 h-5" />;
      case 'danger':
        return <FaExclamationCircle className="w-5 h-5" />;
      case 'warning':
        return <FaExclamationTriangle className="w-5 h-5" />;
      case 'primary':
      case 'secondary':
      default:
        return <FaInfoCircle className="w-5 h-5" />;
    }
  };

  const getColorClasses = () => {
    const baseColors = {
      default: {
        solid: `${BG_COLOR.muted} ${TEXT_COLOR.primary} ${BORDER_COLOR.default}`,
        flat: `${BG_COLOR.card} ${TEXT_COLOR.primary} ${BORDER_COLOR.default}`,
        bordered: `bg-transparent ${BORDER_COLOR.default} ${TEXT_COLOR.primary}`,
        faded: `${BG_COLOR.page} ${TEXT_COLOR.primary}`,
        shadow: `${BG_COLOR.card} ${TEXT_COLOR.primary} shadow-lg ${BORDER_COLOR.default}`,
      },
      primary: {
        solid: 'bg-[#ED6C00] text-white border-[#ED6C00]',
        flat: `${BG_COLOR.card} text-[#ED6C00] ${BORDER_COLOR.orangeAlpha}`,
        bordered: 'bg-transparent border-[#ED6C00] text-[#ED6C00]',
        faded: `${BG_COLOR.brandAlphaSoft} text-[#ED6C00]`,
        shadow: `${BG_COLOR.card} border-[#ED6C00] text-[#ED6C00] shadow-lg`,
      },
      success: {
        solid: 'bg-green-500 text-white border-green-500',
        flat: `${BG_COLOR.card} ${TEXT_COLOR.successStrong} ${BORDER_COLOR.success}`,
        bordered: 'bg-transparent border-green-500 ${TEXT_COLOR.successStrong}',
        faded: `${BG_COLOR.successSoftDeep} ${TEXT_COLOR.successStrong}`,
        shadow: `${BG_COLOR.card} ${BORDER_COLOR.success} ${TEXT_COLOR.successStrong} shadow-lg`,
      },
      warning: {
        solid: 'bg-yellow-500 text-white border-yellow-500',
        flat: `${BG_COLOR.card} ${TEXT_COLOR.warningMid} ${BORDER_COLOR.warning}`,
        bordered: 'bg-transparent border-yellow-500 ${TEXT_COLOR.warningMid}',
        faded: '${BG_COLOR.warningLight} ${TEXT_COLOR.warningMid}',
        shadow: `${BG_COLOR.card} ${BORDER_COLOR.warning} ${TEXT_COLOR.warningMid} shadow-lg`,
      },
      danger: {
        solid: 'bg-red-500 text-white border-red-500',
        flat: `${BG_COLOR.card} ${TEXT_COLOR.errorStrong} ${BORDER_COLOR.error}`,
        bordered: 'bg-transparent border-red-500 ${TEXT_COLOR.errorStrong}',
        faded: `${BG_COLOR.errorSoftDeep} ${TEXT_COLOR.errorStrong}`,
        shadow: `${BG_COLOR.card} ${BORDER_COLOR.error} ${TEXT_COLOR.errorStrong} shadow-lg`,
      },
    };

    const variant = toast.variant || 'flat';
    const color = toast.color || 'default';
    const colorKey = color === 'secondary' ? 'default' : color;
    return baseColors[colorKey][variant];
  };

  const getIconColor = () => {
    switch (toast.color) {
      case 'success':
        return TEXT_COLOR.successBright;
      case 'danger':
        return '${TEXT_COLOR.errorMid}';
      case 'warning':
        return TEXT_COLOR.yellowBrand;
      case 'primary':
        return TEXT_COLOR.brandBright;
      case 'secondary':
        return TEXT_COLOR.muted;
      default:
        return TEXT_COLOR.muted;
    }
  };

  // HeroUI 스타일 애니메이션 variants
  const getAnimationVariants = () => {
    const isTop = placement.startsWith('top');
    const isRight = placement.endsWith('right');
    const isLeft = placement.endsWith('left');
    const isCenter = placement.includes('center');

    let initialX = 0;
    const initialY = isTop ? -20 : 20;

    if (isRight && !isCenter) {
      initialX = 100;
    } else if (isLeft && !isCenter) {
      initialX = -100;
    }

    return {
      initial: {
        opacity: 0,
        x: initialX,
        y: initialY,
        scale: 0.95,
      },
      animate: {
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
        transition: {
          type: 'spring' as const,
          stiffness: 500,
          damping: 30,
          mass: 0.8,
        },
      },
      exit: {
        opacity: 0,
        x: initialX,
        y: initialY,
        scale: 0.95,
        transition: {
          duration: 0.2,
        },
      },
    };
  };

  const variant = toast.variant || 'flat';
  const radius = toast.radius || 'md';
  const hasBorder = variant === 'bordered' || variant === 'flat' || variant === 'shadow';
  const icon = toast.icon !== undefined ? toast.icon : getDefaultIcon();
  const animationVariants = getAnimationVariants();

  const getRadiusClass = () => {
    switch (radius) {
      case 'none':
        return 'rounded-none';
      case 'sm':
        return 'rounded-sm';
      case 'md':
        return 'rounded-lg';
      case 'lg':
        return 'rounded-xl';
      case 'full':
        return 'rounded-full';
      default:
        return 'rounded-lg';
    }
  };

  const handleToastClick = useCallback(
    (e: React.MouseEvent) => {
      // 닫기 버튼이나 action 버튼 클릭 시에는 토스트 클릭 이벤트 무시
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('[role="button"]')) {
        return;
      }

      // 토스트 클릭 시 onClick 핸들러 실행
      if (toast.onClick) {
        toast.onClick();
        handleClose();
      }
    },
    [toast, handleClose]
  );

  return (
    <motion.div
      role="alert"
      initial="initial"
      animate="animate"
      exit="exit"
      variants={animationVariants}
      layout
      onClick={toast.onClick ? handleToastClick : undefined}
      className={`
        relative flex items-center gap-3 p-4 border min-w-[320px] max-w-md pointer-events-auto
        ${getRadiusClass()}
        ${getColorClasses()}
        ${hasBorder ? 'border' : 'border-transparent'}
        shadow-lg backdrop-blur-sm
        ${toast.onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}
        data-[has-title]:has-title
        data-[has-description]:has-description
      `}
      data-has-title={!!toast.title}
      data-has-description={!!toast.description}
      data-placement={placement}
      style={{
        zIndex: 9999 + index,
      }}
    >
      {/* 아이콘 */}
      {icon && !toast.hideIcon && (
        <div className={`flex-shrink-0 flex items-center ${getIconColor()}`}>{icon}</div>
      )}

      {/* 내용 */}
      <div className="flex-1 min-w-0">
        {toast.title && (
          <div className="text-sm font-semibold mb-1 leading-tight">{toast.title}</div>
        )}
        {toast.description && (
          <div className="text-sm opacity-90 leading-relaxed">{toast.description}</div>
        )}
        {toast.action && (
          <button
            onClick={() => {
              toast.action?.onClick();
              handleClose();
            }}
            className={`mt-2 text-xs font-medium ${TEXT_COLOR.brandBright} hover:text-[#d15f00] transition-colors`}
          >
            {toast.action.label}
          </button>
        )}
      </div>

      {/* 닫기 버튼 */}
      {!toast.hideCloseButton && (
        <button
          onClick={handleClose}
          aria-label="Close"
          className={`flex-shrink-0 p-1 ${BG_COLOR.hoverBlackAlpha} rounded transition-colors`}
        >
          <FaTimes className="w-4 h-4 opacity-60" />
        </button>
      )}

      {/* 프로그레스 바 */}
      {toast.timeout && toast.timeout > 0 && toast.shouldShowTimeoutProgress && (
        <div
          className={`absolute bottom-0 left-0 right-0 h-1 ${BG_COLOR.blackAlpha} overflow-hidden ${radius === 'full' ? 'rounded-b-full' : radius === 'lg' ? 'rounded-b-xl' : radius === 'md' ? 'rounded-b-lg' : radius === 'sm' ? 'rounded-b-sm' : ''}`}
        >
          <motion.div
            className={`h-full ${BG_COLOR.brandFull}`}
            initial={{ width: '100%' }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.05, ease: 'linear' }}
          />
        </div>
      )}
    </motion.div>
  );
}
