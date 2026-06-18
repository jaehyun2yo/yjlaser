import type { StatusFilterType } from '@/app/company/dashboard/types';
import { statusFilterOptions } from '@/app/company/dashboard/utils';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

type Variant = 'mobile' | 'tablet' | 'desktop';

interface StatusFilterButtonsProps {
  statusFilter: StatusFilterType;
  onStatusFilterChange: (filter: StatusFilterType) => void;
  variant?: Variant;
}

export function StatusFilterButtons({
  statusFilter,
  onStatusFilterChange,
  variant = 'desktop',
}: StatusFilterButtonsProps) {
  const buttonClasses = {
    mobile: 'px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
    tablet: 'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
    desktop: 'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
  };

  const getButtonStyle = (isActive: boolean) => {
    if (isActive) {
      return 'bg-[#ED6C00] text-white border border-[#ED6C00]';
    }
    return `${BG_COLOR.muted}/50 ${TEXT_COLOR.secondary} border ${BORDER_COLOR.default}/50 ${BG_COLOR.hoverMuted}/50 ${TEXT_COLOR.hoverPrimary}`;
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {statusFilterOptions.map((option) => (
        <button
          key={option.value}
          onClick={() => onStatusFilterChange(option.value)}
          className={`${buttonClasses[variant]} ${getButtonStyle(statusFilter === option.value)}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
