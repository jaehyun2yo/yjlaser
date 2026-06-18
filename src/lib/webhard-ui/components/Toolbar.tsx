'use client';

/**
 * Toolbar
 * File action buttons toolbar
 * - Mark as downloaded
 * - Download
 * - Move
 * - Delete
 */

import { memo } from 'react';
import { BG_COLOR, TEXT_COLOR } from '@/lib/styles';

export interface ToolbarAction {
  /** Action key */
  key: string;
  /** Button label */
  label: string;
  /** Short label for mobile */
  shortLabel?: string;
  /** Icon component */
  icon?: React.ReactNode;
  /** Click handler */
  onClick: () => void;
  /** Disabled state */
  disabled?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Button color variant */
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning';
  /** Show even when no selection */
  showAlways?: boolean;
  /** Tooltip text */
  tooltip?: string;
}

export interface ToolbarProps {
  /** Selected item count */
  selectedCount: number;
  /** Actions to display */
  actions: ToolbarAction[];
  /** Selection count label template (use {count} placeholder) */
  selectionLabel?: string;
  /** Additional class name */
  className?: string;
}

/**
 * Get button classes based on variant and enabled state
 */
function getButtonClasses(variant: ToolbarAction['variant'], enabled: boolean): string {
  const baseClasses =
    'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors font-medium';

  if (!enabled) {
    return `${baseClasses} ${BG_COLOR.muted} ${TEXT_COLOR.muted} cursor-not-allowed`;
  }

  const variantClasses = {
    primary: 'bg-orange-500 hover:bg-orange-600 text-white',
    secondary: 'bg-blue-500 hover:bg-blue-600 text-white',
    success: 'bg-green-500 hover:bg-green-600 text-white',
    danger: 'bg-red-500 hover:bg-red-600 text-white',
    warning: 'bg-yellow-500 hover:bg-yellow-600 text-white',
  };

  return `${baseClasses} ${variantClasses[variant || 'primary']}`;
}

/**
 * Toolbar component
 */
export const Toolbar = memo(function Toolbar({
  selectedCount,
  actions,
  selectionLabel = '{count} selected',
  className = '',
}: ToolbarProps) {
  const hasSelection = selectedCount > 0;

  return (
    <div className={`flex items-center gap-2 flex-shrink-0 ${className}`}>
      {/* Selected count display */}
      {hasSelection && (
        <span className={`text-xs ${TEXT_COLOR.secondary} mr-2`}>
          {selectionLabel.replace('{count}', String(selectedCount))}
        </span>
      )}

      {/* Action buttons */}
      {actions
        .filter((action) => action.showAlways || hasSelection)
        .map((action) => {
          const isEnabled =
            !action.disabled && !action.loading && (action.showAlways || hasSelection);

          return (
            <button
              key={action.key}
              onClick={action.onClick}
              disabled={!isEnabled}
              className={getButtonClasses(action.variant, isEnabled)}
              title={action.tooltip}
              aria-label={action.tooltip || action.label}
            >
              {action.loading ? (
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" aria-hidden="true">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              ) : (
                action.icon
              )}
              <span className="hidden sm:inline">{action.label}</span>
              {action.shortLabel && <span className="sm:hidden">{action.shortLabel}</span>}
            </button>
          );
        })}
    </div>
  );
});

export default Toolbar;
