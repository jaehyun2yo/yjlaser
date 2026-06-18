'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { splitContact } from '@/app/actions/contacts';
import type { Contact } from '@/lib/types';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR, TYPOGRAPHY } from '@/lib/styles';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('SplitContactModal');

interface SplitContactModalProps {
  contact: Contact;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function SplitContactModal({ contact, isOpen, onClose, onSuccess }: SplitContactModalProps) {
  const queryClient = useQueryClient();
  const [count, setCount] = useState(2);
  const [items, setItems] = useState<Array<{ subject: string; description: string }>>([
    { subject: '', description: '' },
    { subject: '', description: '' },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 분할 개수 변경 시 items 배열 조정
  useEffect(() => {
    setItems((prev) => {
      if (prev.length === count) return prev;
      if (prev.length < count) {
        return [
          ...prev,
          ...Array.from({ length: count - prev.length }, () => ({
            subject: '',
            description: '',
          })),
        ];
      }
      return prev.slice(0, count);
    });
  }, [count]);

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (isOpen) {
      setCount(2);
      setItems([
        { subject: '', description: '' },
        { subject: '', description: '' },
      ]);
      setIsSubmitting(false);
      setErrorMessage(null);
    }
  }, [isOpen]);

  // ESC 키 처리
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleCountChange = useCallback((value: number) => {
    const clamped = Math.max(2, Math.min(10, value));
    setCount(clamped);
  }, []);

  const handleItemChange = useCallback(
    (index: number, field: 'subject' | 'description', value: string) => {
      setItems((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    []
  );

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const submitItems = items.map((item) => ({
        subject: item.subject || undefined,
        description: item.description || undefined,
      }));

      const result = await splitContact(String(contact.id), {
        count,
        items: submitItems,
      });

      if (!result.success) {
        setErrorMessage(result.error || '분할에 실패했습니다.');
        log.error('Split contact failed', { error: result.error });
        return;
      }

      toast.success(`${count}종으로 분할되었습니다`);
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
      onSuccess();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
      setErrorMessage(message);
      log.error('Exception splitting contact', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 하위번호 미리보기 생성
  // 도면확정(drawing_confirmed) 단계: workNumber(F) 기준, 그 외: inquiryNumber(O) 기준
  const baseNumber =
    contact.process_stage === 'drawing_confirmed'
      ? contact.work_number || contact.inquiry_number || '???'
      : contact.inquiry_number || contact.work_number || '???';

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[60] animate-fadeIn p-4 overflow-y-auto modal-scrollbar-hide"
      onClick={onClose}
    >
      <div
        className={`${BG_COLOR.card} rounded-lg shadow-2xl border ${BORDER_COLOR.default} max-w-lg w-full max-h-[90vh] overflow-y-auto modal-scrollbar-hide animate-scaleIn my-8`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className={`sticky top-0 ${BG_COLOR.card} border-b ${BORDER_COLOR.default} p-4 z-10`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className={`${TYPOGRAPHY.h4} ${TEXT_COLOR.primary}`}>문의 분할</h3>
              <span className={`text-sm ${TEXT_COLOR.brand}`}>{baseNumber}</span>
            </div>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg ${BG_COLOR.hoverMuted} transition-colors`}
            >
              <svg
                className={`w-5 h-5 ${TEXT_COLOR.muted}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div className="p-4 space-y-4">
          {/* 에러 메시지 */}
          {errorMessage && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {errorMessage}
            </div>
          )}

          {/* 분할 개수 입력 */}
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>
              분할 개수
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCountChange(count - 1)}
                disabled={count <= 2}
                className={`w-8 h-8 rounded ${BG_COLOR.muted} ${TEXT_COLOR.primary} text-sm font-medium disabled:opacity-40 transition-colors`}
              >
                -
              </button>
              <input
                type="number"
                min={2}
                max={10}
                value={count}
                onChange={(e) => handleCountChange(Number(e.target.value))}
                className={`w-16 text-center border ${BORDER_COLOR.default} rounded px-2 py-1.5 text-sm ${BG_COLOR.card} ${TEXT_COLOR.primary}`}
              />
              <button
                type="button"
                onClick={() => handleCountChange(count + 1)}
                disabled={count >= 10}
                className={`w-8 h-8 rounded ${BG_COLOR.muted} ${TEXT_COLOR.primary} text-sm font-medium disabled:opacity-40 transition-colors`}
              >
                +
              </button>
              <span className={`text-xs ${TEXT_COLOR.muted} ml-1`}>2~10</span>
            </div>
          </div>

          {/* 하위번호 미리보기 */}
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>
              생성될 하위번호
            </label>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: count }, (_, i) => (
                <span
                  key={i}
                  className={`inline-block px-2 py-0.5 text-xs rounded ${BG_COLOR.muted} ${TEXT_COLOR.brand} font-mono`}
                >
                  {baseNumber}-{i + 1}
                </span>
              ))}
            </div>
          </div>

          {/* 각 항목 폼 */}
          <div className="space-y-3">
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary}`}>
              항목별 정보 (선택)
            </label>
            {items.map((item, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border ${BORDER_COLOR.default} space-y-2`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-xs font-mono px-1.5 py-0.5 rounded ${BG_COLOR.muted} ${TEXT_COLOR.brand}`}
                  >
                    {baseNumber}-{index + 1}
                  </span>
                </div>
                <input
                  type="text"
                  placeholder={`${contact.inquiry_title || '제목'} (${index + 1})`}
                  value={item.subject}
                  onChange={(e) => handleItemChange(index, 'subject', e.target.value)}
                  className={`w-full border ${BORDER_COLOR.default} rounded px-3 py-1.5 text-sm ${BG_COLOR.card} ${TEXT_COLOR.primary} placeholder:${TEXT_COLOR.muted}`}
                />
                <textarea
                  placeholder="설명 (선택)"
                  value={item.description}
                  onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                  rows={2}
                  className={`w-full border ${BORDER_COLOR.default} rounded px-3 py-1.5 text-sm ${BG_COLOR.card} ${TEXT_COLOR.primary} placeholder:${TEXT_COLOR.muted} resize-none`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div
          className={`sticky bottom-0 ${BG_COLOR.card} border-t ${BORDER_COLOR.default} p-4 flex justify-end gap-2`}
        >
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            취소
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? '분할 중...' : '분할 실행'}
          </Button>
        </div>
      </div>
    </div>
  );
}
