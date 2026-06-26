/**
 * Webhard NestJS API Client
 *
 * NestJS 백엔드 API 호출을 위한 클라이언트
 * 항상 Next.js 프록시 (/api/webhard)를 통해 API 호출 (CSP 준수)
 */

import type {
  WebhardFileDTO,
  WebhardFolderDTO,
  FileListResponseDTO,
  FolderListResponseDTO,
  TrashFileDTO,
  BatchOperationResultDTO,
} from '@/app/webhard/_lib/types';
import { PERMANENT_DELETE_APPROVAL } from '@/lib/api/permanent-delete-approval';

// API Base URL - 항상 Next.js 프록시 사용 (CSP 준수)
const API_BASE = '/api/webhard';

/**
 * NestJS API 호출 헬퍼
 * 쿠키 기반 인증을 사용하므로 credentials: 'include' 필수
 */
async function webhardFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    credentials: 'include', // Cookie 전송
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `API Error: ${response.status}`);
  }

  return response.json();
}

// ============ Files API ============

export interface GetFilesParams {
  folderId?: string;
  companyId?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export async function getFiles(params: GetFilesParams): Promise<FileListResponseDTO> {
  const searchParams = new URLSearchParams();

  if (params.folderId) searchParams.set('folderId', params.folderId);
  if (params.companyId) searchParams.set('companyId', String(params.companyId));
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);

  return webhardFetch<FileListResponseDTO>(`/files?${searchParams.toString()}`);
}

export async function searchFiles(
  query: string,
  companyId?: number,
  limit?: number
): Promise<WebhardFileDTO[]> {
  const searchParams = new URLSearchParams({ query });
  if (companyId) searchParams.set('companyId', String(companyId));
  if (limit) searchParams.set('limit', String(limit));

  return webhardFetch<WebhardFileDTO[]>(`/files/search?${searchParams.toString()}`);
}

export interface PresignedUrlResponse {
  url: string;
  key: string;
  expiresAt: string;
  provider?: 'google_drive' | 'r2';
  uploadUrl?: string;
  uploadHeaders?: Record<string, string>;
  driveFileId?: string;
}

export async function getUploadPresignedUrl(
  filename: string,
  contentType: string,
  folderId?: string,
  companyId?: number
): Promise<PresignedUrlResponse> {
  return webhardFetch<PresignedUrlResponse>('/files/presigned-url', {
    method: 'POST',
    body: JSON.stringify({ filename, contentType, folderId, companyId }),
  });
}

export async function getBatchUploadPresignedUrls(
  files: { filename: string; contentType: string; folderId?: string; companyId?: number }[]
): Promise<{ urls: PresignedUrlResponse[] }> {
  return webhardFetch<{ urls: PresignedUrlResponse[] }>('/files/batch/upload', {
    method: 'POST',
    body: JSON.stringify({ files }),
  });
}

export async function confirmFileUpload(data: {
  key: string;
  name: string;
  originalName: string;
  size: number;
  mimeType: string;
  folderId?: string;
  companyId?: number;
  inquiryNumber?: string;
  storageProvider?: 'google_drive' | 'r2';
  driveFileId?: string;
}): Promise<WebhardFileDTO> {
  return webhardFetch<WebhardFileDTO>('/files/confirm', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getDownloadUrl(fileId: string): Promise<PresignedUrlResponse> {
  return webhardFetch<PresignedUrlResponse>(`/files/${fileId}/download`);
}

export async function renameFile(fileId: string, name: string): Promise<WebhardFileDTO> {
  return webhardFetch<WebhardFileDTO>(`/files/${fileId}/rename`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function moveFile(fileId: string, folderId: string | null): Promise<WebhardFileDTO> {
  return webhardFetch<WebhardFileDTO>(`/files/${fileId}/move`, {
    method: 'PATCH',
    body: JSON.stringify({ folderId }),
  });
}

export async function batchMoveFiles(
  fileIds: string[],
  targetFolderId: string | null
): Promise<BatchOperationResultDTO> {
  return webhardFetch<BatchOperationResultDTO>('/files/batch/move', {
    method: 'POST',
    body: JSON.stringify({ fileIds, targetFolderId }),
  });
}

export async function deleteFile(fileId: string): Promise<{ success: boolean }> {
  return webhardFetch<{ success: boolean }>(`/files/${fileId}`, {
    method: 'DELETE',
  });
}

export async function batchDeleteFiles(fileIds: string[]): Promise<BatchOperationResultDTO> {
  return webhardFetch<BatchOperationResultDTO>('/files/batch/delete', {
    method: 'POST',
    body: JSON.stringify({ fileIds }),
  });
}

// ============ Folders API ============

export interface GetFoldersParams {
  parentId?: string;
  companyId?: number;
  includeFileCounts?: boolean;
  includeAll?: boolean;
}

export async function getFolders(params: GetFoldersParams = {}): Promise<FolderListResponseDTO> {
  const searchParams = new URLSearchParams();

  if (params.parentId) searchParams.set('parentId', params.parentId);
  if (params.companyId) searchParams.set('companyId', String(params.companyId));
  if (params.includeFileCounts) searchParams.set('includeFileCounts', 'true');
  if (params.includeAll) searchParams.set('includeAll', 'true');

  return webhardFetch<FolderListResponseDTO>(`/folders?${searchParams.toString()}`);
}

export interface FolderTreeNode {
  id: string;
  name: string;
  parent_id: string | null;
  children: FolderTreeNode[];
  file_count?: number;
  undownloaded_count?: number;
}

export async function getFolderTree(): Promise<FolderTreeNode[]> {
  return webhardFetch<FolderTreeNode[]>('/folders/tree');
}

export interface FolderDetailResponse extends WebhardFolderDTO {
  subfolders: WebhardFolderDTO[];
  files: {
    id: string;
    name: string;
    original_name: string;
    size: number;
    mime_type: string;
    is_downloaded: boolean;
    created_at: string;
  }[];
}

export async function getFolderDetail(folderId: string): Promise<FolderDetailResponse> {
  return webhardFetch<FolderDetailResponse>(`/folders/${folderId}`);
}

export async function createFolder(
  name: string,
  parentId?: string,
  companyId?: number
): Promise<WebhardFolderDTO> {
  return webhardFetch<WebhardFolderDTO>('/folders', {
    method: 'POST',
    body: JSON.stringify({ name, parentId, companyId }),
  });
}

export async function renameFolder(folderId: string, name: string): Promise<WebhardFolderDTO> {
  return webhardFetch<WebhardFolderDTO>(`/folders/${folderId}/rename`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function moveFolder(
  folderId: string,
  parentId: string | null
): Promise<WebhardFolderDTO> {
  return webhardFetch<WebhardFolderDTO>(`/folders/${folderId}/move`, {
    method: 'PATCH',
    body: JSON.stringify({ parentId }),
  });
}

export async function deleteFolder(folderId: string): Promise<{ success: boolean }> {
  return webhardFetch<{ success: boolean }>(`/folders/${folderId}`, {
    method: 'DELETE',
  });
}

// ============ Trash API ============

export interface TrashListResponse {
  files: TrashFileDTO[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export async function getTrashFiles(
  companyId?: number,
  page?: number,
  limit?: number
): Promise<TrashListResponse> {
  const searchParams = new URLSearchParams();

  if (companyId) searchParams.set('companyId', String(companyId));
  if (page) searchParams.set('page', String(page));
  if (limit) searchParams.set('limit', String(limit));

  return webhardFetch<TrashListResponse>(`/trash?${searchParams.toString()}`);
}

export async function getTrashCount(): Promise<{ count: number }> {
  return webhardFetch<{ count: number }>('/trash/count');
}

export async function restoreFile(fileId: string): Promise<{ success: boolean }> {
  return webhardFetch<{ success: boolean }>(`/trash/${fileId}/restore`, {
    method: 'POST',
  });
}

export async function permanentlyDeleteFile(fileId: string): Promise<{ success: boolean }> {
  return webhardFetch<{ success: boolean }>(`/trash/${fileId}`, {
    method: 'DELETE',
    body: JSON.stringify(PERMANENT_DELETE_APPROVAL),
  });
}

export async function emptyTrash(): Promise<{ deleted: number }> {
  return webhardFetch<{ deleted: number }>('/trash', {
    method: 'DELETE',
    body: JSON.stringify(PERMANENT_DELETE_APPROVAL),
  });
}

// ============ Storage API ============

export interface StorageUsageResponse {
  active: number;
  trash: number;
  current: number;
  max: number;
  companyId?: number;
  percentage?: number;
  activePercentage?: number;
  trashPercentage?: number;
}

export interface StorageBreakdownByCompany {
  companyId: number;
  companyName: string;
  used: number;
  fileCount: number;
}

export interface StorageBreakdownByFolder {
  folderId: string;
  folderName: string;
  used: number;
  fileCount: number;
}

export interface StorageBreakdownResponse {
  total: number;
  byCompany?: StorageBreakdownByCompany[];
  byFolder?: StorageBreakdownByFolder[];
}

export async function getStorageUsage(companyId?: number): Promise<StorageUsageResponse> {
  const searchParams = new URLSearchParams();
  if (companyId) searchParams.set('companyId', String(companyId));
  const query = searchParams.toString();
  return webhardFetch<StorageUsageResponse>(`/storage${query ? `?${query}` : ''}`);
}

export async function getStorageBreakdown(): Promise<StorageBreakdownResponse> {
  return webhardFetch<StorageBreakdownResponse>('/storage/breakdown');
}

// ============ Badge Counts API ============

export interface BadgeCountsResponse {
  totalCount: number;
  companyId?: number;
  folderCounts?: Record<string, number>;
}

export async function getBadgeCounts(
  companyId?: number,
  includeFolderCounts?: boolean
): Promise<BadgeCountsResponse> {
  const searchParams = new URLSearchParams();
  if (companyId) searchParams.set('companyId', String(companyId));
  if (includeFolderCounts) searchParams.set('includeFolderCounts', 'true');
  const query = searchParams.toString();
  return webhardFetch<BadgeCountsResponse>(`/files/badge-counts${query ? `?${query}` : ''}`);
}

// ============ New Files API ============

export interface GetNewFilesParams {
  companyId?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export async function getNewFiles(params: GetNewFilesParams = {}): Promise<FileListResponseDTO> {
  const searchParams = new URLSearchParams();
  if (params.companyId) searchParams.set('companyId', String(params.companyId));
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);
  const query = searchParams.toString();
  return webhardFetch<FileListResponseDTO>(`/files/new${query ? `?${query}` : ''}`);
}

// ============ Folder Ancestors API ============

export interface FolderAncestorsResponse {
  ancestors: WebhardFolderDTO[];
  current: WebhardFolderDTO;
}

export async function getFolderAncestors(folderId: string): Promise<FolderAncestorsResponse> {
  return webhardFetch<FolderAncestorsResponse>(`/folders/${folderId}/ancestors`);
}

// ============ Search API (Unified) ============

export interface UnifiedSearchResponse {
  files: WebhardFileDTO[];
  folders: WebhardFolderDTO[];
  total: number;
}

export async function searchAll(
  query: string,
  companyId?: number,
  limit?: number
): Promise<UnifiedSearchResponse> {
  const searchParams = new URLSearchParams({ q: query });
  if (companyId) searchParams.set('companyId', String(companyId));
  if (limit) searchParams.set('limit', String(limit));
  return webhardFetch<UnifiedSearchResponse>(`/search?${searchParams.toString()}`);
}

// ============ Settings API ============

export interface WebhardSettingsResponse {
  userId: string;
  fontSize: string;
  notificationsEnabled: boolean;
  downloadFolderPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateSettingsParams {
  fontSize?: string;
  notificationsEnabled?: boolean;
  downloadFolderPath?: string;
}

export async function getSettings(): Promise<WebhardSettingsResponse> {
  return webhardFetch<WebhardSettingsResponse>('/settings');
}

export async function updateSettings(
  params: UpdateSettingsParams
): Promise<WebhardSettingsResponse> {
  return webhardFetch<WebhardSettingsResponse>('/settings', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ============ Mark Downloaded API ============

export interface MarkDownloadedParams {
  fileIds?: string[];
  folderId?: string;
  markAll?: boolean;
}

export interface MarkDownloadedResponse {
  success: boolean;
  updatedCount: number;
}

export async function markFilesDownloaded(
  params: MarkDownloadedParams
): Promise<MarkDownloadedResponse> {
  return webhardFetch<MarkDownloadedResponse>('/files/mark-downloaded', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ============ Type exports for backward compatibility ============
export type {
  WebhardFileDTO,
  WebhardFolderDTO,
  FileListResponseDTO,
  FolderListResponseDTO,
  TrashFileDTO,
  BatchOperationResultDTO,
};
