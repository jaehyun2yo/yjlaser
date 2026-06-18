'use client';

/**
 * WebhardBreadcrumb
 * 웹하드 폴더 경로 네비게이션
 * - Home 링크
 * - 폴더 경로 표시
 * - 새 파일 모드 표시
 */
import { memo } from 'react';
import { FaChevronRight, FaStar } from 'react-icons/fa';
import { formatInquiryFolderDisplayName } from '@/app/webhard/_lib/formatInquiryFolderDisplayName';
import { TEXT_COLOR } from '@/lib/styles';

export interface BreadcrumbFolder {
  id: string;
  name: string;
}

export interface WebhardBreadcrumbProps {
  /** Breadcrumb 경로 (폴더 배열) */
  breadcrumbPath: BreadcrumbFolder[];
  /** 현재 선택된 폴더 ID (null = 루트) */
  selectedFolderId: string | null;
  /** 새 파일 모드 여부 */
  isNewFilesMode: boolean;
  /** 폴더 선택 핸들러 */
  onFolderSelect: (folderId: string | null) => void;
  /** 추가 클래스명 */
  className?: string;
}

/**
 * 웹하드 브레드크럼 컴포넌트
 * 폴더 경로 네비게이션 표시
 */
export const WebhardBreadcrumb = memo(function WebhardBreadcrumb({
  breadcrumbPath,
  selectedFolderId,
  isNewFilesMode,
  onFolderSelect,
  className = '',
}: WebhardBreadcrumbProps) {
  // Home이 선택된 상태인지 확인 (새 파일 모드가 아니고 폴더 선택 안됨)
  const isHomeSelected = !isNewFilesMode && selectedFolderId === null;

  return (
    <nav
      aria-label="웹하드 경로"
      data-testid="webhard-breadcrumb"
      className={`flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap text-xs ${TEXT_COLOR.muted} ${className}`}
    >
      {/* Home 링크 - 항상 표시 */}
      <button
        type="button"
        className={`shrink-0 bg-transparent p-0 text-xs ${TEXT_COLOR.brandHover} transition-colors ${isHomeSelected ? TEXT_COLOR.brand : ''}`}
        aria-current={isHomeSelected ? 'page' : undefined}
        data-testid="breadcrumb-home"
        onClick={() => onFolderSelect(null)}
      >
        Home
      </button>

      {/* 새 파일 모드 */}
      {isNewFilesMode ? (
        <div className="flex items-center gap-2">
          <FaChevronRight className="text-[10px]" />
          <span className={`${TEXT_COLOR.brand} flex items-center gap-1`}>
            <FaStar className="text-yellow-500 text-[10px]" />새 파일
          </span>
        </div>
      ) : (
        // 일반 폴더 경로 표시
        breadcrumbPath.map((folder) => (
          <div key={folder.id} className="flex shrink-0 items-center gap-2">
            <FaChevronRight className="text-[10px]" />
            <button
              type="button"
              className={`shrink-0 bg-transparent p-0 text-xs ${TEXT_COLOR.brandHover} transition-colors ${selectedFolderId === folder.id ? TEXT_COLOR.brand : ''}`}
              aria-current={selectedFolderId === folder.id ? 'page' : undefined}
              data-testid={`breadcrumb-folder-${folder.id}`}
              onClick={() => onFolderSelect(folder.id)}
            >
              {formatInquiryFolderDisplayName(folder.name)}
            </button>
          </div>
        ))
      )}
    </nav>
  );
});

export default WebhardBreadcrumb;
