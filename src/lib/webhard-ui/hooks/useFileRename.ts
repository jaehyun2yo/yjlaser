'use client';

/**
 * useFileRename
 * File rename logic with optimistic updates
 */

import { useState, useCallback, useRef } from 'react';
import type { FileDTO } from '@/lib/webhard-ui/types';

// ============ Types ============

interface UseFileRenameOptions<T extends FileDTO> {
  /** File list */
  files: T[];
  /** Rename API endpoint (use {id} placeholder) */
  renameUrl?: string;
  /** Success callback */
  onSuccess?: (message: string) => void;
  /** Error callback */
  onError?: (message: string) => void;
  /** Update file in list (for optimistic update) */
  onUpdateFile?: (fileId: string, updates: Partial<T>) => void;
  /** Refetch files callback (for rollback on error) */
  onRefetch?: () => void;
}

interface UseFileRenameReturn {
  /** Currently editing file ID */
  editingFileId: string | null;
  /** Currently editing file name */
  editingFileName: string;
  /** Start rename */
  startRename: (file: FileDTO) => void;
  /** Finish rename */
  finishRename: (fileId: string) => Promise<void>;
  /** Cancel rename */
  cancelRename: () => void;
  /** Update editing file name */
  setEditingFileName: (name: string) => void;
  /** Input ref */
  editInputRef: React.RefObject<HTMLInputElement | null>;
  /** Key down handler for rename input */
  handleRenameKeyDown: (e: React.KeyboardEvent, fileId: string) => void;
}

// ============ Hook ============
export function useFileRename<T extends FileDTO>({
  files,
  renameUrl = '/api/webhard/files/{id}/rename',
  onSuccess,
  onError,
  onUpdateFile,
  onRefetch,
}: UseFileRenameOptions<T>): UseFileRenameReturn {
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState<string>('');
  const editInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Start rename
   */
  const startRename = useCallback((file: FileDTO) => {
    setEditingFileId(file.id);
    // Initialize with file name without extension
    const nameParts = file.original_name.split('.');
    const extension = nameParts.length > 1 ? nameParts.pop() : '';
    const nameWithoutExt = nameParts.join('.');
    setEditingFileName(extension ? nameWithoutExt : file.original_name);

    // Focus input (next render cycle)
    setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 0);
  }, []);

  /**
   * Finish rename
   */
  const finishRename = useCallback(
    async (fileId: string) => {
      if (!editingFileName.trim()) {
        setEditingFileId(null);
        setEditingFileName('');
        return;
      }

      // Find original file
      const originalFile = files.find((f) => f.id === fileId);
      if (!originalFile) {
        setEditingFileId(null);
        setEditingFileName('');
        return;
      }

      // Keep extension
      const nameParts = originalFile.original_name.split('.');
      const extension = nameParts.length > 1 ? nameParts.pop() : '';
      const newName = extension
        ? `${editingFileName.trim()}.${extension}`
        : editingFileName.trim();

      // No change
      if (newName === originalFile.original_name) {
        setEditingFileId(null);
        setEditingFileName('');
        return;
      }

      // Optimistic update
      onUpdateFile?.(fileId, { original_name: newName, name: newName } as Partial<T>);

      setEditingFileId(null);
      setEditingFileName('');

      try {
        const url = renameUrl.replace('{id}', fileId);
        const response = await fetch(url, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ original_name: newName }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to rename file');
        }

        onSuccess?.('File renamed');
      } catch (err) {
        // Rollback on error
        onUpdateFile?.(fileId, {
          original_name: originalFile.original_name,
          name: originalFile.name,
        } as Partial<T>);
        // Or refetch
        onRefetch?.();
        onError?.(err instanceof Error ? err.message : 'Failed to rename file');
      }
    },
    [editingFileName, files, renameUrl, onSuccess, onError, onUpdateFile, onRefetch]
  );

  /**
   * Cancel rename
   */
  const cancelRename = useCallback(() => {
    setEditingFileId(null);
    setEditingFileName('');
  }, []);

  /**
   * Handle key down in rename input
   */
  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent, fileId: string) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finishRename(fileId);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelRename();
      }
    },
    [finishRename, cancelRename]
  );

  return {
    editingFileId,
    editingFileName,
    startRename,
    finishRename,
    cancelRename,
    setEditingFileName,
    editInputRef,
    handleRenameKeyDown,
  };
}
