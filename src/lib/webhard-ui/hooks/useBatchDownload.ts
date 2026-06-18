'use client';

/**
 * useBatchDownload
 * Batch file download logic with concurrency control
 * This is a simplified hook - integrate with your own API endpoints
 */

import { useState, useCallback } from 'react';
import type { DownloadItem, FileDTO } from '@/lib/webhard-ui/types';

// ============ Constants ============
const DEFAULT_CONCURRENT_LIMIT = 3;

// ============ Types ============

interface UseBatchDownloadOptions {
  /** Download URL endpoint (use {fileId} placeholder) */
  downloadUrl?: string;
  /** Concurrent download limit */
  concurrentLimit?: number;
  /** Success callback */
  onSuccess?: (message: string) => void;
  /** Error callback */
  onError?: (message: string) => void;
  /** Clear selection callback */
  onClearSelection?: () => void;
  /** Refetch files callback */
  onRefetch?: () => void;
  /** Open download modal callback */
  onOpenModal?: () => void;
}

interface UseBatchDownloadReturn {
  /** Is download in progress */
  isDownloading: boolean;
  /** Download items status */
  downloadItems: DownloadItem[];
  /** Download files */
  downloadFiles: (files: FileDTO[]) => Promise<void>;
  /** Reset download state */
  resetDownloadState: () => void;
}

// ============ Hook ============
export function useBatchDownload({
  downloadUrl = '/api/webhard/download?fileId={fileId}',
  concurrentLimit = DEFAULT_CONCURRENT_LIMIT,
  onSuccess,
  onError,
  onClearSelection,
  onRefetch,
  onOpenModal,
}: UseBatchDownloadOptions = {}): UseBatchDownloadReturn {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadItems, setDownloadItems] = useState<DownloadItem[]>([]);

  const downloadFiles = useCallback(
    async (files: FileDTO[]) => {
      if (files.length === 0) return;

      // Initialize download items
      const initialItems: DownloadItem[] = files.map((file) => ({
        id: file.id,
        name: file.original_name,
        status: 'pending' as const,
        progress: 0,
        size: file.size,
        downloadedSize: 0,
      }));
      setDownloadItems(initialItems);
      onOpenModal?.();
      setIsDownloading(true);

      let completedCount = 0;
      let errorCount = 0;

      // Download a single file
      const downloadSingleFile = async (file: FileDTO) => {
        // Update status to downloading
        setDownloadItems((prev) =>
          prev.map((item) =>
            item.id === file.id ? { ...item, status: 'processing' as const } : item
          )
        );

        try {
          const url = downloadUrl.replace('{fileId}', file.id);
          const response = await fetch(url);

          if (!response.ok) {
            throw new Error('Failed to download');
          }

          const blob = await response.blob();
          const blobUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = file.original_name || file.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(blobUrl);

          // Update status to completed
          setDownloadItems((prev) =>
            prev.map((item) =>
              item.id === file.id
                ? { ...item, status: 'completed' as const, progress: 100 }
                : item
            )
          );
          completedCount++;
        } catch (err) {
          // Update status to error
          setDownloadItems((prev) =>
            prev.map((item) =>
              item.id === file.id
                ? {
                    ...item,
                    status: 'error' as const,
                    error: err instanceof Error ? err.message : 'Download failed',
                  }
                : item
            )
          );
          errorCount++;
        }
      };

      // Process files in chunks with concurrency control
      const chunks: FileDTO[][] = [];
      for (let i = 0; i < files.length; i += concurrentLimit) {
        chunks.push(files.slice(i, i + concurrentLimit));
      }

      for (const chunk of chunks) {
        await Promise.all(chunk.map(downloadSingleFile));
      }

      // Complete
      setIsDownloading(false);

      // Show results
      if (completedCount > 0) {
        onSuccess?.(`${completedCount} file(s) downloaded`);
      }
      if (errorCount > 0) {
        onError?.(`${errorCount} file(s) failed to download`);
      }

      onClearSelection?.();
      onRefetch?.();
    },
    [downloadUrl, concurrentLimit, onSuccess, onError, onClearSelection, onRefetch, onOpenModal]
  );

  const resetDownloadState = useCallback(() => {
    setIsDownloading(false);
    setDownloadItems([]);
  }, []);

  return {
    isDownloading,
    downloadItems,
    downloadFiles,
    resetDownloadState,
  };
}

// Re-export types
export type { DownloadItem };
