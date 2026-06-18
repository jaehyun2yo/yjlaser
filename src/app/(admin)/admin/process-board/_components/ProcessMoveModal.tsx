'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useAdvanceProcessStage } from '@/app/(admin)/admin/process-board/_lib/hooks';
import {
  PROCESS_STAGES_ARRAY,
  getProcessStageInfo,
  getProcessProgress,
  isLaserOnlyInquiry,
} from '@/lib/utils/processStages';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { MODAL, TEXT_COLOR, BG_COLOR } from '@/lib/styles';
import { logger } from '@/lib/utils/logger';
import type { Contact } from '@/lib/types/contact';
import type { ProcessStage } from '@/lib/utils/processStages';

interface ProcessMoveModalProps {
  contact: Contact | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function ProcessMoveModal({ contact, isOpen, onClose }: ProcessMoveModalProps) {
  const [isMoving, setIsMoving] = useState(false);
  const { mutateAsync: moveStage } = useAdvanceProcessStage();
  const queryClient = useQueryClient();
  const log = logger.createLogger('ProcessMoveModal');

  if (!isOpen || !contact) return null;

  const currentStageInfo = getProcessStageInfo(contact.process_stage);
  const currentProgress = getProcessProgress(contact.process_stage);
  const isLaserOnly = isLaserOnlyInquiry(contact.inquiry_type) && contact.process_stage === 'laser';

  // 현재 단계의 다음 단계 찾기
  const currentOrder = currentStageInfo?.order || 0;
  const nextStage = isLaserOnly
    ? null
    : PROCESS_STAGES_ARRAY.find((s) => s.order === currentOrder + 1);

  // 이전 단계 찾기
  const prevStage =
    !isLaserOnly && currentOrder > 1
      ? PROCESS_STAGES_ARRAY.find((s) => s.order === currentOrder - 1)
      : null;

  const handleMoveToStage = async (stage: ProcessStage) => {
    if (isMoving) return;
    setIsMoving(true);

    try {
      await moveStage({ contactId: contact.id, processStage: stage });
      onClose();
    } catch (error) {
      log.error('공정 이동 실패:', error);
      alert('공정 이동에 실패했습니다.');
    } finally {
      setIsMoving(false);
    }
  };

  const handleCompleteLaser = async () => {
    if (isMoving) return;
    setIsMoving(true);

    try {
      const csrfMatch = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
      const response = await fetch(`/api/admin/contacts/${contact.id}/complete-laser`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfMatch?.[1] && { 'x-csrf-token': csrfMatch[1] }),
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '레이저가공 완료 처리 실패');
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
      onClose();
    } catch (error) {
      log.error('레이저가공 완료 실패:', error);
      alert('레이저가공 완료 처리에 실패했습니다.');
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <div className={MODAL.overlay} onClick={onClose}>
      <div className={`${MODAL.container} max-w-md`} onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className={MODAL.header}>
          <h2 className={`text-lg font-bold ${TEXT_COLOR.primary}`}>공정 단계 이동</h2>
          <button
            onClick={onClose}
            className={`p-1 ${BG_COLOR.hoverMuted} rounded transition-colors`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div className={MODAL.body}>
          {/* 문의 정보 */}
          <div className={`p-3 rounded-lg mb-4 ${BG_COLOR.muted}`}>
            <div className="flex items-center justify-between mb-1">
              <span className={`text-xs ${TEXT_COLOR.secondary}`}>문의번호</span>
              <span className="text-xs font-mono font-medium">{contact.inquiry_number || '-'}</span>
            </div>
            <div className="flex items-center justify-between mb-1">
              <span className={`text-xs ${TEXT_COLOR.secondary}`}>업체명</span>
              <span className={`text-xs font-medium ${TEXT_COLOR.primary}`}>
                {contact.company_name}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs ${TEXT_COLOR.secondary}`}>패키지명</span>
              <span className={`text-xs ${TEXT_COLOR.secondary} truncate max-w-[200px]`}>
                {contact.inquiry_title || '제목 없음'}
              </span>
            </div>
          </div>

          {/* 현재 공정 표시 */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-medium ${TEXT_COLOR.primary}`}>현재 공정</span>
              <span className="text-xs text-gray-500">{currentProgress}% 완료</span>
            </div>
            {/* 진행 바 */}
            <div className={`w-full h-2 ${BG_COLOR.muted} rounded-full overflow-hidden`}>
              <div
                className="h-full bg-[#ED6C00] transition-all duration-300"
                style={{ width: `${currentProgress}%` }}
              />
            </div>
            {currentStageInfo && (
              <div className="mt-2">
                <span
                  className={`inline-block px-2 py-1 rounded text-xs font-medium ${currentStageInfo.bgColor} ${currentStageInfo.color}`}
                >
                  {currentStageInfo.label}
                </span>
              </div>
            )}
          </div>

          {/* 레이저 전용: 완료 버튼만 표시 */}
          {isLaserOnly ? (
            <button
              onClick={handleCompleteLaser}
              disabled={isMoving}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-lg font-semibold py-4 rounded-lg transition-colors mb-4 flex items-center justify-center gap-2"
            >
              {isMoving ? (
                <span>처리 중...</span>
              ) : (
                <>
                  <span>레이저가공 완료</span>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </>
              )}
            </button>
          ) : (
            <>
              {/* 다음 단계로 버튼 */}
              {nextStage && (
                <button
                  onClick={() => handleMoveToStage(nextStage.id as ProcessStage)}
                  disabled={isMoving}
                  className="w-full bg-[#ED6C00] hover:bg-[#d15f00] disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-lg font-semibold py-4 rounded-lg transition-colors mb-4 flex items-center justify-center gap-2"
                >
                  {isMoving ? (
                    <span>이동 중...</span>
                  ) : (
                    <>
                      <span>{nextStage.label}로 이동</span>
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </>
                  )}
                </button>
              )}

              {/* 각 공정 단계 버튼 그리드 */}
              <div className="mb-4">
                <h3 className={`text-sm font-medium ${TEXT_COLOR.primary} mb-2`}>공정 단계 선택</h3>
                <div className="grid grid-cols-2 gap-2">
                  {PROCESS_STAGES_ARRAY.map((stage) => {
                    const isCurrent = stage.id === contact.process_stage;
                    return (
                      <button
                        key={stage.id}
                        onClick={() => !isCurrent && handleMoveToStage(stage.id as ProcessStage)}
                        disabled={isCurrent || isMoving}
                        className={`
                          px-3 py-2 rounded-lg text-xs font-medium transition-all
                          ${
                            isCurrent
                              ? `${stage.bgColor} ${stage.color} border-2 ${stage.borderColor} cursor-not-allowed`
                              : `${BG_COLOR.muted} ${TEXT_COLOR.secondary} hover:${stage.bgColor} hover:${stage.color} border border-transparent`
                          }
                        `}
                      >
                        {stage.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 이전 단계로 버튼 */}
              {prevStage && (
                <button
                  onClick={() => handleMoveToStage(prevStage.id as ProcessStage)}
                  disabled={isMoving}
                  className={`w-full ${BG_COLOR.muted} ${BG_COLOR.hoverMuted} ${TEXT_COLOR.secondary} text-sm py-2 rounded-lg transition-colors mb-4`}
                >
                  ← {prevStage.label}로 되돌리기
                </button>
              )}
            </>
          )}

          {/* 문의 상세 보기 링크 */}
          <Link
            href={`/admin/contacts/${contact.id}`}
            className="block w-full text-center text-sm text-[#ED6C00] hover:text-[#d15f00] font-medium py-2"
          >
            문의 상세 보기 →
          </Link>
        </div>
      </div>
    </div>
  );
}
