'use server';

import { getSessionUser } from '@/lib/auth/session';
import { logger } from '@/lib/utils/logger';
import { nestjsFetch } from '@/lib/api/nestjs-server-client';

const webhardLogger = logger.createLogger('WEBHARD_FOLDER_UPLOAD');

/**
 * 폴더명 정리 (파일명보다 느슨한 규칙 - 한글 자음/모음 허용)
 */
function sanitizeFolderName(folderName: string): string {
  // 경로 구분자 제거
  let sanitized = folderName.replace(/[/\\]/g, '_');

  // 위험한 특수 문자만 제거 (한글 자음/모음, 공백 등은 허용)

  sanitized = sanitized.replace(/[<>:"|?*\x00-\x1f]/g, '_');

  // 연속된 언더스코어 정리
  sanitized = sanitized.replace(/_+/g, '_');

  // 시작/끝 공백 및 언더스코어 제거
  sanitized = sanitized.trim().replace(/^_+|_+$/g, '');

  // 빈 문자열 방지
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    sanitized = 'unnamed_folder';
  }

  return sanitized;
}

/**
 * NestJS API를 통해 폴더 경로를 생성 또는 가져오기
 * 예: "parent/child/grandchild" -> 각 레벨의 폴더 ID를 반환
 */
async function ensureFolderPath(
  companyId: number | null,
  parentFolderId: string | null,
  folderPath: string
): Promise<string> {
  if (!folderPath || folderPath === '.') {
    return parentFolderId || '';
  }

  const pathParts = folderPath.split('/').filter(Boolean);
  let currentParentId: string | null = parentFolderId || null;

  for (const folderName of pathParts) {
    const sanitizedName = sanitizeFolderName(folderName);

    webhardLogger.debug('Looking for folder', {
      folderName: sanitizedName,
      parentId: currentParentId,
      companyId,
    });

    // NestJS API를 통해 자식 폴더 조회
    const params = new URLSearchParams();
    if (currentParentId) params.set('parentId', currentParentId);
    if (companyId !== null) params.set('companyId', String(companyId));

    const childrenResponse = await nestjsFetch<
      { id: string; name: string; parent_id: string | null }[]
    >(`/folders/children?${params.toString()}`);

    let existingFolder: { id: string } | undefined;
    if (childrenResponse.ok && Array.isArray(childrenResponse.data)) {
      existingFolder = childrenResponse.data.find((f) => f.name === sanitizedName);
    }

    if (existingFolder) {
      currentParentId = existingFolder.id;
      webhardLogger.debug('Found existing folder', {
        folderName: sanitizedName,
        folderId: existingFolder.id,
      });
    } else {
      // NestJS API를 통해 새 폴더 생성
      const createResponse = await nestjsFetch<{ id: string; name: string }>('/folders', {
        method: 'POST',
        body: {
          name: sanitizedName,
          parentId: currentParentId || undefined,
          companyId: companyId,
        },
      });

      if (!createResponse.ok || !createResponse.data) {
        // 중복 폴더 가능 (race condition) - 재시도 조회
        webhardLogger.warn('Folder creation failed, retrying query', {
          folderName: sanitizedName,
          status: createResponse.status,
        });

        const retryResponse = await nestjsFetch<
          { id: string; name: string; parent_id: string | null }[]
        >(`/folders/children?${params.toString()}`);

        if (retryResponse.ok && Array.isArray(retryResponse.data)) {
          const retryFolder = retryResponse.data.find((f) => f.name === sanitizedName);
          if (retryFolder) {
            currentParentId = retryFolder.id;
            continue;
          }
        }

        throw new Error(`폴더 생성 실패: ${sanitizedName}`);
      }

      currentParentId = createResponse.data.id;
      webhardLogger.info('Created folder', {
        folderName: sanitizedName,
        folderId: createResponse.data.id,
      });
    }
  }

  return currentParentId || '';
}

/**
 * @deprecated 미사용 — uploadFolderFileAction + createFolderStructureAction 조합으로 대체됨
 * 빌드 호환을 위해 stub만 유지
 */
type FolderUploadResult = {
  success: boolean;
  totalFiles: number;
  uploadedFiles: number;
  failedFiles: string[];
  createdFolders: string[];
  error?: string;
};
export async function uploadFolderAction(_formData: FormData): Promise<FolderUploadResult> {
  'use server';
  return {
    success: false,
    totalFiles: 0,
    uploadedFiles: 0,
    failedFiles: [],
    createdFolders: [],
    error: 'deprecated: uploadFolderFileAction + createFolderStructureAction 조합을 사용하세요.',
  };
}

/**
 * @deprecated 파일 본문 업로드는 브라우저 direct-to-R2 경로를 사용한다.
 * 이 Server Action은 파일 바이트를 받거나 읽지 않도록 실패만 반환한다.
 */
export async function uploadFolderFileAction(
  _formData: FormData
): Promise<{ success: boolean; error?: string; fileId?: string }> {
  'use server';

  return {
    success: false,
    error: 'deprecated: 폴더 업로드 파일 전송은 uploadFilesBatch direct-to-R2 경로를 사용하세요.',
  };
}

/**
 * 폴더 구조만 먼저 생성 (빠른 폴더 생성)
 */
export async function createFolderStructureAction(formData: FormData): Promise<{
  success: boolean;
  folderMap: Record<string, string>;
  error?: string;
}> {
  'use server';

  try {
    const user = await getSessionUser();
    if (!user || (user.userType !== 'admin' && user.userType !== 'company')) {
      return { success: false, folderMap: {}, error: 'Unauthorized' };
    }

    const folderPathsJson = formData.get('folderPaths') as string;
    const targetFolderId = formData.get('targetFolderId') as string | null;

    const folderPaths: string[] = JSON.parse(folderPathsJson || '[]');

    if (folderPaths.length === 0) {
      return { success: true, folderMap: {} };
    }

    // 업체 정보 가져오기
    let companyId: number | null;
    const companyIdFromForm = formData.get('companyId') as string | null;

    if (user.userType === 'company') {
      companyId = Number(user.userId);
      if (isNaN(companyId)) {
        webhardLogger.error('Invalid company userId', { userId: user.userId });
        return { success: false, folderMap: {}, error: '잘못된 사용자 ID입니다.' };
      }
    } else {
      // 관리자: 1) FormData에서 companyId 확인, 2) targetFolderId에서 추출, 3) 없으면 null 허용
      if (companyIdFromForm) {
        companyId = Number(companyIdFromForm);
      } else if (targetFolderId) {
        const { serverGetFolderById } = await import('@/lib/api/nestjs-server-client');
        const folderData = await serverGetFolderById(targetFolderId);

        if (!folderData) {
          return { success: false, folderMap: {}, error: '업로드 대상 폴더를 찾을 수 없습니다.' };
        }
        // company_id가 null인 폴더(관리자 전용)도 허용
        companyId = folderData.company_id ?? null;
      } else {
        // 관리자가 폴더/업체 모두 미선택 시 오류
        return { success: false, folderMap: {}, error: '관리자는 업체를 선택해야 합니다.' };
      }
    }

    webhardLogger.debug('createFolderStructureAction', {
      companyId,
      targetFolderId,
      folderPathsCount: folderPaths.length,
    });

    // 폴더 경로를 정렬하여 상위 폴더부터 생성
    const sortedPaths = [...folderPaths].sort((a, b) => a.split('/').length - b.split('/').length);

    const folderMap: Record<string, string> = {};

    for (const folderPath of sortedPaths) {
      if (!folderPath || folderPath === '.') continue;

      try {
        const folderId = await ensureFolderPath(companyId, targetFolderId, folderPath);
        folderMap[folderPath] = folderId;
      } catch (error) {
        webhardLogger.error('Error creating folder path', { folderPath, error });
        return {
          success: false,
          folderMap,
          error: `폴더 생성 실패: ${folderPath}`,
        };
      }
    }

    return { success: true, folderMap };
  } catch (error) {
    webhardLogger.error('Exception in createFolderStructureAction', error);
    return {
      success: false,
      folderMap: {},
      error: error instanceof Error ? error.message : '폴더 구조 생성 실패',
    };
  }
}
