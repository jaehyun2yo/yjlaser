'use client';

/**
 * WebhardContextMenu
 * 웹하드 파일/폴더 우클릭 컨텍스트 메뉴
 * - 단일 파일: 다운로드, 이름 수정, 이동, 삭제
 * - 다중 선택: 다운로드, 이동, 삭제
 */
import { memo, forwardRef } from 'react';
import {
  FaArrowRight,
  FaDownload,
  FaEdit,
  FaEye,
  FaFolderPlus,
  FaLink,
  FaTrash,
} from 'react-icons/fa';
import type { WebhardFile } from '@/types/webhard';
import type { WebhardFolderItemFolder } from './WebhardFolderItem';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

export interface WebhardContextMenuProps {
  /** 메뉴 모드: file(파일 우클릭) | folder(폴더 우클릭) | empty-space(빈 공간 우클릭) */
  mode?: 'file' | 'folder' | 'empty-space';
  /** 대상 파일 (단일 선택 시) */
  file?: WebhardFile;
  /** 대상 폴더 (단일 선택 시) */
  folder?: WebhardFolderItemFolder;
  /** 선택된 파일 수 (다중 선택 시) */
  selectedCount?: number;
  /** 선택된 파일 ID 목록 */
  selectedFileIds?: string[];
  /** 메뉴 X 좌표 */
  x: number;
  /** 메뉴 Y 좌표 */
  y: number;
  /** 다운로드 클릭 핸들러 (단일 파일) */
  onDownload?: (file: WebhardFile) => void;
  /** 미리보기 클릭 핸들러 (단일 파일) */
  onPreview?: (file: WebhardFile) => void;
  /** 일괄 다운로드 클릭 핸들러 (다중 선택) */
  onBatchDownload?: () => void;
  /** 이름 수정 클릭 핸들러 */
  onRename?: (file: WebhardFile) => void;
  /** 폴더 이름 수정 클릭 핸들러 */
  onRenameFolder?: (folder: WebhardFolderItemFolder) => void;
  /** 삭제 클릭 핸들러 (단일 파일) */
  onDelete?: (fileId: string) => void;
  /** 삭제 클릭 핸들러 (단일 폴더) */
  onDeleteFolder?: (folderId: string) => void;
  /** 일괄 삭제 클릭 핸들러 (다중 선택) */
  onBatchDelete?: () => void;
  /** 이동 클릭 핸들러 (모달 열기) */
  onMove?: () => void;
  /** 공유 링크 생성 클릭 핸들러 */
  onCreateShareLink?: (file: WebhardFile) => void;
  /** 새 폴더 생성 클릭 핸들러 */
  onCreateFolder?: () => void;
  /** 메뉴 닫기 핸들러 */
  onClose: () => void;
  /** 외부 클릭 감지용 ref */
  contextMenuRef?: React.RefObject<HTMLDivElement | null>;
}

/**
 * 웹하드 컨텍스트 메뉴 컴포넌트
 * 파일/폴더 우클릭 시 표시되는 액션 메뉴
 * 다중 선택 시 선택된 항목에 대한 일괄 작업 지원
 */
export const WebhardContextMenu = memo(
  forwardRef<HTMLDivElement, WebhardContextMenuProps>(function WebhardContextMenu(
    {
      mode = 'file',
      file,
      folder,
      selectedCount = 0,
      selectedFileIds = [],
      x,
      y,
      onDownload,
      onPreview,
      onBatchDownload,
      onRename,
      onRenameFolder,
      onDelete,
      onDeleteFolder,
      onBatchDelete,
      onMove,
      onCreateShareLink,
      onCreateFolder,
      onClose,
      contextMenuRef,
    },
    ref
  ) {
    // ref 우선순위: 외부 ref > forwardRef
    const menuRef = contextMenuRef || ref;

    // 다중 선택 모드 여부
    const isMultiSelect = selectedCount > 1;
    const canDeleteSelection = isMultiSelect
      ? Boolean(onBatchDelete)
      : Boolean((file && onDelete) || (folder && onDeleteFolder));

    const handleDownload = () => {
      if (isMultiSelect && onBatchDownload) {
        onBatchDownload();
      } else if (file && onDownload) {
        onDownload(file);
      }
      onClose();
    };

    const handlePreview = () => {
      if (file && onPreview) {
        onPreview(file);
      }
      onClose();
    };

    const handleRename = () => {
      if (file && onRename) {
        onRename(file);
      } else if (folder && onRenameFolder) {
        onRenameFolder(folder);
      }
      // 이름 수정 후에는 메뉴를 닫지 않음 (인라인 편집)
    };

    const handleDelete = () => {
      if (isMultiSelect && onBatchDelete) {
        onBatchDelete();
      } else if (file && onDelete) {
        onDelete(file.id);
      } else if (folder && onDeleteFolder) {
        onDeleteFolder(folder.id);
      }
      onClose();
    };

    const handleMove = () => {
      if (onMove) {
        onMove();
      }
      onClose();
    };

    const handleCreateShareLink = () => {
      if (file && onCreateShareLink) {
        onCreateShareLink(file);
      }
      onClose();
    };

    const handleCreateFolder = () => {
      if (onCreateFolder) {
        onCreateFolder();
      }
      onClose();
    };

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
    };

    // 화면 경계를 고려한 위치 조정
    const menuWidth = 180;
    const menuHeight =
      mode === 'empty-space' ? 40 : mode === 'folder' ? 140 : isMultiSelect ? 140 : 260;
    const adjustedX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
    const adjustedY = y + menuHeight > window.innerHeight ? y - menuHeight : y;

    // 빈 공간 우클릭 모드: 새 폴더 만들기만 표시
    if (mode === 'empty-space') {
      return (
        <div
          ref={menuRef as React.Ref<HTMLDivElement>}
          className={`fixed z-50 ${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-lg shadow-lg py-1 min-w-[180px]`}
          style={{
            left: `${Math.max(0, adjustedX)}px`,
            top: `${Math.max(0, adjustedY)}px`,
          }}
          onClick={handleClick}
        >
          <button
            onClick={handleCreateFolder}
            className={`w-full px-4 py-2 text-left text-sm ${TEXT_COLOR.primary} ${BG_COLOR.hoverMuted} flex items-center gap-2 transition-colors`}
          >
            <FaFolderPlus className="text-xs" />
            <span>새 폴더 만들기</span>
          </button>
        </div>
      );
    }

    if (mode === 'folder') {
      return (
        <div
          ref={menuRef as React.Ref<HTMLDivElement>}
          className={`fixed z-50 ${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-lg shadow-lg py-1 min-w-[180px]`}
          style={{
            left: `${Math.max(0, adjustedX)}px`,
            top: `${Math.max(0, adjustedY)}px`,
          }}
          onClick={handleClick}
        >
          {isMultiSelect && (
            <div
              className={`px-4 py-2 text-xs ${TEXT_COLOR.muted} border-b ${BORDER_COLOR.default}`}
            >
              {selectedCount}개 항목 선택됨
            </div>
          )}

          {!isMultiSelect && folder && onRenameFolder && (
            <button
              onClick={handleRename}
              className={`w-full px-4 py-2 text-left text-sm ${TEXT_COLOR.primary} ${BG_COLOR.hoverMuted} flex items-center gap-2 transition-colors`}
            >
              <FaEdit className="text-xs" />
              <span>이름 변경</span>
            </button>
          )}

          {onMove && (
            <button
              onClick={handleMove}
              className={`w-full px-4 py-2 text-left text-sm ${TEXT_COLOR.primary} ${BG_COLOR.hoverMuted} flex items-center gap-2 transition-colors`}
            >
              <FaArrowRight className="text-xs" />
              <span>{isMultiSelect ? `${selectedCount}개 이동` : '이동'}</span>
            </button>
          )}

          {canDeleteSelection && (
            <button
              onClick={handleDelete}
              className={`w-full px-4 py-2 text-left text-sm ${TEXT_COLOR.error} ${BG_COLOR.hoverErrorSoft} flex items-center gap-2 transition-colors`}
            >
              <FaTrash className="text-xs" />
              <span>{isMultiSelect ? `${selectedCount}개 삭제` : '삭제'}</span>
            </button>
          )}
        </div>
      );
    }

    return (
      <div
        ref={menuRef as React.Ref<HTMLDivElement>}
        className={`fixed z-50 ${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-lg shadow-lg py-1 min-w-[180px]`}
        style={{
          left: `${Math.max(0, adjustedX)}px`,
          top: `${Math.max(0, adjustedY)}px`,
        }}
        onClick={handleClick}
      >
        {/* 선택된 항목 수 표시 (다중 선택 시) */}
        {isMultiSelect && (
          <div className={`px-4 py-2 text-xs ${TEXT_COLOR.muted} border-b ${BORDER_COLOR.default}`}>
            {selectedCount}개 항목 선택됨
          </div>
        )}

        {/* 다운로드 버튼 */}
        <button
          onClick={handleDownload}
          className={`w-full px-4 py-2 text-left text-sm ${TEXT_COLOR.primary} ${BG_COLOR.hoverMuted} flex items-center gap-2 transition-colors`}
        >
          <FaDownload className="text-xs" />
          <span>{isMultiSelect ? `${selectedCount}개 다운로드` : '다운로드'}</span>
        </button>

        {/* 미리보기 버튼 (단일 선택 시에만 표시) */}
        {!isMultiSelect && file && onPreview && (
          <button
            onClick={handlePreview}
            className={`w-full px-4 py-2 text-left text-sm ${TEXT_COLOR.primary} ${BG_COLOR.hoverMuted} flex items-center gap-2 transition-colors`}
          >
            <FaEye className="text-xs" />
            <span>미리보기</span>
          </button>
        )}

        {/* 이름 수정 버튼 (단일 선택 시에만 표시) */}
        {!isMultiSelect && file && onRename && (
          <button
            onClick={handleRename}
            className={`w-full px-4 py-2 text-left text-sm ${TEXT_COLOR.primary} ${BG_COLOR.hoverMuted} flex items-center gap-2 transition-colors`}
          >
            <FaEdit className="text-xs" />
            <span>이름 수정</span>
          </button>
        )}

        {/* 이동 버튼 */}
        {onMove && (
          <button
            onClick={handleMove}
            className={`w-full px-4 py-2 text-left text-sm ${TEXT_COLOR.primary} ${BG_COLOR.hoverMuted} flex items-center gap-2 transition-colors`}
          >
            <FaArrowRight className="text-xs" />
            <span>{isMultiSelect ? `${selectedCount}개 이동` : '이동'}</span>
          </button>
        )}

        {/* 공유 링크 생성 버튼 (단일 선택 시에만 표시) */}
        {!isMultiSelect && file && onCreateShareLink && (
          <button
            onClick={handleCreateShareLink}
            className={`w-full px-4 py-2 text-left text-sm ${TEXT_COLOR.primary} ${BG_COLOR.hoverMuted} flex items-center gap-2 transition-colors`}
          >
            <FaLink className="text-xs" />
            <span>공유 링크 생성</span>
          </button>
        )}

        {/* 삭제 버튼 */}
        {canDeleteSelection && (
          <button
            onClick={handleDelete}
            className={`w-full px-4 py-2 text-left text-sm ${TEXT_COLOR.error} ${BG_COLOR.hoverErrorSoft} flex items-center gap-2 transition-colors`}
          >
            <FaTrash className="text-xs" />
            <span>{isMultiSelect ? `${selectedCount}개 삭제` : '삭제'}</span>
          </button>
        )}
      </div>
    );
  })
);

export default WebhardContextMenu;
