'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FaSpinner } from 'react-icons/fa';
import { logger } from '@/lib/utils/logger';
import type { InquiryType } from '@/lib/types';
import { TEXT_COLOR } from '@/lib/styles';

const log = logger.createLogger('InquiryTypeSelector');

interface InquiryTypeSelectorProps {
  contactId: string;
  currentInquiryType: InquiryType | null | undefined;
  source: string | null | undefined;
}

const INQUIRY_TYPE_OPTIONS: { value: InquiryType; label: string; description: string }[] = [
  { value: 'cutting_request', label: '칼선의뢰', description: '도면작업 필요 (status: 도면작업)' },
  {
    value: 'mold_request',
    label: '목형의뢰',
    description: '도면 확정, 제작 가능 (status: 컨펌)',
  },
];

export function InquiryTypeSelector({
  contactId,
  currentInquiryType,
  source,
}: InquiryTypeSelectorProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected] = useState<InquiryType | null>(currentInquiryType ?? null);

  const isUnclassified = source === 'webhard' && !currentInquiryType;
  const isWebhard = source === 'webhard';

  const handleChange = useCallback(
    async (inquiryType: InquiryType) => {
      if (isLoading || selected === inquiryType) return;
      setIsLoading(true);

      try {
        const response = await fetch(`/api/contacts/${contactId}/inquiry-type`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inquiry_type: inquiryType }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || '문의 유형 변경에 실패했습니다.');
        }

        setSelected(inquiryType);
        router.refresh();
      } catch (err) {
        log.error('Error updating inquiry_type', err);
        alert(err instanceof Error ? err.message : '문의 유형 변경에 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    },
    [contactId, isLoading, selected, router]
  );

  if (!isWebhard) {
    return (
      <p className={`mt-1 ${TEXT_COLOR.primary} text-sm`}>
        웹하드 문의만 유형을 지정할 수 있습니다.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* 현재 유형 표시 */}
      <div className="flex items-center gap-2">
        {selected === 'cutting_request' && (
          <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
            칼선의뢰
          </span>
        )}
        {selected === 'mold_request' && (
          <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
            목형의뢰
          </span>
        )}
        {!selected && (
          <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800">
            미분류
          </span>
        )}
      </div>

      {/* 변경 UI: 미분류이거나 변경 필요 시 */}
      {isWebhard && (
        <div className="space-y-2">
          <p className={`text-xs ${TEXT_COLOR.muted}`}>
            {isUnclassified ? '유형을 지정해주세요:' : '유형 변경:'}
          </p>
          <div className="flex gap-2">
            {INQUIRY_TYPE_OPTIONS.map(({ value, label, description }) => (
              <button
                key={value}
                onClick={() => handleChange(value)}
                disabled={isLoading || selected === value}
                className={`flex-1 px-3 py-2 text-xs rounded-md border transition-colors cursor-pointer
                  ${
                    selected === value
                      ? value === 'cutting_request'
                        ? 'bg-blue-100 border-blue-400 text-blue-800 cursor-default'
                        : 'bg-green-100 border-green-400 text-green-800 cursor-default'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }
                  disabled:opacity-60`}
                title={description}
              >
                {isLoading ? <FaSpinner className="animate-spin mx-auto" /> : label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
