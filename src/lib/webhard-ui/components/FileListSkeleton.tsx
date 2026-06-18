'use client';

/**
 * FileListSkeleton
 * Loading skeleton for file list
 */

import { memo } from 'react';
import { BG_COLOR, BORDER_COLOR, DIVIDE_COLOR } from '@/lib/styles';

export interface FileListSkeletonProps {
  /** Number of skeleton rows */
  rows?: number;
  /** View mode */
  viewMode?: 'list' | 'grid';
  /** Additional class name */
  className?: string;
  /** Animation class */
  animationClass?: string;
}

/**
 * List view skeleton row
 */
const ListSkeletonRow = ({ animationClass }: { animationClass: string }) => (
  <div className="flex items-center px-4 py-3 gap-4">
    {/* Checkbox */}
    <div className={`w-4 h-4 rounded ${animationClass}`} />
    {/* Icon */}
    <div className={`w-6 h-6 rounded ${animationClass}`} />
    {/* File name */}
    <div className="flex-1">
      <div className={`h-4 rounded w-3/4 ${animationClass}`} />
    </div>
    {/* Size */}
    <div className={`h-4 w-16 rounded ${animationClass}`} />
    {/* Date */}
    <div className={`h-4 w-20 rounded ${animationClass}`} />
    {/* Uploader */}
    <div className={`h-4 w-24 rounded ${animationClass}`} />
  </div>
);

/**
 * Grid view skeleton item
 */
const GridSkeletonItem = ({ animationClass }: { animationClass: string }) => (
  <div className={`p-4 rounded-xl border ${BORDER_COLOR.default}`}>
    {/* Checkbox */}
    <div className={`w-4 h-4 rounded ${animationClass} mb-4`} />
    {/* Icon */}
    <div className="flex justify-center mb-4">
      <div className={`w-12 h-12 rounded ${animationClass}`} />
    </div>
    {/* File name */}
    <div className={`h-4 rounded w-3/4 mx-auto ${animationClass}`} />
    {/* Size */}
    <div className={`h-3 rounded w-1/2 mx-auto mt-2 ${animationClass}`} />
  </div>
);

/**
 * FileListSkeleton component
 */
export const FileListSkeleton = memo(function FileListSkeleton({
  rows = 10,
  viewMode = 'list',
  className = '',
  animationClass = `${BG_COLOR.muted} animate-pulse`,
}: FileListSkeletonProps) {
  const items = Array.from({ length: rows }, (_, i) => i);

  if (viewMode === 'grid') {
    return (
      <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 ${className}`}>
        {items.map((i) => (
          <GridSkeletonItem key={i} animationClass={animationClass} />
        ))}
      </div>
    );
  }

  return (
    <div className={`divide-y ${DIVIDE_COLOR.lighter} ${className}`}>
      {items.map((i) => (
        <ListSkeletonRow key={i} animationClass={animationClass} />
      ))}
    </div>
  );
});

export default FileListSkeleton;
