'use client';

import Image from 'next/image';
import { BG_COLOR, BORDER_COLOR } from '@/lib/styles';

// ============================================
// 로딩 컴포넌트 Props
// ============================================

interface LogoLoadingProps {
  /** 로딩 화면 variant */
  variant?: 'fullscreen' | 'container' | 'inline';
  /** 로고 크기 */
  size?: 'sm' | 'md' | 'lg';
  /** 로딩 텍스트 표시 여부 */
  showText?: boolean;
  /** 커스텀 로딩 텍스트 */
  text?: string;
  /** 배경 투명 여부 */
  transparent?: boolean;
}

// ============================================
// 로딩 스타일 상수
// ============================================

const LOADING_STYLES = {
  container: {
    fullscreen: 'fixed inset-0 z-50 flex items-center justify-center',
    container: 'flex items-center justify-center w-full h-full min-h-[calc(100vh-64px)]',
    inline: 'flex items-center justify-center w-full py-12',
  },
  background: {
    solid: BG_COLOR.darker,
    transparent: 'bg-transparent',
  },
  logoSize: {
    sm: { width: 80, height: 27, className: 'w-20' },
    md: { width: 120, height: 40, className: 'w-[120px]' },
    lg: { width: 140, height: 47, className: 'w-[140px]' },
  },
} as const;

// ============================================
// 메인 로딩 컴포넌트
// ============================================

export function LogoLoading({
  variant = 'container',
  size = 'md',
  showText = false,
  text = '로딩 중...',
  transparent = false,
}: LogoLoadingProps) {
  const containerStyle = LOADING_STYLES.container[variant];
  const bgStyle = transparent
    ? LOADING_STYLES.background.transparent
    : LOADING_STYLES.background.solid;
  const logoConfig = LOADING_STYLES.logoSize[size];

  return (
    <div className={`${containerStyle} ${bgStyle}`}>
      <div className="flex flex-col items-center">
        {/* 로고 */}
        <div className={`${logoConfig.className} h-auto mb-6 animate-fadeInUp`}>
          <Image
            src="/logoBox.svg"
            alt="Loading..."
            width={logoConfig.width}
            height={logoConfig.height}
            className="object-contain"
            priority
          />
        </div>

        {/* 점 3개 애니메이션 */}
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#ED6C00] animate-dot-1" />
          <div className="w-2 h-2 rounded-full bg-[#ED6C00] animate-dot-2" />
          <div className="w-2 h-2 rounded-full bg-[#ED6C00] animate-dot-3" />
        </div>

        {/* 로딩 텍스트 */}
        {showText && (
          <p className="mt-5 text-sm text-gray-400 animate-fadeIn animate-delay-300">{text}</p>
        )}
      </div>
    </div>
  );
}

// ============================================
// 페이지 로딩 컴포넌트 (전체 화면)
// ============================================

export function PageLoading() {
  return <LogoLoading variant="fullscreen" size="lg" />;
}

// ============================================
// 컨테이너 로딩 컴포넌트 (레이아웃 내)
// ============================================

export function ContainerLoading() {
  return <LogoLoading variant="container" size="md" />;
}

// ============================================
// 인라인 로딩 컴포넌트 (섹션 내)
// ============================================

export function InlineLoading({ text }: { text?: string }) {
  return <LogoLoading variant="inline" size="sm" showText={text !== undefined} text={text} />;
}

// ============================================
// 스피너 로딩 컴포넌트 (작은 영역용)
// ============================================

interface SpinnerLoadingProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'white' | 'gray';
}

export function SpinnerLoading({ size = 'md', color = 'primary' }: SpinnerLoadingProps) {
  const sizeStyles = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-3',
  };

  const colorStyles = {
    primary: 'border-[#ED6C00] border-t-transparent',
    white: 'border-white border-t-transparent',
    gray: `${BORDER_COLOR.grayMedium} border-t-transparent`,
  };

  return (
    <div
      className={`${sizeStyles[size]} ${colorStyles[color]} rounded-full animate-spin`}
      role="status"
      aria-label="로딩 중"
    />
  );
}

// ============================================
// 버튼 내 로딩 컴포넌트
// ============================================

interface ButtonLoadingProps {
  text?: string;
  color?: 'white' | 'primary';
}

export function ButtonLoading({ text = '처리 중...', color = 'white' }: ButtonLoadingProps) {
  return (
    <span className="flex items-center gap-2">
      <SpinnerLoading size="sm" color={color} />
      <span>{text}</span>
    </span>
  );
}
