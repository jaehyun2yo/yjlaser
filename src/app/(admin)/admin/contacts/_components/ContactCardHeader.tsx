/**
 * 문의 카드 헤더 컴포넌트
 * 행1: 태그 (상태, 분류, 번호) + 업체명 - 문의명 + 오른쪽(웹하드, 시간, 토글)
 */
'use client';

import { memo, useMemo } from 'react';
import { FaChevronDown } from 'react-icons/fa';
import { Siren } from 'lucide-react';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR, TRANSITION_STYLES, BADGE, TAG } from '@/lib/styles';
import type { Contact } from '@/lib/types';
import {
  getStatusBadgeClass,
  getStatusLabel,
  getDaysUntilPermanentDelete,
  formatCreatedAt,
} from '@/app/(admin)/admin/contacts/_lib/utils';
import { NotificationBadge, shouldShowBadge } from './NotificationBadge';
import { InquiryTypeBadge } from './InquiryTypeBadge';

interface ContactCardHeaderProps {
  contact: Contact;
  isExpanded: boolean;
  mounted: boolean;
  isRevisionRequestDismissed: boolean;
  isVisitScheduleDismissed: boolean;
  isDeliveryMethodDismissed: boolean;
  onDismissRevisionRequest: () => void;
  onDismissVisitSchedule: () => void;
  onDismissDeliveryMethod: () => void;
  onExpand: () => void;
  onStopPropagation?: (e: React.MouseEvent) => void;
}

/** 표시할 문의명 결정: inquiry_title > attachment_filename > drawing_file_name
 *  inquiry_title에 포함된 번호+업체명 접두사는 제거 (카드 헤더에 이미 별도 표시) */
function getDisplayTitle(contact: Contact): string | null {
  const raw = contact.inquiry_title || contact.attachment_filename || contact.drawing_file_name;
  if (!raw) return null;

  let title = raw;
  if (contact.inquiry_number && title.startsWith(contact.inquiry_number)) {
    title = title.slice(contact.inquiry_number.length).trim();
  }
  if (contact.company_name && title.startsWith(contact.company_name)) {
    title = title.slice(contact.company_name.length).trim();
  }

  return title || null;
}

function ContactCardHeaderComponent({
  contact,
  isExpanded,
  mounted,
  isRevisionRequestDismissed,
  isVisitScheduleDismissed,
  isDeliveryMethodDismissed,
  onDismissRevisionRequest,
  onDismissVisitSchedule,
  onDismissDeliveryMethod,
  onExpand,
  onStopPropagation,
}: ContactCardHeaderProps) {
  const statusBadgeClass = useMemo(() => getStatusBadgeClass(contact.status), [contact.status]);
  const statusLabel = useMemo(() => getStatusLabel(contact.status), [contact.status]);
  const createdAtLabel = useMemo(() => formatCreatedAt(contact.created_at), [contact.created_at]);
  const displayTitle = useMemo(
    () => getDisplayTitle(contact),
    [
      contact.inquiry_title,
      contact.attachment_filename,
      contact.drawing_file_name,
      contact.inquiry_number,
      contact.company_name,
    ]
  );

  const daysUntilDelete = useMemo(() => {
    if (contact.status === 'deleting' && contact.deleted_at) {
      return getDaysUntilPermanentDelete(contact.deleted_at);
    }
    return null;
  }, [contact.status, contact.deleted_at]);

  return (
    <div className="mb-2 space-y-1">
      {/* 행1: 태그 + 오른쪽 정보 */}
      <div className="flex items-center justify-between gap-2">
        {/* 왼쪽: 상태 태그들 + 알림 뱃지 */}
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          {/* 긴급 배지 (항상 제일 왼쪽) */}
          {contact.is_urgent && (
            <span
              data-testid="urgent-badge"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded bg-red-600 text-white flex-shrink-0"
            >
              <Siren className="w-3.5 h-3.5 animate-pulse" />
              긴급
            </span>
          )}

          {/* 상태 배지 */}
          <span className={`${statusBadgeClass} flex items-center flex-shrink-0 text-xs`}>
            {contact.status === 'received' && (
              <span className="relative flex h-2 w-2 mr-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
            )}
            {statusLabel}
          </span>

          {/* 삭제 예정 표시 */}
          {daysUntilDelete !== null && (
            <span
              className={`text-xs font-bold ${TEXT_COLOR.error} ${BG_COLOR.error} px-1.5 py-0.5 rounded border ${BORDER_COLOR.error} flex-shrink-0`}
            >
              D-{daysUntilDelete}
            </span>
          )}

          {/* 문의 유형 배지 (칼선/목형/미분류) */}
          <InquiryTypeBadge
            contact={contact}
            mode="label-only"
            onStopPropagation={onStopPropagation}
          />

          {/* 문의번호 태그 */}
          {contact.inquiry_number && (
            <span className={`${TAG.outline} font-mono text-xs flex-shrink-0`}>
              {contact.inquiry_number}
            </span>
          )}
          {contact.work_number && (
            <span className={`${TAG.outline} font-mono text-xs flex-shrink-0`}>
              {contact.work_number}
            </span>
          )}

          {/* 알림 뱃지들 */}
          {mounted && (
            <>
              {shouldShowBadge('revision', contact, isRevisionRequestDismissed) && (
                <NotificationBadge
                  type="revision"
                  contact={contact}
                  isDismissed={isRevisionRequestDismissed}
                  onDismiss={onDismissRevisionRequest}
                  isExpanded={isExpanded}
                  onExpand={onExpand}
                />
              )}
              {shouldShowBadge('visit', contact, isVisitScheduleDismissed) && (
                <NotificationBadge
                  type="visit"
                  contact={contact}
                  isDismissed={isVisitScheduleDismissed}
                  onDismiss={onDismissVisitSchedule}
                  isExpanded={isExpanded}
                  onExpand={onExpand}
                />
              )}
              {shouldShowBadge('delivery', contact, isDeliveryMethodDismissed) && (
                <NotificationBadge
                  type="delivery"
                  contact={contact}
                  isDismissed={isDeliveryMethodDismissed}
                  onDismiss={onDismissDeliveryMethod}
                  isExpanded={isExpanded}
                  onExpand={onExpand}
                />
              )}
            </>
          )}
        </div>

        {/* 오른쪽: 웹하드 태그 + 등록일시 + 토글 */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {contact.source === 'webhard' && (
            <span className={`${BADGE.gray} text-xs flex-shrink-0 ${TRANSITION_STYLES.colors}`}>
              웹하드 자동생성
            </span>
          )}
          <span className={`text-xs ${TEXT_COLOR.muted}`}>{createdAtLabel}</span>
          <div
            className={`p-1 rounded transition-all duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          >
            <FaChevronDown className={`text-xs ${TEXT_COLOR.muted}`} />
          </div>
        </div>
      </div>

      {/* 행2: 업체명 - 문의명(파일명) */}
      <h3 className={`text-sm md:text-base font-semibold ${TEXT_COLOR.primary} truncate`}>
        {contact.company_name}
        {displayTitle && (
          <span className={`${TEXT_COLOR.secondary} font-normal`}>
            {' - '}
            {displayTitle}
          </span>
        )}
      </h3>
    </div>
  );
}

export const ContactCardHeader = memo(ContactCardHeaderComponent);
