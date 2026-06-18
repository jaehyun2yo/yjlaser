/**
 * 상태 필터 바 컴포넌트
 */
'use client';

import { memo, useCallback } from 'react';
import { FaTrash, FaSpinner, FaCalendarAlt, FaTags } from 'react-icons/fa';
import { SearchInput } from '@/components/SearchInput';
import { FILTER_BUTTON_STYLES, TEXT_COLOR } from '@/lib/styles';
import type { StatusCounts } from '@/lib/types';
import {
  STATUS_FILTERS,
  DATE_FILTERS,
  INQUIRY_TYPE_FILTERS,
} from '@/app/(admin)/admin/contacts/_lib/constants';

interface StatusFilterBarProps {
  statusFilter: string;
  statusCounts?: StatusCounts;
  totalCount: number;
  searchInput: string;
  onSearchChange: (value: string) => void;
  onSearchClear: () => void;
  onFilterChange: (status: string) => void;
  onFilterHover?: (status: string) => void;
  onEmptyTrash?: () => void;
  isEmptyingTrash?: boolean;
  deletingCount?: number;
  trashButton?: React.ReactNode;
  isSearching?: boolean;
  dateFilter?: string;
  onDateFilterChange?: (filter: string) => void;
  inquiryTypeFilter?: string;
  onInquiryTypeFilterChange?: (filter: string) => void;
}

function StatusFilterBarComponent({
  statusFilter,
  statusCounts,
  totalCount,
  searchInput,
  onSearchChange,
  onSearchClear,
  onFilterChange,
  onFilterHover,
  onEmptyTrash,
  isEmptyingTrash = false,
  deletingCount = 0,
  trashButton,
  isSearching = false,
  dateFilter = 'all',
  onDateFilterChange,
  inquiryTypeFilter = 'all',
  onInquiryTypeFilterChange,
}: StatusFilterBarProps) {
  /**
   * 필터별 카운트 가져오기
   */
  const getCount = useCallback(
    (key: string): number => {
      if (key === 'all') return statusCounts?.all ?? totalCount;
      if (statusCounts) {
        return statusCounts[key as keyof StatusCounts] ?? 0;
      }
      return 0;
    },
    [statusCounts, totalCount]
  );

  return (
    <div className="flex flex-col gap-2 mb-6">
      {/* 1행: 상태 필터 버튼 + 휴지통 비우기 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onFilterChange(key)}
              onMouseEnter={() => onFilterHover?.(key)}
              className={`px-2 sm:px-2.5 py-1 rounded-md transition-colors text-xs cursor-pointer ${
                statusFilter === key ? 'bg-[#ED6C00] text-white' : FILTER_BUTTON_STYLES.inactive
              }`}
            >
              {label} ({getCount(key)})
            </button>
          ))}
        </div>

        {/* 삭제중 필터일 때 휴지통 비우기 버튼 */}
        {statusFilter === 'deleting' && trashButton && (
          <div className="flex-shrink-0">{trashButton}</div>
        )}
      </div>

      {/* 2행: 날짜 필터 + 문의유형 필터 + 검색 입력 */}
      <div className="flex flex-wrap items-center gap-2">
        {/* 날짜 필터 */}
        {onDateFilterChange && (
          <div className="flex items-center gap-1.5">
            <FaCalendarAlt className={`text-xs ${TEXT_COLOR.muted}`} />
            <div className="flex gap-1">
              {DATE_FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => onDateFilterChange(key)}
                  className={`px-2 py-1 rounded-md transition-colors text-xs cursor-pointer ${
                    dateFilter === key ? 'bg-blue-600 text-white' : FILTER_BUTTON_STYLES.inactive
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 문의유형 필터 */}
        {onInquiryTypeFilterChange && (
          <div className="flex items-center gap-1.5">
            <FaTags className={`text-xs ${TEXT_COLOR.muted}`} />
            <div className="flex gap-1">
              {INQUIRY_TYPE_FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => onInquiryTypeFilterChange(key)}
                  className={`px-2 py-1 rounded-md transition-colors text-xs cursor-pointer ${
                    inquiryTypeFilter === key
                      ? 'bg-orange-500 text-white'
                      : FILTER_BUTTON_STYLES.inactive
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 검색 입력 */}
        <div className="flex-1 min-w-[200px]">
          <SearchInput
            value={searchInput}
            onChange={onSearchChange}
            onClear={onSearchClear}
            placeholder="문의번호, 업체명, 패키지명 검색"
            className="w-full"
            size="small"
            icon
          />
        </div>
        {isSearching && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <FaSpinner className={`animate-spin text-xs ${TEXT_COLOR.muted}`} />
            <span className={`text-xs ${TEXT_COLOR.muted}`}>검색 중...</span>
          </div>
        )}
      </div>

      {/* 레거시 지원: trashButton이 없고 onEmptyTrash가 있는 경우 */}
      {statusFilter === 'deleting' && !trashButton && deletingCount > 0 && onEmptyTrash && (
        <div className="flex justify-end">
          <button
            onClick={onEmptyTrash}
            disabled={isEmptyingTrash}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
              ${
                isEmptyingTrash
                  ? 'bg-gray-400 cursor-not-allowed text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }
              transition-colors cursor-pointer
            `}
          >
            {isEmptyingTrash ? (
              <>
                <FaSpinner className="animate-spin" />
                삭제 중...
              </>
            ) : (
              <>
                <FaTrash />
                휴지통 비우기 ({deletingCount}개)
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export const StatusFilterBar = memo(StatusFilterBarComponent);
