'use client';

/**
 * WebhardToolbar
 * 웹하드 파일 액션 버튼 툴바
 * - 확인처리 (다운로드 완료 표시)
 * - 다운로드
 * - 이동
 * - 삭제
 */
import { memo } from 'react';
import { FaCheckDouble, FaDownload, FaArrowRight, FaTrash } from 'react-icons/fa';
import { TEXT_COLOR, BG_COLOR } from '@/lib/styles';

export interface WebhardToolbarProps {
  /** 선택된 파일 수 */
  selectedCount: number;
  /** 폴더가 선택되어 있는지 여부 */
  hasFolderSelected?: boolean;
  /** 확인 처리 클릭 핸들러 */
  onMarkAllDownloaded: () => void;
  /** 다운로드 클릭 핸들러 */
  onDownload: () => void;
  /** 이동 클릭 핸들러 */
  onMove: () => void;
  /** 삭제 클릭 핸들러 */
  onDelete: () => void;
  /** 다운로드 진행 중 여부 */
  isDownloading?: boolean;
  /** 삭제 진행 중 여부 */
  isDeleting?: boolean;
  /** 삭제 버튼 노출 여부 */
  canDelete?: boolean;
  /** 이동 진행 중 여부 */
  isMoving?: boolean;
  /** 추가 클래스명 */
  className?: string;
}

/**
 * 웹하드 툴바 컴포넌트
 * 파일 선택 시 활성화되는 액션 버튼 모음
 */
export const WebhardToolbar = memo(function WebhardToolbar({
  selectedCount,
  hasFolderSelected = false,
  onMarkAllDownloaded,
  onDownload,
  onMove,
  onDelete,
  isDownloading = false,
  isDeleting = false,
  canDelete = true,
  isMoving = false,
  className = '',
}: WebhardToolbarProps) {
  const hasSelection = selectedCount > 0;

  // 버튼 스타일 헬퍼
  const getButtonStyle = (enabled: boolean, baseColor: string, hoverColor: string) => {
    if (enabled) {
      return `${baseColor} ${hoverColor} text-white`;
    }
    return `${BG_COLOR.muted} ${TEXT_COLOR.disabled} cursor-not-allowed`;
  };

  return (
    <div className={`flex items-center gap-2 flex-shrink-0 ${className}`}>
      {/* 선택된 파일 수 표시 */}
      {hasSelection && (
        <span className={`text-xs ${TEXT_COLOR.muted} mr-2`}>{selectedCount}개 선택</span>
      )}

      {/* 확인처리 버튼 - 항상 활성화 */}
      <button
        onClick={onMarkAllDownloaded}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors font-medium bg-green-500 hover:bg-green-600 text-white"
        title={hasSelection ? '선택한 파일 확인 처리' : '전체 새 파일 확인 처리 (N 뱃지 제거)'}
        aria-label={hasSelection ? '선택한 파일 확인 처리' : '전체 새 파일 확인 처리'}
      >
        <FaCheckDouble className="text-[10px]" aria-hidden="true" />
        <span className="hidden sm:inline">확인처리</span>
      </button>

      {/* 다운로드 버튼 (폴더 선택 시 비활성) */}
      <button
        onClick={onDownload}
        disabled={!hasSelection || isDownloading || hasFolderSelected}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors font-medium ${getButtonStyle(
          hasSelection && !isDownloading && !hasFolderSelected,
          BG_COLOR.brand,
          BG_COLOR.brandHover
        )}`}
        title={hasFolderSelected ? '폴더는 다운로드할 수 없습니다' : '선택한 파일 다운로드'}
        aria-label="선택한 파일 다운로드"
      >
        <FaDownload className="text-[10px]" aria-hidden="true" />
        <span className="hidden sm:inline">다운로드</span>
      </button>

      {/* 이동 버튼 (폴더 선택 시 비활성) */}
      <button
        onClick={onMove}
        disabled={!hasSelection || isMoving || hasFolderSelected}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors font-medium ${getButtonStyle(
          hasSelection && !isMoving && !hasFolderSelected,
          'bg-blue-500',
          'hover:bg-blue-600'
        )}`}
        title={hasFolderSelected ? '폴더는 이동할 수 없습니다' : '선택한 파일 이동'}
        aria-label="선택한 파일 이동"
      >
        <FaArrowRight className="text-[10px]" aria-hidden="true" />
        <span className="hidden sm:inline">이동</span>
      </button>

      {/* 삭제 버튼 */}
      {canDelete && (
        <button
          onClick={onDelete}
          disabled={!hasSelection || isDeleting}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors font-medium ${getButtonStyle(
            hasSelection && !isDeleting,
            'bg-red-500',
            'hover:bg-red-600'
          )}`}
          title="선택한 파일 삭제"
          aria-label="선택한 파일 삭제"
        >
          <FaTrash className="text-[10px]" aria-hidden="true" />
          <span className="hidden sm:inline">삭제</span>
        </button>
      )}
    </div>
  );
});

export default WebhardToolbar;
