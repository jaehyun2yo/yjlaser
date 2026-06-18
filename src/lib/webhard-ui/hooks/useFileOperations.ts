'use client';

/**
 * useFileOperations
 * File operations logic (upload, download, delete, move, rename)
 * This is a simplified hook - integrate with your own API endpoints
 */

import { useState, useCallback } from 'react';
import type { ProgressItem, DownloadItem, FileDTO } from '@/lib/webhard-ui/types';

// ============ Types ============

interface FileOperationResult {
  success: boolean;
  message?: string;
  error?: string;
}

interface UseFileOperationsOptions {
  /** Download API endpoint */
  downloadUrl?: string;
  /** Delete API endpoint */
  deleteUrl?: string;
  /** Move API endpoint */
  moveUrl?: string;
  /** Rename API endpoint (use {id} as placeholder) */
  renameUrl?: string;
  /** Success callback */
  onSuccess?: (message: string) => void;
  /** Error callback */
  onError?: (message: string) => void;
  /** Clear selection callback */
  onClearSelection?: () => void;
  /** Refetch files callback */
  onRefetch?: () => void;
}

interface UseFileOperationsReturn {
  // Download
  isDownloading: boolean;
  downloadItems: DownloadItem[];
  downloadFiles: (files: FileDTO[]) => Promise<void>;
  downloadSingleFile: (file: FileDTO) => Promise<void>;

  // Delete
  isDeleting: boolean;
  deleteItems: ProgressItem[];
  deleteFiles: (fileIds: string[]) => Promise<void>;

  // Move
  isMoving: boolean;
  moveItems: ProgressItem[];
  moveFiles: (fileIds: string[], targetFolderId: string | null) => Promise<void>;

  // Rename
  renameFile: (fileId: string, newName: string) => Promise<boolean>;

  // Reset functions
  resetDownloadState: () => void;
  resetDeleteState: () => void;
  resetMoveState: () => void;
}

// ============ Hook ============

export function useFileOperations({
  downloadUrl = '/api/webhard/download',
  deleteUrl = '/api/webhard/files/batch/delete',
  moveUrl = '/api/webhard/files/batch/move',
  renameUrl = '/api/webhard/files/{id}/rename',
  onSuccess,
  onError,
  onClearSelection,
  onRefetch,
}: UseFileOperationsOptions = {}): UseFileOperationsReturn {
  // ============ Download State ============
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadItems, setDownloadItems] = useState<DownloadItem[]>([]);

  // ============ Delete State ============
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteItems, setDeleteItems] = useState<ProgressItem[]>([]);

  // ============ Move State ============
  const [isMoving, setIsMoving] = useState(false);
  const [moveItems, setMoveItems] = useState<ProgressItem[]>([]);

  // ============ Download ============
  const downloadSingleFile = useCallback(
    async (file: FileDTO) => {
      try {
        const response = await fetch(`${downloadUrl}?fileId=${file.id}`);
        if (!response.ok) throw new Error('Download failed');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.original_name || file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        onSuccess?.('File downloaded');
      } catch (error) {
        onError?.(error instanceof Error ? error.message : 'Download failed');
        throw error;
      }
    },
    [downloadUrl, onSuccess, onError]
  );

  const downloadFiles = useCallback(
    async (files: FileDTO[]) => {
      if (files.length === 0) return;

      setIsDownloading(true);

      // Initialize progress items
      const items: DownloadItem[] = files.map((file) => ({
        id: file.id,
        name: file.original_name || file.name,
        status: 'pending',
        progress: 0,
        size: file.size,
        downloadedSize: 0,
      }));
      setDownloadItems(items);

      try {
        if (files.length === 1) {
          // Single file download
          const file = files[0];
          setDownloadItems((prev) =>
            prev.map((item) => (item.id === file.id ? { ...item, status: 'processing' } : item))
          );

          await downloadSingleFile(file);

          setDownloadItems((prev) =>
            prev.map((item) =>
              item.id === file.id ? { ...item, status: 'completed', progress: 100 } : item
            )
          );
        } else {
          // Multiple file download (ZIP)
          const fileIds = files.map((f) => f.id);
          const response = await fetch(downloadUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileIds }),
          });

          if (!response.ok) throw new Error('Download failed');

          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `files_${new Date().toISOString().slice(0, 10)}.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);

          setDownloadItems((prev) =>
            prev.map((item) => ({ ...item, status: 'completed', progress: 100 }))
          );
          onSuccess?.(`${files.length} files downloaded`);
        }

        onRefetch?.();
      } catch (error) {
        setDownloadItems((prev) =>
          prev.map((item) => ({
            ...item,
            status: 'error',
            error: error instanceof Error ? error.message : 'Download failed',
          }))
        );
        onError?.(error instanceof Error ? error.message : 'Download failed');
      } finally {
        setIsDownloading(false);
      }
    },
    [downloadUrl, downloadSingleFile, onSuccess, onError, onRefetch]
  );

  // ============ Delete ============
  const deleteFiles = useCallback(
    async (fileIds: string[]) => {
      if (fileIds.length === 0) return;

      setIsDeleting(true);

      const items: ProgressItem[] = fileIds.map((id) => ({
        id,
        name: id,
        status: 'pending',
        progress: 0,
      }));
      setDeleteItems(items);

      try {
        const response = await fetch(deleteUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileIds }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Delete failed');
        }

        const result = await response.json();

        setDeleteItems((prev) =>
          prev.map((item) => ({ ...item, status: 'completed', progress: 100 }))
        );

        onSuccess?.(`${result.deleted || fileIds.length} files deleted`);
        onClearSelection?.();
        onRefetch?.();
      } catch (error) {
        setDeleteItems((prev) =>
          prev.map((item) => ({
            ...item,
            status: 'error',
            error: error instanceof Error ? error.message : 'Delete failed',
          }))
        );
        onError?.(error instanceof Error ? error.message : 'Delete failed');
      } finally {
        setIsDeleting(false);
      }
    },
    [deleteUrl, onSuccess, onError, onClearSelection, onRefetch]
  );

  // ============ Move ============
  const moveFiles = useCallback(
    async (fileIds: string[], targetFolderId: string | null) => {
      if (fileIds.length === 0) return;

      setIsMoving(true);

      const items: ProgressItem[] = fileIds.map((id) => ({
        id,
        name: id,
        status: 'pending',
        progress: 0,
      }));
      setMoveItems(items);

      try {
        const response = await fetch(moveUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileIds, targetFolderId }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Move failed');
        }

        setMoveItems((prev) =>
          prev.map((item) => ({ ...item, status: 'completed', progress: 100 }))
        );

        onSuccess?.(`${fileIds.length} files moved`);
        onClearSelection?.();
        onRefetch?.();
      } catch (error) {
        setMoveItems((prev) =>
          prev.map((item) => ({
            ...item,
            status: 'error',
            error: error instanceof Error ? error.message : 'Move failed',
          }))
        );
        onError?.(error instanceof Error ? error.message : 'Move failed');
      } finally {
        setIsMoving(false);
      }
    },
    [moveUrl, onSuccess, onError, onClearSelection, onRefetch]
  );

  // ============ Rename ============
  const renameFile = useCallback(
    async (fileId: string, newName: string): Promise<boolean> => {
      try {
        const url = renameUrl.replace('{id}', fileId);
        const response = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newName }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Rename failed');
        }

        onSuccess?.('File renamed');
        onRefetch?.();
        return true;
      } catch (error) {
        onError?.(error instanceof Error ? error.message : 'Rename failed');
        return false;
      }
    },
    [renameUrl, onSuccess, onError, onRefetch]
  );

  // ============ Reset Functions ============
  const resetDownloadState = useCallback(() => {
    setIsDownloading(false);
    setDownloadItems([]);
  }, []);

  const resetDeleteState = useCallback(() => {
    setIsDeleting(false);
    setDeleteItems([]);
  }, []);

  const resetMoveState = useCallback(() => {
    setIsMoving(false);
    setMoveItems([]);
  }, []);

  return {
    // Download
    isDownloading,
    downloadItems,
    downloadFiles,
    downloadSingleFile,

    // Delete
    isDeleting,
    deleteItems,
    deleteFiles,

    // Move
    isMoving,
    moveItems,
    moveFiles,

    // Rename
    renameFile,

    // Reset
    resetDownloadState,
    resetDeleteState,
    resetMoveState,
  };
}

// Re-export types
export type { ProgressItem, DownloadItem };
