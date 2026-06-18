'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * 통합 뱃지 컴포넌트
 * - 레퍼런스: 숫자 자릿수에 따라 동적 크기
 * - 1자리: 18px 원형
 * - 2자리: 22px pill
 * - 3자리(+99): 28px pill
 */

export type BadgeSize = 'sm' | 'md' | 'lg';
export type BadgeVariant = 'default' | 'absolute' | 'inline';

interface BadgeProps {
  /** 표시할 숫자 또는 'N'(신규) */
  count: number | 'N';
  /** 뱃지 크기 기준: sm(기본), md(중간), lg(큰) */
  size?: BadgeSize;
  /** 뱃지 변형: default(인라인), absolute(우상단 절대위치), inline(ml-auto 포함) */
  variant?: BadgeVariant;
  /** 추가 클래스 */
  className?: string;
}

// 크기 배율 (size prop에 따른 배율)
const sizeMultiplier: Record<BadgeSize, number> = {
  sm: 1,
  md: 1.1,
  lg: 1.2,
};

// 변형별 스타일
const variantStyles: Record<BadgeVariant, string> = {
  default: '',
  absolute: 'absolute -top-1 -right-1',
  inline: 'ml-auto',
};

/**
 * 뱃지 텍스트 포맷팅
 * - 99 초과: +99
 * - 그 외: 숫자 그대로
 */
function formatBadgeText(count: number | 'N'): string {
  if (count === 'N') return 'N';
  if (count > 99) return '+99';
  return String(count);
}

/**
 * 자릿수에 따른 동적 크기 계산
 */
function getDynamicSize(
  displayText: string,
  multiplier: number
): { width: number; height: number } {
  const length = displayText.length;

  // 기본 크기 (1자리 기준)
  let baseWidth = 18;
  let baseHeight = 18;

  if (length === 1) {
    // 1자리: 원형
    baseWidth = 18;
    baseHeight = 18;
  } else if (length === 2) {
    // 2자리: 약간 넓은 pill
    baseWidth = 22;
    baseHeight = 18;
  } else {
    // 3자리 이상 (99+): 넓은 pill
    baseWidth = 28;
    baseHeight = 18;
  }

  return {
    width: Math.round(baseWidth * multiplier),
    height: Math.round(baseHeight * multiplier),
  };
}

/**
 * 통합 뱃지 컴포넌트
 *
 * @example
 * // 기본 사용 (폴더 트리, 사이드바용)
 * <Badge count={5} />
 *
 * // 버튼 우상단 절대 위치
 * <Badge count={10} variant="absolute" size="md" />
 *
 * // 모바일 메뉴용 (ml-auto 포함)
 * <Badge count={99} variant="inline" size="lg" />
 *
 * // 신규 표시
 * <Badge count="N" />
 */
export function Badge({ count, size = 'sm', variant = 'default', className = '' }: BadgeProps) {
  const badgeRef = useRef<HTMLSpanElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 숫자 0이면 표시하지 않음 (N은 표시)
  if (count === 0) return null;

  const displayText = formatBadgeText(count);
  const multiplier = sizeMultiplier[size];
  const dynamicSize = getDynamicSize(displayText, multiplier);

  // 99 초과일 때만 실제 숫자를 툴팁으로 표시
  const showTooltip = typeof count === 'number' && count > 99;

  // 호버 시 툴팁 위치를 뷰포트 좌표로 계산 (부모 overflow clipping 회피)
  const handleMouseEnter = () => {
    if (!showTooltip || !badgeRef.current) return;
    const rect = badgeRef.current.getBoundingClientRect();
    setTooltipPos({ x: rect.right + 4, y: rect.bottom + 4 });
  };

  const handleMouseLeave = () => {
    setTooltipPos(null);
  };

  return (
    <span
      ref={badgeRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-red-500 text-white font-bold shrink-0 relative leading-none text-center tabular-nums',
        variantStyles[variant],
        className
      )}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${dynamicSize.width}px`,
        minWidth: `${dynamicSize.width}px`,
        height: `${dynamicSize.height}px`,
        fontFamily: 'Arial, sans-serif',
        fontSize: '11px',
        lineHeight: 1,
        padding: '0px',
        boxSizing: 'border-box',
      }}
    >
      {displayText}
      {/* 호버 시 실제 숫자 툴팁 - Portal로 body에 렌더링하여 overflow clipping 회피 */}
      {showTooltip &&
        isMounted &&
        tooltipPos &&
        createPortal(
          <span
            className="fixed px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap pointer-events-none shadow-lg"
            style={{
              left: `${tooltipPos.x}px`,
              top: `${tooltipPos.y}px`,
              zIndex: 10000,
            }}
          >
            {count}개
          </span>,
          document.body
        )}
    </span>
  );
}
