'use client';

import { useCallback } from 'react';
import { FaChevronLeft, FaChevronRight, FaCalendarAlt } from 'react-icons/fa';
import type { DateFilter } from '@/app/company/dashboard/types';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

interface FilterButtonsProps {
  dateFilter: DateFilter;
  onDateFilterChange: (filter: DateFilter) => void;
  filteredCount: number;
  variant?: 'mobile' | 'tablet' | 'desktop';
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatInputDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function FilterButtons({
  dateFilter,
  onDateFilterChange,
  filteredCount,
}: FilterButtonsProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isAllTime = !dateFilter.startDate && !dateFilter.endDate;

  // 날짜 네비게이션 (하루 단위)
  const navigateDay = useCallback(
    (direction: -1 | 1) => {
      const base = dateFilter.startDate || today;
      const newDate = new Date(base);
      newDate.setDate(newDate.getDate() + direction);
      newDate.setHours(0, 0, 0, 0);
      const endOfDay = new Date(newDate);
      endOfDay.setHours(23, 59, 59, 999);
      onDateFilterChange({ startDate: newDate, endDate: endOfDay });
    },
    [dateFilter.startDate, onDateFilterChange, today]
  );

  // 오늘 선택
  const selectToday = useCallback(() => {
    const start = new Date(today);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    onDateFilterChange({ startDate: start, endDate: end });
  }, [onDateFilterChange, today]);

  // 전체 보기
  const selectAll = useCallback(() => {
    onDateFilterChange({ startDate: null, endDate: null });
  }, [onDateFilterChange]);

  // 날짜 직접 선택
  const handleStartDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.value) return;
      const start = new Date(e.target.value);
      start.setHours(0, 0, 0, 0);
      const end =
        dateFilter.endDate && dateFilter.endDate >= start
          ? dateFilter.endDate
          : new Date(start.getTime());
      if (!dateFilter.endDate || dateFilter.endDate < start) end.setHours(23, 59, 59, 999);
      onDateFilterChange({ startDate: start, endDate: end });
    },
    [dateFilter.endDate, onDateFilterChange]
  );

  const handleEndDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.value) return;
      const end = new Date(e.target.value);
      end.setHours(23, 59, 59, 999);
      const start =
        dateFilter.startDate && dateFilter.startDate <= end
          ? dateFilter.startDate
          : new Date(end.getTime());
      if (!dateFilter.startDate || dateFilter.startDate > end) start.setHours(0, 0, 0, 0);
      onDateFilterChange({ startDate: start, endDate: end });
    },
    [dateFilter.startDate, onDateFilterChange]
  );

  // 현재 표시 라벨
  const getLabel = () => {
    if (isAllTime) return '전체 기간';
    if (
      dateFilter.startDate &&
      dateFilter.endDate &&
      isSameDay(dateFilter.startDate, dateFilter.endDate)
    ) {
      if (isSameDay(dateFilter.startDate, today)) return '오늘';
      return formatDate(dateFilter.startDate);
    }
    if (dateFilter.startDate && dateFilter.endDate) {
      return `${formatDate(dateFilter.startDate)} ~ ${formatDate(dateFilter.endDate)}`;
    }
    return '전체 기간';
  };

  const btnBase = `px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200`;
  const btnActive = 'bg-[#ED6C00] text-white border border-[#ED6C00]';
  const btnInactive = `${BG_COLOR.muted}/50 ${TEXT_COLOR.secondary} border ${BORDER_COLOR.default}/50 ${BG_COLOR.hoverMuted}/50`;

  return (
    <div className="flex flex-col gap-2">
      {/* 상단: 전체/오늘 + 날짜 네비게이터 (가운데 정렬) */}
      <div className="flex items-center justify-center gap-3">
        <button onClick={selectAll} className={`${btnBase} ${isAllTime ? btnActive : btnInactive}`}>
          전체
        </button>
        <button
          onClick={selectToday}
          className={`${btnBase} ${!isAllTime && dateFilter.startDate && isSameDay(dateFilter.startDate, today) && dateFilter.endDate && isSameDay(dateFilter.endDate, today) ? btnActive : btnInactive}`}
        >
          오늘
        </button>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => navigateDay(-1)}
            className={`p-1.5 rounded-lg ${BG_COLOR.muted}/50 ${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted}/50 transition-colors`}
          >
            <FaChevronLeft className="w-3 h-3" />
          </button>
          <span
            className={`text-xs sm:text-sm font-medium ${TEXT_COLOR.secondary} w-[200px] text-center`}
          >
            {getLabel()}
          </span>
          <button
            onClick={() => navigateDay(1)}
            className={`p-1.5 rounded-lg ${BG_COLOR.muted}/50 ${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted}/50 transition-colors`}
          >
            <FaChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 하단: 날짜 범위 선택 (가운데 정렬) */}
      <div
        className={`flex items-center justify-center gap-2 p-2 ${BG_COLOR.muted}/50 rounded-lg border ${BORDER_COLOR.default}/50`}
      >
        <FaCalendarAlt className="text-gray-400 text-xs flex-shrink-0" />
        <input
          type="date"
          value={dateFilter.startDate ? formatInputDate(dateFilter.startDate) : ''}
          max={dateFilter.endDate ? formatInputDate(dateFilter.endDate) : formatInputDate(today)}
          onChange={handleStartDateChange}
          className={`text-xs sm:text-sm bg-transparent ${TEXT_COLOR.secondary} outline-none w-[130px] text-center`}
        />
        <span className="text-gray-400 text-xs">~</span>
        <input
          type="date"
          value={dateFilter.endDate ? formatInputDate(dateFilter.endDate) : ''}
          min={dateFilter.startDate ? formatInputDate(dateFilter.startDate) : ''}
          max={
            dateFilter.startDate
              ? formatInputDate(new Date(dateFilter.startDate.getTime() + 365 * 86400000))
              : formatInputDate(today)
          }
          onChange={handleEndDateChange}
          className={`text-xs sm:text-sm bg-transparent ${TEXT_COLOR.secondary} outline-none w-[130px] text-center`}
        />
        <span className={`text-xs font-medium text-[#ED6C00]`}>({filteredCount}건)</span>
      </div>
    </div>
  );
}
