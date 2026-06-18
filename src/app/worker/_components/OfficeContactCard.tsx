'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { getProcessStageInfo } from '@/lib/utils/processStages';
import OfficeAdvanceButton from './OfficeAdvanceButton';
import { InquiryClassifyButtons } from '@/components/contacts/InquiryClassifyButtons';
import { ConfirmModal } from './ConfirmModal';
import { InquiryTypeBadge } from '@/app/(admin)/admin/contacts/_components/InquiryTypeBadge';
import { Siren, Download, MessageSquare, ChevronDown, Upload } from 'lucide-react';
import { toggleStageCompleted, advanceSplitGroupStage } from '@/app/actions/contacts';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { downloadLatestDrawing } from '@/app/worker/_lib/downloadFiles';
import { useContactTimeline } from '@/lib/hooks/useContactTimeline';
import { useMinLoadingState } from '@/lib/hooks/useMinLoadingState';
import { ContactTimeline, ContactTimelineSkeleton } from '@/components/ContactTimeline';
import { WorkerDrawingUpload } from './WorkerDrawingUpload';
import { useTimelineRealtime } from './useTimelineRealtime';
import { getNextProcessStage } from '@/app/(admin)/admin/contacts/_lib/split-utils';
import {
  formatWorkerCreatedAt,
  formatWorkerInquiryNumbers,
} from '@/app/worker/_lib/formatWorkerContactMeta';
import { buildWorkerContactCardFilenameParts } from '@/lib/utils/contactDownloadFilename';
import { BG_COLOR, TEXT_COLOR } from '@/lib/styles';
import { Badge } from '@/components/ui/badge';
import type { Contact } from '@/lib/types/contact';

interface OfficeContactCardProps {
  contact: Contact;
  onAdvance: () => void;
  onAdvanceComplete: () => void;
  isAdvancing: boolean;
  onMemo?: (contactId: Contact['id']) => void;
  onContextMenu?: (contactId: Contact['id'], x: number, y: number) => void;
  onMarkNotificationRead?: (contactId: Contact['id']) => void;
  hasNewContactNotification?: boolean;
  isNotificationHighlighted?: boolean;
}

export default function OfficeContactCard({
  contact,
  onAdvance,
  onAdvanceComplete,
  isAdvancing,
  onMemo,
  onContextMenu,
  onMarkNotificationRead,
  hasNewContactNotification = false,
  isNotificationHighlighted = false,
}: OfficeContactCardProps) {
  const queryClient = useQueryClient();
  const stageInfo = getProcessStageInfo(contact.process_stage);
  const hasWebhardFolder = !!contact.webhard_folder_id;
  const [downloading, setDownloading] = useState(false);
  const [togglingChildId, setTogglingChildId] = useState<string | null>(null);
  const [confirmingChild, setConfirmingChild] = useState<Contact | null>(null);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [successWarning, setSuccessWarning] = useState<{ code: string; message: string } | null>(
    null
  );
  const canUploadDrawing =
    contact.process_stage === 'drawing' || contact.process_stage === 'sample';

  const isSplit = (contact.split_count ?? 0) > 0;
  const children = contact.children ?? [];
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [isBatchAdvancing, setIsBatchAdvancing] = useState(false);

  // 자식들의 실제 공정 단계 기준으로 다음 단계 계산 (부모 단계와 불일치 가능)
  const childrenStage = isSplit && children.length > 0 ? children[0].process_stage : null;
  const nextStageForGroup = isSplit && childrenStage ? getNextProcessStage(childrenStage) : null;
  const nextStageInfo = nextStageForGroup
    ? getProcessStageInfo(nextStageForGroup as NonNullable<typeof contact.process_stage>)
    : null;

  const handleBatchCompleteAndAdvance = async () => {
    if (!nextStageForGroup) return;
    onMarkNotificationRead?.(contact.id);
    setShowBatchConfirm(false);
    setIsBatchAdvancing(true);
    onAdvance();
    try {
      const result = await advanceSplitGroupStage(String(contact.id), nextStageForGroup, true);
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
      }
    } finally {
      setIsBatchAdvancing(false);
      onAdvanceComplete();
    }
  };

  // 모든 하위가 이미 완료 상태면 자동으로 다음 단계 이동
  const autoAdvancedRef = useRef(false);
  useEffect(() => {
    if (
      isSplit &&
      children.length > 0 &&
      children.every((c) => c.stage_completed) &&
      nextStageForGroup &&
      !autoAdvancedRef.current &&
      !isBatchAdvancing
    ) {
      autoAdvancedRef.current = true;
      advanceSplitGroupStage(String(contact.id), nextStageForGroup, true).then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
      });
    }
  }, [isSplit, children, nextStageForGroup, isBatchAdvancing, contact.id, queryClient]);

  const handleChildComplete = async (childId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onMarkNotificationRead?.(contact.id);
    setTogglingChildId(childId);
    try {
      await toggleStageCompleted(childId, true);

      // 이 child를 완료 처리한 후, 나머지가 모두 완료인지 확인 → 자동 이동
      const othersAllCompleted = children.every(
        (c) => String(c.id) === childId || c.stage_completed
      );
      if (othersAllCompleted && nextStageForGroup) {
        await advanceSplitGroupStage(String(contact.id), nextStageForGroup, true);
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
    } finally {
      setTogglingChildId(null);
    }
  };
  const { expanded, toggle, entries, isLoading: rawLoading } = useContactTimeline(contact.id);
  const isLoading = useMinLoadingState(rawLoading, 1000);
  useTimelineRealtime(String(contact.id), expanded);

  // Long press for mobile context menu
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchMoved = useRef(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      touchMoved.current = false;
      longPressTimerRef.current = setTimeout(() => {
        if (!touchMoved.current && onContextMenu) {
          e.preventDefault();
          onMarkNotificationRead?.(contact.id);
          const touch = e.touches[0];
          onContextMenu(contact.id, touch.clientX, touch.clientY);
        }
      }, 500);
    },
    [contact.id, onContextMenu, onMarkNotificationRead]
  );

  const handleTouchMove = useCallback(() => {
    touchMoved.current = true;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (onContextMenu) {
        e.preventDefault();
        onMarkNotificationRead?.(contact.id);
        onContextMenu(contact.id, e.clientX, e.clientY);
      }
    },
    [contact.id, onContextMenu, onMarkNotificationRead]
  );

  const handleDownloadFiles = async () => {
    if (downloading) return;
    onMarkNotificationRead?.(contact.id);
    setDownloading(true);
    try {
      await downloadLatestDrawing(contact.id, {
        inquiryNumber: contact.inquiry_number,
        workNumber: contact.work_number,
        companyName: contact.company_name,
        processStage: contact.process_stage,
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleCardClick = () => {
    onMarkNotificationRead?.(contact.id);
    toggle();
  };

  const stopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMarkNotificationRead?.(contact.id);
  };

  const workerNotes = contact.worker_notes ?? [];
  const urgent = !!contact.is_urgent;
  const showNewContactDot = hasNewContactNotification;
  const inquiryNumbers = formatWorkerInquiryNumbers({
    inquiryNumber: contact.inquiry_number,
    workNumber: contact.work_number,
  });
  const cardFileNameParts = buildWorkerContactCardFilenameParts({
    inquiryNumber: contact.inquiry_number,
    workNumber: contact.work_number,
    companyName: contact.company_name,
    fileName: contact.drawing_file_name,
  });
  const notificationHighlightClass = isNotificationHighlighted
    ? 'border-brand bg-brand-light ring-2 ring-brand shadow-md'
    : 'border-gray-200 bg-white';

  return (
    <div
      id={`worker-contact-${contact.id}`}
      data-contact-id={contact.id}
      data-notification-highlighted={isNotificationHighlighted ? 'true' : undefined}
      className={`rounded-lg cursor-pointer border shadow-sm transition-colors active:bg-gray-50 ${notificationHighlightClass}`}
      onClick={handleCardClick}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="px-3 py-2.5 flex items-start gap-3">
        {/* 왼쪽: 정보 */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            {showNewContactDot && (
              <span
                aria-hidden="true"
                data-testid={
                  hasNewContactNotification ? `worker-contact-new-dot-${contact.id}` : undefined
                }
                className="relative flex h-2.5 w-2.5 shrink-0 rounded-full bg-error"
              >
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-error opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-error" />
              </span>
            )}
            {urgent && (
              <Badge
                data-testid="urgent-badge"
                variant="error"
                size="xs"
                className="shrink-0 bg-error text-white font-bold"
              >
                <Siren className="w-3 h-3 animate-pulse" />
                긴급
              </Badge>
            )}
            <InquiryTypeBadge
              contact={contact}
              mode="label-only"
              onStopPropagation={stopPropagation}
            />
            <Badge
              size="xs"
              className={`shrink-0 font-medium ${
                stageInfo ? `${stageInfo.bgColor} ${stageInfo.color}` : 'bg-gray-100 text-gray-500'
              }`}
            >
              {stageInfo ? stageInfo.label : '공정 시작 전'}
            </Badge>
            {inquiryNumbers && (
              <span className="text-xs font-mono shrink-0 text-gray-400">{inquiryNumbers}</span>
            )}
          </div>
          <p
            className="text-sm font-normal truncate text-gray-900"
            data-testid={`worker-contact-file-name-${contact.id}`}
          >
            <span className="font-bold">{cardFileNameParts.companyName}</span>
            <span className="font-normal"> - {cardFileNameParts.fileName}</span>
          </p>
          {contact.webhard_folder_path ? (
            <div className="flex items-center min-w-0 text-[10px] text-gray-400">
              <p className="truncate min-w-0 max-w-[260px] sm:max-w-[360px]">
                {contact.webhard_folder_path}
              </p>
            </div>
          ) : null}
        </div>

        {/* 오른쪽: 버튼 그룹 */}
        <div className="mt-5 shrink-0 flex items-center gap-1.5" onClick={stopPropagation}>
          <span
            data-testid={`worker-contact-created-at-${contact.id}`}
            className="shrink-0 whitespace-nowrap text-xs font-medium text-gray-500"
          >
            {formatWorkerCreatedAt(contact.created_at)}
          </span>

          {/* 파일 다운로드 */}
          {hasWebhardFolder && (
            <button
              onClick={handleDownloadFiles}
              disabled={downloading}
              className="p-2 rounded-lg transition disabled:opacity-50 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
              title="작업 파일 다운로드"
            >
              {downloading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </button>
          )}

          {/* 도면 업로드 */}
          {canUploadDrawing && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="p-2 rounded-lg transition text-gray-400 hover:text-green-600 hover:bg-green-50"
              title="도면 업로드"
            >
              <Upload className="w-4 h-4" />
            </button>
          )}

          {/* 메모 버튼 */}
          {onMemo && (
            <button
              onClick={() => onMemo(contact.id)}
              className="p-2 rounded-lg transition text-gray-400 hover:text-brand hover:bg-brand-light"
              title="메모 / 이슈 보고"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          )}

          {/* 단계 전진 버튼 */}
          {isSplit && nextStageForGroup ? (
            <>
              <button
                onClick={() => setShowBatchConfirm(true)}
                disabled={isAdvancing || isBatchAdvancing}
                className="px-4 py-2 bg-brand hover:bg-brand-hover disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors whitespace-nowrap flex items-center justify-center"
              >
                {isBatchAdvancing ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                ) : (
                  '일괄 작업완료'
                )}
              </button>
              <ConfirmModal
                isOpen={showBatchConfirm}
                title="일괄 작업완료"
                message={`모든 하위 문의(${children.length}건)를 작업완료 처리하고 ${nextStageInfo?.label || nextStageForGroup}(으)로 이동하시겠습니까?`}
                type="confirm"
                confirmText="일괄 완료"
                onConfirm={handleBatchCompleteAndAdvance}
                onCancel={() => setShowBatchConfirm(false)}
              />
            </>
          ) : !contact.inquiry_type ? (
            <InquiryClassifyButtons
              contact={contact}
              size="sm"
              onStopPropagation={stopPropagation}
            />
          ) : (
            <OfficeAdvanceButton
              contact={contact}
              onAdvance={onAdvance}
              onAdvanceComplete={onAdvanceComplete}
              isAdvancing={isAdvancing}
            />
          )}
        </div>

        {/* 펼치기 표시 */}
        <ChevronDown
          className={`mt-7 w-4 h-4 shrink-0 transition-transform text-gray-300 ${expanded ? 'rotate-180' : ''}`}
        />
      </div>

      {/* 작업자 노트 표시 (다건) */}
      {workerNotes.length > 0 && (
        <div className="px-3 pb-2 space-y-1">
          {workerNotes.map((note) => (
            <div
              key={note.id}
              className={`px-2 py-1.5 rounded text-xs ${
                note.type === 'issue'
                  ? 'bg-red-50 border border-red-100 text-red-700'
                  : 'bg-yellow-50 border border-yellow-100 text-yellow-800'
              }`}
            >
              <span className="font-medium">{note.type === 'issue' ? '[이슈] ' : '[메모] '}</span>
              {note.content}
              {note.created_by && <span className="text-gray-400 ml-1">- {note.created_by}</span>}
            </div>
          ))}
        </div>
      )}
      {/* Fallback: 기존 단일 메모 */}
      {workerNotes.length === 0 && contact.worker_memo && (
        <div className="px-3 pb-2">
          <div
            className={`px-2 py-1.5 rounded text-xs ${
              contact.worker_issue
                ? 'bg-red-50 border border-red-100 text-red-700'
                : 'bg-yellow-50 border border-yellow-100 text-yellow-800'
            }`}
          >
            <span className="font-medium">{contact.worker_issue ? '[이슈] ' : '[메모] '}</span>
            {contact.worker_memo}
            {contact.worker_memo_by && (
              <span className="text-gray-400 ml-1">- {contact.worker_memo_by}</span>
            )}
          </div>
        </div>
      )}

      {/* 분할 하위 문의 카드 (항상 표시) */}
      {isSplit && children.length > 0 && (
        <div className="px-3 pb-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
          <p className="text-[11px] font-medium pt-2 mb-1.5 text-gray-500">
            분할 문의 ({children.filter((c) => c.stage_completed).length}/{children.length} 완료)
          </p>
          <div className="space-y-1.5">
            {children.map((child) => {
              const childStage = getProcessStageInfo(child.process_stage);
              const isToggling = togglingChildId === String(child.id);
              return (
                <div
                  key={child.id}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border ${
                    child.stage_completed
                      ? 'bg-green-50 border-green-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono shrink-0 text-gray-400">
                        {child.work_number || child.inquiry_number}
                      </span>
                      {childStage && (
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-full ${childStage.bgColor} ${childStage.color}`}
                        >
                          {childStage.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs truncate text-gray-700">
                      {child.inquiry_title || child.company_name}
                    </p>
                  </div>
                  {child.stage_completed ? (
                    <span
                      className={`shrink-0 px-2 py-1 rounded text-[11px] font-bold ${BG_COLOR.success} ${TEXT_COLOR.success}`}
                    >
                      완료
                    </span>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmingChild(child);
                      }}
                      disabled={isToggling}
                      className="shrink-0 px-4 py-2 bg-brand hover:bg-brand-hover disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors whitespace-nowrap flex items-center justify-center"
                    >
                      {isToggling ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      ) : (
                        '작업완료'
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 개별 하위 문의 작업완료 확인 모달 */}
      <ConfirmModal
        isOpen={!!confirmingChild}
        title="작업완료"
        message={`${confirmingChild?.work_number || confirmingChild?.inquiry_number || ''} 작업완료 처리하시겠습니까?`}
        type="confirm"
        confirmText="완료"
        onConfirm={() => {
          if (confirmingChild) {
            const syntheticEvent = { stopPropagation: () => {} } as React.MouseEvent;
            handleChildComplete(String(confirmingChild.id), syntheticEvent);
            setConfirmingChild(null);
          }
        }}
        onCancel={() => setConfirmingChild(null)}
      />

      {/* 펼침: 타임라인 */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 pt-1 border-t border-gray-100">
            <p className="text-[11px] font-medium mb-2 text-gray-500">타임라인</p>
            {isLoading ? (
              <ContactTimelineSkeleton compact />
            ) : (
              <ContactTimeline entries={entries} compact />
            )}
          </div>
        </div>
      </div>

      {/* 도면 업로드 모달 */}
      {showUploadModal && (
        <WorkerDrawingUpload
          contactId={String(contact.id)}
          companyName={contact.company_name || ''}
          onClose={() => setShowUploadModal(false)}
          onSuccess={(warning) => {
            setShowUploadModal(false);
            setSuccessWarning(warning ?? null);
            setSuccessModalOpen(true);
          }}
        />
      )}

      {/* 업로드 성공 모달 — 부모에서 관리 (WorkerDrawingUpload 재마운트와 무관하게 살아남음) */}
      <ConfirmModal
        isOpen={successModalOpen}
        title="업로드 완료"
        message={
          successWarning
            ? `도면이 업로드되었습니다. (웹하드 경고: ${successWarning.message})`
            : '도면이 업로드되었습니다.'
        }
        type="alert"
        confirmText="확인"
        onConfirm={() => {
          setSuccessModalOpen(false);
          setSuccessWarning(null);
        }}
        onCancel={() => {
          setSuccessModalOpen(false);
          setSuccessWarning(null);
        }}
      />
    </div>
  );
}
