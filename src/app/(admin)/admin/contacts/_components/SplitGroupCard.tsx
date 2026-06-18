'use client';

import { memo, useState, useCallback, useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { toggleStageCompleted, advanceSplitGroupStage } from '@/app/actions/contacts';
import type { Contact } from '@/lib/types';
import { getProcessStageInfo } from '@/lib/utils/processStages';
import {
  calcGroupProgress,
  canGroupAdvance,
  getNextProcessStage,
} from '@/app/(admin)/admin/contacts/_lib/split-utils';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR, TRANSITION_STYLES, TAG } from '@/lib/styles';
import { Button } from '@/components/ui/button';
import { CARD_STYLES } from '@/app/(admin)/admin/contacts/_lib/constants';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { logger } from '@/lib/utils/logger';
import { FaChevronDown } from 'react-icons/fa';

const log = logger.createLogger('SplitGroupCard');

interface SplitGroupCardProps {
  parent: Contact & { children: Contact[] };
  onContactClick: (contact: Contact) => void;
}

function SplitGroupCardComponent({ parent, onContactClick }: SplitGroupCardProps) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(true);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmingChild, setConfirmingChild] = useState<Contact | null>(null);

  const children = parent.children || [];
  const progress = calcGroupProgress(children);
  const allCompleted = canGroupAdvance(children);

  // 현재 공정 단계 (첫 번째 자식 기준)
  const currentStage = children[0]?.process_stage;
  const currentStageInfo = currentStage ? getProcessStageInfo(currentStage) : null;
  const nextStage = currentStage ? getNextProcessStage(currentStage) : null;
  const nextStageInfo = nextStage
    ? getProcessStageInfo(nextStage as NonNullable<typeof currentStage>)
    : null;

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleChildComplete = useCallback(
    (e: React.MouseEvent, child: Contact) => {
      e.stopPropagation();
      const childId = String(child.id);

      setTogglingId(childId);
      startTransition(async () => {
        const result = await toggleStageCompleted(childId, true);
        if (result.success) {
          // 이 child 완료 후 나머지 모두 완료인지 확인 → 자동 이동
          const othersAllCompleted = children.every(
            (c) => String(c.id) === childId || c.stage_completed
          );
          if (othersAllCompleted && nextStage) {
            const advResult = await advanceSplitGroupStage(String(parent.id), nextStage, true);
            if (advResult.success) {
              toast.success(
                `모든 하위 문의 완료 → ${nextStageInfo?.label || nextStage}(으)로 이동`
              );
            }
          }
          queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        } else {
          toast.error(result.error || '상태 변경에 실패했습니다.');
          log.error('Toggle stage completed failed', { error: result.error });
        }
        setTogglingId(null);
      });
    },
    [queryClient, children, nextStage, nextStageInfo, parent.id]
  );

  const handleChildClick = useCallback(
    (e: React.MouseEvent, child: Contact) => {
      e.stopPropagation();
      onContactClick(child);
    },
    [onContactClick]
  );

  const handleAdvanceConfirm = useCallback(async () => {
    if (!nextStage) return;

    setShowAdvanceModal(false);
    startTransition(async () => {
      const result = await advanceSplitGroupStage(String(parent.id), nextStage, true);
      if (result.success) {
        toast.success(
          `모든 하위 문의를 완료 처리하고 ${nextStageInfo?.label || nextStage}(으)로 이동했습니다`
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
      } else {
        toast.error(result.error || '단계 이동에 실패했습니다.');
        log.error('Advance split group stage failed', { error: result.error });
      }
    });
  }, [nextStage, nextStageInfo, parent.id, queryClient]);

  const baseNumber = parent.inquiry_number || parent.work_number || '???';

  return (
    <div className={CARD_STYLES.container}>
      {/* 그룹 헤더 */}
      <div
        className={`${CARD_STYLES.header} ${TRANSITION_STYLES.colors}`}
        onClick={handleToggleExpand}
      >
        <div className="space-y-1">
          {/* 행1: 번호 + 업체명 + 분할 뱃지 + 접기/펼치기 */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
              <span className={`${TAG.outline} font-mono text-xs flex-shrink-0`}>{baseNumber}</span>
              <span className={`text-sm font-semibold ${TEXT_COLOR.primary} truncate`}>
                {parent.company_name}
              </span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${BG_COLOR.info} ${TEXT_COLOR.info} font-medium flex-shrink-0`}
              >
                {children.length}종 분할
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {nextStage && nextStageInfo && (
                <Button
                  type="button"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAdvanceModal(true);
                  }}
                  disabled={isPending}
                >
                  {isPending ? '처리 중...' : '일괄 작업완료'}
                </Button>
              )}
              <div
                className={`p-1 rounded transition-all duration-200 ${isExpanded ? 'rotate-180' : ''}`}
              >
                <FaChevronDown className={`text-xs ${TEXT_COLOR.muted}`} />
              </div>
            </div>
          </div>

          {/* 행2: 진행률 */}
          {currentStageInfo && (
            <div className={`text-xs ${TEXT_COLOR.secondary}`}>
              진행: {currentStageInfo.label} {progress.completed}/{progress.total} 완료
            </div>
          )}
        </div>
      </div>

      {/* 하위 문의 목록 (펼쳐진 상태) */}
      {isExpanded && (
        <div className={`border-t ${BORDER_COLOR.default}`}>
          <div className="px-3 md:px-4 py-2 space-y-0">
            {children.map((child, index) => {
              const isLast = index === children.length - 1;
              const connector = isLast ? '└─' : '├─';
              const childNumber =
                child.inquiry_number || child.work_number || `${baseNumber}-${child.split_index}`;
              const childStageInfo = child.process_stage
                ? getProcessStageInfo(child.process_stage)
                : null;
              const isToggling = togglingId === String(child.id);

              return (
                <div
                  key={child.id}
                  className={`flex items-center gap-2 py-1.5 cursor-pointer ${BG_COLOR.hoverMuted} rounded px-1 ${TRANSITION_STYLES.colors}`}
                  onClick={(e) => handleChildClick(e, child)}
                >
                  {/* 연결선 */}
                  <span className={`text-xs font-mono ${TEXT_COLOR.muted} flex-shrink-0 w-5`}>
                    {connector}
                  </span>

                  {/* 하위번호 */}
                  <span className={`text-xs font-mono ${TEXT_COLOR.brand} flex-shrink-0`}>
                    {childNumber}
                  </span>

                  {/* 제목 */}
                  <span className={`text-xs ${TEXT_COLOR.primary} truncate flex-1 min-w-0`}>
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
                        setConfirmingChild(child);
                      }}
                      disabled={isToggling || isPending}
                      className="flex-shrink-0"
                    >
                      {isToggling ? '...' : '작업완료'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {/* 하단 그룹 진행 상태 */}
          <div className={`border-t ${BORDER_COLOR.default} px-3 md:px-4 py-2`}>
            {allCompleted && !nextStage ? (
              <span className={`text-xs ${TEXT_COLOR.success}`}>✅ 최종 단계 완료</span>
            ) : allCompleted ? (
              <span className={`text-xs ${TEXT_COLOR.success}`}>
                ✅ 모두 완료! 상단 '일괄 작업완료' 버튼으로 다음 단계 이동
              </span>
            ) : (
              <span className={`text-xs ${TEXT_COLOR.muted}`}>
                ⏳ {progress.total - progress.completed}건 남음 — 상단 '일괄 작업완료'로 전체
                완료+이동 가능
              </span>
            )}
          </div>
        </div>
      )}

      {/* 일괄 이동 확인 모달 */}
      {nextStageInfo && (
        <ConfirmModal
          isOpen={showAdvanceModal}
          onClose={() => setShowAdvanceModal(false)}
          onConfirm={handleAdvanceConfirm}
          title="일괄 작업완료"
          message={
            <>
              모든 하위 문의({children.length}건)를 작업완료 처리하고{' '}
              <strong className={TEXT_COLOR.brand}>{nextStageInfo.label}</strong>(으)로 일괄
              이동하시겠습니까?
            </>
          }
          confirmLabel="일괄 완료"
          cancelLabel="취소"
          isSubmitting={isPending}
          icon={
            <svg
              className={`h-6 w-6 ${TEXT_COLOR.brand}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          }
        />
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
        message={`${confirmingChild?.inquiry_number || confirmingChild?.work_number || ''} 작업완료 처리하시겠습니까?`}
        confirmLabel="완료"
        cancelLabel="취소"
        isSubmitting={isPending}
      />
    </div>
  );
}

export const SplitGroupCard = memo(SplitGroupCardComponent);
