'use client';

import React, { forwardRef, useCallback, useRef, useEffect, useState, useId } from 'react';
import { FaSpinner, FaExclamationTriangle, FaCheck } from 'react-icons/fa';
import { TEXT_COLOR, BG_COLOR } from '@/lib/styles';

/**
 * 접근성 개선을 위한 공통 컴포넌트 모음
 */

// ===== 스크린 리더 전용 텍스트 =====
interface VisuallyHiddenProps {
  children: React.ReactNode;
}

/**
 * 시각적으로는 숨기지만 스크린 리더에서는 읽을 수 있는 텍스트
 */
export function VisuallyHidden({ children }: VisuallyHiddenProps) {
  return (
    <span
      className="absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0"
      style={{ clip: 'rect(0, 0, 0, 0)' }}
    >
      {children}
    </span>
  );
}

// ===== 키보드 네비게이션 지원 버튼 =====
interface AccessibleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const AccessibleButton = forwardRef<HTMLButtonElement, AccessibleButtonProps>(
  (
    {
      children,
      loading = false,
      loadingText = '처리 중...',
      icon,
      iconPosition = 'left',
      disabled,
      className = '',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        className={`focus:outline-none focus:ring-2 focus:ring-[#ED6C00] focus:ring-offset-2 ${className}`}
        {...props}
      >
        {loading ? (
          <>
            <FaSpinner className="animate-spin mr-2" aria-hidden="true" />
            <span>{loadingText}</span>
            <VisuallyHidden>처리 중입니다. 잠시만 기다려주세요.</VisuallyHidden>
          </>
        ) : (
          <>
            {icon && iconPosition === 'left' && (
              <span className="mr-2" aria-hidden="true">
                {icon}
              </span>
            )}
            {children}
            {icon && iconPosition === 'right' && (
              <span className="ml-2" aria-hidden="true">
                {icon}
              </span>
            )}
          </>
        )}
      </button>
    );
  }
);
AccessibleButton.displayName = 'AccessibleButton';

// ===== 라이브 리전 (스크린 리더 알림) =====
interface LiveRegionProps {
  message: string;
  type?: 'polite' | 'assertive';
  clearAfter?: number; // ms
}

/**
 * 스크린 리더에 동적 알림을 전달하는 라이브 리전
 */
export function LiveRegion({ message, type = 'polite', clearAfter = 5000 }: LiveRegionProps) {
  const [currentMessage, setCurrentMessage] = useState(message);

  useEffect(() => {
    setCurrentMessage(message);

    if (clearAfter > 0 && message) {
      const timer = setTimeout(() => {
        setCurrentMessage('');
      }, clearAfter);
      return () => clearTimeout(timer);
    }
  }, [message, clearAfter]);

  return (
    <div
      role="status"
      aria-live={type}
      aria-atomic="true"
      className="absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0"
      style={{ clip: 'rect(0, 0, 0, 0)' }}
    >
      {currentMessage}
    </div>
  );
}

// ===== 포커스 트랩 (모달용) =====
interface FocusTrapProps {
  children: React.ReactNode;
  active?: boolean;
  initialFocus?: React.RefObject<HTMLElement>;
}

/**
 * 모달 등에서 포커스를 내부에 가두는 컴포넌트
 */
export function FocusTrap({ children, active = true, initialFocus }: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    // 현재 포커스된 요소 저장
    previousActiveElement.current = document.activeElement as HTMLElement;

    // 초기 포커스 설정
    if (initialFocus?.current) {
      initialFocus.current.focus();
    } else if (containerRef.current) {
      const firstFocusable = containerRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }

    // 정리: 이전 포커스 복원
    return () => {
      previousActiveElement.current?.focus();
    };
  }, [active, initialFocus]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !containerRef.current) return;

    const focusableElements = containerRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    }
  }, []);

  if (!active) {
    return <>{children}</>;
  }

  return (
    <div ref={containerRef} onKeyDown={handleKeyDown}>
      {children}
    </div>
  );
}

// ===== 스킵 링크 =====
interface SkipLinkProps {
  href: string;
  children?: React.ReactNode;
}

/**
 * 메인 콘텐츠로 바로 이동하는 스킵 링크
 */
export function SkipLink({ href, children = '메인 콘텐츠로 건너뛰기' }: SkipLinkProps) {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-[#ED6C00] focus:text-white focus:rounded-lg focus:outline-none"
    >
      {children}
    </a>
  );
}

// ===== 폼 필드 에러 메시지 =====
interface FormErrorProps {
  id: string;
  error?: string;
}

export function FormError({ id, error }: FormErrorProps) {
  if (!error) return null;

  return (
    <div
      id={id}
      role="alert"
      aria-live="polite"
      className={`flex items-center gap-1 mt-1 text-sm ${TEXT_COLOR.errorMid}`}
    >
      <FaExclamationTriangle className="w-3 h-3" aria-hidden="true" />
      <span>{error}</span>
    </div>
  );
}

// ===== 성공 메시지 =====
interface FormSuccessProps {
  message?: string;
}

export function FormSuccess({ message }: FormSuccessProps) {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-1 mt-1 text-sm ${TEXT_COLOR.successBright}`}
    >
      <FaCheck className="w-3 h-3" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

// ===== 접근 가능한 아이콘 버튼 =====
interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  showTooltip?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, showTooltip = true, className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        aria-label={label}
        title={showTooltip ? label : undefined}
        className={`p-2 rounded-lg ${BG_COLOR.hoverGray} focus:outline-none focus:ring-2 focus:ring-[#ED6C00] focus:ring-offset-2 transition-colors ${className}`}
        {...props}
      >
        <span aria-hidden="true">{icon}</span>
        <VisuallyHidden>{label}</VisuallyHidden>
      </button>
    );
  }
);
IconButton.displayName = 'IconButton';

// ===== 접근 가능한 체크박스 =====
interface AccessibleCheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  label: string;
  description?: string;
}

export const AccessibleCheckbox = forwardRef<HTMLInputElement, AccessibleCheckboxProps>(
  ({ label, description, id, className = '', ...props }, ref) => {
    const reactId = useId();
    const checkboxId = id || `checkbox-${reactId}`;
    const descriptionId = description ? `${checkboxId}-description` : undefined;

    return (
      <div className="flex items-start gap-3">
        <input
          ref={ref}
          type="checkbox"
          id={checkboxId}
          aria-describedby={descriptionId}
          className={`w-4 h-4 rounded border-gray-300 text-[#ED6C00] focus:ring-[#ED6C00] focus:ring-offset-2 ${className}`}
          {...props}
        />
        <div>
          <label
            htmlFor={checkboxId}
            className={`text-sm font-medium ${TEXT_COLOR.primary} cursor-pointer`}
          >
            {label}
          </label>
          {description && (
            <p id={descriptionId} className={`text-xs ${TEXT_COLOR.muted} mt-0.5`}>
              {description}
            </p>
          )}
        </div>
      </div>
    );
  }
);
AccessibleCheckbox.displayName = 'AccessibleCheckbox';

// ===== 키보드 단축키 힌트 =====
interface KeyboardHintProps {
  keys: string[];
  action: string;
  className?: string;
}

export function KeyboardHint({ keys, action, className = '' }: KeyboardHintProps) {
  return (
    <div className={`flex items-center gap-2 text-xs ${TEXT_COLOR.muted} ${className}`}>
      <div className="flex gap-1">
        {keys.map((key, i) => (
          <React.Fragment key={key}>
            <kbd className={`px-1.5 py-0.5 ${BG_COLOR.light} rounded font-mono`}>{key}</kbd>
            {i < keys.length - 1 && <span>+</span>}
          </React.Fragment>
        ))}
      </div>
      <span>{action}</span>
    </div>
  );
}

// ===== 로딩 상태 표시 =====
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

export function LoadingSpinner({
  size = 'md',
  label = '로딩 중...',
  className = '',
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <div role="status" aria-live="polite" className={`flex items-center gap-2 ${className}`}>
      <FaSpinner
        className={`animate-spin text-[#ED6C00] ${sizeClasses[size]}`}
        aria-hidden="true"
      />
      <VisuallyHidden>{label}</VisuallyHidden>
    </div>
  );
}

// ===== 테이블 접근성 래퍼 =====
interface AccessibleTableProps {
  caption: string;
  children: React.ReactNode;
  className?: string;
}

export function AccessibleTable({ caption, children, className = '' }: AccessibleTableProps) {
  return (
    <div className="overflow-x-auto" role="region" aria-label={caption}>
      <table className={`w-full ${className}`}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

// ===== 알림 배너 =====
interface AlertBannerProps {
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  onDismiss?: () => void;
  dismissLabel?: string;
}

export function AlertBanner({
  type,
  message,
  onDismiss,
  dismissLabel = '알림 닫기',
}: AlertBannerProps) {
  const typeStyles = {
    info: `${BG_COLOR.infoLight} border-blue-500 ${TEXT_COLOR.blueMid}`,
    success: `${BG_COLOR.successSoftDeep} border-green-500 ${TEXT_COLOR.successStrong}`,
    warning: `${BG_COLOR.warningLight} border-yellow-500 ${TEXT_COLOR.warningStrong}`,
    error: `${BG_COLOR.errorSoftDeep} border-red-500 ${TEXT_COLOR.errorStrong}`,
  };

  const roleMap = {
    info: 'status',
    success: 'status',
    warning: 'alert',
    error: 'alert',
  };

  return (
    <div
      role={roleMap[type]}
      aria-live={type === 'error' || type === 'warning' ? 'assertive' : 'polite'}
      className={`flex items-center justify-between px-4 py-3 rounded-lg border-l-4 ${typeStyles[type]}`}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label={dismissLabel}
          className={`p-1 ${BG_COLOR.hoverBlackAlphaLight} rounded`}
        >
          ✕
        </button>
      )}
    </div>
  );
}
