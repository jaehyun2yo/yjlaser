/**
 * InMemoryCache (Async Wrapper)
 * 개발 환경 또는 Redis 폴백용 인메모리 캐시
 * - ICacheService 인터페이스를 비동기로 구현
 * - 서버 재시작 시 캐시 초기화
 */

import type { ICacheService } from './ICacheService';

interface CacheItem<T> {
  value: T;
  expiresAt: number;
}

class InMemoryCacheImpl implements ICacheService {
  private cache = new Map<string, CacheItem<unknown>>();
  private cleanupIntervalId: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 60000; // 1분마다 만료 항목 정리

  constructor() {
    this.startCleanupInterval();
  }

  async get<T>(key: string): Promise<T | null> {
    const item = this.cache.get(key);

    if (!item) return null;

    if (item.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return item.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async deleteMany(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.cache.delete(key);
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    // 와일드카드 패턴을 정규식으로 변환
    // "webhard:files:*" -> /^webhard:files:.*$/
    const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  async getOrSet<T>(key: string, fetcher: () => Promise<T>, ttlSeconds: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await fetcher();
    await this.set(key, data, ttlSeconds);
    return data;
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  /**
   * 현재 캐시 크기 (디버깅용)
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 만료된 항목 정리
   */
  private cleanup(): void {
    const now = Date.now();

    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt < now) {
        this.cache.delete(key);
      }
    }
  }

  private startCleanupInterval(): void {
    if (typeof global !== 'undefined' && !this.cleanupIntervalId) {
      this.cleanupIntervalId = setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL_MS);
      // Node.js 프로세스 종료 시 인터벌 정리
      if (this.cleanupIntervalId.unref) {
        this.cleanupIntervalId.unref();
      }
    }
  }
}

// 싱글톤 인스턴스
let instance: InMemoryCacheImpl | null = null;

export function getInMemoryCache(): ICacheService {
  if (!instance) {
    instance = new InMemoryCacheImpl();
  }
  return instance;
}

export { InMemoryCacheImpl };
