'use client';

import { useState, useMemo, type FC } from 'react';
import { FaBoxOpen, FaSyncAlt } from 'react-icons/fa';
import { COMPANY_THEME, TEXT_COLOR, BG_COLOR, FILTER_BUTTON_STYLES } from '@/lib/styles';
import { useCompanyOrders } from './_lib/hooks';
import { useOrderRealtime } from '@/lib/hooks/useOrderRealtime';
import { toCustomerStatus } from './_lib/statusUtils';
import { OrderCard } from './_components';
import type { CustomerOrderStatus, OrderListItem } from './_lib/types';

// ============================================
// 상태 필터 탭 정의
// ============================================

const STATUS_FILTERS: Array<{ label: string; value: CustomerOrderStatus | '전체' }> = [
  { label: '전체', value: '전체' },
  { label: '접수됨', value: '접수됨' },
  { label: '작업 준비중', value: '작업 준비중' },
  { label: '작업중', value: '작업중' },
  { label: '작업 완료', value: '작업 완료' },
  { label: '납품 진행중', value: '납품 진행중' },
  { label: '납품 완료', value: '납품 완료' },
  { label: '완료', value: '완료' },
];

// ============================================
// Props
// ============================================

interface OrdersClientProps {
  companyId: number;
}

/**
 * 거래처 주문 목록 클라이언트 컴포넌트
 * - 상태 필터 탭
 * - 주문 카드 그리드
 * - 실시간 업데이트 (WebSocket)
 */
const OrdersClient: FC<OrdersClientProps> = ({ companyId }) => {
  const [activeFilter, setActiveFilter] = useState<CustomerOrderStatus | '전체'>('전체');

  // React Query로 주문 목록 조회
  const {
    data: orders = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useCompanyOrders(companyId);

  // 실시간 업데이트 (WebSocket - companyId 기반 room 구독)
  const { status: realtimeStatus } = useOrderRealtime({
    companyId,
    enabled: true,
  });

  // 필터링된 주문 목록 (companyId 보안 필터 + 상태 필터)
  const filteredOrders = useMemo<OrderListItem[]>(() => {
    // 보안: contactId가 companyId와 일치하는 주문만 표시
    const secureOrders = orders.filter((order) => order.contactId === String(companyId));

    if (activeFilter === '전체') {
      return secureOrders;
    }

    return secureOrders.filter((order) => toCustomerStatus(order.status) === activeFilter);
  }, [orders, companyId, activeFilter]);

  // 각 상태별 카운트
  const statusCounts = useMemo(() => {
    const secureOrders = orders.filter((order) => order.contactId === String(companyId));
    const counts: Record<string, number> = { 전체: secureOrders.length };

    for (const order of secureOrders) {
      const customerStatus = toCustomerStatus(order.status);
      counts[customerStatus] = (counts[customerStatus] ?? 0) + 1;
    }

    return counts;
  }, [orders, companyId]);

  // ============================================
  // 로딩 상태
  // ============================================

  if (isLoading) {
    return <OrdersLoadingSkeleton />;
  }

  // ============================================
  // 에러 상태
  // ============================================

  if (isError) {
    return (
      <div
        className={`${COMPANY_THEME.card} ${COMPANY_THEME.cardPadding} flex flex-col items-center justify-center py-12 text-center`}
      >
        <div className="text-red-400 text-4xl mb-4" aria-hidden="true">
          ⚠️
        </div>
        <h2 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-2`}>
          주문 정보를 불러오지 못했습니다
        </h2>
        <p className={`text-sm ${TEXT_COLOR.tertiary} mb-6`}>
          {error?.message ?? '잠시 후 다시 시도해주세요.'}
        </p>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#ED6C00] hover:bg-[#d15f00] text-white text-sm font-medium rounded-lg transition-colors"
        >
          <FaSyncAlt className="text-xs" aria-hidden="true" />
          다시 시도
        </button>
      </div>
    );
  }

  // ============================================
  // 메인 렌더
  // ============================================

  return (
    <div className="space-y-5">
      {/* 실시간 연결 상태 + 새로고침 */}
      <div className="flex items-center justify-between">
        <RealtimeStatusIndicator status={realtimeStatus} />
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className={`
            inline-flex items-center gap-1.5 text-xs ${TEXT_COLOR.tertiary}
            hover:text-[#ED6C00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed
          `}
          aria-label="주문 목록 새로고침"
        >
          <FaSyncAlt
            className={`text-[10px] ${isFetching ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          새로고침
        </button>
      </div>

      {/* 상태 필터 탭 */}
      <div
        className={`flex gap-2 overflow-x-auto pb-1 scrollbar-hide`}
        role="tablist"
        aria-label="주문 상태 필터"
      >
        {STATUS_FILTERS.map(({ label, value }) => {
          const count = statusCounts[value] ?? 0;
          const isActive = activeFilter === value;

          // 카운트가 0이고 전체가 아닌 경우 숨김
          if (value !== '전체' && count === 0) return null;

          return (
            <button
              key={value}
              onClick={() => setActiveFilter(value)}
              role="tab"
              aria-selected={isActive}
              className={`
                flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                transition-all duration-200
                ${isActive ? FILTER_BUTTON_STYLES.active : FILTER_BUTTON_STYLES.inactive}
              `}
            >
              <span>{label}</span>
              {count > 0 && (
                <span
                  className={`
                    inline-flex items-center justify-center min-w-[16px] h-4 px-1
                    rounded-full text-[10px] font-bold
                    ${isActive ? 'bg-white/30 text-white' : `${BG_COLOR.white} ${TEXT_COLOR.secondary}`}
                  `}
                  aria-label={`${label} ${count}건`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 주문 목록 */}
      {filteredOrders.length === 0 ? (
        <EmptyState activeFilter={activeFilter} totalCount={statusCounts['전체'] ?? 0} />
      ) : (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          role="list"
          aria-label="주문 목록"
        >
          {filteredOrders.map((order) => (
            <div key={order.id} role="listitem">
              <OrderCard order={order} />
            </div>
          ))}
        </div>
      )}

      {/* 총 건수 */}
      {filteredOrders.length > 0 && (
        <p className={`text-xs ${TEXT_COLOR.muted} text-right`}>총 {filteredOrders.length}건</p>
      )}
    </div>
  );
};

// ============================================
// 서브 컴포넌트: 실시간 상태 표시
// ============================================

interface RealtimeStatusIndicatorProps {
  status: 'connected' | 'disconnected' | 'reconnecting';
}

const RealtimeStatusIndicator: FC<RealtimeStatusIndicatorProps> = ({ status }) => {
  const config = {
    connected: {
      color: 'bg-green-500',
      text: '실시간 연결됨',
      textClass: TEXT_COLOR.success,
    },
    reconnecting: {
      color: 'bg-yellow-500 animate-pulse',
      text: '재연결 중...',
      textClass: TEXT_COLOR.warning,
    },
    disconnected: {
      color: 'bg-gray-400',
      text: '연결 끊김',
      textClass: TEXT_COLOR.muted,
    },
  }[status];

  return (
    <div
      className="flex items-center gap-1.5"
      aria-live="polite"
      aria-label={`실시간 연결 상태: ${config.text}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.color}`}
        aria-hidden="true"
      />
      <span className={`text-xs ${config.textClass}`}>{config.text}</span>
    </div>
  );
};

// ============================================
// 서브 컴포넌트: 빈 상태
// ============================================

interface EmptyStateProps {
  activeFilter: CustomerOrderStatus | '전체';
  totalCount: number;
}

const EmptyState: FC<EmptyStateProps> = ({ activeFilter, totalCount }) => {
  return (
    <div
      className={`${COMPANY_THEME.card} ${COMPANY_THEME.cardPadding} flex flex-col items-center justify-center py-16 text-center`}
    >
      <div
        className={`w-16 h-16 rounded-full ${BG_COLOR.light} flex items-center justify-center mb-4`}
        aria-hidden="true"
      >
        <FaBoxOpen className={`text-2xl ${TEXT_COLOR.muted}`} />
      </div>
      {totalCount === 0 ? (
        <>
          <h2 className={`text-base font-semibold ${TEXT_COLOR.primary} mb-2`}>
            아직 주문이 없습니다
          </h2>
          <p className={`text-sm ${TEXT_COLOR.tertiary}`}>
            레이저 커팅 주문이 접수되면 이곳에서 확인하실 수 있습니다.
          </p>
        </>
      ) : (
        <>
          <h2 className={`text-base font-semibold ${TEXT_COLOR.primary} mb-2`}>
            &apos;{activeFilter}&apos; 상태의 주문이 없습니다
          </h2>
          <p className={`text-sm ${TEXT_COLOR.tertiary}`}>다른 상태 필터를 선택해보세요.</p>
        </>
      )}
    </div>
  );
};

// ============================================
// 서브 컴포넌트: 로딩 스켈레톤
// ============================================

const OrdersLoadingSkeleton: FC = () => {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="주문 목록 로딩 중">
      {/* 필터 스켈레톤 */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`h-7 w-16 rounded-full ${BG_COLOR.light} animate-pulse`}
            aria-hidden="true"
          />
        ))}
      </div>

      {/* 카드 스켈레톤 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`${COMPANY_THEME.card} h-40 animate-pulse ${BG_COLOR.light}`}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
};

export { OrdersClient };
