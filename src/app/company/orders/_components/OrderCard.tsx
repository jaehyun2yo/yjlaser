'use client';

import type { FC } from 'react';
import Link from 'next/link';
import { FaCalendarAlt, FaChevronRight, FaBuilding } from 'react-icons/fa';
import { LAYOUT, BORDER_COLOR, TEXT_COLOR, BG_COLOR, TRANSITION_STYLES } from '@/lib/styles';
import type { OrderListItem } from '@/app/company/orders/_lib/types';
import { toCustomerStatus, formatDate, formatDateShort } from '@/app/company/orders/_lib/statusUtils';
import StatusBadge from './StatusBadge';

interface OrderCardProps {
  order: OrderListItem;
}

/**
 * 주문 목록 카드 컴포넌트
 * 고객용 주문 정보를 카드 형태로 표시
 * 내부 정보(가격, 네스팅 효율 등)는 표시하지 않음
 */
const OrderCard: FC<OrderCardProps> = ({ order }) => {
  const customerStatus = toCustomerStatus(order.status);

  return (
    <Link
      href={`/company/orders/${order.id}`}
      className={`
        block ${LAYOUT.card} ${TRANSITION_STYLES.all}
        hover:shadow-lg hover:-translate-y-0.5
        focus:outline-none focus:ring-2 focus:ring-[#ED6C00] focus:ring-offset-2
      `}
      aria-label={`${order.title} 주문 상세 보기`}
    >
      <div className="p-5">
        {/* 헤더: 상태 뱃지 + 화살표 */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <StatusBadge status={customerStatus} />
          <FaChevronRight
            className={`flex-shrink-0 text-sm ${TEXT_COLOR.muted} mt-0.5`}
            aria-hidden="true"
          />
        </div>

        {/* 주문 제목 */}
        <h3
          className={`text-base font-semibold ${TEXT_COLOR.primary} mb-3 leading-snug line-clamp-2`}
        >
          {order.title || '제목 없음'}
        </h3>

        {/* 메타 정보 */}
        <div className={`space-y-1.5 pt-3 border-t ${BORDER_COLOR.light}`}>
          {/* 업체명 */}
          <div className={`flex items-center gap-2 text-xs ${TEXT_COLOR.tertiary}`}>
            <FaBuilding className="flex-shrink-0 text-[10px]" aria-hidden="true" />
            <span className="truncate">{order.companyName}</span>
          </div>

          {/* 날짜 정보 */}
          <div className={`flex items-center justify-between text-xs ${TEXT_COLOR.muted}`}>
            <div className="flex items-center gap-1.5">
              <FaCalendarAlt className="flex-shrink-0 text-[10px]" aria-hidden="true" />
              <span>접수: {formatDateShort(order.createdAt)}</span>
            </div>

            {order.dueDate && (
              <span className="text-right">
                납기:{' '}
                <span className={`font-medium ${TEXT_COLOR.secondary}`}>
                  {formatDate(order.dueDate)}
                </span>
              </span>
            )}
          </div>

          {/* 납품 완료 날짜 */}
          {order.deliveredAt && (
            <div className={`flex items-center gap-1.5 text-xs ${TEXT_COLOR.success}`}>
              <span
                className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0"
                aria-hidden="true"
              />
              <span>납품 완료: {formatDate(order.deliveredAt)}</span>
            </div>
          )}
        </div>
      </div>

      {/* 하단 진행 표시줄 */}
      <div className={`h-1 ${BG_COLOR.light} rounded-b-lg overflow-hidden`}>
        <div
          className="h-full bg-[#ED6C00] rounded-b-lg transition-all duration-500"
          style={{ width: getProgressWidth(customerStatus) }}
          role="progressbar"
          aria-label={`진행률: ${customerStatus}`}
        />
      </div>
    </Link>
  );
};

/**
 * 고객 상태에 따른 진행 막대 너비 계산
 */
function getProgressWidth(status: ReturnType<typeof toCustomerStatus>): string {
  switch (status) {
    case '접수됨':
      return '15%';
    case '작업 준비중':
      return '30%';
    case '작업중':
      return '55%';
    case '작업 완료':
      return '75%';
    case '납품 진행중':
      return '88%';
    case '납품 완료':
    case '완료':
      return '100%';
    default:
      return '5%';
  }
}

export default OrderCard;
