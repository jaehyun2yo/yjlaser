'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { BG_COLOR } from '@/lib/styles';

interface LazyImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  placeholder?: 'blur' | 'empty';
  blurDataURL?: string;
  priority?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

/**
 * Intersection Observer를 사용한 지연 로딩 이미지 컴포넌트
 * 뷰포트에 진입할 때만 이미지를 로드합니다.
 */
export function LazyImage({
  src,
  alt,
  width = 200,
  height = 200,
  className = '',
  placeholder = 'blur',
  blurDataURL,
  priority = false,
  onLoad,
  onError,
}: LazyImageProps) {
  const [isInView, setIsInView] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  // 기본 blur placeholder (1x1 회색 픽셀)
  const defaultBlurDataURL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN88P/BfwYACwsD/e6JZJQAAAAASUVORK5CYII=';

  useEffect(() => {
    // priority가 true면 즉시 로드
    if (priority) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '100px', // 뷰포트 100px 전에 미리 로드
        threshold: 0.1,
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [priority]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  return (
    <div ref={imgRef} className={`relative overflow-hidden ${className}`} style={{ width, height }}>
      {/* 로딩 스켈레톤 */}
      {!isLoaded && !hasError && (
        <div className={`absolute inset-0 ${BG_COLOR.light} animate-pulse`} />
      )}

      {/* 에러 상태 */}
      {hasError && (
        <div className={`absolute inset-0 flex items-center justify-center ${BG_COLOR.lightDark}`}>
          <span className="text-gray-400 text-sm">이미지 로드 실패</span>
        </div>
      )}

      {/* 이미지 */}
      {isInView && !hasError && (
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          className={`transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          placeholder={placeholder}
          blurDataURL={blurDataURL || defaultBlurDataURL}
          onLoad={handleLoad}
          onError={handleError}
          loading={priority ? 'eager' : 'lazy'}
        />
      )}
    </div>
  );
}

/**
 * 파일 썸네일 미리보기 컴포넌트
 * 이미지 파일만 미리보기 표시, 나머지는 아이콘 표시
 */
interface FileThumbnailProps {
  file: {
    id: string;
    mime_type: string;
    name: string;
    original_name: string;
  };
  size?: number;
  className?: string;
  thumbnailUrl?: string;
}

export function FileThumbnail({
  file,
  size = 64,
  className = '',
  thumbnailUrl,
}: FileThumbnailProps) {
  const isImage = file.mime_type.startsWith('image/');

  if (isImage && thumbnailUrl) {
    return (
      <LazyImage
        src={thumbnailUrl}
        alt={file.original_name}
        width={size}
        height={size}
        className={`rounded-lg object-cover ${className}`}
      />
    );
  }

  // 이미지가 아니면 파일 아이콘 표시
  return (
    <div
      className={`flex items-center justify-center ${BG_COLOR.light} rounded-lg ${className}`}
      style={{ width: size, height: size }}
    >
      <FileTypeIcon mimeType={file.mime_type} size={size * 0.5} />
    </div>
  );
}

/**
 * 파일 타입에 따른 아이콘 컴포넌트
 */
interface FileTypeIconProps {
  mimeType: string;
  size?: number;
  className?: string;
}

export function FileTypeIcon({ mimeType, size = 24, className = '' }: FileTypeIconProps) {
  const getIconColor = () => {
    if (mimeType.startsWith('image/')) return 'text-purple-500';
    if (mimeType.startsWith('video/')) return 'text-pink-500';
    if (mimeType.startsWith('audio/')) return 'text-yellow-500';
    if (mimeType.includes('pdf')) return 'text-red-500';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'text-blue-500';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'text-green-500';
    if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('compressed'))
      return 'text-amber-500';
    return 'text-gray-500';
  };

  const getIconPath = () => {
    if (mimeType.startsWith('image/')) {
      return (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
        />
      );
    }
    if (mimeType.startsWith('video/')) {
      return (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M19.125 12h1.5m0 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h1.5m14.25 0h1.5"
        />
      );
    }
    // 기본 파일 아이콘
    return (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    );
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={`${getIconColor()} ${className}`}
      style={{ width: size, height: size }}
    >
      {getIconPath()}
    </svg>
  );
}
