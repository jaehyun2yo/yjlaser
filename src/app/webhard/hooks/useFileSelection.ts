'use client';

/**
 * useFileSelection
 * 파일 선택 관련 비즈니스 로직 훅
 * - 단일 선택, 다중 선택, 범위 선택
 * - Shift+Click 범위 선택
 * - Ctrl+Click 토글 선택
 * - 전체 선택/해제
 */

import { useCallback, useRef } from 'react';
import { useWebhardSelectionStore } from '@/store/webhard';
import type { WebhardFileDTO } from '@/app/webhard/_lib/types';

interface UseFileSelectionOptions {
  /** 파일 목록 (인덱스 계산용) */
  files: WebhardFileDTO[];
  /** 선택 변경 시 콜백 */
  onSelectionChange?: (selectedIds: Set<string>) => void;
}

interface UseFileSelectionReturn {
  /** 선택된 파일 ID Set */
  selectedFiles: Set<string>;
  /** 마지막 클릭된 파일 인덱스 */
  lastClickedIndex: number | null;

  /** 파일 클릭 핸들러 (Shift, Ctrl 조합 처리) */
  handleFileClick: (file: WebhardFileDTO, event: React.MouseEvent) => void;
  /** 파일 체크박스 클릭 핸들러 */
  handleCheckboxClick: (fileId: string, event: React.MouseEvent) => void;
  /** 전체 선택 토글 */
  handleSelectAll: () => void;
  /** 선택 해제 */
  clearSelection: () => void;

  /** 파일이 선택되었는지 확인 */
  isFileSelected: (fileId: string) => boolean;
  /** 모든 파일이 선택되었는지 확인 */
  isAllSelected: boolean;
  /** 일부 파일만 선택되었는지 확인 */
  isPartiallySelected: boolean;
  /** 선택된 파일 수 */
  selectedCount: number;
}

export function useFileSelection({
  files,
  onSelectionChange,
}: UseFileSelectionOptions): UseFileSelectionReturn {
  // Zustand Store
  const {
    selectedFiles,
    lastClickedFileIndex,
    selectFile,
    toggleFile,
    selectRange,
    selectAll,
    clearSelection,
    setLastClickedIndex,
  } = useWebhardSelectionStore();

  // 이전 선택 상태 추적 (onSelectionChange 호출용)
  const prevSelectionRef = useRef<Set<string>>(selectedFiles);

  // 파일 ID 배열 (인덱스 계산용)
  const fileIds = files.map((f) => f.id);

  /**
   * 파일 클릭 핸들러
   * - 일반 클릭: 단일 선택
   * - Shift+클릭: 범위 선택
   * - Ctrl+클릭: 토글 선택
   */
  const handleFileClick = useCallback(
    (file: WebhardFileDTO, event: React.MouseEvent) => {
      const currentIndex = files.findIndex((f) => f.id === file.id);
      if (currentIndex === -1) return;

      if (event.shiftKey && lastClickedFileIndex !== null) {
        // Shift+클릭: 범위 선택
        selectRange(lastClickedFileIndex, currentIndex, files);
      } else if (event.ctrlKey || event.metaKey) {
        // Ctrl+클릭: 토글 선택
        toggleFile(file.id, currentIndex);
        setLastClickedIndex(currentIndex);
      } else {
        // 일반 클릭: 단일 선택
        selectFile(file.id, currentIndex);
        setLastClickedIndex(currentIndex);
      }

      // 선택 변경 콜백
      if (onSelectionChange && prevSelectionRef.current !== selectedFiles) {
        prevSelectionRef.current = selectedFiles;
        onSelectionChange(selectedFiles);
      }
    },
    [
      files,
      lastClickedFileIndex,
      selectFile,
      toggleFile,
      selectRange,
      setLastClickedIndex,
      selectedFiles,
      onSelectionChange,
    ]
  );

  /**
   * 체크박스 클릭 핸들러
   * - 항상 토글 동작 (Shift 제외)
   */
  const handleCheckboxClick = useCallback(
    (fileId: string, event: React.MouseEvent) => {
      event.stopPropagation(); // 파일 클릭 이벤트 방지

      const currentIndex = files.findIndex((f) => f.id === fileId);

      if (event.shiftKey && lastClickedFileIndex !== null && currentIndex !== -1) {
        // Shift+체크박스 클릭: 범위 선택
        selectRange(lastClickedFileIndex, currentIndex, files);
      } else {
        // 일반 체크박스 클릭: 토글
        toggleFile(fileId, currentIndex);
        if (currentIndex !== -1) {
          setLastClickedIndex(currentIndex);
        }
      }
    },
    [files, lastClickedFileIndex, toggleFile, selectRange, setLastClickedIndex]
  );

  /**
   * 전체 선택 토글
   */
  const handleSelectAll = useCallback(() => {
    if (selectedFiles.size === files.length && files.length > 0) {
      // 모두 선택됨 -> 선택 해제
      clearSelection();
    } else {
      // 일부만 선택 또는 없음 -> 전체 선택
      selectAll(fileIds);
    }
  }, [selectedFiles.size, files.length, fileIds, selectAll, clearSelection]);

  /**
   * 파일 선택 여부 확인
   */
  const isFileSelected = useCallback(
    (fileId: string) => {
      return selectedFiles.has(fileId);
    },
    [selectedFiles]
  );

  // 계산된 값
  const selectedCount = selectedFiles.size;
  const isAllSelected = selectedCount > 0 && selectedCount === files.length;
  const isPartiallySelected = selectedCount > 0 && selectedCount < files.length;

  return {
    selectedFiles,
    lastClickedIndex: lastClickedFileIndex,
    handleFileClick,
    handleCheckboxClick,
    handleSelectAll,
    clearSelection,
    isFileSelected,
    isAllSelected,
    isPartiallySelected,
    selectedCount,
  };
}
