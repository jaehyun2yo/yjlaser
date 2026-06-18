/**
 * ICacheService (Async Interface)
 * Redis와 InMemory 캐시 모두 지원하는 통합 인터페이스
 * - Redis: 프로덕션 환경
 * - InMemory: 개발 환경 또는 Redis 연결 실패 시 폴백
 */

export interface ICacheService {
  /**
   * 캐시에서 값 조회
   * @param key 캐시 키
   * @returns 캐시된 값 또는 null
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * 캐시에 값 저장
   * @param key 캐시 키
   * @param value 저장할 값
   * @param ttlSeconds TTL (초 단위)
   */
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;

  /**
   * 캐시에서 키 삭제
   * @param key 캐시 키
   */
  delete(key: string): Promise<void>;

  /**
   * 여러 키 삭제
   * @param keys 삭제할 키 배열
   */
  deleteMany(keys: string[]): Promise<void>;

  /**
   * 패턴에 맞는 키 무효화 (와일드카드: *)
   * @param pattern 패턴 문자열 (예: "webhard:files:*")
   */
  invalidatePattern(pattern: string): Promise<void>;

  /**
   * 캐시에서 가져오거나, 없으면 fetcher 실행 후 저장
   * @param key 캐시 키
   * @param fetcher 데이터 조회 함수
   * @param ttlSeconds TTL (초 단위)
   */
  getOrSet<T>(key: string, fetcher: () => Promise<T>, ttlSeconds: number): Promise<T>;

  /**
   * 캐시에 키 존재 여부 확인
   * @param key 캐시 키
   */
  has(key: string): Promise<boolean>;

  /**
   * 모든 캐시 클리어
   */
  clear(): Promise<void>;
}

// TTL 상수 (초 단위) - 통합
export const CACHE_TTL = {
  FOLDER_TREE: 300, // 5분
  FOLDER_PATH: 600, // 10분
  FOLDER_INFO: 300, // 5분
  FILE_LIST: 60, // 1분
  FILE_INFO: 120, // 2분
  FILE_COUNTS: 60, // 1분
  BREADCRUMBS: 300, // 5분
  BADGE_COUNTS: 30, // 30초
  COMPANY_INFO: 3600, // 1시간
  UNDOWNLOADED_COUNT: 30, // 30초
} as const;

// 캐시 키 생성 헬퍼 - 통합
export const CacheKeys = {
  // 폴더 관련
  folderTree: (companyId: number | null) => `webhard:folders:tree:${companyId ?? 'all'}`,
  folderPath: (folderId: string) => `webhard:folders:path:${folderId}`,
  folderInfo: (folderId: string) => `webhard:folders:info:${folderId}`,
  folderChildren: (parentId: string | null, companyId: number | null) =>
    `webhard:folders:children:${parentId ?? 'root'}:${companyId ?? 'all'}`,

  // 파일 관련
  fileList: (folderId: string | null, companyId: number | null) =>
    `webhard:files:list:${folderId ?? 'root'}:${companyId ?? 'all'}`,
  fileInfo: (fileId: string) => `webhard:files:info:${fileId}`,
  fileCounts: (folderIds: string[]) => `webhard:files:counts:${folderIds.sort().join(',')}`,

  // 카운트/뱃지 관련
  badgeCounts: (companyId: number | null) => `webhard:badges:${companyId ?? 'all'}`,
  undownloadedCount: (folderId: string | null, companyId: number | null) =>
    `webhard:count:undownloaded:${folderId ?? 'root'}:${companyId ?? 'all'}`,

  // 회사 관련
  companyInfo: (companyId: number) => `webhard:company:${companyId}`,

  // 패턴 (무효화용)
  patterns: {
    allFiles: (companyId: number | null) => `webhard:files:*:${companyId ?? 'all'}`,
    allFolders: (companyId: number | null) => `webhard:folders:*:${companyId ?? 'all'}`,
    allBadges: (companyId: number | null) => `webhard:badges:*`,
    allCounts: () => `webhard:count:*`,
  },
} as const;
