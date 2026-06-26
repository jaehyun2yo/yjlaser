/**
 * Webhard DTO Mappers & Utility Functions
 * DTO 변환 및 유틸리티 함수
 */

import type {
  WebhardFileDTO,
  WebhardFolderDTO,
  SearchResultDTO,
  TrashFileDTO,
  FolderTreeNodeDTO,
} from './types';

// ============ File Mappers ============

/**
 * WebhardFileDTO → TrashFileDTO 변환 (휴지통용)
 */
export function fileToTrashDTO(file: WebhardFileDTO, folderPath?: string): TrashFileDTO {
  const deletedAt = file.deleted_at ? new Date(file.deleted_at) : new Date();
  const daysUntilDelete = Math.max(
    0,
    30 - Math.floor((Date.now() - deletedAt.getTime()) / (1000 * 60 * 60 * 24))
  );

  return {
    ...file,
    days_until_delete: daysUntilDelete,
    folder_path: folderPath,
  };
}

// ============ Folder Mappers ============

/**
 * 폴더 목록을 트리 구조로 변환
 */
export function foldersToTreeDTO(
  folders: WebhardFolderDTO[],
  fileCounts?: Map<string, { total: number; undownloaded: number }>
): FolderTreeNodeDTO[] {
  // 폴더 ID로 빠른 조회를 위한 Map 생성
  const folderMap = new Map<string, FolderTreeNodeDTO>();

  // 모든 폴더를 TreeNode로 변환
  folders.forEach((folder) => {
    const counts = fileCounts?.get(folder.id);
    folderMap.set(folder.id, {
      id: folder.id,
      name: folder.name,
      parent_id: folder.parent_id,
      children: [],
      file_count: counts?.total,
      undownloaded_count: counts?.undownloaded,
    });
  });

  // 트리 구조 구축
  const rootNodes: FolderTreeNodeDTO[] = [];

  folderMap.forEach((node) => {
    if (node.parent_id && folderMap.has(node.parent_id)) {
      folderMap.get(node.parent_id)!.children.push(node);
    } else {
      rootNodes.push(node);
    }
  });

  // 각 레벨에서 이름순 정렬
  const sortChildren = (nodes: FolderTreeNodeDTO[]): void => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    nodes.forEach((node) => sortChildren(node.children));
  };

  sortChildren(rootNodes);

  return rootNodes;
}

// ============ Search Result Mappers ============

/**
 * WebhardFileDTO → SearchResultDTO 변환
 */
export function fileToSearchResultDTO(file: WebhardFileDTO): SearchResultDTO {
  return {
    id: file.id,
    name: file.name,
    type: 'file',
    size: file.size,
    folder_id: file.folder_id,
    original_name: file.original_name,
    created_at: file.created_at,
  };
}

/**
 * WebhardFolderDTO → SearchResultDTO 변환
 */
export function folderToSearchResultDTO(folder: WebhardFolderDTO): SearchResultDTO {
  return {
    id: folder.id,
    name: folder.name,
    type: 'folder',
    folder_id: folder.parent_id,
    created_at: folder.created_at,
  };
}

// ============ Utility Functions ============

/**
 * 파일 크기를 사람이 읽기 쉬운 형식으로 변환
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

/**
 * 날짜를 한국어 형식으로 변환
 */
export function formatDateKo(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
