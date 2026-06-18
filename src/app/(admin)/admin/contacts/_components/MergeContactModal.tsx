'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FaSpinner } from 'react-icons/fa';
import { BaseModal } from '@/components/modals/BaseModal';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { logger } from '@/lib/utils/logger';
import type { Contact } from '@/lib/types';

const log = logger.createLogger('MergeContactModal');

interface MergeContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact;
}

interface CompanyContact {
  id: string;
  inquiry_number: string | null;
  work_number: string | null;
  inquiry_title: string | null;
  process_stage: string | null;
  status: string;
  parent_contact_id: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  drawing: '도면작업',
  sample: '샘플제작',
  drawing_confirmed: '도면확정',
  laser: '레이저가공',
  cutting: '칼작업',
  creasing: '오시작업',
  delivery: '납품',
};

export function MergeContactModal({ isOpen, onClose, contact }: MergeContactModalProps) {
  const queryClient = useQueryClient();
  const [candidates, setCandidates] = useState<CompanyContact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 같은 업체의 활성 문의 목록 조회
  useEffect(() => {
    if (!isOpen || !contact.company_name) return;

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);
    setSelectedId(null);

    (async () => {
      try {
        const params = new URLSearchParams({
          companyName: contact.company_name,
        });
        const res = await fetch(`/api/contacts/by-company?${params}`);
        if (!res.ok) throw new Error('업체 문의 목록 조회 실패');

        const data = (await res.json()) as CompanyContact[];

        if (cancelled) return;

        // 현재 문의 제외, 분할 하위 문의 제외, 삭제 상태 제외
        const filtered = data.filter(
          (c) =>
            String(c.id) !== String(contact.id) &&
            !c.parent_contact_id &&
            c.status !== 'deleting' &&
            c.status !== 'completed'
        );

        setCandidates(filtered);
      } catch (err) {
        if (!cancelled) {
          log.error('업체 문의 목록 조회 오류', err);
          setErrorMessage('문의 목록을 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, contact.company_name, contact.id]);

  const handleSubmit = useCallback(async () => {
    if (!selectedId || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/contacts/${selectedId}/merge-drawing-from/${contact.id}`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as Record<string, string>).message || `연결 실패 (${res.status})`);
      }

      // 캐시 무효화
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all }),
      ]);

      onClose();
    } catch (err) {
      log.error('문의 연결 오류', err);
      setErrorMessage(err instanceof Error ? err.message : '연결 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedId, isSubmitting, contact.id, queryClient, onClose]);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleSubmit}
      title="기존 문의와 연결"
      confirmLabel="연결"
      cancelLabel="취소"
      isSubmitting={isSubmitting}
      disabled={!selectedId}
      maxWidth="md"
    >
      <p className={`text-sm ${TEXT_COLOR.secondary} -mt-1 mb-3`}>
        같은 업체(
        <span className={`font-medium ${TEXT_COLOR.primary}`}>{contact.company_name}</span>)의 진행
        중 문의:
      </p>

      {/* 에러 메시지 */}
      {errorMessage && (
        <div className={`text-sm ${TEXT_COLOR.error} p-2 rounded ${BG_COLOR.error} mb-2`}>
          {errorMessage}
        </div>
      )}

      {/* 로딩 */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-4 justify-center">
          <FaSpinner className={`animate-spin text-sm ${TEXT_COLOR.muted}`} />
          <span className={`text-xs ${TEXT_COLOR.muted}`}>문의 목록 로딩 중...</span>
        </div>
      ) : candidates.length === 0 ? (
        <p className={`text-xs ${TEXT_COLOR.disabled} py-4 text-center`}>
          연결 가능한 진행 중 문의가 없습니다.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {candidates.map((c) => {
            const isSelected = selectedId === String(c.id);
            const number = c.work_number || c.inquiry_number || `#${c.id}`;
            const stageLabel = c.process_stage
              ? (STAGE_LABELS[c.process_stage] ?? c.process_stage)
              : '';

            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(String(c.id))}
                disabled={isSubmitting}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                  isSelected
                    ? `border-teal-500 ${BG_COLOR.infoLighter}`
                    : `${BORDER_COLOR.default} ${BG_COLOR.card} hover:${BG_COLOR.muted}`
                } disabled:opacity-50`}
              >
                {/* 라디오 표시 */}
                <div
                  className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    isSelected ? 'border-teal-500' : `${BORDER_COLOR.default}`
                  }`}
                >
                  {isSelected && <div className="w-2 h-2 rounded-full bg-teal-500" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono ${TEXT_COLOR.primary}`}>{number}</span>
                    <span className={`text-xs ${TEXT_COLOR.primary} truncate`}>
                      {c.inquiry_title || ''}
                    </span>
                  </div>
                </div>

                {stageLabel && (
                  <span className={`text-[10px] ${TEXT_COLOR.muted} flex-shrink-0`}>
                    ({stageLabel})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <p className={`text-[10px] ${TEXT_COLOR.dim} mt-3`}>
        선택한 문의에 이 도면을 연결하고, 현재 문의는 삭제됩니다.
      </p>
    </BaseModal>
  );
}
