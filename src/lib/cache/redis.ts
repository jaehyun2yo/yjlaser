/**
 * Upstash Redis 클라이언트
 * 서버리스 환경에 최적화된 HTTP 기반 Redis
 */

import { Redis } from '@upstash/redis';

// Redis 클라이언트 인스턴스 (싱글톤)
let redisInstance: Redis | null = null;

/**
 * Redis 클라이언트 가져오기
 * 환경 변수가 설정되지 않으면 null 반환 (개발 환경에서 Redis 없이도 동작)
 */
export function getRedis(): Redis | null {
  if (redisInstance) {
    return redisInstance;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  // 환경 변수가 없으면 캐시 비활성화 (개발 환경 대응)
  if (!url || !token) {
    return null;
  }

  redisInstance = new Redis({
    url,
    token,
  });

  return redisInstance;
}

/**
 * 캐시 키 생성 헬퍼
 */
export const cacheKeys = {
  // 폴더 관련
  folderTree: (companyId: number) => `webhard:folders:tree:${companyId}`,
  folderPath: (folderId: string) => `webhard:folders:path:${folderId}`,
  folderInfo: (folderId: string) => `webhard:folders:info:${folderId}`,

  // 파일 관련
  fileList: (folderId: string | null, companyId?: number) =>
    `webhard:files:list:${folderId || 'root'}:${companyId || 'all'}`,
  fileInfo: (fileId: string) => `webhard:files:info:${fileId}`,

  // 회사 관련
  companyInfo: (companyId: number) => `webhard:company:${companyId}`,

  // 카운트 관련
  undownloadedCount: (folderId: string | null) =>
    `webhard:count:undownloaded:${folderId || 'root'}`,
  totalUndownloadedCount: (companyId?: number) =>
    `webhard:count:total:${companyId || 'all'}`,
};

/**
 * TTL 설정 (초 단위)
 */
export const cacheTTL = {
  folderTree: 300, // 5분
  folderPath: 600, // 10분
  folderInfo: 300, // 5분
  fileList: 60, // 1분
  fileInfo: 120, // 2분
  companyInfo: 3600, // 1시간
  undownloadedCount: 30, // 30초
  totalUndownloadedCount: 30, // 30초
};

/**
 * 캐시 무효화 패턴
 */
export const invalidationPatterns = {
  // 폴더 관련 작업 시 무효화할 키들
  onFolderChange: (companyId: number, folderId?: string) => [
    cacheKeys.folderTree(companyId),
    ...(folderId ? [cacheKeys.folderPath(folderId), cacheKeys.folderInfo(folderId)] : []),
  ],

  // 파일 관련 작업 시 무효화할 키들
  onFileChange: (folderId: string | null, companyId?: number, fileId?: string) => [
    cacheKeys.fileList(folderId, companyId),
    cacheKeys.undownloadedCount(folderId),
    cacheKeys.totalUndownloadedCount(companyId),
    ...(fileId ? [cacheKeys.fileInfo(fileId)] : []),
  ],

  // 회사 정보 변경 시
  onCompanyChange: (companyId: number) => [cacheKeys.companyInfo(companyId)],
};

/**
 * 캐시에서 데이터 가져오기 (제네릭)
 */
export async function getCached<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const cached = await redis.get<T>(key);
    return cached;
  } catch (error) {
    return null;
  }
}

/**
 * 캐시에 데이터 저장
 */
export async function setCache<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch (error) {
    // Silently handle errors
  }
}

/**
 * 캐시 키 삭제
 */
export async function deleteCache(keys: string[]): Promise<void> {
  const redis = getRedis();
  if (!redis || keys.length === 0) return;

  try {
    await redis.del(...keys);
  } catch (error) {
    // Silently handle errors
  }
}

/**
 * 패턴 매칭 캐시 삭제 (와일드카드 지원)
 */
export async function deleteCacheByPattern(pattern: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    // Upstash Redis는 SCAN 명령 지원 (cursor는 문자열로 반환됨)
    let cursor = '0';
    const keysToDelete: string[] = [];

    do {
      const [nextCursor, keys] = await redis.scan(Number(cursor), { match: pattern, count: 100 });
      cursor = String(nextCursor);
      keysToDelete.push(...keys);
    } while (cursor !== '0');

    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
    }
  } catch (error) {
    // Silently handle errors
  }
}
