'use client';

/**
 * SearchDropdown
 * Search results dropdown component
 * - Keyboard navigation
 * - Highlight matching text
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { SearchResultDTO } from '@/lib/webhard-ui/types';
import { BG_COLOR, BORDER_COLOR, DIVIDE_COLOR, TEXT_COLOR } from '@/lib/styles';

export interface SearchDropdownProps {
  /** Search query */
  query: string;
  /** Is dropdown open */
  isOpen: boolean;
  /** Search results */
  searchResults: SearchResultDTO[];
  /** Is loading */
  isLoading?: boolean;
  /** Selected index */
  selectedIndex?: number;
  /** Result select handler */
  onSelectResult: (result: SearchResultDTO) => void;
  /** Close handler */
  onClose: () => void;
  /** Selected index change handler */
  onSelectedIndexChange?: (index: number) => void;
  /** Additional class name */
  className?: string;
  /** Labels */
  labels?: {
    resultsCount?: string;
    searching?: string;
    noResults?: string;
    noResultsHint?: string;
    folder?: string;
    selectHint?: string;
    enterHint?: string;
    escapeHint?: string;
  };
  /** File icon component */
  fileIcon?: React.ReactNode;
  /** Folder icon component */
  folderIcon?: React.ReactNode;
}

/**
 * Highlight text matching query (ignoring spaces)
 */
function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  // Normalize: remove spaces
  const normalizedQuery = query.replace(/\s+/g, '').toLowerCase();
  const normalizedText = text.replace(/\s+/g, '').toLowerCase();

  // Check if query is in normalized text
  if (!normalizedText.includes(normalizedQuery)) {
    return text;
  }

  // Find match position in normalized text
  const matchIndex = normalizedText.indexOf(normalizedQuery);
  if (matchIndex === -1) return text;

  // Find corresponding range in original text
  let normalizedPos = 0;
  let highlightStart = -1;
  let highlightEnd = -1;

  for (let i = 0; i < text.length; i++) {
    if (normalizedPos === matchIndex) {
      highlightStart = i;
    }
    if (normalizedPos === matchIndex + normalizedQuery.length) {
      highlightEnd = i;
      break;
    }

    // Only count non-space characters
    if (!/\s/.test(text[i])) {
      normalizedPos++;
    }
  }

  // highlightEnd not found (match goes to end)
  if (highlightEnd === -1) {
    highlightEnd = text.length;
  }

  if (highlightStart === -1) return text;

  const before = text.substring(0, highlightStart);
  const highlighted = text.substring(highlightStart, highlightEnd);
  const after = text.substring(highlightEnd);

  return (
    <>
      {before}
      <span className="text-orange-500 font-semibold">{highlighted}</span>
      {after}
    </>
  );
}

/**
 * Default file icon
 */
const DefaultFileIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
    <path
      fillRule="evenodd"
      d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
      clipRule="evenodd"
    />
  </svg>
);

/**
 * Default folder icon
 */
const DefaultFolderIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
  </svg>
);

/**
 * SearchDropdown component
 */
export function SearchDropdown({
  query,
  isOpen,
  searchResults,
  isLoading = false,
  selectedIndex: externalSelectedIndex = 0,
  onSelectResult,
  onClose,
  onSelectedIndexChange,
  className = '',
  labels = {},
  fileIcon,
  folderIcon,
}: SearchDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [localSelectedIndex, setLocalSelectedIndex] = useState(0);

  const selectedIndex = externalSelectedIndex ?? localSelectedIndex;

  const setSelectedIndex = useCallback(
    (value: number | ((prev: number) => number)) => {
      const newIndex = typeof value === 'function' ? value(selectedIndex) : value;
      if (onSelectedIndexChange) {
        onSelectedIndexChange(newIndex);
      } else {
        setLocalSelectedIndex(newIndex);
      }
    },
    [selectedIndex, onSelectedIndexChange]
  );

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchResults, setSelectedIndex]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen, onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen || searchResults.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % searchResults.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev === 0 ? searchResults.length - 1 : prev - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (searchResults[selectedIndex]) {
            onSelectResult(searchResults[selectedIndex]);
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [isOpen, searchResults, selectedIndex, onSelectResult, onClose, setSelectedIndex]
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  const {
    resultsCount = 'Search results: {count}',
    searching = 'Searching...',
    noResults = 'No results found.',
    noResultsHint = 'Try a different search term.',
    folder = 'Folder',
    selectHint = '↑↓ Select',
    enterHint = 'Enter',
    escapeHint = 'Esc Close',
  } = labels;

  const FileIcon = fileIcon || <DefaultFileIcon />;
  const FolderIcon = folderIcon || <DefaultFolderIcon />;

  if (!isOpen || query.length === 0) return null;

  return (
    <div
      ref={dropdownRef}
      className={`absolute top-full left-0 right-0 mt-2 ${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-lg shadow-xl z-50 max-h-[420px] overflow-hidden flex flex-col ${className}`}
    >
      {/* Header with result count */}
      {!isLoading && searchResults.length > 0 && (
        <div
          className={`px-4 py-2 ${BG_COLOR.page}/50 border-b ${BORDER_COLOR.default} flex justify-between items-center`}
        >
          <span className={`text-xs font-medium ${TEXT_COLOR.secondary}`}>
            {resultsCount.replace('{count}', String(searchResults.length))}
          </span>
        </div>
      )}

      {/* Results list */}
      {isLoading ? (
        <div className="px-4 py-6 text-center">
          <span className={`text-sm ${TEXT_COLOR.secondary}`}>{searching}</span>
        </div>
      ) : searchResults.length > 0 ? (
        <ul className={`overflow-y-auto flex-1 divide-y ${DIVIDE_COLOR.light}`}>
          {searchResults.map((result, index) => (
            <li
              key={`${result.type}-${result.id}`}
              className={`transition-colors ${
                index === selectedIndex ? BG_COLOR.info : `${BG_COLOR.hoverMuted}/30`
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  onSelectResult(result);
                  onClose();
                }}
                className="w-full px-4 py-3 text-left flex items-center gap-3 group"
              >
                <div
                  className={`flex-shrink-0 text-sm transition-colors ${
                    index === selectedIndex
                      ? 'text-orange-500'
                      : 'text-gray-400 group-hover:text-orange-500'
                  }`}
                >
                  {result.type === 'folder' ? FolderIcon : FileIcon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${TEXT_COLOR.primary} truncate`}>
                    {highlightText(result.original_name || result.name, query)}
                  </div>
                  <div className={`text-xs ${TEXT_COLOR.secondary} truncate`}>
                    {result.type === 'folder' ? (
                      <span>📁 {folder}</span>
                    ) : (
                      <span>{result.path || '/'}</span>
                    )}
                  </div>
                </div>
                {result.type === 'file' && result.size && (
                  <div className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                    {(result.size / 1024 / 1024).toFixed(1)} MB
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className={`p-6 text-center text-sm ${TEXT_COLOR.secondary}`}>
          <div className="mb-2">{noResults}</div>
          <div className="text-xs">{noResultsHint}</div>
        </div>
      )}

      {/* Footer hint */}
      {searchResults.length > 0 && !isLoading && (
        <div
          className={`px-3 py-2 ${BG_COLOR.page}/50 border-t ${BORDER_COLOR.default} text-[10px] ${TEXT_COLOR.secondary} flex justify-between items-center`}
        >
          <span>{selectHint}</span>
          <span>{enterHint}</span>
          <span>{escapeHint}</span>
        </div>
      )}
    </div>
  );
}

export default SearchDropdown;
