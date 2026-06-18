/**
 * Webhard UI Types
 * Portable file/folder types for file manager UI components
 */

/**
 * File data type
 */
export interface FileDTO {
  id: string;
  name: string;
  original_name: string;
  size: number;
  mime_type: string;
  path: string;
  folder_id: string | null;
  company_id?: number | null;
  uploaded_by?: number;
  is_downloaded?: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;

  // Optional relationship data
  companies?: {
    company_name: string;
    manager_name?: string | null;
  } | null;

  // Optional computed fields
  folder_path?: string;
}

/**
 * Folder data type
 */
export interface FolderDTO {
  id: string;
  name: string;
  parent_id: string | null;
  company_id?: number | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;

  // Optional relationship data
  companies?: {
    company_name: string;
  } | null;

  // Optional computed fields
  file_count?: number;
  undownloaded_count?: number;
}

/**
 * Search result type
 */
export interface SearchResultDTO {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  folder_id?: string | null;
  original_name?: string;
  created_at?: string;
  path?: string;
}

/**
 * Sort configuration
 */
export type SortBy = 'name' | 'date' | 'size' | 'uploader';
export type SortOrder = 'asc' | 'desc';

export interface SortConfig {
  sortBy: SortBy;
  sortOrder: SortOrder;
}

/**
 * Selection state
 */
export interface SelectionState {
  selectedIds: Set<string>;
  lastClickedIndex: number | null;
}

/**
 * Bounding rect for drag selection
 */
export interface BoundingRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/**
 * Breadcrumb folder
 */
export interface BreadcrumbFolder {
  id: string;
  name: string;
}

/**
 * Progress item for operations
 */
export interface ProgressItem {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  error?: string;
}

/**
 * Download item with size tracking
 */
export interface DownloadItem extends ProgressItem {
  size: number;
  downloadedSize: number;
}

/**
 * Context menu state
 */
export interface ContextMenuState<T = FileDTO> {
  item: T;
  x: number;
  y: number;
}
