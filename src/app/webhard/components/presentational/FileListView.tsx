'use client';

/**
 * FileListView
 * 파일 목록 Presentational 컴포넌트
 * - 순수 UI 렌더링
 * - 리스트/그리드 뷰 모드 지원
 * - 모든 이벤트는 props로 전달받음
 *
 * NOTE: 이 컴포넌트는 기존 WebhardFileItem/WebhardFolderItem의 정확한 props에 맞게
 * 조정이 필요할 수 있습니다. 실제 사용 시 props 인터페이스를 확인하세요.
 */

import type { FC, MouseEvent } from 'react';
import type { WebhardFileDTO, WebhardFolderDTO } from '@/app/webhard/_lib/types';
import { formatInquiryFolderDisplayName } from '@/app/webhard/_lib/formatInquiryFolderDisplayName';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

// ============ Types ============

interface FileListViewProps {
  /** 파일 목록 */
  files: WebhardFileDTO[];
  /** 폴더 목록 */
  folders: WebhardFolderDTO[];
  /** 선택된 파일 ID Set */
  selectedFiles: Set<string>;
  /** 뷰 모드 */
  viewMode: 'list' | 'grid';
  /** 로딩 중 */
  isLoading?: boolean;
  /** 새 파일 모드 */
  isNewFilesMode?: boolean;

  // 파일 이벤트
  onFileClick?: (file: WebhardFileDTO, event: MouseEvent) => void;
  onFileDoubleClick?: (file: WebhardFileDTO) => void;
  onFileContextMenu?: (file: WebhardFileDTO, event: MouseEvent) => void;
  onFileDownload?: (file: WebhardFileDTO) => void;
  onFileDelete?: (file: WebhardFileDTO) => void;

  // 폴더 이벤트
  onFolderClick?: (folder: WebhardFolderDTO) => void;
  onFolderDoubleClick?: (folder: WebhardFolderDTO) => void;

  // 드래그 앤 드롭
  draggedFileId?: string | null;
  dragOverFolderId?: string | null;
}

// ============ Simple Empty State ============

const EmptyState: FC<{ isNewFilesMode?: boolean }> = ({ isNewFilesMode }) => (
  <div className={`flex flex-col items-center justify-center py-20 ${TEXT_COLOR.muted}`}>
    <div className={`text-5xl mb-5 ${TEXT_COLOR.secondary}`}>📁</div>
    <p className={`text-base font-medium ${TEXT_COLOR.secondary}`}>
      {isNewFilesMode ? '새 파일이 없습니다' : '파일이 없습니다'}
    </p>
    <p className={`text-sm mt-2 ${TEXT_COLOR.secondary}`}>
      {isNewFilesMode ? '모든 파일을 확인했습니다' : '파일을 업로드해 주세요'}
    </p>
  </div>
);

// ============ Simple File Item ============

interface SimpleFileItemProps {
  file: WebhardFileDTO;
  isSelected: boolean;
  isDragging?: boolean;
  viewMode: 'list' | 'grid';
  onClick?: (event: MouseEvent) => void;
  onDoubleClick?: () => void;
  onContextMenu?: (event: MouseEvent) => void;
}

const SimpleFileItem: FC<SimpleFileItemProps> = ({
  file,
  isSelected,
  isDragging,
  viewMode,
  onClick,
  onDoubleClick,
  onContextMenu,
}) => {
  const fileName = file.original_name || file.name;

  if (viewMode === 'grid') {
    return (
      <div
        className={`
          p-3 rounded-lg border cursor-pointer transition-all
          ${isSelected ? `${BG_COLOR.info} border-blue-300` : `${BG_COLOR.card} ${BORDER_COLOR.default}`}
          ${isDragging ? 'opacity-50' : ''}
          hover:shadow-md
        `}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      >
        <div className="flex flex-col items-center gap-2">
          <div className="text-3xl">📄</div>
          <span className="text-sm text-center truncate w-full">{fileName}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`
        flex items-center px-4 py-2 rounded-lg border cursor-pointer transition-all
        ${isSelected ? `${BG_COLOR.info} border-blue-300` : `${BG_COLOR.card} ${BORDER_COLOR.default}`}
        ${isDragging ? 'opacity-50' : ''}
        hover:shadow-sm
      `}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <span className="text-xl mr-3">📄</span>
      <span className="flex-1 truncate">{fileName}</span>
      <span className="text-xs text-gray-500 ml-4">
        {new Date(file.created_at).toLocaleDateString()}
      </span>
    </div>
  );
};

// ============ Simple Folder Item ============

interface SimpleFolderItemProps {
  folder: WebhardFolderDTO;
  isDragOver?: boolean;
  viewMode: 'list' | 'grid';
  onClick?: () => void;
  onDoubleClick?: () => void;
}

const SimpleFolderItem: FC<SimpleFolderItemProps> = ({
  folder,
  isDragOver,
  viewMode,
  onClick,
  onDoubleClick,
}) => {
  const displayFolderName = formatInquiryFolderDisplayName(folder.name);

  if (viewMode === 'grid') {
    return (
      <div
        className={`
          p-3 rounded-lg border cursor-pointer transition-all
          ${isDragOver ? 'bg-blue-100 border-blue-400' : `${BG_COLOR.card} ${BORDER_COLOR.default}`}
          hover:shadow-md
        `}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        <div className="flex flex-col items-center gap-2">
          <div className="text-3xl">📁</div>
          <span className="text-sm text-center truncate w-full">{displayFolderName}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`
        flex items-center px-4 py-2 rounded-lg border cursor-pointer transition-all
        ${isDragOver ? 'bg-blue-100 border-blue-400' : `${BG_COLOR.card} ${BORDER_COLOR.default}`}
        hover:shadow-sm
      `}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <span className="text-xl mr-3">📁</span>
      <span className="flex-1 truncate font-medium">{displayFolderName}</span>
    </div>
  );
};

// ============ Component ============

export const FileListView: FC<FileListViewProps> = ({
  files,
  folders,
  selectedFiles,
  viewMode,
  isLoading = false,
  isNewFilesMode = false,
  onFileClick,
  onFileDoubleClick,
  onFileContextMenu,
  onFolderClick,
  onFolderDoubleClick,
  draggedFileId,
  dragOverFolderId,
}) => {
  // 빈 상태
  if (!isLoading && files.length === 0 && folders.length === 0) {
    return <EmptyState isNewFilesMode={isNewFilesMode} />;
  }

  // 리스트 뷰
  if (viewMode === 'list') {
    return (
      <div className="flex flex-col gap-1">
        {/* 폴더 목록 */}
        {folders.map((folder, index) => (
          <div
            key={folder.id}
            className="animate-stagger-item"
            style={{ animationDelay: `${index * 0.02}s` }}
          >
            <SimpleFolderItem
              folder={folder}
              isDragOver={dragOverFolderId === folder.id}
              viewMode={viewMode}
              onClick={() => onFolderClick?.(folder)}
              onDoubleClick={() => onFolderDoubleClick?.(folder)}
            />
          </div>
        ))}

        {/* 파일 목록 */}
        {files.map((file, index) => (
          <div
            key={file.id}
            className="animate-stagger-item"
            style={{ animationDelay: `${(folders.length + index) * 0.02}s` }}
          >
            <SimpleFileItem
              file={file}
              isSelected={selectedFiles.has(file.id)}
              isDragging={draggedFileId === file.id}
              viewMode={viewMode}
              onClick={(e) => onFileClick?.(file, e)}
              onDoubleClick={() => onFileDoubleClick?.(file)}
              onContextMenu={(e) => onFileContextMenu?.(file, e)}
            />
          </div>
        ))}
      </div>
    );
  }

  // 그리드 뷰
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {/* 폴더 목록 */}
      {folders.map((folder, index) => (
        <div
          key={folder.id}
          className="animate-stagger-item"
          style={{ animationDelay: `${index * 0.02}s` }}
        >
          <SimpleFolderItem
            folder={folder}
            isDragOver={dragOverFolderId === folder.id}
            viewMode={viewMode}
            onClick={() => onFolderClick?.(folder)}
            onDoubleClick={() => onFolderDoubleClick?.(folder)}
          />
        </div>
      ))}

      {/* 파일 목록 */}
      {files.map((file, index) => (
        <div
          key={file.id}
          className="animate-stagger-item"
          style={{ animationDelay: `${(folders.length + index) * 0.02}s` }}
        >
          <SimpleFileItem
            file={file}
            isSelected={selectedFiles.has(file.id)}
            isDragging={draggedFileId === file.id}
            viewMode={viewMode}
            onClick={(e) => onFileClick?.(file, e)}
            onDoubleClick={() => onFileDoubleClick?.(file)}
            onContextMenu={(e) => onFileContextMenu?.(file, e)}
          />
        </div>
      ))}
    </div>
  );
};

export default FileListView;
