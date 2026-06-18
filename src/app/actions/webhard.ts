'use server';

import { getSessionUser } from '@/lib/auth/session';
import { logger } from '@/lib/utils/logger';
import {
  serverInitializeCompanyFolders,
  serverGetFolderTemplate,
  serverUpdateFolderTemplate,
  serverGetFolderStatusMapping,
  serverUpdateFolderStatusMapping,
  serverGetExcludedFolders,
  serverUpdateExcludedFolders,
  serverGetAutoContactExcludedFolders,
  serverUpdateAutoContactExcludedFolders,
} from '@/lib/api/nestjs-server-client';
import type { FolderTemplateNode, FolderStatusMapping } from '@/lib/api/nestjs-server-client';

const webhardLogger = logger.createLogger('WEBHARD');

/**
 * 폴더 템플릿 조회 (관리자 전용)
 */
export async function getFolderTemplate(): Promise<{
  success: boolean;
  template?: FolderTemplateNode[];
  error?: string;
}> {
  try {
    const user = await getSessionUser();
    if (!user || user.userType !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    const template = await serverGetFolderTemplate();
    return { success: true, template };
  } catch (error) {
    webhardLogger.error('Exception in getFolderTemplate', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 폴더 템플릿 수정 (관리자 전용)
 */
export async function updateFolderTemplate(
  template: FolderTemplateNode[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getSessionUser();
    if (!user || user.userType !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    await serverUpdateFolderTemplate(template);

    webhardLogger.info('Folder template updated by admin');
    return { success: true };
  } catch (error) {
    webhardLogger.error('Exception in updateFolderTemplate', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 업체 사용자의 기본 폴더 구조 생성
 * - 업체명 폴더 (루트)
 *   - 올리기 폴더
 *     - 완료함 폴더
 *   - 내리기 폴더
 *
 * NestJS API 경유 (Prisma ORM)
 *
 * @param companyId - 업체 ID
 * @param companyName - 업체명
 * @param skipAuthCheck - 인증 체크를 건너뛸지 여부 (업체 등록 시 사용)
 */
export async function initializeCompanyFolders(
  companyId: number,
  companyName: string,
  skipAuthCheck: boolean = false
) {
  try {
    // 인증 체크 (업체 등록 시에는 건너뛰기)
    if (!skipAuthCheck) {
      const user = await getSessionUser();
      if (!user || user.userType !== 'company' || Number(user.userId) !== companyId) {
        return { success: false, error: 'Unauthorized' };
      }
    }

    const result = await serverInitializeCompanyFolders(companyId, companyName);

    if (!result.success) {
      webhardLogger.error('Failed to initialize company folders via NestJS', {
        companyId,
        companyName,
        error: result.error,
      });
      return { success: false, error: result.error };
    }

    webhardLogger.info('Company folders initialized via NestJS', {
      companyId,
      companyName,
    });

    return { success: true };
  } catch (error) {
    webhardLogger.error('Exception in initializeCompanyFolders', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============ Webhard Config Actions ============

/**
 * 폴더→문의상태 매핑 조회 (관리자 전용)
 */
export async function getFolderStatusMapping(): Promise<{
  success: boolean;
  mappings?: FolderStatusMapping[];
  error?: string;
}> {
  try {
    const user = await getSessionUser();
    if (!user || user.userType !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    const mappings = await serverGetFolderStatusMapping();
    return { success: true, mappings };
  } catch (error) {
    webhardLogger.error('Exception in getFolderStatusMapping', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 폴더→문의상태 매핑 수정 (관리자 전용)
 */
export async function updateFolderStatusMapping(
  mappings: FolderStatusMapping[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getSessionUser();
    if (!user || user.userType !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    await serverUpdateFolderStatusMapping(mappings);
    webhardLogger.info(`Folder status mapping updated: ${mappings.length} entries`);
    return { success: true };
  } catch (error) {
    webhardLogger.error('Exception in updateFolderStatusMapping', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 제외폴더 목록 조회 (관리자 전용)
 */
export async function getExcludedFolders(): Promise<{
  success: boolean;
  folders?: string[];
  error?: string;
}> {
  try {
    const user = await getSessionUser();
    if (!user || user.userType !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    const folders = await serverGetExcludedFolders();
    return { success: true, folders };
  } catch (error) {
    webhardLogger.error('Exception in getExcludedFolders', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 제외폴더 목록 수정 (관리자 전용)
 */
export async function updateExcludedFolders(
  folders: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getSessionUser();
    if (!user || user.userType !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    await serverUpdateExcludedFolders(folders);
    webhardLogger.info(`Excluded folders updated: ${folders.length} entries`);
    return { success: true };
  } catch (error) {
    webhardLogger.error('Exception in updateExcludedFolders', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 문의 자동생성 제외 폴더 목록 조회 (관리자 전용)
 */
export async function getAutoContactExcludedFolders(): Promise<{
  success: boolean;
  folders?: string[];
  error?: string;
}> {
  try {
    const user = await getSessionUser();
    if (!user || user.userType !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    const folders = await serverGetAutoContactExcludedFolders();
    return { success: true, folders };
  } catch (error) {
    webhardLogger.error('Exception in getAutoContactExcludedFolders', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 문의 자동생성 제외 폴더 목록 수정 (관리자 전용)
 */
export async function updateAutoContactExcludedFolders(
  folders: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getSessionUser();
    if (!user || user.userType !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    await serverUpdateAutoContactExcludedFolders(folders);
    webhardLogger.info(`Auto-contact excluded folders updated: ${folders.length} entries`);
    return { success: true };
  } catch (error) {
    webhardLogger.error('Exception in updateAutoContactExcludedFolders', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
