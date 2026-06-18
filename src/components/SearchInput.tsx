'use client';

import { INPUT_STYLES, TEXT_COLOR, BG_COLOR, BORDER_COLOR, TRANSITION_STYLES } from '@/lib/styles';
import { FaSearch, FaTimes } from 'react-icons/fa';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onClear?: () => void;
  showClearButton?: boolean;
  size?: 'default' | 'small';
  className?: string;
  icon?: boolean;
}

export function SearchInput({
  value,
  onChange,
  placeholder = '검색...',
  onClear,
  showClearButton = true,
  size = 'default',
  className = '',
  icon = false,
}: SearchInputProps) {
  const handleClear = () => {
    onChange('');
    if (onClear) {
      onClear();
    }
  };

  // size="small"이면서 icon이 있을 때 특별 처리
  const isSmallWithIcon = size === 'small' && icon;

  const baseStyles = isSmallWithIcon
    ? `w-full px-3 py-1.5 text-xs rounded-md border ${BG_COLOR.card} ${TEXT_COLOR.primary} ${BORDER_COLOR.default} focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand`
    : size === 'small'
      ? `${INPUT_STYLES.searchSmall} ${INPUT_STYLES.searchSmallWidth}`
      : `${INPUT_STYLES.base} ${INPUT_STYLES.full}`;

  const focusStyles = size === 'small' ? '' : INPUT_STYLES.focus;

  return (
    <div
      className={`${icon || isSmallWithIcon ? 'relative' : size === 'small' ? 'flex items-center gap-2' : 'relative'} ${className}`}
    >
      {icon && (
        <div
          className={`absolute inset-y-0 left-0 ${isSmallWithIcon ? 'pl-2.5' : 'pl-3'} flex items-center pointer-events-none`}
        >
          <FaSearch className={`${TEXT_COLOR.muted} ${isSmallWithIcon ? 'text-xs' : ''}`} />
        </div>
      )}
      <div className="relative flex-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${baseStyles} ${focusStyles} ${icon ? (isSmallWithIcon ? 'pl-8' : 'pl-10') : ''} ${value && showClearButton ? (isSmallWithIcon ? 'pr-7' : size === 'small' ? 'pr-8' : 'pr-10') : ''}`}
        />
        {/* small + icon일 때 인라인 클리어 버튼 */}
        {showClearButton && value && isSmallWithIcon && (
          <button
            type="button"
            onClick={handleClear}
            className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 ${TEXT_COLOR.muted} ${TEXT_COLOR.brandHover} rounded ${TRANSITION_STYLES.colors} cursor-pointer`}
            aria-label="검색어 지우기"
          >
            <FaTimes className="text-xs" />
          </button>
        )}
        {showClearButton && value && size !== 'small' && (
          <button
            type="button"
            onClick={handleClear}
            className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 ${TEXT_COLOR.muted} ${TEXT_COLOR.brandHover} rounded-full ${BG_COLOR.hoverMuted} ${TRANSITION_STYLES.colors} cursor-pointer`}
            aria-label="검색어 지우기"
          >
            <FaTimes className="text-sm" />
          </button>
        )}
      </div>
      {showClearButton && value && size === 'small' && !icon && (
        <button
          type="button"
          onClick={handleClear}
          className={`px-2.5 sm:px-3 py-1.5 ${BG_COLOR.muted} ${BG_COLOR.hoverMuted} ${TEXT_COLOR.secondary} rounded-lg text-xs ${TRANSITION_STYLES.colors} cursor-pointer`}
          aria-label="검색어 지우기"
        >
          <FaTimes className="text-xs" />
        </button>
      )}
    </div>
  );
}
