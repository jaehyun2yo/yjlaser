/**
 * 문의 카드 컴포넌트 (래퍼)
 * 모든 카드 서브 컴포넌트를 조합
 */
'use client';

import { memo, useCallback, useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { Contact, InquiryType } from '@/lib/types';
import { ContactCardHeader } from './ContactCardHeader';
import { ContactCardSummary } from './ContactCardSummary';
import { ContactCardActions } from './ContactCardActions';
import { ContactDetailView } from './ContactDetailView';
import { ContactContextMenu } from './ContactContextMenu';
import { useMounted, useNotificationDismissal } from '@/app/(admin)/admin/contacts/_lib/hooks';
import { CARD_STYLES } from '@/app/(admin)/admin/contacts/_lib/constants';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('ContactCard');

export interface ContactCardProps {
  contact: Contact;
  isExpanded?: boolean;
  onToggle?: (id: string) => void;
  /** 알림 클릭 시 강조 표시 */
  isHighlighted?: boolean;
}

function ContactCardComponent({
  contact,
  isExpanded: externalExpanded,
  onToggle: externalToggle,
  isHighlighted = false,
}: ContactCardProps) {
  // 자체 확장 상태 (외부 제어가 없을 때 사용)
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = externalToggle ? (externalExpanded ?? false) : internalExpanded;
  const onToggle = externalToggle ?? (() => setInternalExpanded((prev) => !prev));
  const queryClient = useQueryClient();
  const mounted = useMounted();

  // 복구/영구삭제 상태
  const [isRestoring, setIsRestoring] = useState(false);
  const [isPermanentlyDeleting, setIsPermanentlyDeleting] = useState(false);

  // 재분류 컨텍스트 메뉴 상태
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // 알림 해제 상태 관리
  const {
    checkRevisionRequestDismissed,
    checkVisitScheduleDismissed,
    isDeliveryMethodDismissed,
    dismissRevisionRequest,
    dismissVisitSchedule,
    dismissDeliveryMethod,
  } = useNotificationDismissal(contact.id);

  // 실제 해제 상태 값 계산
  const isRevisionRequestDismissed = useMemo(
    () => checkRevisionRequestDismissed(contact.revision_requested_at),
    [checkRevisionRequestDismissed, contact.revision_requested_at]
  );

  const isVisitScheduleDismissed = useMemo(
    () => checkVisitScheduleDismissed(contact.booking_changed_at),
    [checkVisitScheduleDismissed, contact.booking_changed_at]
  );

  // 이벤트 전파 방지
  const handleStopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // 카드 토글 핸들러
  const handleToggle = useCallback(() => {
    onToggle(contact.id);
  }, [contact.id, onToggle]);

  // 카드 확장 핸들러 (알림 뱃지 클릭 시)
  const handleExpand = useCallback(() => {
    if (!isExpanded) {
      onToggle(contact.id);
    }
  }, [isExpanded, contact.id, onToggle]);

  // 알림 해제 핸들러들 (contact 데이터를 포함)
  const handleDismissRevisionRequest = useCallback(() => {
    dismissRevisionRequest(contact.revision_requested_at);
  }, [dismissRevisionRequest, contact.revision_requested_at]);

  const handleDismissVisitSchedule = useCallback(() => {
    dismissVisitSchedule(contact.booking_changed_at);
  }, [dismissVisitSchedule, contact.booking_changed_at]);

  // 작업시작 핸들러
  const handleStartWork = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const response = await fetch(`/api/contacts/${contact.id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'drawing' }),
        });

        if (response.ok) {
          queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        } else {
          alert('작업 시작에 실패했습니다.');
        }
      } catch (error) {
        log.error('Error starting work:', error);
        alert('작업 시작 중 오류가 발생했습니다.');
      }
    },
    [contact.id, queryClient]
  );

  // 상태 변경 핸들러
  const handleChangeStatus = useCallback(
    async (status: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const response = await fetch(`/api/contacts/${contact.id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });

        if (response.ok) {
          queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        } else {
          alert('상태 변경에 실패했습니다.');
        }
      } catch (error) {
        log.error('Error changing status:', error);
        alert('상태 변경 중 오류가 발생했습니다.');
      }
    },
    [contact.id, queryClient]
  );

  // 복구 핸들러
  const handleRestore = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsRestoring(true);

      try {
        const response = await fetch(`/api/contacts/${contact.id}/restore`, {
          method: 'POST',
        });

        if (response.ok) {
          queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        } else {
          const error = await response.json();
          alert(`복구 실패: ${error.error || '알 수 없는 오류가 발생했습니다.'}`);
        }
      } catch (error) {
        log.error('Error restoring contact:', error);
        alert('복구 중 오류가 발생했습니다.');
      } finally {
        setIsRestoring(false);
      }
    },
    [contact.id, queryClient]
  );

  // 영구 삭제 핸들러
  const handlePermanentDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();

      const contactName = contact.company_name || contact.name || `문의 #${contact.id}`;
      if (
        !confirm(
          `정말로 "${contactName}" 문의를 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`
        )
      ) {
        return;
      }

      setIsPermanentlyDeleting(true);

      try {
        const response = await fetch(`/api/contacts/${contact.id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permanent: true }),
        });

        if (response.ok) {
          alert('문의가 영구 삭제되었습니다.');
          queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        } else {
          const error = await response.json();
          alert(`영구 삭제 실패: ${error.error || '알 수 없는 오류가 발생했습니다.'}`);
        }
      } catch (error) {
        log.error('Error permanently deleting contact:', error);
        alert('영구 삭제 중 오류가 발생했습니다.');
      } finally {
        setIsPermanentlyDeleting(false);
      }
    },
    [contact.id, contact.company_name, contact.name, queryClient]
  );

  // 우클릭 컨텍스트 메뉴 핸들러 (분류된 카드에서만)
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const isUnclassified = !contact.inquiry_type;
      if (isUnclassified) return;
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [contact.inquiry_type]
  );

  // 재분류 핸들러 (컨텍스트 메뉴에서 호출)
  const handleReclassify = useCallback(
    async (inquiryType: InquiryType) => {
      if (contact.status !== 'received') {
        const targetLabel =
          inquiryType === 'cutting_request' ? '칼선의뢰 → 도면작업' : '목형의뢰 → 컨펌';
        const ok = window.confirm(
          `재분류 시 공정 상태도 함께 변경됩니다.\n(${targetLabel})\n진행하시겠습니까?`
        );
        if (!ok) return;
      }

      try {
        const response = await fetch(`/api/contacts/${contact.id}/inquiry-type`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inquiry_type: inquiryType }),
        });

        if (response.ok) {
          queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        } else {
          const error = await response.json();
          alert(error.error || '문의 유형 변경에 실패했습니다.');
        }
      } catch (error) {
        log.error('Error reclassifying contact:', error);
        alert('문의 유형 변경 중 오류가 발생했습니다.');
      }
    },
    [contact.id, contact.status, queryClient]
  );

  const highlightClass = isHighlighted
    ? 'ring-2 ring-orange-500 shadow-lg shadow-orange-500/20 animate-pulse'
    : '';

  return (
    <div className={`${CARD_STYLES.container} ${highlightClass}`} onContextMenu={handleContextMenu}>
      {/* 클릭 가능한 헤더 영역 */}
      <div className={CARD_STYLES.header} onClick={handleToggle}>
        {/* 헤더: 상태, 업체명, 문의번호, 알림뱃지 */}
        <ContactCardHeader
          contact={contact}
          isExpanded={isExpanded}
          mounted={mounted}
          isRevisionRequestDismissed={isRevisionRequestDismissed}
          isVisitScheduleDismissed={isVisitScheduleDismissed}
          isDeliveryMethodDismissed={isDeliveryMethodDismissed}
          onDismissRevisionRequest={handleDismissRevisionRequest}
          onDismissVisitSchedule={handleDismissVisitSchedule}
          onDismissDeliveryMethod={dismissDeliveryMethod}
          onExpand={handleExpand}
          onStopPropagation={handleStopPropagation}
        />

        {/* 요약 정보: 신규가 아닐 때만 표시 */}
        <ContactCardSummary contact={contact} onStopPropagation={handleStopPropagation} />

        {/* 액션 버튼 */}
        <ContactCardActions
          contact={contact}
          onStartWork={handleStartWork}
          onChangeStatus={handleChangeStatus}
          onRestore={handleRestore}
          onPermanentDelete={handlePermanentDelete}
          isRestoring={isRestoring}
          isPermanentlyDeleting={isPermanentlyDeleting}
          onStopPropagation={handleStopPropagation}
        />
      </div>

      {/* 상세 뷰 (확장 시 표시) */}
      <ContactDetailView contact={contact} isExpanded={isExpanded} />

      {/* 우클릭 재분류 컨텍스트 메뉴 */}
      {contextMenu && (
        <ContactContextMenu
          contact={contact}
          x={contextMenu.x}
          y={contextMenu.y}
          onSelectInquiryType={handleReclassify}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export const ContactCard = memo(ContactCardComponent);
