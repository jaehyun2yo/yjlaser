'use client';

import {
  UNCLASSIFIED_STAGE_FILTERS,
  OFFICE_STAGE_FILTERS,
  FIELD_STAGE_FILTERS,
} from '@/app/(admin)/admin/work-management/board/_lib/constants';
import type { WorkCategory } from '@/app/(admin)/admin/work-management/board/_lib/constants';
import { BG_COLOR, TEXT_COLOR } from '@/lib/styles';

interface StageFilterBarProps {
  workCategory: WorkCategory;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}

export function StageFilterBar({
  workCategory,
  activeFilter,
  onFilterChange,
}: StageFilterBarProps) {
  const filters =
    workCategory === 'unclassified'
      ? UNCLASSIFIED_STAGE_FILTERS
      : workCategory === 'office'
        ? OFFICE_STAGE_FILTERS
        : FIELD_STAGE_FILTERS;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {filters.map((filter) => {
        const isActive = activeFilter === filter.key;

        return (
          <button
            key={filter.key}
            onClick={() => onFilterChange(filter.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              isActive
                ? `${BG_COLOR.inverted} ${TEXT_COLOR.inverted}`
                : `${BG_COLOR.muted} ${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted}`
            }`}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}
