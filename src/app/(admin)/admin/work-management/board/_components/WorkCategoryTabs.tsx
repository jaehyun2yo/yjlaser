'use client';

import { Building2, HardHat, HelpCircle } from 'lucide-react';
import { BG_COLOR, TEXT_COLOR } from '@/lib/styles';
import type { WorkCategory } from '@/app/(admin)/admin/work-management/board/_lib/constants';

interface WorkCategoryTabsProps {
  activeCategory: WorkCategory;
  onCategoryChange: (category: WorkCategory) => void;
  counts?: { unclassified: number; office: number; field: number };
}

const categories: { key: WorkCategory; label: string; icon: React.ReactNode }[] = [
  {
    key: 'unclassified',
    label: '미분류',
    icon: <HelpCircle className="w-4 h-4" />,
  },
  {
    key: 'office',
    label: '사무실 작업',
    icon: <Building2 className="w-4 h-4" />,
  },
  {
    key: 'field',
    label: '현장 작업',
    icon: <HardHat className="w-4 h-4" />,
  },
];

export function WorkCategoryTabs({
  activeCategory,
  onCategoryChange,
  counts,
}: WorkCategoryTabsProps) {
  return (
    <div className="flex items-center gap-2">
      {categories.map((cat) => {
        const isActive = activeCategory === cat.key;
        const count = counts?.[cat.key];

        return (
          <button
            key={cat.key}
            onClick={() => onCategoryChange(cat.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-[#ED6C00] text-white shadow-sm'
                : `${BG_COLOR.muted} ${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted}`
            }`}
          >
            {cat.icon}
            {cat.label}
            {count !== undefined && (
              <span
                className={`px-1.5 py-0.5 text-xs rounded-full ${
                  isActive ? 'bg-white/20 text-white' : `${BG_COLOR.muted} ${TEXT_COLOR.secondary}`
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
