/**
 * Webhard UI Library
 *
 * Portable, reusable file manager UI components and hooks
 * No external state management dependencies (Zustand-free)
 *
 * @example
 * ```tsx
 * import {
 *   // Components
 *   Breadcrumb,
 *   VirtualFileList,
 *   Toolbar,
 *   // Hooks
 *   useSelection,
 *   useFileSort,
 *   // Types
 *   FileDTO,
 *   FolderDTO,
 * } from '@/lib/webhard-ui';
 * ```
 */

// ============ Types ============
export type {
  // Core types
  FileDTO,
  FolderDTO,
  SearchResultDTO,
  // Sort
  SortConfig,
  SortBy,
  SortOrder,
  // UI State
  BoundingRect,
  ProgressItem,
  DownloadItem,
  ContextMenuState,
} from './types';

// ============ Hooks ============
export {
  // Selection
  useSelection,
  // Drag selection
  useDragSelection,
  // Column resize
  useColumnResize,
  // File sorting
  useFileSort,
  // Keyboard shortcuts
  useKeyboardShortcuts,
  // Context menu
  useContextMenu,
  // Sidebar resize
  useSidebarResize,
  // File operations
  useFileOperations,
  // File upload
  useFileUpload,
  // Batch download
  useBatchDownload,
  // File rename
  useFileRename,
} from './hooks';

// Note: Hook types are inferred from usage, not exported separately

// ============ Components ============
export {
  // Navigation
  Breadcrumb,
  // Empty state
  EmptyState,
  // Toolbar
  Toolbar,
  // Column header
  ColumnHeader,
  // Sidebar resizer
  SidebarResizer,
  // Search dropdown
  SearchDropdown,
  // Storage usage
  StorageUsage,
  // File list skeleton
  FileListSkeleton,
  // Drag selection
  DragSelection,
  // Virtual file list
  VirtualFileList,
  VirtualFileGrid,
  // File preview tooltip
  FilePreviewTooltip,
  useFilePreview,
} from './components';

// Component types
export type {
  BreadcrumbProps,
  EmptyStateProps,
  ToolbarProps,
  ToolbarAction,
  ColumnHeaderProps,
  ColumnConfig,
  SidebarResizerProps,
  SearchDropdownProps,
  StorageUsageProps,
  FileListSkeletonProps,
  DragSelectionProps,
  VirtualFileListProps,
  VirtualFileGridProps,
  FileItemRenderProps,
  FilePreviewTooltipProps,
  UseFilePreviewReturn,
} from './components';
