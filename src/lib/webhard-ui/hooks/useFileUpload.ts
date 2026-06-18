'use client';

/**
 * useFileUpload
 * File upload logic with progress tracking
 * This is a simplified hook - integrate with your own API endpoints
 */

import { useState, useCallback } from 'react';

// ============ Constants ============
const DEFAULT_MAX_BATCH_SIZE = 100;
const DEFAULT_MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

// ============ Types ============

interface UploadResult {
  success: number;
  failed: number;
  skipped: number;
  errors: Array<{ fileName: string; error: string }>;
}

interface UseFileUploadOptions {
  /** Upload API endpoint */
  uploadUrl?: string;
  /** Maximum number of files per batch */
  maxBatchSize?: number;
  /** Maximum file size in bytes */
  maxFileSize?: number;
  /** Target folder ID */
  folderId?: string | null;
  /** Success callback */
  onSuccess?: (message: string) => void;
  /** Error callback */
  onError?: (title: string, message: string) => void;
  /** Refetch files callback */
  onRefetch?: () => void;
  /** File input ref (for reset after upload) */
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
}

interface UseFileUploadReturn {
  /** Is upload in progress */
  isUploading: boolean;
  /** Upload progress by file name (0-100, -1 for error) */
  uploadProgress: Record<string, number>;
  /** Upload files */
  uploadFiles: (files: FileList | File[], targetFolderId?: string | null) => Promise<void>;
  /** Reset upload state */
  resetUploadState: () => void;
}

// ============ Hook ============
export function useFileUpload({
  uploadUrl = '/api/webhard/files/upload',
  maxBatchSize = DEFAULT_MAX_BATCH_SIZE,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  folderId = null,
  onSuccess,
  onError,
  onRefetch,
  fileInputRef,
}: UseFileUploadOptions = {}): UseFileUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  const uploadFiles = useCallback(
    async (files: FileList | File[], targetFolderId?: string | null) => {
      const fileArray = Array.isArray(files) ? files : Array.from(files);
      if (fileArray.length === 0) return;

      // Use provided targetFolderId or default to folderId
      const uploadFolderId = targetFolderId !== undefined ? targetFolderId : folderId;

      // Validate max batch size
      if (fileArray.length > maxBatchSize) {
        onError?.('Error', `Maximum ${maxBatchSize} files can be uploaded at once.`);
        return;
      }

      // Validate file sizes
      const oversizedFiles = fileArray.filter((file) => file.size > maxFileSize);
      if (oversizedFiles.length > 0) {
        const fileNames = oversizedFiles.map((f) => f.name).join(', ');
        const sizeLimit = Math.round(maxFileSize / 1024 / 1024 / 1024);
        onError?.(
          'File size exceeded',
          `These files exceed ${sizeLimit}GB: ${fileNames.length > 50 ? fileNames.slice(0, 50) + '...' : fileNames}`
        );
        return;
      }

      // Validate empty files
      const emptyFiles = fileArray.filter((file) => file.size === 0);
      if (emptyFiles.length > 0) {
        onError?.('Error', 'Empty files (0 bytes) cannot be uploaded.');
        return;
      }

      setIsUploading(true);
      const progress: Record<string, number> = {};

      // Initialize progress for all files
      fileArray.forEach((file) => {
        progress[file.name] = 0;
      });
      setUploadProgress({ ...progress });

      try {
        // Upload files one by one
        const uploadPromises = fileArray.map(async (file) => {
          const formData = new FormData();
          formData.append('file', file);
          if (uploadFolderId) {
            formData.append('folderId', uploadFolderId);
          }

          try {
            const response = await fetch(uploadUrl, {
              method: 'POST',
              body: formData,
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Upload failed');
            }

            progress[file.name] = 100;
            setUploadProgress({ ...progress });
            return await response.json();
          } catch (err) {
            progress[file.name] = -1;
            setUploadProgress({ ...progress });
            throw err;
          }
        });

        const results = await Promise.allSettled(uploadPromises);

        // Count successes and failures
        const successCount = results.filter((r) => r.status === 'fulfilled').length;
        const failedCount = results.filter((r) => r.status === 'rejected').length;

        if (successCount > 0) {
          onSuccess?.(
            `${successCount} file(s) uploaded${failedCount > 0 ? `, ${failedCount} failed` : ''}`
          );
        }

        onRefetch?.();
      } catch (err) {
        onError?.('Error', err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setIsUploading(false);
        setUploadProgress({});
        // Reset input
        if (fileInputRef?.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [uploadUrl, maxBatchSize, maxFileSize, folderId, onSuccess, onError, onRefetch, fileInputRef]
  );

  const resetUploadState = useCallback(() => {
    setIsUploading(false);
    setUploadProgress({});
  }, []);

  return {
    isUploading,
    uploadProgress,
    uploadFiles,
    resetUploadState,
  };
}
