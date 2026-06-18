'use client';

import { Calendar, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { DATE_MODE_OPTIONS } from '@/app/(admin)/admin/work-management/delivered/_lib/constants';
import type { DateMode } from '@/app/(admin)/admin/work-management/delivered/_lib/constants';
import { WorkerCompanyMultiSelect } from './WorkerCompanyMultiSelect';

interface WorkerDeliveredFilterBarProps {
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

export function WorkerDeliveredFilterBar({
  dateMode,
  selectedDate,
  selectedMonth,
  selectedCompanies,
  onDateModeChange,
  onDateChange,
  onMonthChange,
  onCompaniesChange,
  onResetToToday,
}: WorkerDeliveredFilterBarProps) {
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
    <div className="space-y-3">
      {/* Date mode toggle */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
        {DATE_MODE_OPTIONS.map((option) => (
          <button
            key={option.key}
            onClick={() => onDateModeChange(option.key)}
            className={`flex-1 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              dateMode === option.key
                ? 'bg-[#ED6C00] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Date picker + navigation */}
      <div className="flex items-center gap-1.5">
        <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />

        {/* Prev button */}
        <button
          onClick={handlePrev}
          className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors"
          aria-label="이전"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Date input */}
        {dateMode === 'daily' ? (
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="w-36 px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white text-gray-900"
          />
        ) : (
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => onMonthChange(e.target.value)}
            className="w-36 px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white text-gray-900"
          />
        )}

        {/* Next button */}
        <button
          onClick={handleNext}
          className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors"
          aria-label="다음"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Reset button */}
        <button
          onClick={onResetToToday}
          title={dateMode === 'daily' ? '오늘' : '이번 달'}
          className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Company multi-select */}
      <WorkerCompanyMultiSelect selected={selectedCompanies} onChange={onCompaniesChange} />
    </div>
  );
}
