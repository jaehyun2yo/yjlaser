'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useState, useRef, useEffect } from 'react';
import { useCreateTestContact } from '@/app/(admin)/admin/process-board/_lib/hooks';
import { logger } from '@/lib/utils/logger';

export default function TestContactButton() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { mutate: createTest, isPending } = useCreateTestContact();

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleCreate = (count: 1 | 5) => {
    createTest(count, {
      onSuccess: () => {
        setIsOpen(false);
      },
      onError: (error) => {
        logger.error('테스트 문의 생성 실패:', error);
        alert('테스트 문의 생성에 실패했습니다.');
      },
    });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isPending}
        className={`flex items-center gap-2 px-3 py-2 bg-gray-200 ${BG_COLOR.hoverDark} ${TEXT_COLOR.primary} rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isPending ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            생성 중...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            테스트 문의
            <svg
              className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </>
        )}
      </button>

      {/* 드롭다운 메뉴 */}
      {isOpen && !isPending && (
        <div
          className={`absolute top-full left-0 mt-1 w-32 ${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-lg shadow-lg z-10`}
        >
          <button
            onClick={() => handleCreate(1)}
            className={`w-full px-4 py-2 text-left text-sm ${TEXT_COLOR.primary} ${BG_COLOR.hoverMuted} rounded-t-lg transition-colors`}
          >
            1개 생성
          </button>
          <button
            onClick={() => handleCreate(5)}
            className={`w-full px-4 py-2 text-left text-sm ${TEXT_COLOR.primary} ${BG_COLOR.hoverMuted} rounded-b-lg transition-colors`}
          >
            5개 생성
          </button>
        </div>
      )}
    </div>
  );
}
