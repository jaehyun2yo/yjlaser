'use client';

/**
 * WebhardEmptyState
 * 웹하드 빈 폴더 상태 컴포넌트
 * - 일반 빈 폴더 상태
 * - 새 파일 모드 빈 상태
 */
import { memo } from 'react';
import { FaFile, FaStar } from 'react-icons/fa';
import { TEXT_COLOR } from '@/lib/styles';

export interface WebhardEmptyStateProps {
  /** 새 파일 모드 여부 */
  isNewFilesMode: boolean;
  /** 그리드 모드 여부 (col-span-full 적용) */
  gridMode?: boolean;
  /** 추가 클래스명 */
  className?: string;
}

/**
 * 웹하드 빈 상태 컴포넌트
 * 폴더에 파일이 없을 때 표시
 */
export const WebhardEmptyState = memo(function WebhardEmptyState({
  isNewFilesMode,
  gridMode = false,
  className = '',
}: WebhardEmptyStateProps) {
  const baseClasses = `text-center py-12 ${TEXT_COLOR.muted} ${gridMode ? 'col-span-full' : ''} ${className}`;

  if (isNewFilesMode) {
    return (
      <div className={baseClasses}>
        <FaStar className="mx-auto text-4xl md:text-5xl mb-4 opacity-50 text-yellow-500" />
        <p className="text-sm md:text-base">새 파일이 없습니다</p>
        <p className="text-xs mt-2 text-gray-400">
          24시간 이내 업로드되어 아직 다운로드하지 않은 파일이 여기에 표시됩니다
        </p>
      </div>
    );
  }

  return (
    <div className={baseClasses}>
      <FaFile className="mx-auto text-4xl md:text-5xl mb-4 opacity-50" />
      <p className="text-sm md:text-base">업로드된 파일이 없습니다</p>
    </div>
  );
});

export default WebhardEmptyState;
