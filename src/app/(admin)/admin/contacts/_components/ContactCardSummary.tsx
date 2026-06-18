/**
 * 문의 카드 요약 정보 컴포넌트
 * 2순위 정보: 작업현황, 담당자/연락처/이메일, 도면/샘플, 수령방법, 첨부파일
 * - 신규 상태가 아닐 때만 표시
 */
'use client';

import { memo, useMemo, useCallback, useState, useTransition, useEffect } from 'react';
import { FaDownload, FaSpinner } from 'react-icons/fa';
import { TEXT_COLOR, BADGE, BG_COLOR, BORDER_COLOR } from '@/lib/styles';
import { Button } from '@/components/ui/button';
import type { Contact } from '@/lib/types';
import { QuickProcessStageSelect } from '@/app/(admin)/admin/contacts/quick-process-stage-select';
import { logger } from '@/lib/utils/logger';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { toggleStageCompleted, advanceSplitGroupStage } from '@/app/actions/contacts';
import { getProcessStageInfo } from '@/lib/utils/processStages';
import { getNextProcessStage } from '@/app/(admin)/admin/contacts/_lib/split-utils';
import {
  shouldShowSecondaryInfo,
  canShowProcessStage,
  parseReferencePhotos,
  formatDimensions,
  getVisitTimeSlotLabel,
  hasValue,
} from '@/app/(admin)/admin/contacts/_lib/utils';
import { ConfirmModal } from '@/components/modals/ConfirmModal';

const log = logger.createLogger('ContactCardSummary');

interface ContactCardSummaryProps {
  contact: Contact;
  onStopPropagation: (e: React.MouseEvent) => void;
}

function ContactCardSummaryComponent({ contact, onStopPropagation }: ContactCardSummaryProps) {
  const queryClient = useQueryClient();
  const [togglingChildId, setTogglingChildId] = useState<string | null>(null);
  const [confirmingChild, setConfirmingChild] = useState<Contact | null>(null);
  const [isPending, startTransition] = useTransition();

  const isSplit = (contact.split_count ?? 0) > 0;
  const children = contact.children ?? [];

  // 자식들의 실제 공정 단계 기준으로 다음 단계 계산
  const childrenStage = isSplit && children.length > 0 ? children[0].process_stage : null;
  const nextStageForGroup = isSplit && childrenStage ? getNextProcessStage(childrenStage) : null;

  const handleChildComplete = useCallback(
    (e: React.MouseEvent, child: Contact) => {
      e.stopPropagation();
      onStopPropagation(e);
      const childId = String(child.id);

      setTogglingChildId(childId);
      startTransition(async () => {
        const result = await toggleStageCompleted(childId, true);
        if (result.success) {
          // 모든 하위 완료 시 자동 이동
          const othersAllCompleted = children.every(
            (c) => String(c.id) === childId || c.stage_completed
          );
          if (othersAllCompleted && nextStageForGroup) {
            await advanceSplitGroupStage(String(contact.id), nextStageForGroup, true);
          }
          queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        }
        setTogglingChildId(null);
      });
    },
    [queryClient, onStopPropagation, children, nextStageForGroup, contact.id]
  );

  // 2순위 정보 표시 여부 (신규가 아닐 때만)
  const showSecondaryInfo = useMemo(
    () => shouldShowSecondaryInfo(contact.status),
    [contact.status]
  );

  // 공정 단계 표시 여부 — 실시간 업데이트/상태 전환 시 타임라인이 순간 사라지는 깜빡임을 방지하기 위해
  // true→false 전환 시 최소 1초간 고정 표시 유지
  const actualShowProcessStage = useMemo(
    () => canShowProcessStage(contact.status),
    [contact.status]
  );
  const [showProcessStage, setShowProcessStage] = useState(actualShowProcessStage);

  useEffect(() => {
    if (actualShowProcessStage) {
      setShowProcessStage(true);
      return;
    }
    const timer = setTimeout(() => setShowProcessStage(false), 1000);
    return () => clearTimeout(timer);
  }, [actualShowProcessStage]);

  // 참고 사진 URL 파싱 (메모이제이션)
  const referencePhotos = useMemo(
    () => parseReferencePhotos(contact.reference_photos_urls),
    [contact.reference_photos_urls]
  );

  // 크기 문자열
  const dimensions = useMemo(
    () => formatDimensions(contact.length, contact.width, contact.height),
    [contact.length, contact.width, contact.height]
  );

  // 첨부파일 유무
  const hasFiles = useMemo(
    () =>
      !!(
        contact.attachment_filename ||
        contact.drawing_file_name ||
        referencePhotos.length > 0 ||
        contact.webhard_folder_path
      ),
    [
      contact.attachment_filename,
      contact.drawing_file_name,
      referencePhotos.length,
      contact.webhard_folder_path,
    ]
  );

  // 신규 상태면 요약 정보 미표시 (분할 문의는 하위 카드 표시)
  if (!showSecondaryInfo && !(isSplit && children.length > 0)) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* 분할 하위 문의 카드 */}
      {isSplit && children.length > 0 && (
        <div className="mb-1" onClick={onStopPropagation}>
          <label className={`text-xs font-medium ${TEXT_COLOR.muted} mb-1.5 block`}>
            분할 문의 ({children.filter((c) => c.stage_completed).length}/{children.length} 완료)
          </label>
          <div className="space-y-1 ml-3 border-l-2 border-gray-200 pl-2.5">
            {children.map((child) => {
              const childStageInfo = child.process_stage
                ? getProcessStageInfo(child.process_stage)
                : null;
              const isToggling = togglingChildId === String(child.id);
              const childNumber = child.work_number || child.inquiry_number || `#${child.id}`;

              return (
                <div
                  key={child.id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md border text-xs ${
                    child.stage_completed
                      ? `${BG_COLOR.success} ${BORDER_COLOR.success}`
                      : `bg-gray-50 ${BORDER_COLOR.default}`
                  }`}
                >
                  {/* 번호 */}
                  <span className={`font-mono ${TEXT_COLOR.muted} flex-shrink-0`}>
                    {childNumber}
                  </span>

                  {/* 제목 */}
                  <span className={`${TEXT_COLOR.primary} truncate flex-1 min-w-0`}>
                    {child.inquiry_title || ''}
                  </span>

                  {/* 공정 단계 */}
                  {childStageInfo && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${childStageInfo.bgColor} ${childStageInfo.color}`}
                    >
                      {childStageInfo.label}
                    </span>
                  )}

                  {/* 작업완료 버튼 */}
                  {child.stage_completed ? (
                    <span
                      className={`flex-shrink-0 px-2 py-1 rounded text-[11px] font-bold ${BG_COLOR.success} ${TEXT_COLOR.success}`}
                    >
                      완료
                    </span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStopPropagation(e);
                        setConfirmingChild(child);
                      }}
                      disabled={isToggling || isPending}
                      className="flex-shrink-0"
                    >
                      {isToggling ? <FaSpinner className="animate-spin text-[9px]" /> : '작업완료'}
                    </Button>
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
        onClose={() => setConfirmingChild(null)}
        onConfirm={() => {
          if (confirmingChild) {
            const syntheticEvent = { stopPropagation: () => {} } as React.MouseEvent;
            handleChildComplete(syntheticEvent, confirmingChild);
            setConfirmingChild(null);
          }
        }}
        title="작업완료"
        message={`${confirmingChild?.work_number || confirmingChild?.inquiry_number || ''} 작업완료 처리하시겠습니까?`}
        confirmLabel="완료"
        cancelLabel="취소"
        isSubmitting={isPending}
      />

      {/* 작업현황 (공정 단계) */}
      {showProcessStage && (
        <div className="mb-2" onClick={onStopPropagation}>
          <label className={`text-xs font-medium ${TEXT_COLOR.muted} mb-1 block`}>작업현황</label>
          <QuickProcessStageSelect
            contactId={contact.id}
            currentStage={contact.process_stage}
            status={contact.status}
          />
        </div>
      )}

      {/* 담당자, 연락처, 이메일 - 실제 값이 있을 때만 표시 ("-" 등 플레이스홀더 제외) */}
      {(hasValue(contact.name) || hasValue(contact.phone) || hasValue(contact.email)) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {hasValue(contact.name) && (
            <span className={TEXT_COLOR.primary}>
              <span className={TEXT_COLOR.muted}>담당자 </span>
              {contact.name}
              {hasValue(contact.position) ? ` (${contact.position})` : ''}
            </span>
          )}
          {hasValue(contact.phone) && (
            <span className={TEXT_COLOR.primary}>
              <span className={TEXT_COLOR.muted}>연락처 </span>
              <a
                href={`tel:${contact.phone}`}
                className="hover:underline"
                onClick={onStopPropagation}
              >
                {contact.phone}
              </a>
            </span>
          )}
          {hasValue(contact.email) && (
            <span className={`${TEXT_COLOR.primary} truncate`}>
              <span className={TEXT_COLOR.muted}>이메일 </span>
              <a
                href={`mailto:${contact.email}`}
                className="hover:underline"
                onClick={onStopPropagation}
              >
                {contact.email}
              </a>
            </span>
          )}
        </div>
      )}

      {/* 도면 및 샘플 정보 */}
      {contact.drawing_type && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs ${TEXT_COLOR.muted}`}>도면/샘플:</span>
          {contact.drawing_type === 'create' ? (
            <span className={BADGE.info}>제작 필요</span>
          ) : contact.drawing_type === 'have' ? (
            <span className={BADGE.success}>보유</span>
          ) : null}
          {contact.material && (
            <span className={`text-xs ${TEXT_COLOR.secondary}`}>재질: {contact.material}</span>
          )}
          {dimensions && (
            <span className={`text-xs ${TEXT_COLOR.secondary}`}>크기: {dimensions}</span>
          )}
        </div>
      )}

      {/* 수령 방법 정보 */}
      {contact.receipt_method && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs ${TEXT_COLOR.muted}`}>수령방법:</span>
          {contact.receipt_method === 'visit' ? (
            <>
              <span className={BADGE.purple}>방문</span>
              {contact.visit_date && (
                <span className={`text-xs ${TEXT_COLOR.secondary}`}>
                  {contact.visit_date}{' '}
                  {contact.visit_time_slot && getVisitTimeSlotLabel(contact.visit_time_slot)}
                </span>
              )}
            </>
          ) : contact.receipt_method === 'delivery' ? (
            <>
              <span className={BADGE.warning}>
                {contact.delivery_type === 'parcel'
                  ? '택배'
                  : contact.delivery_type === 'quick'
                    ? '퀵'
                    : '배송'}
              </span>
              {contact.delivery_address && (
                <span className={`text-xs ${TEXT_COLOR.secondary} truncate max-w-xs`}>
                  {contact.delivery_address}
                </span>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* 최신 도면 다운로드 */}
      {(contact.latestDrawing || contact.drawing_file_name) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs ${TEXT_COLOR.muted}`}>최신 도면:</span>
          {contact.latestDrawing && contact.latestDrawing.files?.length > 0 ? (
            <PresignedFileLink
              contactId={contact.id}
              fileType={`drawing-revision:${contact.latestDrawing.id}`}
              fileName={contact.latestDrawing.files[0].name}
              onStopPropagation={onStopPropagation}
              revisionId={contact.latestDrawing.id}
              fileIndex={0}
            />
          ) : contact.drawing_file_name ? (
            <PresignedFileLink
              contactId={contact.id}
              fileType="drawing"
              fileName={contact.drawing_file_name}
              onStopPropagation={onStopPropagation}
              apiUrl={`/api/contacts/${contact.id}/latest-drawing/download`}
            />
          ) : null}
        </div>
      )}

      {/* 첨부파일 + 경로 */}
      {hasFiles && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs ${TEXT_COLOR.muted}`}>첨부파일:</span>
          {contact.attachment_filename && (
            <PresignedFileLink
              contactId={contact.id}
              fileType="attachment"
              fileName={contact.attachment_filename}
              onStopPropagation={onStopPropagation}
            />
          )}
          {contact.drawing_file_name && (
            <PresignedFileLink
              contactId={contact.id}
              fileType="drawing"
              fileName={contact.drawing_file_name}
              onStopPropagation={onStopPropagation}
            />
          )}
          {referencePhotos.length > 0 && (
            <span className={`text-xs ${TEXT_COLOR.brand}`}>
              참고사진 {referencePhotos.length}개
            </span>
          )}
          {/* 디렉토리 경로 */}
          {contact.webhard_folder_path && (
            <span className={`text-xs ${TEXT_COLOR.muted}`}>
              / {contact.webhard_folder_path.split('/').filter(Boolean).join('/')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Presigned URL 방식 파일 링크 (모든 파일 타입 공용)
 */
const PresignedFileLink = memo(function PresignedFileLink({
  contactId,
  fileType,
  fileName,
  icon,
  index,
  revisionId,
  fileIndex,
  apiUrl,
  onStopPropagation,
}: {
  contactId: string;
  fileType: string;
  fileName: string;
  icon?: string;
  index?: number;
  revisionId?: string;
  fileIndex?: number;
  apiUrl?: string;
  onStopPropagation: (e: React.MouseEvent) => void;
}) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handlePresignedDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onStopPropagation(e);
      setIsDownloading(true);

      try {
        let res: Response;
        if (apiUrl) {
          res = await fetch(apiUrl);
        } else if (revisionId !== undefined) {
          const params = new URLSearchParams({ fileIndex: String(fileIndex ?? 0) });
          res = await fetch(`/api/drawing-revisions/${revisionId}/download?${params}`);
        } else {
          const params = new URLSearchParams({ type: fileType });
          if (index !== undefined) params.set('index', String(index));
          res = await fetch(`/api/contacts/${contactId}/file-download?${params}`);
        }
        if (!res.ok) throw new Error('Failed to get download URL');
        const data = await res.json();
        const downloadName = data.fileName || 'download';

        // blob download (Worker 패턴과 동일 — cross-origin presigned URL 안정적 처리)
        try {
          const fileRes = await fetch(data.url);
          if (!fileRes.ok) throw new Error('File fetch failed');
          const blob = await fileRes.blob();
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = downloadName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        } catch {
          // fallback: direct link
          const link = document.createElement('a');
          link.href = data.url;
          link.download = downloadName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } catch (err) {
        log.error('Presigned download failed', err);
        alert('다운로드에 실패했습니다.');
      } finally {
        setIsDownloading(false);
      }
    },
    [apiUrl, contactId, fileType, index, revisionId, fileIndex, onStopPropagation]
  );

  return (
    <button
      onClick={handlePresignedDownload}
      disabled={isDownloading}
      className={`text-xs ${TEXT_COLOR.brand} hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50`}
    >
      {icon && <>{icon} </>}
      {fileName}
      {isDownloading ? (
        <FaSpinner className="animate-spin text-[10px] ml-0.5" />
      ) : (
        <FaDownload className="text-[10px] ml-0.5 opacity-60 hover:opacity-100" />
      )}
    </button>
  );
});

export const ContactCardSummary = memo(ContactCardSummaryComponent);
