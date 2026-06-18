'use client';

import type { FC } from 'react';
import { BADGE } from '@/lib/styles';
import type { CustomerOrderStatus } from '@/app/company/orders/_lib/types';
import { getStatusBadgeVariant } from '@/app/company/orders/_lib/statusUtils';

interface StatusBadgeProps {
  status: CustomerOrderStatus;
  className?: string;
}

/**
 * 주문 상태 뱃지 컴포넌트
 * 고객용 상태를 색상으로 시각화
 */
const StatusBadge: FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const variant = getStatusBadgeVariant(status);

  const badgeClass = (() => {
    switch (variant) {
      case 'success':
        return BADGE.success;
      case 'warning':
        return BADGE.warning;
      case 'info':
        return BADGE.info;
      case 'primary':
        return BADGE.primary;
      case 'gray':
      default:
        return BADGE.gray;
    }
  })();

  return <span className={`${badgeClass} ${className}`}>{status}</span>;
};

export default StatusBadge;
