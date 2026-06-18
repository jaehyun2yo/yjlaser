'use client';

import { useState, useEffect, useCallback } from 'react';
import { FaTimes } from 'react-icons/fa';
import { useToast } from '@/hooks/useToast';
import { TEXT_COLOR, BORDER_COLOR } from '@/lib/styles';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('LinkFileToContactModal');

type Purpose = 'revision_submit' | 'mold_request' | 'other';

interface ContactItem {
  id: string;
  inquiry_number: string | null;
  inquiry_title: string | null;
  company_name: string;
  status: string;
  process_stage: string | null;
}

interface LinkFileToContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  companyName: string;
}

const PURPOSE_LABELS: Record<Purpose, string> = {
  revision_submit: '수정도면',
  mold_request: '목형의뢰',
  other: '기타',
};

const STAGE_LABELS: Record<string, string> = {
  drawing: '도면작업',
  sample: '샘플제작',
  drawing_confirmed: '도면확정',
  laser: '레이저가공',
  cutting: '칼작업',
  creasing: '오시작업',
};

const ACTIVE_STATUSES = new Set([
  'received',
  'drawing',
  'confirmed',
  'production',
  'cutting',
  'finishing',
  'delivering',
  'on_hold',
]);

export function LinkFileToContactModal({
  isOpen,
  onClose,
  fileId,
  fileName,
  companyName,
}: LinkFileToContactModalProps) {
  const { success, error: showError } = useToast();
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<Purpose>('mold_request');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 진행 중인 문의 목록 조회
  useEffect(() => {
    if (!isOpen || !companyName) return;

    setIsLoading(true);
    setSelectedContactId(null);

    fetch(`/api/contacts/by-company?companyName=${encodeURIComponent(companyName)}`)
      .then((res) => {
        if (!res.ok) throw new Error('문의 목록 조회 실패');
        return res.json();
      })
      .then((data) => {
        const items: ContactItem[] = Array.isArray(data) ? data : data.data || [];
        // 진행 중인 문의만 필터링
        const activeItems = items.filter((c) => ACTIVE_STATUSES.has(c.status));
        setContacts(activeItems);
      })
      .catch((err) => {
        log.error('문의 목록 조회 실패', err);
        setContacts([]);
      })
      .finally(() => setIsLoading(false));
  }, [isOpen, companyName]);

  const handleLink = useCallback(async () => {
    if (!selectedContactId || selectedContactId === '__none__') {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/contacts/${selectedContactId}/link-webhard-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, purpose }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as Record<string, string>).message || '문의 연결 실패');
      }

      success('연결 완료', '파일이 문의에 연결되었습니다.');
      onClose();
    } catch (err) {
      log.error('문의 연결 실패', err);
      showError(
        '연결 실패',
        err instanceof Error ? err.message : '문의 연결 중 오류가 발생했습니다.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedContactId, fileId, purpose, success, showError, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-md mx-4 rounded-xl bg-white dark:bg-gray-800 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h3 className={`text-lg font-bold ${TEXT_COLOR.primary}`}>문의 연결</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            aria-label="닫기"
          >
            <FaTimes />
          </button>
        </div>

        <div className="px-6 pb-6">
          <p className={`text-sm ${TEXT_COLOR.secondary} mb-4`}>
            <span className="font-medium">{fileName}</span> 파일과 관련된 문의가 있나요?
          </p>

          {/* 문의 목록 */}
          <div
            className={`max-h-48 overflow-y-auto rounded-lg border ${BORDER_COLOR.default} mb-4`}
          >
            {isLoading ? (
              <div className="p-4 text-center">
                <p className={`text-sm ${TEXT_COLOR.muted}`}>문의 목록 불러오는 중...</p>
              </div>
            ) : contacts.length === 0 ? (
              <div className="p-4 text-center">
                <p className={`text-sm ${TEXT_COLOR.muted}`}>진행 중인 문의가 없습니다.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {contacts.map((contact) => (
                  <label
                    key={contact.id}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      selectedContactId === contact.id
                        ? 'bg-orange-50 dark:bg-orange-950/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="link-contact"
                      value={contact.id}
                      checked={selectedContactId === contact.id}
                      onChange={() => setSelectedContactId(contact.id)}
                      className="text-[#ED6C00] focus:ring-[#ED6C00]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${TEXT_COLOR.primary} truncate`}>
                        {contact.inquiry_number || '번호 없음'}{' '}
                        {contact.inquiry_title || contact.company_name}
                      </p>
                      {contact.process_stage && (
                        <p className={`text-xs ${TEXT_COLOR.muted}`}>
                          {STAGE_LABELS[contact.process_stage] || contact.process_stage}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
                {/* 해당 없음 */}
                <label
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                    selectedContactId === '__none__'
                      ? 'bg-orange-50 dark:bg-orange-950/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="link-contact"
                    value="__none__"
                    checked={selectedContactId === '__none__'}
                    onChange={() => setSelectedContactId('__none__')}
                    className="text-[#ED6C00] focus:ring-[#ED6C00]"
                  />
                  <span className={`text-sm ${TEXT_COLOR.muted}`}>해당 없음</span>
                </label>
              </div>
            )}
          </div>

          {/* 용도 선택 — 문의 선택 시만 표시 */}
          {selectedContactId && selectedContactId !== '__none__' && (
            <div className="mb-4">
              <p className={`text-sm font-medium ${TEXT_COLOR.primary} mb-2`}>용도</p>
              <div className="flex flex-wrap gap-3">
                {(Object.keys(PURPOSE_LABELS) as Purpose[]).map((key) => (
                  <label
                    key={key}
                    className={`flex items-center gap-2 cursor-pointer text-sm ${TEXT_COLOR.secondary}`}
                  >
                    <input
                      type="radio"
                      name="link-purpose"
                      value={key}
                      checked={purpose === key}
                      onChange={() => setPurpose(key)}
                      className="text-[#ED6C00] focus:ring-[#ED6C00]"
                    />
                    {PURPOSE_LABELS[key]}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 버튼 */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              건너뛰기
            </button>
            <button
              type="button"
              onClick={handleLink}
              disabled={!selectedContactId || isSubmitting}
              className={`
                px-5 py-2 text-sm font-medium rounded-lg transition-colors
                ${
                  !selectedContactId || isSubmitting
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-600 dark:text-gray-400'
                    : 'bg-[#ED6C00] hover:bg-[#d15f00] text-white'
                }
              `}
            >
              {isSubmitting ? '연결 중...' : selectedContactId === '__none__' ? '확인' : '연결'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
