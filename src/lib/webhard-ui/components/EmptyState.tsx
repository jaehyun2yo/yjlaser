'use client';

/**
 * EmptyState
 * Empty folder state component
 * - Normal empty folder state
 * - New files mode empty state
 */

import { memo } from 'react';
import { TEXT_COLOR } from '@/lib/styles';

export interface EmptyStateProps {
  /** New files mode */
  isNewFilesMode?: boolean;
  /** Grid mode (applies col-span-full) */
  gridMode?: boolean;
  /** Empty folder message */
  emptyMessage?: string;
  /** New files empty message */
  newFilesEmptyMessage?: string;
  /** New files description */
  newFilesDescription?: string;
  /** Empty folder icon */
  emptyIcon?: React.ReactNode;
  /** New files icon */
  newFilesIcon?: React.ReactNode;
  /** Additional class name */
  className?: string;
}

/**
 * Default file icon
 */
const DefaultFileIcon = () => (
  <svg
    className="mx-auto text-4xl md:text-5xl mb-4 opacity-50 w-12 h-12"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path
      fillRule="evenodd"
      d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
      clipRule="evenodd"
    />
  </svg>
);

/**
 * Default star icon
 */
const DefaultStarIcon = () => (
  <svg
    className="mx-auto text-4xl md:text-5xl mb-4 opacity-50 text-yellow-500 w-12 h-12"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  </svg>
);

/**
 * EmptyState component
 */
export const EmptyState = memo(function EmptyState({
  isNewFilesMode = false,
  gridMode = false,
  emptyMessage = 'No files uploaded',
  newFilesEmptyMessage = 'No new files',
  newFilesDescription = 'Files uploaded within 24 hours that have not been downloaded will appear here',
  emptyIcon,
  newFilesIcon,
  className = '',
}: EmptyStateProps) {
  const baseClasses = `text-center py-12 ${TEXT_COLOR.secondary} ${gridMode ? 'col-span-full' : ''} ${className}`;

  const FileIcon = emptyIcon || <DefaultFileIcon />;
  const StarIcon = newFilesIcon || <DefaultStarIcon />;

  if (isNewFilesMode) {
    return (
      <div className={baseClasses}>
        {StarIcon}
        <p className="text-sm md:text-base">{newFilesEmptyMessage}</p>
        <p className="text-xs mt-2 text-gray-400">{newFilesDescription}</p>
      </div>
    );
  }

  return (
    <div className={baseClasses}>
      {FileIcon}
      <p className="text-sm md:text-base">{emptyMessage}</p>
    </div>
  );
});

export default EmptyState;
