/**
 * 문의 카드 액션 버튼 컴포넌트
 */
'use client';

import { memo, useCallback } from 'react';
import { FaUndo, FaTrash } from 'react-icons/fa';
import {
  FILTER_BUTTON_STYLES,
  BADGE,
  BG_COLOR,
  BORDER_COLOR,
  TRANSITION_STYLES,
} from '@/lib/styles';
import type { Contact } from '@/lib/types';
import { DeleteButton } from '@/app/(admin)/admin/contacts/delete-button';
import { InquiryClassifyButtons } from '@/components/contacts/InquiryClassifyButtons';

interface ContactCardActionsProps {
  contact: Contact;
  onStartWork: (e: React.MouseEvent) => Promise<void>;
  onChangeStatus: (status: string, e: React.MouseEvent) => Promise<void>;
  onRestore: (e: React.MouseEvent) => Promise<void>;
  onPermanentDelete: (e: React.MouseEvent) => Promise<void>;
  isRestoring: boolean;
  isPermanentlyDeleting: boolean;
  onStopPropagation: (e: React.MouseEvent) => void;
}

function ContactCardActionsComponent({
  contact,
  onStartWork,
  onChangeStatus,
  onRestore,
  onPermanentDelete,
  isRestoring,
  isPermanentlyDeleting,
  onStopPropagation,
}: ContactCardActionsProps) {
  // 미분류 여부 (Hooks 규칙: 조건부 return 전에 선언)
  const isUnclassified = contact.source === 'webhard' && !contact.inquiry_type;

  // 상태 변경 핸들러들
  const handleSetOnHold = useCallback(
    (e: React.MouseEvent) => onChangeStatus('on_hold', e),
    [onChangeStatus]
  );

  const handleSetInProgress = useCallback(
    (e: React.MouseEvent) => onChangeStatus('drawing', e),
    [onChangeStatus]
  );

  const handleSetRevisionInProgress = useCallback(
    (e: React.MouseEvent) => onChangeStatus('drawing', e),
    [onChangeStatus]
  );

  // 삭제중 상태: 복구/영구삭제 버튼
  if (contact.status === 'deleting') {
    return (
      <div className={`pt-3 border-t ${BORDER_COLOR.default} mt-3`}>
        <div className="flex items-center justify-start gap-2">
          {/* 복구 버튼 - 버튼만 stopPropagation */}
          <button
            onClick={(e) => {
              onStopPropagation(e);
              onRestore(e);
            }}
            disabled={isRestoring || isPermanentlyDeleting}
            className={`
              px-3 py-1.5 text-xs border ${BORDER_COLOR.default} rounded-lg cursor-pointer
              ${BADGE.info} ${BG_COLOR.hoverInfoDark} ${TRANSITION_STYLES.colors}
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center gap-1.5
            `}
          >
            <FaUndo className="text-xs" />
            {isRestoring ? '복구 중...' : '복구'}
          </button>

          {/* 영구 삭제 버튼 - 버튼만 stopPropagation */}
          <button
            onClick={(e) => {
              onStopPropagation(e);
              onPermanentDelete(e);
            }}
            disabled={isRestoring || isPermanentlyDeleting}
            className={`
              px-3 py-1.5 text-xs border ${BORDER_COLOR.error} rounded-lg cursor-pointer
              ${BADGE.error} ${BG_COLOR.hoverErrorDark} ${TRANSITION_STYLES.colors}
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center gap-1.5
            `}
          >
            <FaTrash className="text-xs" />
            {isPermanentlyDeleting ? '삭제 중...' : '지금삭제'}
          </button>
        </div>
      </div>
    );
  }

  // 일반 상태: 작업시작/상태변경/삭제 버튼
  // 버튼만 stopPropagation - 버튼 외 영역 클릭 시 카드 열림
  return (
    <div className={`pt-2 border-t ${BORDER_COLOR.default} mt-2`}>
      <div className="flex flex-row items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* 신규 상태: 미분류는 분류 CTA, 분류 완료는 작업시작 */}
          {contact.status === 'received' &&
            (isUnclassified ? (
              <InquiryClassifyButtons
                contact={contact}
                size="md"
                onStopPropagation={onStopPropagation}
              />
            ) : (
              <button
                onClick={(e) => {
                  onStopPropagation(e);
                  onStartWork(e);
                }}
                className={`px-2.5 py-1 text-[11px] rounded ${BG_COLOR.primary} ${BG_COLOR.primaryHover} text-white cursor-pointer ${TRANSITION_STYLES.colors}`}
              >
                작업시작
              </button>
            ))}

          {/* 상태 변경 버튼들 (신규가 아닐 때) - 각 버튼만 stopPropagation */}
          {contact.status !== 'received' && (
            <>
              {/* 보류/작업중 토글 */}
              {contact.status === 'on_hold' ? (
                <button
                  onClick={(e) => {
                    onStopPropagation(e);
                    handleSetInProgress(e);
                  }}
                  className="px-3 py-1.5 text-xs bg-[#ED6C00] hover:bg-[#d15f00] text-white rounded-lg transition-colors cursor-pointer"
                >
                  작업중으로 변경
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    onStopPropagation(e);
                    handleSetOnHold(e);
                  }}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${FILTER_BUTTON_STYLES.inactive}`}
                >
                  보류 중으로 변경
                </button>
              )}

              {/* 수정작업중/작업중 토글 */}
              {false ? (
                <button
                  onClick={(e) => {
                    onStopPropagation(e);
                    handleSetInProgress(e);
                  }}
                  className="px-3 py-1.5 text-xs bg-[#ED6C00] hover:bg-[#d15f00] text-white rounded-lg transition-colors cursor-pointer"
                >
                  작업중으로 변경
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    onStopPropagation(e);
                    handleSetRevisionInProgress(e);
                  }}
                  className={`px-3 py-1.5 text-xs ${BADGE.warning} ${BG_COLOR.hoverLight} ${TRANSITION_STYLES.colors} rounded-lg cursor-pointer`}
                >
                  수정작업중으로 변경
                </button>
              )}
            </>
          )}
        </div>

        {/* 삭제 버튼 - DeleteButton 내부에서 stopPropagation 처리 */}
        <div onClick={onStopPropagation}>
          <DeleteButton
            contactId={contact.id}
            contactName={contact.company_name || contact.name || `문의 #${contact.id}`}
          />
        </div>
      </div>
    </div>
  );
}

export const ContactCardActions = memo(ContactCardActionsComponent);
