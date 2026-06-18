'use client';

/**
 * StorageUsage
 * Storage usage bar component
 */

import { memo } from 'react';
import { BG_COLOR, TEXT_COLOR } from '@/lib/styles';

export interface StorageUsageProps {
  /** Used storage in bytes */
  usedBytes: number;
  /** Total storage in bytes (if applicable) */
  totalBytes?: number;
  /** Total files count */
  totalFiles?: number;
  /** Additional class name */
  className?: string;
  /** Labels */
  labels?: {
    used?: string;
    of?: string;
    files?: string;
    unlimited?: string;
  };
  /** Bar color class */
  barColorClass?: string;
  /** Show percentage */
  showPercentage?: boolean;
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * StorageUsage component
 */
export const StorageUsage = memo(function StorageUsage({
  usedBytes,
  totalBytes,
  totalFiles,
  className = '',
  labels = {},
  barColorClass = 'bg-orange-500',
  showPercentage = true,
}: StorageUsageProps) {
  const { used = 'Used', of = 'of', files = 'files', unlimited = 'Unlimited' } = labels;

  const percentage = totalBytes ? Math.min(100, (usedBytes / totalBytes) * 100) : 0;
  const usedFormatted = formatBytes(usedBytes);
  const totalFormatted = totalBytes ? formatBytes(totalBytes) : unlimited;

  return (
    <div className={`${className}`}>
      {/* Progress bar */}
      {totalBytes && (
        <div className={`relative h-2 ${BG_COLOR.muted} rounded-full overflow-hidden mb-2`}>
          <div
            className={`absolute top-0 left-0 h-full ${barColorClass} transition-all duration-300`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}

      {/* Stats */}
      <div className={`flex items-center justify-between text-xs ${TEXT_COLOR.secondary}`}>
        <div>
          <span className="font-medium">{usedFormatted}</span>
          {totalBytes && (
            <>
              <span className="mx-1">{of}</span>
              <span>{totalFormatted}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Percentage */}
          {showPercentage && totalBytes && (
            <span
              className={`font-medium ${percentage >= 90 ? 'text-red-500' : percentage >= 70 ? 'text-yellow-500' : ''}`}
            >
              {percentage.toFixed(1)}%
            </span>
          )}

          {/* File count */}
          {totalFiles !== undefined && (
            <span>
              {totalFiles.toLocaleString()} {files}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

export default StorageUsage;
