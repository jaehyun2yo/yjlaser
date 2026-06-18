/**
 * 웹하드 캐시 유틸리티
 * Redis 캐시를 활용한 폴더/파일/회사 정보 캐싱
 *
 * NestJS API 경유 (Prisma ORM)
 */

import {
  serverGetFoldersByCompany,
  serverGetFolderById,
  serverGetFolderAncestors,
  serverGetUndownloadedCount,
  nestjsFetch,
} from '@/lib/api/nestjs-server-client';
import {
  getCached,
  setCache,
  deleteCache,
  cacheKeys,
  cacheTTL,
  invalidationPatterns,
} from './redis';

// 타입 정의
interface FolderTreeItem {
  id: string;
  name: string;
  parent_id: string | null;
  company_id: number | null;
  children?: FolderTreeItem[];
}

interface FolderInfo {
  id: string;
  name: string;
  parent_id: string | null;
  company_id: number | null;
  created_at: string;
}

interface CompanyInfo {
  id: number;
  company_name: string;
}

/**
 * 폴더 트리 캐시
 */
export const folderTreeCache = {
  /**
   * 폴더 트리 가져오기 (캐시 우선)
   */
  async get(companyId: number): Promise<FolderTreeItem[] | null> {
    const key = cacheKeys.folderTree(companyId);

    // 캐시 확인
    const cached = await getCached<FolderTreeItem[]>(key);
    if (cached) {
      return cached;
    }

    // NestJS API에서 조회
    const folders = await serverGetFoldersByCompany(companyId);

    if (!folders || folders.length === 0) {
      return null;
    }

    const data: FolderTreeItem[] = folders.map((f) => ({
      id: f.id,
      name: f.name,
      parent_id: f.parent_id,
      company_id: f.company_id,
    }));

    // 캐시 저장
    await setCache(key, data, cacheTTL.folderTree);

    return data;
  },

  /**
   * 폴더 트리 캐시 무효화
   */
  async invalidate(companyId: number): Promise<void> {
    const keys = invalidationPatterns.onFolderChange(companyId);
    await deleteCache(keys);
  },
};

/**
 * 폴더 경로 캐시
 */
export const folderPathCache = {
  /**
   * 폴더 경로 가져오기 (캐시 우선)
   */
  async get(folderId: string): Promise<string> {
    const key = cacheKeys.folderPath(folderId);

    // 캐시 확인
    const cached = await getCached<string>(key);
    if (cached) {
      return cached;
    }

    // NestJS API에서 조상 경로 조회
    const ancestors = await serverGetFolderAncestors(folderId);
    const currentFolder = await serverGetFolderById(folderId);

    const pathParts: string[] = ancestors.map((a) => a.name);
    if (currentFolder) {
      pathParts.push(currentFolder.name);
    }

    const path = '/' + pathParts.join('/');

    // 캐시 저장
    await setCache(key, path, cacheTTL.folderPath);

    return path;
  },

  /**
   * 폴더 경로 캐시 무효화
   */
  async invalidate(folderId: string): Promise<void> {
    await deleteCache([cacheKeys.folderPath(folderId)]);
  },
};

/**
 * 폴더 정보 캐시
 */
export const folderInfoCache = {
  /**
   * 폴더 정보 가져오기 (캐시 우선)
   */
  async get(folderId: string): Promise<FolderInfo | null> {
    const key = cacheKeys.folderInfo(folderId);

    // 캐시 확인
    const cached = await getCached<FolderInfo>(key);
    if (cached) {
      return cached;
    }

    // NestJS API에서 조회
    const folder = await serverGetFolderById(folderId);

    if (!folder) {
      return null;
    }

    const data: FolderInfo = {
      id: folder.id,
      name: folder.name,
      parent_id: folder.parent_id,
      company_id: folder.company_id,
      created_at: folder.created_at,
    };

    // 캐시 저장
    await setCache(key, data, cacheTTL.folderInfo);

    return data;
  },

  /**
   * 폴더 정보 캐시 무효화
   */
  async invalidate(folderId: string): Promise<void> {
    await deleteCache([cacheKeys.folderInfo(folderId)]);
  },
};

/**
 * 회사 정보 캐시
 */
export const companyInfoCache = {
  /**
   * 회사 정보 가져오기 (캐시 우선)
   */
  async get(companyId: number): Promise<CompanyInfo | null> {
    const key = cacheKeys.companyInfo(companyId);

    // 캐시 확인
    const cached = await getCached<CompanyInfo>(key);
    if (cached) {
      return cached;
    }

    // NestJS API에서 조회 (orders/companies/search 사용)
    const response = await nestjsFetch<{ id: number; companyName: string }[]>(
      '/orders/companies/search?q=&limit=1000',
      { useApiKey: true }
    );

    if (!response.ok || !response.data) {
      return null;
    }

    const company = response.data.find((c) => c.id === companyId);
    if (!company) {
      return null;
    }

    const data: CompanyInfo = {
      id: company.id,
      company_name: company.companyName,
    };

    // 캐시 저장
    await setCache(key, data, cacheTTL.companyInfo);

    return data;
  },

  /**
   * 회사 정보 캐시 무효화
   */
  async invalidate(companyId: number): Promise<void> {
    await deleteCache([cacheKeys.companyInfo(companyId)]);
  },
};

/**
 * 미다운로드 카운트 캐시
 */
export const undownloadedCountCache = {
  /**
   * 폴더별 미다운로드 카운트 가져오기 (캐시 우선)
   */
  async get(folderId: string | null): Promise<number> {
    const key = cacheKeys.undownloadedCount(folderId);

    // 캐시 확인
    const cached = await getCached<number>(key);
    if (cached !== null) {
      return cached;
    }

    // NestJS API에서 조회
    const result = await serverGetUndownloadedCount();

    // 캐시 저장
    await setCache(key, result, cacheTTL.undownloadedCount);

    return result;
  },

  /**
   * 미다운로드 카운트 캐시 무효화
   */
  async invalidate(folderId: string | null): Promise<void> {
    await deleteCache([cacheKeys.undownloadedCount(folderId)]);
  },
};

/**
 * 캐시 무효화 유틸리티
 */
export const cacheInvalidation = {
  /**
   * 파일 작업 후 관련 캐시 무효화
   */
  async onFileChange(folderId: string | null, companyId?: number, fileId?: string): Promise<void> {
    const keys = invalidationPatterns.onFileChange(folderId, companyId, fileId);
    await deleteCache(keys);
  },

  /**
   * 폴더 작업 후 관련 캐시 무효화
   */
  async onFolderChange(companyId: number, folderId?: string): Promise<void> {
    const keys = invalidationPatterns.onFolderChange(companyId, folderId);
    await deleteCache(keys);
  },

  /**
   * 회사 정보 변경 후 캐시 무효화
   */
  async onCompanyChange(companyId: number): Promise<void> {
    const keys = invalidationPatterns.onCompanyChange(companyId);
    await deleteCache(keys);
  },

  /**
   * 모든 웹하드 캐시 무효화 (관리용)
   */
  async invalidateAll(): Promise<void> {
    // 패턴 매칭으로 모든 웹하드 관련 캐시 삭제
    const { deleteCacheByPattern } = await import('./redis');
    await deleteCacheByPattern('webhard:*');
  },
};
