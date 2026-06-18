'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { Calendar, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { DATE_MODE_OPTIONS } from '@/app/(admin)/admin/work-management/delivered/_lib/constants';
import type { DateMode } from '@/app/(admin)/admin/work-management/delivered/_lib/constants';
import { CompanyMultiSelect } from './CompanyMultiSelect';

interface DeliveredFilterBarProps {
  dateMode: DateMode;
  selectedDate: string;
  selectedMonth: string;
  selectedCompanies: string[];
  onDateModeChange: (mode: DateMode) => void;
  onDateChange: (date: string) => void;
  onMonthChange: (month: string) => void;
  onCompaniesChange: (companies: string[]) => void;
  onResetToToday: () => void;
}

function shiftDate(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftMonth(monthStr: string, delta: number): string {
  const [year, month] = monthStr.split('-').map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function DeliveredFilterBar({
  dateMode,
  selectedDate,
  selectedMonth,
  selectedCompanies,
  onDateModeChange,
  onDateChange,
  onMonthChange,
  onCompaniesChange,
  onResetToToday,
}: DeliveredFilterBarProps) {
  const handlePrev = () => {
    if (dateMode === 'daily') {
      onDateChange(shiftDate(selectedDate, -1));
    } else {
      onMonthChange(shiftMonth(selectedMonth, -1));
    }
  };

  const handleNext = () => {
    if (dateMode === 'daily') {
      onDateChange(shiftDate(selectedDate, 1));
    } else {
      onMonthChange(shiftMonth(selectedMonth, 1));
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      {/* Date mode toggle */}
      <div className={`flex items-center gap-1 ${BG_COLOR.muted} rounded-lg p-0.5`}>
        {DATE_MODE_OPTIONS.map((option) => (
          <button
            key={option.key}
            onClick={() => onDateModeChange(option.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              dateMode === option.key
                ? `${BG_COLOR.card} ${TEXT_COLOR.primary} shadow-sm`
                : `${TEXT_COLOR.secondary} ${TEXT_COLOR.hoverPrimary}`
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Date / Month picker with navigation */}
      <div className="flex items-center gap-1.5">
        <Calendar className="w-4 h-4 text-gray-400" />

        <button
          onClick={handlePrev}
          className={`p-1.5 text-gray-400 ${TEXT_COLOR.hoverPrimary} rounded-md ${BG_COLOR.hoverMuted} transition-colors`}
          aria-label="이전"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {dateMode === 'daily' ? (
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className={`w-36 px-3 py-1.5 text-xs rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.secondary}`}
          />
        ) : (
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => onMonthChange(e.target.value)}
            className={`w-36 px-3 py-1.5 text-xs rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.secondary}`}
          />
        )}

        <button
          onClick={handleNext}
          className={`p-1.5 text-gray-400 ${TEXT_COLOR.hoverPrimary} rounded-md ${BG_COLOR.hoverMuted} transition-colors`}
          aria-label="다음"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onResetToToday}
          title={dateMode === 'daily' ? '오늘' : '이번 달'}
          className={`p-1.5 text-gray-400 ${TEXT_COLOR.hoverPrimary} rounded-md ${BG_COLOR.hoverMuted} transition-colors`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Company multi-select */}
      <CompanyMultiSelect selected={selectedCompanies} onChange={onCompaniesChange} />
    </div>
  );
}
