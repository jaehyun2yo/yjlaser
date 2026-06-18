'use client';

/**
 * Breadcrumb
 * Folder path navigation component
 * - Home link
 * - Folder path display
 * - New files mode display
 */

import { memo } from 'react';
import type { BreadcrumbFolder } from '@/lib/webhard-ui/types';
import { TEXT_COLOR } from '@/lib/styles';

export interface BreadcrumbProps {
  /** Breadcrumb path (folder array) */
  breadcrumbPath: BreadcrumbFolder[];
  /** Currently selected folder ID (null = root) */
  selectedFolderId: string | null;
  /** New files mode */
  isNewFilesMode?: boolean;
  /** Folder select handler */
  onFolderSelect: (folderId: string | null) => void;
  /** Home label */
  homeLabel?: string;
  /** New files label */
  newFilesLabel?: string;
  /** Separator icon component */
  separatorIcon?: React.ReactNode;
  /** New files icon component */
  newFilesIcon?: React.ReactNode;
  /** Additional class name */
  className?: string;
  /** Active color class */
  activeColorClass?: string;
}

/**
 * Default separator icon
 */
const DefaultSeparator = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

/**
 * Default new files icon
 */
const DefaultNewFilesIcon = () => (
  <svg className="w-3 h-3 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  </svg>
);

/**
 * Breadcrumb component
 */
export const Breadcrumb = memo(function Breadcrumb({
  breadcrumbPath,
  selectedFolderId,
  isNewFilesMode = false,
  onFolderSelect,
  homeLabel = 'Home',
  newFilesLabel = 'New Files',
  separatorIcon,
  newFilesIcon,
  className = '',
  activeColorClass = 'text-orange-500',
}: BreadcrumbProps) {
  // Check if Home is selected (not new files mode and no folder selected)
  const isHomeSelected = !isNewFilesMode && selectedFolderId === null;

  const Separator = separatorIcon || <DefaultSeparator />;
  const NewFilesIcon = newFilesIcon || <DefaultNewFilesIcon />;

  return (
    <nav
      className={`flex items-center gap-2 text-xs ${TEXT_COLOR.secondary} overflow-x-auto whitespace-nowrap ${className}`}
      aria-label="Breadcrumb"
    >
      {/* Home link - always visible */}
      <button
        type="button"
        className={`cursor-pointer hover:${activeColorClass} transition-colors ${isHomeSelected ? activeColorClass : ''}`}
        onClick={() => onFolderSelect(null)}
        aria-current={isHomeSelected ? 'page' : undefined}
      >
        {homeLabel}
      </button>

      {/* New files mode */}
      {isNewFilesMode ? (
        <div className="flex items-center gap-2">
          {Separator}
          <span className={`${activeColorClass} flex items-center gap-1`}>
            {NewFilesIcon}
            {newFilesLabel}
          </span>
        </div>
      ) : (
        // Normal folder path display
        breadcrumbPath.map((folder) => (
          <div key={folder.id} className="flex items-center gap-2">
            {Separator}
            <button
              type="button"
              className={`cursor-pointer hover:${activeColorClass} transition-colors ${selectedFolderId === folder.id ? activeColorClass : ''}`}
              onClick={() => onFolderSelect(folder.id)}
              aria-current={selectedFolderId === folder.id ? 'page' : undefined}
            >
              {folder.name}
            </button>
          </div>
        ))
      )}
    </nav>
  );
});

export default Breadcrumb;
