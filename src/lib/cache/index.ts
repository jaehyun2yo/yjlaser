/**
 * Cache Module - 통합 Export
 */

// 인터페이스 및 타입
export type { ICacheService } from './ICacheService';
export { CACHE_TTL, CacheKeys } from './ICacheService';

// 구현체
export { UpstashRedisCache } from './UpstashRedisCache';
export { getInMemoryCache, InMemoryCacheImpl } from './InMemoryCache';

// 팩토리
export { getCacheService, setCacheProvider, resetCacheService, cacheService } from './CacheFactory';
export { getCacheService as default } from './CacheFactory';

// 기존 호환성을 위한 re-export (점진적 마이그레이션 지원)
// 기존 redis.ts의 함수들을 새 인터페이스로 래핑
export {
  cacheKeys as legacyCacheKeys,
  cacheTTL as legacyCacheTTL,
  getCached,
  setCache,
  deleteCache,
  deleteCacheByPattern,
  invalidationPatterns,
} from './redis';
