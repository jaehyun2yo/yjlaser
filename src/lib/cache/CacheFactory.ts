/**
 * CacheFactory
 * 환경에 따라 적절한 캐시 서비스를 선택하는 팩토리
 * - 프로덕션 + Redis 설정: UpstashRedisCache
 * - 개발 환경 또는 폴백: InMemoryCache
 */

import type { ICacheService } from './ICacheService';
import { UpstashRedisCache } from './UpstashRedisCache';
import { getInMemoryCache } from './InMemoryCache';

type CacheProvider = 'redis' | 'memory' | 'auto';

let cacheInstance: ICacheService | null = null;
let cacheProvider: CacheProvider = 'auto';

/**
 * 캐시 프로바이더 설정
 * 테스트나 특수 상황에서 강제 지정 가능
 */
export function setCacheProvider(provider: CacheProvider): void {
  cacheProvider = provider;
  cacheInstance = null; // 인스턴스 리셋
}

/**
 * Redis 사용 가능 여부 확인
 */
function isRedisAvailable(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/**
 * 캐시 서비스 생성
 */
function createCacheService(): ICacheService {
  // 명시적으로 memory 지정된 경우
  if (cacheProvider === 'memory') {
    return getInMemoryCache();
  }

  // 명시적으로 redis 지정된 경우
  if (cacheProvider === 'redis') {
    if (!isRedisAvailable()) {
      throw new Error('[CacheFactory] Redis requested but environment variables not set');
    }
    return new UpstashRedisCache();
  }

  // auto 모드: 환경에 따라 자동 선택
  // 프로덕션이고 Redis 환경변수가 있으면 Redis 사용
  if (process.env.NODE_ENV === 'production' && isRedisAvailable()) {
    try {
      return new UpstashRedisCache();
    } catch (error) {
      return getInMemoryCache();
    }
  }

  // 개발 환경이지만 Redis 환경변수가 있으면 Redis 사용 (테스트용)
  if (isRedisAvailable()) {
    try {
      return new UpstashRedisCache();
    } catch (error) {
      return getInMemoryCache();
    }
  }

  // 기본: InMemory 사용
  return getInMemoryCache();
}

/**
 * 캐시 서비스 인스턴스 가져오기 (싱글톤)
 */
export function getCacheService(): ICacheService {
  if (!cacheInstance) {
    cacheInstance = createCacheService();
  }
  return cacheInstance;
}

/**
 * 캐시 서비스 리셋 (테스트용)
 */
export function resetCacheService(): void {
  cacheInstance = null;
}

// 기본 export
export const cacheService = {
  get instance(): ICacheService {
    return getCacheService();
  },
};

export default getCacheService;
