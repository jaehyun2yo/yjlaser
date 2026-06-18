'use client';

import { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { WebhardFileItem } from './WebhardFileItem';
import { useWebhardState, useWebhardActions, useWebhardLayout } from './context/WebhardContext';
import { TEXT_COLOR } from '@/lib/styles';

/**
 * VirtualizedFileList Props
 * Context 사용으로 props 대폭 축소
 */
interface VirtualizedFileListProps {
  // 무한 스크롤 props만 유지
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
}

const ROW_HEIGHT = 48;
const OVERSCAN = 10;

export function VirtualizedFileList({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: VirtualizedFileListProps) {
  // Context에서 값 가져오기
  const {
    files,
    selectedFiles,
    editingFileId,
    editingFileName,
    draggedFileId,
    isDragSelecting,
    isNewFilesMode,
  } = useWebhardState();

  const {
    onDragStart,
    onDragEnd,
    onFileClick,
    onFileDoubleClick,
    onContextMenu,
    onMouseEnter,
    onMouseMove,
    onMouseLeave,
    onCheckboxChange,
    onEditChange,
    onEditBlur,
    onEditKeyDown,
    onDownload,
    onDelete,
    onFolderNavigate,
    isFileNew,
    canPreviewFile,
    editInputRef,
  } = useWebhardActions();

  const { fileNameColWidth, dateColWidth } = useWebhardLayout();
  const parentRef = useRef<HTMLDivElement>(null);

  // 로딩 row를 위한 추가 공간 (hasNextPage일 때만)
  const virtualizer = useVirtualizer({
    count: files.length + (hasNextPage ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // 무한 스크롤: 마지막 아이템 근처에서 다음 페이지 로드
  const lastItem = virtualItems[virtualItems.length - 1];
  useEffect(() => {
    if (!lastItem) return;

    if (lastItem.index >= files.length - 5 && hasNextPage && !isFetchingNextPage && onLoadMore) {
      onLoadMore();
    }
  }, [lastItem?.index, files.length, hasNextPage, isFetchingNextPage, onLoadMore]);

  if (files.length === 0) {
    return null;
  }

  return (
    <div
      ref={parentRef}
      className="h-[calc(100vh-280px)] overflow-auto"
      style={{ contain: 'strict' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const index = virtualItem.index;

          // 로딩 row (마지막 가상 아이템이 파일 개수를 넘어섰을 때)
          if (index >= files.length) {
            return (
              <div
                key="loading-more"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className={`flex items-center justify-center ${TEXT_COLOR.muted}`}
              >
                {isFetchingNextPage && (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    더 불러오는 중...
                  </span>
                )}
              </div>
            );
          }

          const file = files[index];

          return (
            <div
              key={file.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <WebhardFileItem
                file={file}
                index={index}
                isSelected={selectedFiles.has(file.id)}
                isEditing={editingFileId === file.id}
                editingFileName={editingFileName}
                editInputRef={editingFileId === file.id ? editInputRef : undefined}
                isDragging={draggedFileId === file.id}
                isDragSelecting={isDragSelecting}
                isNewFilesMode={isNewFilesMode}
                isNew={isFileNew(file)}
                canPreview={canPreviewFile(file)}
                fileNameColWidth={fileNameColWidth}
                dateColWidth={dateColWidth}
                onDragStart={(e) => onDragStart(e, file.id)}
                onDragEnd={onDragEnd}
                onClick={(e) => onFileClick(e, file, index)}
                onDoubleClick={() => onFileDoubleClick(file)}
                onContextMenu={(e) => onContextMenu(e, file)}
                onMouseEnter={(e) => onMouseEnter(e, file)}
                onMouseMove={onMouseMove}
                onMouseLeave={onMouseLeave}
                onCheckboxChange={(checked) => onCheckboxChange(file.id, checked)}
                onEditChange={onEditChange}
                onEditBlur={() => onEditBlur(file.id)}
                onEditKeyDown={(e) => onEditKeyDown(e, file.id)}
                onDownload={() => onDownload(file)}
                onDelete={onDelete ? () => onDelete(file.id) : undefined}
                canDelete={Boolean(onDelete)}
                onFolderNavigate={onFolderNavigate}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
