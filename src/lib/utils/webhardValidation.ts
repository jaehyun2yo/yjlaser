/**
 * 웹하드 입력값 검증 유틸리티
 *
 * 배치 작업 및 API 요청의 입력값을 검증합니다.
 * @security 배열 크기 제한 및 타입 검증을 통해 DoS 공격 방지
 */

import { NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';

const validationLogger = logger.createLogger('WEBHARD_VALIDATION');

// ============================================================================
// 상수 정의
// ============================================================================

/** 배치 작업의 최대 항목 수 */
export const MAX_BATCH_SIZE = 100;

/** 파일 ID 최대 길이 (UUID) */
export const MAX_FILE_ID_LENGTH = 36;

/** 폴더 ID 최대 길이 (UUID) */
export const MAX_FOLDER_ID_LENGTH = 36;

/** 파일명 최대 길이 */
export const MAX_FILE_NAME_LENGTH = 255;

/** 검색어 최대 길이 */
export const MAX_SEARCH_QUERY_LENGTH = 100;

// ============================================================================
// 타입 정의
// ============================================================================

interface ValidationResult<T = unknown> {
  valid: boolean;
  data?: T;
  error?: string;
  response?: NextResponse;
}

interface BatchDeleteInput {
  fileIds: string[];
}

interface BatchMoveInput {
  fileIds: string[];
  targetFolderId: string | null;
}

interface SearchInput {
  query: string;
  folderId?: string;
  companyId?: string | number;
}

// ============================================================================
// 기본 검증 함수
// ============================================================================

/**
 * UUID 형식 검증
 */
export function isValidUUID(id: string): boolean {
  if (typeof id !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * 문자열 배열 검증
 */
export function isStringArray(arr: unknown): arr is string[] {
  return Array.isArray(arr) && arr.every((item) => typeof item === 'string');
}

/**
 * 파일 ID 배열 검증
 */
export function validateFileIds(fileIds: unknown): ValidationResult<string[]> {
  // 배열인지 확인
  if (!Array.isArray(fileIds)) {
    return {
      valid: false,
      error: 'fileIds는 배열이어야 합니다.',
      response: NextResponse.json({ error: 'fileIds는 배열이어야 합니다.' }, { status: 400 }),
    };
  }

  // 빈 배열 확인
  if (fileIds.length === 0) {
    return {
      valid: false,
      error: '처리할 파일이 없습니다.',
      response: NextResponse.json({ error: '처리할 파일이 없습니다.' }, { status: 400 }),
    };
  }

  // 배열 크기 제한
  if (fileIds.length > MAX_BATCH_SIZE) {
    validationLogger.warn('배치 크기 제한 초과', {
      requested: fileIds.length,
      limit: MAX_BATCH_SIZE,
    });
    return {
      valid: false,
      error: `한 번에 최대 ${MAX_BATCH_SIZE}개까지 처리할 수 있습니다.`,
      response: NextResponse.json(
        { error: `한 번에 최대 ${MAX_BATCH_SIZE}개까지 처리할 수 있습니다.` },
        { status: 400 }
      ),
    };
  }

  // 문자열 배열인지 확인
  if (!isStringArray(fileIds)) {
    return {
      valid: false,
      error: '유효하지 않은 파일 ID 형식입니다.',
      response: NextResponse.json({ error: '유효하지 않은 파일 ID 형식입니다.' }, { status: 400 }),
    };
  }

  // 각 ID의 길이 및 형식 검증
  const validIds: string[] = [];
  for (const id of fileIds) {
    if (id.length > MAX_FILE_ID_LENGTH) {
      return {
        valid: false,
        error: '유효하지 않은 파일 ID 형식입니다.',
        response: NextResponse.json(
          { error: '유효하지 않은 파일 ID 형식입니다.' },
          { status: 400 }
        ),
      };
    }
    // UUID 형식 검증 (선택적 - 프로젝트에서 사용하는 ID 형식에 따라)
    if (!isValidUUID(id)) {
      validationLogger.warn('유효하지 않은 UUID 형식', { id });
      return {
        valid: false,
        error: '유효하지 않은 파일 ID 형식입니다.',
        response: NextResponse.json(
          { error: '유효하지 않은 파일 ID 형식입니다.' },
          { status: 400 }
        ),
      };
    }
    validIds.push(id);
  }

  return {
    valid: true,
    data: validIds,
  };
}

/**
 * 폴더 ID 검증
 */
export function validateFolderId(folderId: unknown): ValidationResult<string | null> {
  // null 또는 undefined는 루트 폴더를 의미
  if (folderId === null || folderId === undefined) {
    return { valid: true, data: null };
  }

  // 문자열인지 확인
  if (typeof folderId !== 'string') {
    return {
      valid: false,
      error: '유효하지 않은 폴더 ID 형식입니다.',
      response: NextResponse.json({ error: '유효하지 않은 폴더 ID 형식입니다.' }, { status: 400 }),
    };
  }

  // 길이 검증
  if (folderId.length > MAX_FOLDER_ID_LENGTH) {
    return {
      valid: false,
      error: '유효하지 않은 폴더 ID 형식입니다.',
      response: NextResponse.json({ error: '유효하지 않은 폴더 ID 형식입니다.' }, { status: 400 }),
    };
  }

  // UUID 형식 검증
  if (!isValidUUID(folderId)) {
    return {
      valid: false,
      error: '유효하지 않은 폴더 ID 형식입니다.',
      response: NextResponse.json({ error: '유효하지 않은 폴더 ID 형식입니다.' }, { status: 400 }),
    };
  }

  return { valid: true, data: folderId };
}

// ============================================================================
// 배치 작업 검증 함수
// ============================================================================

/**
 * 배치 삭제 요청 검증
 */
export function validateBatchDelete(body: unknown): ValidationResult<BatchDeleteInput> {
  if (!body || typeof body !== 'object') {
    return {
      valid: false,
      error: '요청 본문이 없습니다.',
      response: NextResponse.json({ error: '요청 본문이 없습니다.' }, { status: 400 }),
    };
  }

  const { fileIds } = body as { fileIds?: unknown };
  const fileIdsResult = validateFileIds(fileIds);

  if (!fileIdsResult.valid) {
    return {
      valid: false,
      error: fileIdsResult.error,
      response: fileIdsResult.response,
    };
  }

  return {
    valid: true,
    data: { fileIds: fileIdsResult.data! },
  };
}

/**
 * 배치 이동 요청 검증
 */
export function validateBatchMove(body: unknown): ValidationResult<BatchMoveInput> {
  if (!body || typeof body !== 'object') {
    return {
      valid: false,
      error: '요청 본문이 없습니다.',
      response: NextResponse.json({ error: '요청 본문이 없습니다.' }, { status: 400 }),
    };
  }

  const { fileIds, targetFolderId } = body as { fileIds?: unknown; targetFolderId?: unknown };

  // 파일 ID 검증
  const fileIdsResult = validateFileIds(fileIds);
  if (!fileIdsResult.valid) {
    return {
      valid: false,
      error: fileIdsResult.error,
      response: fileIdsResult.response,
    };
  }

  // 폴더 ID 검증
  const folderIdResult = validateFolderId(targetFolderId);
  if (!folderIdResult.valid) {
    return {
      valid: false,
      error: folderIdResult.error,
      response: folderIdResult.response,
    };
  }

  return {
    valid: true,
    data: {
      fileIds: fileIdsResult.data!,
      targetFolderId: folderIdResult.data!,
    },
  };
}

// ============================================================================
// 검색 및 기타 검증 함수
// ============================================================================

/**
 * 검색 쿼리 검증
 */
export function validateSearchQuery(query: unknown): ValidationResult<string> {
  if (typeof query !== 'string') {
    return {
      valid: false,
      error: '검색어는 문자열이어야 합니다.',
      response: NextResponse.json({ error: '검색어는 문자열이어야 합니다.' }, { status: 400 }),
    };
  }

  // 빈 검색어 확인
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    return {
      valid: false,
      error: '검색어를 입력해주세요.',
      response: NextResponse.json({ error: '검색어를 입력해주세요.' }, { status: 400 }),
    };
  }

  // 길이 제한
  if (trimmedQuery.length > MAX_SEARCH_QUERY_LENGTH) {
    return {
      valid: false,
      error: `검색어는 ${MAX_SEARCH_QUERY_LENGTH}자 이내로 입력해주세요.`,
      response: NextResponse.json(
        { error: `검색어는 ${MAX_SEARCH_QUERY_LENGTH}자 이내로 입력해주세요.` },
        { status: 400 }
      ),
    };
  }

  return {
    valid: true,
    data: trimmedQuery,
  };
}

/**
 * 검색 요청 전체 검증
 */
export function validateSearchInput(params: {
  query?: unknown;
  folderId?: unknown;
  companyId?: unknown;
}): ValidationResult<SearchInput> {
  // 검색어 검증
  const queryResult = validateSearchQuery(params.query);
  if (!queryResult.valid) {
    return {
      valid: false,
      error: queryResult.error,
      response: queryResult.response,
    };
  }

  // 폴더 ID 검증 (선택적)
  if (params.folderId !== undefined) {
    const folderIdResult = validateFolderId(params.folderId);
    if (!folderIdResult.valid) {
      return {
        valid: false,
        error: folderIdResult.error,
        response: folderIdResult.response,
      };
    }
  }

  // companyId는 string 또는 number
  let companyId: string | number | undefined;
  if (params.companyId !== undefined) {
    if (typeof params.companyId === 'string' || typeof params.companyId === 'number') {
      companyId = params.companyId;
    }
  }

  return {
    valid: true,
    data: {
      query: queryResult.data!,
      folderId: params.folderId as string | undefined,
      companyId,
    },
  };
}

/**
 * 파일명 검증
 */
export function validateFileName(name: unknown): ValidationResult<string> {
  if (typeof name !== 'string') {
    return {
      valid: false,
      error: '파일명은 문자열이어야 합니다.',
      response: NextResponse.json({ error: '파일명은 문자열이어야 합니다.' }, { status: 400 }),
    };
  }

  const trimmedName = name.trim();

  // 빈 파일명 확인
  if (trimmedName.length === 0) {
    return {
      valid: false,
      error: '파일명을 입력해주세요.',
      response: NextResponse.json({ error: '파일명을 입력해주세요.' }, { status: 400 }),
    };
  }

  // 길이 제한
  if (trimmedName.length > MAX_FILE_NAME_LENGTH) {
    return {
      valid: false,
      error: `파일명은 ${MAX_FILE_NAME_LENGTH}자 이내로 입력해주세요.`,
      response: NextResponse.json(
        { error: `파일명은 ${MAX_FILE_NAME_LENGTH}자 이내로 입력해주세요.` },
        { status: 400 }
      ),
    };
  }

  // 위험한 문자 확인 (경로 탐색 공격 방지)
  const dangerousChars = ['/', '\\', '..', '\0'];
  for (const char of dangerousChars) {
    if (trimmedName.includes(char)) {
      validationLogger.warn('위험한 문자가 포함된 파일명', { name: trimmedName, char });
      return {
        valid: false,
        error: '유효하지 않은 파일명입니다.',
        response: NextResponse.json({ error: '유효하지 않은 파일명입니다.' }, { status: 400 }),
      };
    }
  }

  return {
    valid: true,
    data: trimmedName,
  };
}

export default {
  validateFileIds,
  validateFolderId,
  validateBatchDelete,
  validateBatchMove,
  validateSearchQuery,
  validateSearchInput,
  validateFileName,
  isValidUUID,
  isStringArray,
  MAX_BATCH_SIZE,
  MAX_FILE_ID_LENGTH,
  MAX_FOLDER_ID_LENGTH,
  MAX_FILE_NAME_LENGTH,
  MAX_SEARCH_QUERY_LENGTH,
};
