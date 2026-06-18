/**
 * 알림 뱃지 컴포넌트 (수정요청, 예약변경, 배송방법)
 */
'use client';

import { memo, useCallback } from 'react';
import { FaExclamationCircle } from 'react-icons/fa';
import { BADGE, BG_COLOR, TRANSITION_STYLES } from '@/lib/styles';
import type { Contact, NotificationBadgeType } from '@/lib/types';
import { scrollToSection } from '@/app/(admin)/admin/contacts/_lib/utils';

interface NotificationBadgeProps {
  type: NotificationBadgeType;
  contact: Contact;
  isDismissed: boolean;
  onDismiss: () => void;
  isExpanded: boolean;
  onExpand: () => void;
}

/**
 * 뱃지 타입별 설정
 */
const BADGE_CONFIG: Record<
  NotificationBadgeType,
  {
    label: string;
    badgeClass: string;
    hoverClass: string;
    sectionIdPrefix: string;
    highlightColor: 'red' | 'green' | 'blue';
  }
> = {
  revision: {
    label: '수정요청',
    badgeClass: BADGE.error,
    hoverClass: BG_COLOR.hoverErrorDeep,
    sectionIdPrefix: 'revision-request-section',
    highlightColor: 'red',
  },
  visit: {
    label: '예약변경',
    badgeClass: BADGE.success,
    hoverClass: BG_COLOR.hoverSuccessMedium,
    sectionIdPrefix: 'visit-schedule-section',
    highlightColor: 'green',
  },
  delivery: {
    label: '배송방법',
    badgeClass: BADGE.info,
    hoverClass: BG_COLOR.hoverInfoStrong,
    sectionIdPrefix: 'delivery-method-section',
    highlightColor: 'blue',
  },
};

/**
 * 알림 뱃지 표시 조건 확인
 */
export function shouldShowBadge(
  type: NotificationBadgeType,
  contact: Contact,
  isDismissed: boolean
): boolean {
  if (isDismissed) return false;

  switch (type) {
    case 'revision':
      return !!contact.revision_request_title;
    case 'visit':
      // 예약변경: 배송방법이 없고 방문 예약 변경이 있을 때만
      return (
        (!!contact.visit_date || !!contact.visit_time_slot) &&
        !!contact.booking_changed_at &&
        !contact.delivery_method
      );
    case 'delivery':
      return !!contact.delivery_method && !!contact.delivery_method_changed_at;
    default:
      return false;
  }
}

/**
 * 알림 뱃지 컴포넌트
 */
function NotificationBadgeComponent({
  type,
  contact,
  isDismissed,
  onDismiss,
  isExpanded,
  onExpand,
}: NotificationBadgeProps) {
  const config = BADGE_CONFIG[type];

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      // 뱃지 해제
      onDismiss();

      // 확장 및 스크롤
      if (!isExpanded) {
        onExpand();
      }

      // 섹션으로 스크롤
      const sectionId = `${config.sectionIdPrefix}-${contact.id}`;
      scrollToSection(sectionId, isExpanded, config.highlightColor);
    },
    [contact.id, config, isExpanded, onDismiss, onExpand]
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // 표시 조건 확인
  if (!shouldShowBadge(type, contact, isDismissed)) {
    return null;
  }

  return (
    <button
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      className={`
        relative z-10 inline-flex items-center gap-1 px-2 py-1
        text-xs font-medium rounded-full flex-shrink-0
        animate-pulse cursor-pointer
        ${config.badgeClass} ${config.hoverClass} ${TRANSITION_STYLES.colors}
      `}
    >
      <FaExclamationCircle className="text-xs" />
      {config.label}
    </button>
  );
}

export const NotificationBadge = memo(NotificationBadgeComponent);
