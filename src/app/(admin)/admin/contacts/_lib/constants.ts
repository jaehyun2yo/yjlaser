/**
 * 문의하기 관리 로컬 상수
 */
import { BG_COLOR, BORDER_COLOR, TRANSITION_STYLES } from '@/lib/styles';

/**
 * 카드 스타일 상수 (압축 레이아웃)
 */
export const CARD_STYLES = {
  container: `border rounded-lg overflow-visible hover:shadow-lg ${TRANSITION_STYLES.shadow} ${BG_COLOR.card} ${BORDER_COLOR.default}`,
  header: `p-3 md:p-4 cursor-pointer ${TRANSITION_STYLES.colors}`,
  headerExpanded: `p-3 md:p-4`,
  divider: `border-t ${BORDER_COLOR.default} my-2`,
  summary: 'space-y-2',
  actions: `pt-3 border-t mt-3 ${BORDER_COLOR.default}`,
  detail: `border-t ${BORDER_COLOR.default}`,
} as const;

/**
 * 상태별 라벨 (한글) — 중앙화된 statusLabels에서 re-export
 */
export { STATUS_LABELS } from '@/lib/utils/statusLabels';

/**
 * 상태 필터 목록
 */
export const STATUS_FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'received', label: '접수' },
  { key: 'drawing', label: '도면작업' },
  { key: 'confirmed', label: '컨펌' },
  { key: 'production', label: '목형제작' },
  { key: 'cutting', label: '레이저가공' },
  { key: 'finishing', label: '칼/오시' },
  { key: 'delivered', label: '납품' },
  { key: 'completed', label: '작업완료' },
  { key: 'on_hold', label: '보류' },
] as const;

/**
 * 날짜 필터 목록
 * - all: 전체 기간
 * - today: 오늘 (00:00 ~ 23:59)
 * - week: 이번 주 (월요일 ~ 금요일)
 * - month: 이번 달 (1일 ~ 말일)
 */
export const DATE_FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'today', label: '오늘' },
  { key: 'week', label: '이번 주' },
  { key: 'month', label: '이번 달' },
] as const;

export type DateFilterKey = (typeof DATE_FILTERS)[number]['key'];

/**
 * 문의유형 필터 목록
 */
export const INQUIRY_TYPE_FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'cutting_request', label: '칼선의뢰' },
  { key: 'mold_request', label: '목형의뢰' },
  { key: 'laser_cutting', label: '레이저가공' },
  { key: 'unclassified', label: '미분류' },
] as const;

export type InquiryTypeFilterKey = (typeof INQUIRY_TYPE_FILTERS)[number]['key'];

/**
 * localStorage 키
 */
export const STORAGE_KEYS = {
  DISMISSED_REVISION_REQUESTS: 'admin-dismissed-revision-requests',
  DISMISSED_VISIT_SCHEDULES: 'admin-dismissed-visit-schedules',
  DISMISSED_DELIVERY_METHODS: 'admin-dismissed-delivery-methods',
} as const;

/**
 * 영구 삭제까지 기간 (일)
 */
export const PERMANENT_DELETE_DAYS = 30;

/**
 * 검색 디바운스 시간 (ms)
 */
export const SEARCH_DEBOUNCE_MS = 500;

/**
 * 실시간 업데이트 디바운스 시간 (ms)
 */
export const REALTIME_DEBOUNCE_MS = 300;

/**
 * 캐시 staleTime (ms) - 캐시된 데이터가 fresh로 유지되는 시간
 * 30초 동안 캐시 히트하여 불필요한 API 요청 방지
 */
export const CACHE_STALE_TIME = 30000;

/**
 * 캐시 gcTime (ms) - 필터 전환 시 캐시 유지
 */
export const CACHE_GC_TIME = 5 * 60 * 1000;

/**
 * 페이지당 아이템 수
 */
export const ITEMS_PER_PAGE = 10;
