'use client';

import type { FC } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FaArrowLeft, FaCalendarAlt, FaClipboardList, FaSyncAlt, FaBuilding } from 'react-icons/fa';
import { COMPANY_THEME, TEXT_COLOR, BG_COLOR, BORDER_COLOR, DIVIDER } from '@/lib/styles';
import { useOrderDetail } from '@/app/company/orders/_lib/hooks';
import { useOrderRealtime } from '@/lib/hooks/useOrderRealtime';
import {
  toCustomerStatus,
  buildTimelineSteps,
  formatDate,
} from '@/app/company/orders/_lib/statusUtils';
import { StatusBadge, OrderStatusTimeline } from '@/app/company/orders/_components';
import DeliveryProofImage from '@/components/DeliveryProofImage';
import { CompanyDrawingUpload } from '@/app/company/orders/_components/CompanyDrawingUpload';
import { CompanyDrawingHistory } from '@/app/company/orders/_components/CompanyDrawingHistory';

interface OrderDetailClientProps {
  orderId: string;
  companyId: number;
}

/**
 * 주문 상세 클라이언트 컴포넌트
 *
 * 보안 정책 - 표시하지 않는 항목:
 * - 가격, 단가, 견적 금액
 * - 네스팅 효율, 재료 활용률
 * - 내부 메모, 작업 지시사항
 * - 상세 공정 정보 (네스팅 큐, 가공 파라미터 등)
 *
 * 표시 항목:
 * - 주문 제목, 업체명
 * - 고객용 간소화 상태
 * - 타임라인 (5단계)
 * - 주요 날짜 (접수일, 납기일, 납품일)
 */
const OrderDetailClient: FC<OrderDetailClientProps> = ({ orderId, companyId }) => {
  // 주문 상세 조회
  const { data: order, isLoading, isError, error, refetch, isFetching } = useOrderDetail(orderId);

  // 실시간 업데이트
  const { status: realtimeStatus } = useOrderRealtime({
    orderId,
    companyId,
    enabled: true,
  });

  // ============================================
  // 로딩 상태
  // ============================================

  if (isLoading) {
    return <OrderDetailSkeleton />;
  }

  // ============================================
  // 에러 상태
  // ============================================

  if (isError) {
    return (
      <div
        className={`${COMPANY_THEME.card} ${COMPANY_THEME.cardPadding} flex flex-col items-center justify-center py-16 text-center`}
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
  // 데이터 없음 / 접근 권한 없음
  // ============================================

  if (!order) {
    return notFound();
  }

  // 보안: 해당 업체의 주문인지 확인
  if (order.contactId !== String(companyId)) {
    return notFound();
  }

  // ============================================
  // 상태 및 타임라인 계산
  // ============================================

  const customerStatus = toCustomerStatus(order.status);
  const timelineSteps = buildTimelineSteps(customerStatus, order.events);

  // ============================================
  // 메인 렌더
  // ============================================

  return (
    <div className="space-y-5">
      {/* 뒤로 가기 + 새로고침 */}
      <div className="flex items-center justify-between">
        <Link
          href="/company/orders"
          className={`inline-flex items-center gap-2 text-sm ${TEXT_COLOR.tertiary} hover:text-[#ED6C00] transition-colors`}
          aria-label="주문 목록으로 돌아가기"
        >
          <FaArrowLeft className="text-xs" aria-hidden="true" />
          주문 목록
        </Link>

        <div className="flex items-center gap-3">
          {/* 실시간 연결 상태 */}
          <RealtimeIndicator status={realtimeStatus} />

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className={`
              inline-flex items-center gap-1.5 text-xs ${TEXT_COLOR.tertiary}
              hover:text-[#ED6C00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed
            `}
            aria-label="주문 정보 새로고침"
          >
            <FaSyncAlt
              className={`text-[10px] ${isFetching ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            새로고침
          </button>
        </div>
      </div>

      {/* 주문 기본 정보 카드 */}
      <div className={`${COMPANY_THEME.card} ${COMPANY_THEME.cardPadding}`}>
        {/* 제목 + 상태 */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h2 className={`text-xl font-bold ${TEXT_COLOR.primary} leading-snug mb-2`}>
              {order.title || '제목 없음'}
            </h2>
            <div className={`flex items-center gap-2 text-sm ${TEXT_COLOR.tertiary}`}>
              <FaBuilding className="flex-shrink-0 text-xs" aria-hidden="true" />
              <span>{order.companyName}</span>
            </div>
          </div>

          <StatusBadge status={customerStatus} className="flex-shrink-0 text-sm px-3 py-1.5" />
        </div>

        <div className={DIVIDER.horizontal} />

        {/* 날짜 정보 (고객에게 유용한 정보만) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
          <DateInfo
            icon={<FaCalendarAlt aria-hidden="true" />}
            label="접수일"
            value={formatDate(order.createdAt)}
          />
          {order.dueDate && (
            <DateInfo
              icon={<FaCalendarAlt aria-hidden="true" />}
              label="납기 예정일"
              value={formatDate(order.dueDate)}
              highlight
            />
          )}
          {order.deliveredAt && (
            <DateInfo
              icon={<FaCalendarAlt aria-hidden="true" />}
              label="납품 완료일"
              value={formatDate(order.deliveredAt)}
              success
            />
          )}
        </div>
      </div>

      {/* 진행 상황 타임라인 카드 */}
      <div className={`${COMPANY_THEME.card} ${COMPANY_THEME.cardPadding}`}>
        <div className="flex items-center gap-2 mb-6">
          <FaClipboardList className="text-[#ED6C00]" aria-hidden="true" />
          <h3 className={`text-lg font-bold ${TEXT_COLOR.primary}`}>진행 현황</h3>
        </div>

        <OrderStatusTimeline steps={timelineSteps} />

        {/* 현재 상태 설명 */}
        <div className={`mt-6 p-4 rounded-lg ${BG_COLOR.light} border ${BORDER_COLOR.light}`}>
          <p className={`text-sm font-medium ${TEXT_COLOR.primary} mb-1`}>현재 상태</p>
          <p className={`text-sm ${TEXT_COLOR.secondary}`}>
            {getStatusDescription(customerStatus)}
          </p>
        </div>
      </div>

      {/* 납품 증빙 사진 */}
      {order.deliveryProofImage && order.contactUuid && (
        <div className={`${COMPANY_THEME.card} ${COMPANY_THEME.cardPadding}`}>
          <h3 className={`text-base font-semibold ${TEXT_COLOR.primary} mb-3`}>납품 증빙 사진</h3>
          <DeliveryProofImage
            contactId={order.contactUuid}
            className="w-full max-h-60 object-cover rounded-lg"
          />
          {order.deliveredAt && (
            <p className={`text-xs ${TEXT_COLOR.muted} mt-2`}>
              {formatDate(order.deliveredAt)} 납품완료
            </p>
          )}
        </div>
      )}

      {/* 도면 업로드 — contactUuid가 있는 경우만 */}
      {order.contactUuid && <CompanyDrawingUpload contactId={order.contactUuid} />}

      {/* 도면 이력 — contactUuid가 있는 경우만 */}
      {order.contactUuid && <CompanyDrawingHistory contactId={order.contactUuid} />}

      {/* 이벤트 이력 (공개 가능한 항목만) */}
      {order.events && order.events.length > 0 && (
        <OrderEventHistory events={order.events} companyId={companyId} />
      )}
    </div>
  );
};

// ============================================
// 서브 컴포넌트: 날짜 정보 아이템
// ============================================

interface DateInfoProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  success?: boolean;
}

const DateInfo: FC<DateInfoProps> = ({ icon, label, value, highlight, success }) => {
  return (
    <div className={`flex flex-col gap-1`}>
      <p className={`text-xs font-medium ${TEXT_COLOR.muted} flex items-center gap-1.5`}>
        <span className="text-[10px]">{icon}</span>
        {label}
      </p>
      <p
        className={`text-sm font-semibold ${
          success ? TEXT_COLOR.success : highlight ? 'text-[#ED6C00]' : TEXT_COLOR.primary
        }`}
      >
        {value}
      </p>
    </div>
  );
};

// ============================================
// 서브 컴포넌트: 이벤트 이력 (고객용 공개 정보만)
// ============================================

interface OrderEventHistoryProps {
  events: Array<{
    id: string;
    type: string;
    description: string;
    createdAt: string;
    status?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
  companyId: number;
}

// 고객에게 공개 가능한 이벤트 타입
const PUBLIC_EVENT_TYPES = new Set([
  'status_changed',
  'order_created',
  'delivery_started',
  'delivery_completed',
  'order_completed',
]);

// 고객용 이벤트 설명 변환 (내부 정보 숨김)
function getPublicEventDescription(type: string, description: string): string | null {
  if (!PUBLIC_EVENT_TYPES.has(type)) return null;

  // 내부 정보가 포함된 설명은 간소화
  switch (type) {
    case 'order_created':
      return '주문이 접수되었습니다.';
    case 'status_changed':
      return description.includes('nesting') || description.includes('cutting')
        ? '작업이 진행 중입니다.'
        : description;
    case 'delivery_started':
      return '납품이 시작되었습니다.';
    case 'delivery_completed':
      return '납품이 완료되었습니다.';
    case 'order_completed':
      return '주문이 완료되었습니다.';
    default:
      return description;
  }
}

const OrderEventHistory: FC<OrderEventHistoryProps> = ({ events }) => {
  // 고객에게 공개 가능한 이벤트만 필터링
  const publicEvents = events.filter((event) => PUBLIC_EVENT_TYPES.has(event.type)).slice(0, 10); // 최대 10건 표시

  if (publicEvents.length === 0) return null;

  return (
    <div className={`${COMPANY_THEME.card} ${COMPANY_THEME.cardPadding}`}>
      <h3 className={`text-lg font-bold ${TEXT_COLOR.primary} mb-5`}>처리 이력</h3>

      <ol className="space-y-3" aria-label="주문 처리 이력">
        {publicEvents.map((event) => {
          const publicDescription = getPublicEventDescription(event.type, event.description);
          if (!publicDescription) return null;

          return (
            <li
              key={event.id}
              className={`flex gap-3 pb-3 border-b ${BORDER_COLOR.light} last:border-0 last:pb-0`}
            >
              {/* 타임라인 점 */}
              <div className="flex-shrink-0 mt-1">
                <div className="w-2 h-2 rounded-full bg-[#ED6C00]" aria-hidden="true" />
              </div>

              {/* 내용 */}
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${TEXT_COLOR.secondary} leading-relaxed`}>
                  {publicDescription}
                </p>
                <p className={`text-xs ${TEXT_COLOR.muted} mt-0.5`}>
                  {formatDate(event.createdAt)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

// ============================================
// 서브 컴포넌트: 실시간 상태 표시
// ============================================

interface RealtimeIndicatorProps {
  status: 'connected' | 'disconnected' | 'reconnecting';
}

const RealtimeIndicator: FC<RealtimeIndicatorProps> = ({ status }) => {
  const config = {
    connected: { color: 'bg-green-500', text: '실시간', textClass: TEXT_COLOR.success },
    reconnecting: {
      color: 'bg-yellow-500 animate-pulse',
      text: '재연결 중',
      textClass: TEXT_COLOR.warning,
    },
    disconnected: { color: 'bg-gray-400', text: '오프라인', textClass: TEXT_COLOR.muted },
  }[status];

  return (
    <div
      className="flex items-center gap-1.5"
      aria-live="polite"
      aria-label={`연결 상태: ${config.text}`}
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
// 서브 컴포넌트: 로딩 스켈레톤
// ============================================

const OrderDetailSkeleton: FC = () => {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="주문 상세 로딩 중">
      {/* 뒤로 가기 스켈레톤 */}
      <div className={`h-5 w-24 ${BG_COLOR.light} rounded animate-pulse`} aria-hidden="true" />

      {/* 기본 정보 카드 스켈레톤 */}
      <div className={`${COMPANY_THEME.card} p-6`} aria-hidden="true">
        <div className={`h-7 w-3/4 ${BG_COLOR.light} rounded animate-pulse mb-3`} />
        <div className={`h-4 w-1/4 ${BG_COLOR.light} rounded animate-pulse mb-6`} />
        <div className={`h-px ${BG_COLOR.light} mb-5`} />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={`h-10 ${BG_COLOR.light} rounded animate-pulse`} />
          ))}
        </div>
      </div>

      {/* 타임라인 카드 스켈레톤 */}
      <div className={`${COMPANY_THEME.card} p-6`} aria-hidden="true">
        <div className={`h-6 w-24 ${BG_COLOR.light} rounded animate-pulse mb-6`} />
        <div className="flex justify-between">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className={`w-8 h-8 rounded-full ${BG_COLOR.light} animate-pulse`} />
              <div className={`h-3 w-8 ${BG_COLOR.light} rounded animate-pulse`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================
// 상태 설명 텍스트 (고객용)
// ============================================

function getStatusDescription(status: ReturnType<typeof toCustomerStatus>): string {
  switch (status) {
    case '접수됨':
      return '주문이 접수되었으며 도면 검토 중입니다. 작업 준비가 완료되면 안내드리겠습니다.';
    case '작업 준비중':
      return '도면 확인이 완료되어 작업 준비 중입니다. 곧 가공 작업이 시작됩니다.';
    case '작업중':
      return '레이저 커팅 작업이 진행 중입니다. 작업 완료 후 품질 검사를 진행합니다.';
    case '작업 완료':
      return '가공 작업이 완료되어 품질 검사 및 후처리 중입니다. 납품 준비가 완료되면 안내드리겠습니다.';
    case '납품 진행중':
      return '납품이 진행 중입니다. 빠른 시일 내에 전달될 예정입니다.';
    case '납품 완료':
      return '납품이 완료되었습니다. 이용해 주셔서 감사합니다.';
    case '완료':
      return '모든 작업이 완료되었습니다. 이용해 주셔서 감사합니다.';
    default:
      return '처리 중입니다.';
  }
}

export { OrderDetailClient };
