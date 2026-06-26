/** Webhard NestJS server-side client functions. */

import { nestjsFetch } from './core.client';
import { PERMANENT_DELETE_APPROVAL } from '@/lib/api/permanent-delete-approval';
// ============ Files API ============

export interface BatchMoveResult {
  success: boolean;
  filesMoved?: number;
  error?: string;
}

interface BatchOperationApiResponse {
  success?: boolean;
  affected?: number;
  processed?: number;
  failed?: number;
  errors?: string[];
}

/**
 * 파일 배치 이동 (NestJS API)
 */
export async function serverBatchMoveFiles(
  fileIds: string[],
  targetFolderId: string | null
): Promise<BatchMoveResult> {
  const response = await nestjsFetch<BatchOperationApiResponse>('/files/batch/move', {
    method: 'POST',
    body: { fileIds, targetFolderId },
  });

  if (!response.ok) {
    return {
      success: false,
      error: `API error: ${response.status}`,
    };
  }

  if (response.data.success === false || (response.data.failed ?? 0) > 0) {
    return {
      success: false,
      filesMoved: response.data.processed ?? response.data.affected ?? 0,
      error: response.data.errors?.join(', ') || 'Batch move failed',
    };
  }

  return {
    success: true,
    filesMoved: response.data.processed ?? response.data.affected ?? 0,
  };
}

/**
 * 파일 배치 soft delete (NestJS API)
 */
export async function serverBatchDeleteFiles(
  fileIds: string[]
): Promise<{ success: boolean; deleted: number; error?: string }> {
  const response = await nestjsFetch<BatchOperationApiResponse>('/files/batch/delete', {
    method: 'POST',
    body: { fileIds },
  });

  if (!response.ok) {
    return { success: false, deleted: 0, error: `API error: ${response.status}` };
  }

  if (response.data.success === false || (response.data.failed ?? 0) > 0) {
    return {
      success: false,
      deleted: response.data.processed ?? response.data.affected ?? 0,
      error: response.data.errors?.join(', ') || 'Batch delete failed',
    };
  }

  return { success: true, deleted: response.data.processed ?? response.data.affected ?? 0 };
}

// ============ Folders API ============

export interface FolderMoveResult {
  success: boolean;
  folderId?: string;
  newParentId?: string | null;
  error?: string;
}

/**
 * 폴더 이동 (NestJS API)
 */
export async function serverMoveFolder(
  folderId: string,
  targetFolderId: string | null
): Promise<FolderMoveResult> {
  const response = await nestjsFetch<{ id: string; parent_id: string | null }>(
    `/folders/${folderId}/move`,
    {
      method: 'PATCH',
      body: { parentId: targetFolderId },
    }
  );

  if (!response.ok) {
    return { success: false, error: `API error: ${response.status}` };
  }

  return {
    success: true,
    folderId: response.data.id,
    newParentId: response.data.parent_id,
  };
}

/**
 * 업체 기본 폴더 구조 초기화 (NestJS API)
 */
export async function serverInitializeCompanyFolders(
  companyId: number,
  companyName: string
): Promise<{ success: boolean; error?: string }> {
  const response = await nestjsFetch<{ success: boolean; error?: string }>('/folders/initialize', {
    method: 'POST',
    body: { companyId, companyName },
    useApiKey: true,
  });

  if (!response.ok) {
    return { success: false, error: `API error: ${response.status}` };
  }

  return response.data;
}

// ============ Folder Template API ============

export interface FolderTemplateNode {
  name: string;
  children?: FolderTemplateNode[];
}

/**
 * 폴더 템플릿 조회 (NestJS API)
 */
export async function serverGetFolderTemplate(): Promise<FolderTemplateNode[]> {
  const response = await nestjsFetch<FolderTemplateNode[]>('/folders/template');

  if (!response.ok) {
    throw new Error(`Failed to get folder template: ${response.status}`);
  }

  return response.data;
}

/**
 * 폴더 템플릿 수정 (NestJS API)
 */
export async function serverUpdateFolderTemplate(
  template: FolderTemplateNode[]
): Promise<{ success: boolean }> {
  const response = await nestjsFetch<{ success: boolean }>('/folders/template', {
    method: 'PUT',
    body: { template },
  });

  if (!response.ok) {
    throw new Error(`Failed to update folder template: ${response.status}`);
  }

  return response.data;
}

// ============ Webhard Config API ============

export interface FolderStatusMapping {
  folderName: string;
  processStage: string;
}

/**
 * 폴더→문의상태 매핑 조회
 */
export async function serverGetFolderStatusMapping(): Promise<FolderStatusMapping[]> {
  const response = await nestjsFetch<FolderStatusMapping[]>('/folders/config/status-mapping');
  if (!response.ok) {
    throw new Error(`Failed to get folder status mapping: ${response.status}`);
  }
  return response.data;
}

/**
 * 폴더→문의상태 매핑 업데이트
 */
export async function serverUpdateFolderStatusMapping(
  mappings: FolderStatusMapping[]
): Promise<{ success: boolean }> {
  const response = await nestjsFetch<{ success: boolean }>('/folders/config/status-mapping', {
    method: 'PUT',
    body: { mappings },
  });
  if (!response.ok) {
    throw new Error(`Failed to update folder status mapping: ${response.status}`);
  }
  return response.data;
}

/**
 * 제외폴더 목록 조회
 */
export async function serverGetExcludedFolders(): Promise<string[]> {
  const response = await nestjsFetch<string[]>('/folders/config/excluded-folders');
  if (!response.ok) {
    throw new Error(`Failed to get excluded folders: ${response.status}`);
  }
  return response.data;
}

/**
 * 제외폴더 목록 업데이트
 */
export async function serverUpdateExcludedFolders(
  folders: string[]
): Promise<{ success: boolean }> {
  const response = await nestjsFetch<{ success: boolean }>('/folders/config/excluded-folders', {
    method: 'PUT',
    body: { folders },
  });
  if (!response.ok) {
    throw new Error(`Failed to update excluded folders: ${response.status}`);
  }
  return response.data;
}

/**
 * 문의 자동생성 제외폴더 목록 조회
 */
export async function serverGetAutoContactExcludedFolders(): Promise<string[]> {
  const response = await nestjsFetch<string[]>('/folders/config/auto-contact-excluded');
  if (!response.ok) {
    throw new Error(`Failed to get auto-contact excluded folders: ${response.status}`);
  }
  return response.data;
}

/**
 * 문의 자동생성 제외폴더 목록 업데이트
 */
export async function serverUpdateAutoContactExcludedFolders(
  folders: string[]
): Promise<{ success: boolean }> {
  const response = await nestjsFetch<{ success: boolean }>(
    '/folders/config/auto-contact-excluded',
    {
      method: 'PUT',
      body: { folders },
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to update auto-contact excluded folders: ${response.status}`);
  }
  return response.data;
}

// ============ Folders Query API ============

export interface ServerFolderInfo {
  id: string;
  name: string;
  parent_id: string | null;
  company_id: number | null;
  created_at: string;
}

interface ServerFolderTreeNode {
  id: string;
  name: string;
  parent_id: string | null;
  company_id?: number | null;
  children?: ServerFolderTreeNode[];
}

/**
 * 폴더 정보 조회 (NestJS API)
 */
export async function serverGetFolderById(folderId: string): Promise<ServerFolderInfo | null> {
  const response = await nestjsFetch<ServerFolderInfo>(`/folders/${folderId}`);

  if (!response.ok) return null;

  return response.data;
}

/**
 * 폴더 트리 조회 (NestJS API)
 */
export async function serverGetFolderTree(): Promise<ServerFolderTreeNode[]> {
  const response = await nestjsFetch<ServerFolderTreeNode[]>('/folders/tree');

  if (!response.ok) return [];

  return response.data;
}

/**
 * 업체별 폴더 목록 조회 (NestJS API)
 */
export async function serverGetFoldersByCompany(companyId: number): Promise<ServerFolderInfo[]> {
  const response = await nestjsFetch<{ folders: ServerFolderInfo[]; total: number }>(
    `/folders?companyId=${companyId}&includeAll=true`
  );

  if (!response.ok) return [];

  return response.data.folders;
}

/**
 * 폴더 조상 경로 조회 (NestJS API - breadcrumb용)
 */
export async function serverGetFolderAncestors(folderId: string): Promise<ServerFolderInfo[]> {
  const response = await nestjsFetch<{
    ancestors: ServerFolderInfo[];
    current: ServerFolderInfo;
  }>(`/folders/${folderId}/ancestors`);

  if (!response.ok) return [];

  return response.data.ancestors;
}

// ============ Company Webhard Info API ============

export interface CompanyWebhardInfo {
  companyName: string;
  webhardAccess: boolean;
  hasRootFolder: boolean;
}

/**
 * 업체 웹하드 접근 정보 조회 (NestJS API)
 */
export async function serverGetCompanyWebhardInfo(
  companyId: number
): Promise<CompanyWebhardInfo | null> {
  const response = await nestjsFetch<CompanyWebhardInfo>(`/folders/company-info/${companyId}`);

  if (!response.ok) return null;

  return response.data;
}

// ============ Batch Delete Folders API ============

/**
 * 폴더 배치 soft delete (NestJS API)
 */
export async function serverBatchDeleteFolders(folderIds: string[]): Promise<{
  success: boolean;
  foldersDeleted: number;
  filesDeleted: number;
  error?: string;
  code?: string;
  companyId?: number;
  companyName?: string;
  folderName?: string;
  redirectTo?: string;
}> {
  const response = await nestjsFetch<{
    foldersDeleted: number;
    filesDeleted: number;
    durationMs: number;
    message?: string;
    error?: string;
    code?: string;
    companyId?: number;
    companyName?: string;
    folderName?: string;
    redirectTo?: string;
  }>('/folders/batch-delete', {
    method: 'DELETE',
    body: { folderIds },
  });

  if (!response.ok) {
    return {
      success: false,
      foldersDeleted: 0,
      filesDeleted: 0,
      error: response.data.message || response.data.error || `API error: ${response.status}`,
      code: response.data.code,
      companyId: response.data.companyId,
      companyName: response.data.companyName,
      folderName: response.data.folderName,
      redirectTo: response.data.redirectTo,
    };
  }

  return {
    success: true,
    foldersDeleted: response.data.foldersDeleted,
    filesDeleted: response.data.filesDeleted,
  };
}

// ============ Trash API ============

/**
 * 휴지통 비우기 (NestJS API)
 */
export async function serverEmptyTrash(): Promise<{
  success: boolean;
  deleted: number;
  error?: string;
}> {
  const response = await nestjsFetch<{ deleted: number }>('/trash', {
    method: 'DELETE',
    body: PERMANENT_DELETE_APPROVAL,
  });

  if (!response.ok) {
    return { success: false, deleted: 0, error: `API error: ${response.status}` };
  }

  return { success: true, deleted: response.data.deleted };
}

/**
 * 휴지통 개수 조회 (NestJS API)
 */
export async function serverGetTrashCount(): Promise<number> {
  const response = await nestjsFetch<{ count: number }>('/trash/count');

  if (!response.ok) return 0;

  return response.data.count;
}

// ============ Files Query API ============

/**
 * 미다운로드 파일 카운트 (NestJS API - badge-counts 사용)
 */
export async function serverGetUndownloadedCount(companyId?: number): Promise<number> {
  const params = new URLSearchParams();
  if (companyId) params.set('companyId', String(companyId));
  const query = params.toString();

  const response = await nestjsFetch<{
    totalCount: number;
  }>(`/files/badge-counts${query ? `?${query}` : ''}`);

  if (!response.ok) return 0;

  return response.data.totalCount;
}

/**
 * 파일 목록 조회 (NestJS API)
 */
export async function serverGetFiles(
  companyId: number,
  options?: { folderId?: string; includeDeleted?: boolean }
): Promise<
  {
    id: string;
    name: string;
    original_name: string;
    size: number;
    mime_type: string;
    path: string;
    folder_id: string | null;
    is_downloaded: boolean;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    company_id: number | null;
  }[]
> {
  const params = new URLSearchParams();
  params.set('companyId', String(companyId));
  params.set('limit', '10000');
  if (options?.folderId) params.set('folderId', options.folderId);
  if (options?.includeDeleted) params.set('includeDeleted', 'true');

  const response = await nestjsFetch<{
    files: {
      id: string;
      name: string;
      original_name: string;
      size: number;
      mime_type: string;
      path: string;
      folder_id: string | null;
      is_downloaded: boolean;
      created_at: string;
      updated_at: string;
      deleted_at: string | null;
      company_id: number | null;
    }[];
    total: number;
  }>(`/files?${params.toString()}`);

  if (!response.ok) return [];

  return response.data.files;
}

/**
 * 폴더 자식 목록 조회 (NestJS API)
 */
export async function serverGetChildFolders(parentId: string | null): Promise<ServerFolderInfo[]> {
  const params = new URLSearchParams();
  if (parentId) params.set('parentId', parentId);

  const response = await nestjsFetch<ServerFolderInfo[]>(`/folders/children?${params.toString()}`);

  if (!response.ok) return [];

  return response.data;
}
