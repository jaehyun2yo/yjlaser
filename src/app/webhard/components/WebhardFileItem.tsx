'use client';

/**
 * WebhardFileItem
 * 웹하드 파일 리스트 아이템 (리스트 뷰용)
 * - 파일 정보 표시 (아이콘, 이름, 날짜, 업로더)
 * - 선택/편집 상태 관리
 * - 드래그 앤 드롭
 * - 컨텍스트 메뉴
 * - 업로드 중 파일 진행률 표시
 */
import { memo, RefObject } from 'react';
import { FaDownload, FaTrash, FaSpinner, FaExclamationTriangle, FaFolder } from 'react-icons/fa';
import { getFileIcon } from '@/lib/utils/fileIcons';
import { WEBHARD_STYLES, TEXT_COLOR, BG_COLOR } from '@/lib/styles';
import type { WebhardFile } from '@/types/webhard';
import { isPendingFile, type FileListItem } from '@/app/webhard/_lib/types';
import { Badge } from '@/components/Badge';
import { useWebhardHighlightStore } from '@/store/webhard/useWebhardHighlightStore';

export interface WebhardFileItemProps {
  /** 파일 데이터 (일반 파일 또는 업로드 중인 임시 파일) */
  file: (WebhardFile & { folder_path?: string }) | FileListItem;
  /** 파일 인덱스 */
  index: number;
  /** 선택 여부 */
  isSelected: boolean;
  /** 편집 모드 여부 */
  isEditing: boolean;
  /** 편집 중인 파일명 */
  editingFileName: string;
  /** 편집 입력 ref */
  editInputRef?: RefObject<HTMLInputElement | null>;
  /** 드래그 중 여부 */
  isDragging: boolean;
  /** 드래그 선택 중 여부 */
  isDragSelecting: boolean;
  /** 새 파일 모드 여부 */
  isNewFilesMode: boolean;
  /** 새 파일 여부 */
  isNew: boolean;
  /** 미리보기 가능 여부 */
  canPreview: boolean;
  /** 파일명 컬럼 너비 (%) */
  fileNameColWidth: number;
  /** 날짜 컬럼 너비 (%) */
  dateColWidth: number;
  /** 드래그 시작 핸들러 */
  onDragStart: (e: React.DragEvent) => void;
  /** 드래그 종료 핸들러 */
  onDragEnd: (e: React.DragEvent) => void;
  /** 클릭 핸들러 */
  onClick: (e: React.MouseEvent) => void;
  /** 더블클릭 핸들러 */
  onDoubleClick: () => void;
  /** 컨텍스트 메뉴 핸들러 */
  onContextMenu: (e: React.MouseEvent) => void;
  /** 마우스 진입 핸들러 */
  onMouseEnter: (e: React.MouseEvent) => void;
  /** 마우스 이동 핸들러 */
  onMouseMove: (e: React.MouseEvent) => void;
  /** 마우스 퇴장 핸들러 */
  onMouseLeave: () => void;
  /** 체크박스 변경 핸들러 */
  onCheckboxChange: (checked: boolean) => void;
  /** 편집 내용 변경 핸들러 */
  onEditChange: (value: string) => void;
  /** 편집 블러 핸들러 */
  onEditBlur: () => void;
  /** 편집 키다운 핸들러 */
  onEditKeyDown: (e: React.KeyboardEvent) => void;
  /** 다운로드 핸들러 */
  onDownload: () => void;
  /** 삭제 핸들러 */
  onDelete?: () => void;
  /** 삭제 버튼 노출 여부 */
  canDelete?: boolean;
  /** 폴더 경로 클릭 시 해당 폴더로 이동 (새파일 모드 전용) */
  onFolderNavigate?: (folderId: string) => void;
}

/**
 * 웹하드 파일 아이템 컴포넌트
 * 리스트 뷰에서 단일 파일을 표시
 */
export const WebhardFileItem = memo(function WebhardFileItem({
  file,
  isSelected,
  isEditing,
  editingFileName,
  editInputRef,
  isDragging,
  isDragSelecting,
  isNewFilesMode,
  isNew,
  fileNameColWidth,
  dateColWidth,
  onDragStart,
  onDragEnd,
  onClick,
  onDoubleClick,
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
  canDelete = true,
  onFolderNavigate,
}: WebhardFileItemProps) {
  // 업로드 중인 파일인지 확인
  const isPending = isPendingFile(file);
  const uploadProgress = isPending ? file.uploadProgress : null;
  const uploadStatus = isPending ? file.uploadStatus : null;
  const uploadError = isPending ? file.uploadError : null;

  // 검색 결과 하이라이트 상태
  const { highlightedId, highlightType } = useWebhardHighlightStore();
  const isHighlighted = highlightedId === file.id && highlightType === 'file';

  // 드래그 스타일
  const draggingClass = isDragging ? 'opacity-50' : '';
  // 선택 스타일
  const selectedClass = isSelected ? `${BG_COLOR.brandLight} border-brand` : '';
  // 업로드 중 스타일
  const pendingClass = isPending ? 'opacity-70' : '';
  // 업로드 실패 스타일
  const failedClass = uploadStatus === 'failed' ? `${BG_COLOR.error} border-red-300` : '';
  // 검색 결과 하이라이트 스타일 (3초간 강조)
  const highlightClass = isHighlighted ? `ring-2 ring-blue-500 ${BG_COLOR.info} animate-pulse` : '';

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onCheckboxChange(e.target.checked);
  };

  const handleDownloadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDownload();
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.();
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      data-file-item
      data-file-id={file.id}
      draggable={!isPending}
      onDragStart={!isPending ? onDragStart : undefined}
      onDragEnd={!isPending ? onDragEnd : undefined}
      onClick={!isPending ? onClick : undefined}
      onDoubleClick={!isPending ? onDoubleClick : undefined}
      onContextMenu={!isPending ? onContextMenu : undefined}
      onMouseEnter={!isDragSelecting && !isPending ? onMouseEnter : undefined}
      onMouseMove={!isDragSelecting && !isPending ? onMouseMove : undefined}
      onMouseLeave={!isDragSelecting && !isPending ? onMouseLeave : undefined}
      className={`${WEBHARD_STYLES.fileRow.base} ${isPending ? 'cursor-default' : 'cursor-pointer'} ${draggingClass} ${selectedClass} ${pendingClass} ${failedClass} ${highlightClass} relative overflow-hidden`}
    >
      {/* 업로드 진행률 바 (배경) */}
      {isPending && uploadStatus !== 'failed' && uploadProgress !== null && (
        <div
          className={`absolute inset-y-0 left-0 ${BG_COLOR.brandLight} transition-all duration-300 ease-out z-0`}
          style={{ width: `${uploadProgress}%` }}
        />
      )}
      {/* 체크박스 (고정 40px) */}
      <div className="w-10 shrink-0 z-10" onClick={handleCheckboxClick}>
        {isPending ? (
          // 업로드 중일 때는 스피너 또는 상태 아이콘 표시
          uploadStatus === 'failed' ? (
            <FaExclamationTriangle
              className="text-red-500 text-sm"
              title={uploadError || '업로드 실패'}
            />
          ) : (
            <FaSpinner className="text-orange-500 text-sm animate-spin" title="업로드 중..." />
          )
        ) : (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={handleCheckboxChange}
            className="rounded"
          />
        )}
      </div>

      {/* 파일명 (가변 너비) */}
      <div
        className="flex items-center gap-2 min-w-0 z-10"
        style={{ width: `calc(${fileNameColWidth}% - 40px)` }}
      >
        {isNew && !isPending && <Badge count="N" size="sm" />}
        <span
          className="text-sm shrink-0 inline-flex items-center justify-center w-4 h-4"
          title={file.mime_type}
        >
          {getFileIcon(file.mime_type, file.original_name, 'sm')}
        </span>
        {isEditing ? (
          <input
            ref={editInputRef}
            type="text"
            value={editingFileName}
            onChange={(e) => onEditChange(e.target.value)}
            onBlur={onEditBlur}
            onKeyDown={onEditKeyDown}
            className={`flex-1 px-2 py-1 text-sm border border-brand rounded ${BG_COLOR.card} ${TEXT_COLOR.primary} focus:outline-none focus:ring-2 focus:ring-brand`}
            onClick={handleEditClick}
          />
        ) : (
          <div className="flex flex-col min-w-0 flex-1">
            <span
              className={`text-sm ${WEBHARD_STYLES.fileName} truncate`}
              title={file.original_name}
            >
              {file.original_name}
            </span>
            {/* 새 파일 모드에서 폴더 경로 표시 (클릭 시 해당 폴더로 이동) */}
            {isNewFilesMode && 'folder_path' in file && file.folder_path && (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-brand transition-colors truncate max-w-full text-left"
                title={`${file.folder_path} 폴더로 이동`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onFolderNavigate && 'folder_id' in file && file.folder_id) {
                    onFolderNavigate(file.folder_id);
                  }
                }}
              >
                <FaFolder className="shrink-0 text-[10px]" />
                <span className="truncate">{file.folder_path}</span>
              </button>
            )}
            {/* 업로드 실패 시 에러 메시지 표시 */}
            {isPending && uploadStatus === 'failed' && uploadError && (
              <span className="text-xs text-red-500 truncate" title={uploadError}>
                ⚠️ {uploadError}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 업로드날짜 (가변 너비) */}
      <div
        className={`shrink-0 ${WEBHARD_STYLES.fileMeta} pl-3 pr-3 z-10`}
        style={{ width: `${dateColWidth}%`, minWidth: '110px' }}
      >
        {isPending ? (
          // 업로드 중일 때는 진행률 표시
          <span className={`${TEXT_COLOR.brand} font-medium`}>
            {uploadStatus === 'failed' ? '실패' : `${uploadProgress || 0}%`}
          </span>
        ) : (
          new Date(file.created_at).toLocaleDateString('ko-KR')
        )}
      </div>

      {/* 업로더 (나머지 공간, 최소 15%) */}
      <div className="flex-1 min-w-[80px] flex items-center gap-1 pl-4 z-10">
        {isPending ? (
          // 업로드 중일 때는 상태 텍스트 표시
          <span className={`${WEBHARD_STYLES.fileMeta} truncate flex-1 min-w-0`}>
            {uploadStatus === 'failed' ? (
              <span className="text-red-500">업로드 실패</span>
            ) : uploadStatus === 'uploading' ? (
              <span className="text-orange-500">업로드 중...</span>
            ) : uploadStatus === 'completed' ? (
              <span className="text-green-500">완료</span>
            ) : (
              <span className="text-gray-400">대기 중...</span>
            )}
          </span>
        ) : (
          <>
            <span className={`${WEBHARD_STYLES.fileMeta} truncate flex-1 min-w-0`}>
              {isNewFilesMode && 'uploader_display_name' in file && file.uploader_display_name
                ? file.uploader_display_name
                : file.companies?.manager_name || file.companies?.company_name || '-'}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleDownloadClick}
                className={WEBHARD_STYLES.fileActionButton}
                title="다운로드"
              >
                <FaDownload className="text-xs" />
              </button>
              {canDelete && onDelete && (
                <button
                  onClick={handleDeleteClick}
                  className={`p-1.5 ${BG_COLOR.hoverError} rounded ${TEXT_COLOR.error} transition-colors`}
                  title="삭제"
                >
                  <FaTrash className="text-xs" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
});

export default WebhardFileItem;
