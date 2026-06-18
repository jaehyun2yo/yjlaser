'use client';

import { useEffect, useRef, useState } from 'react';
import { FaFile, FaFolder } from 'react-icons/fa';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useWebhardHighlightStore } from '@/store/webhard/useWebhardHighlightStore';
import type { SearchResultDTO } from '@/app/webhard/_lib/types';
import {
  highlightText,
  formatBreadcrumbPath,
  buildSearchNavigationUrl,
} from '@/app/webhard/_lib/searchUtils';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

interface SearchDropdownProps {
  query: string;
  isOpen: boolean;
  onSelectResult: (result: SearchResultDTO) => void;
  onClose: () => void;
  selectedIndex?: number;
  onSelectedIndexChange?: (index: number) => void;
  searchResults: SearchResultDTO[];
  isLoading?: boolean;
  /** 폴더 클릭 시 직접 폴더 상태를 업데이트하는 콜백 */
  onFolderNavigate?: (folderId: string | null) => void;
}

export function SearchDropdown({
  query,
  isOpen,
  onSelectResult,
  onClose,
  selectedIndex: externalSelectedIndex = 0,
  onSelectedIndexChange,
  searchResults,
  isLoading = false,
  onFolderNavigate,
}: SearchDropdownProps) {
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [localSelectedIndex, setLocalSelectedIndex] = useState(0);

  const selectedIndex = externalSelectedIndex ?? localSelectedIndex;

  const setSelectedIndex = (value: number | ((prev: number) => number)) => {
    const newIndex = typeof value === 'function' ? value(selectedIndex) : value;
    if (onSelectedIndexChange) {
      onSelectedIndexChange(newIndex);
    } else {
      setLocalSelectedIndex(newIndex);
    }
  };

  // 검색 결과가 변경될 때 selectedIndex 초기화
  useEffect(() => {
    setSelectedIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchResults]);

  // 외부 클릭으로 드롭다운 닫기
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

  // 키보드 네비게이션
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
          handleResultClick(searchResults[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  const handleResultClick = (result: SearchResultDTO) => {
    onSelectResult(result);

    if (result.type === 'folder') {
      // 폴더: onFolderNavigate 콜백으로 직접 상태 업데이트 (searchParams 가드 우회)
      // onClose 전에 호출하여 상태 업데이트 보장
      onFolderNavigate?.(result.id);
    } else {
      // 파일: 하이라이트 후 router.push로 해당 폴더로 이동
      const { setHighlight, clearHighlight } = useWebhardHighlightStore.getState();
      setHighlight(result.id, result.type);
      setTimeout(() => clearHighlight(), 3000);
      router.push(buildSearchNavigationUrl(result));
    }

    onClose();
  };

  // Expose keyboard handler globally for search input
  useEffect(() => {
    if (isOpen) {
      const win = window as unknown as Record<string, unknown>;
      win.__searchDropdownKeyDown = handleKeyDown;
    }
    return () => {
      const win = window as unknown as Record<string, unknown>;
      delete win.__searchDropdownKeyDown;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && query.length > 0 && (
        <motion.div
          ref={dropdownRef}
          data-testid="webhard-search-dropdown"
          initial={{ opacity: 0, y: -8, scaleY: 0.95 }}
          animate={{ opacity: 1, y: 0, scaleY: 1 }}
          exit={{ opacity: 0, y: -8, scaleY: 0.95 }}
          transition={{ duration: 0.12 }}
          className={`absolute top-full left-0 right-0 mt-2 ${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-lg shadow-xl z-50 max-h-[420px] overflow-hidden flex flex-col`}
          style={{ transformOrigin: 'top' }}
        >
          {/* Header with result count */}
          {!isLoading && searchResults.length > 0 && (
            <div
              className={`px-4 py-2 ${BG_COLOR.page} border-b ${BORDER_COLOR.default} flex justify-between items-center`}
            >
              <span className={`text-xs font-medium ${TEXT_COLOR.secondary}`}>
                검색 결과: {searchResults.length}개
              </span>
            </div>
          )}

          {/* Results list */}
          {isLoading ? (
            <div className="px-4 py-6 text-center">
              <span className={`text-sm ${TEXT_COLOR.muted}`}>검색 중...</span>
            </div>
          ) : searchResults.length > 0 ? (
            <ul
              role="listbox"
              aria-label="검색 결과"
              className={`overflow-y-auto flex-1 divide-y ${BORDER_COLOR.light}`}
            >
              {searchResults.map((result, index) => (
                <li
                  key={`${result.type}-${result.id}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  className={`transition-colors ${
                    index === selectedIndex ? BG_COLOR.info : BG_COLOR.hoverMuted
                  }`}
                >
                  <button
                    onClick={() => handleResultClick(result)}
                    className="w-full px-4 py-3 text-left flex items-center gap-3 group"
                  >
                    <div
                      className={`flex-shrink-0 text-sm transition-colors ${
                        index === selectedIndex
                          ? 'text-[#ED6C00]'
                          : 'text-gray-400 group-hover:text-[#ED6C00]'
                      }`}
                    >
                      {result.type === 'folder' ? <FaFolder /> : <FaFile />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm ${TEXT_COLOR.primary} truncate`}>
                        {highlightText(result.original_name || result.name, query)}
                      </div>
                      <div className={`text-xs ${TEXT_COLOR.muted} truncate`}>
                        📁 {formatBreadcrumbPath(result.path)}
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
            <div className={`p-6 text-center text-sm ${TEXT_COLOR.muted}`}>
              <div className="mb-2">검색 결과가 없습니다.</div>
              <div className="text-xs">다른 검색어를 시도해보세요.</div>
            </div>
          )}

          {/* Footer hint */}
          {searchResults.length > 0 && !isLoading && (
            <div
              className={`px-3 py-2 ${BG_COLOR.page} border-t ${BORDER_COLOR.default} text-[10px] ${TEXT_COLOR.muted} flex justify-between items-center`}
            >
              <span>↑↓ 선택</span>
              <span>Enter 입력</span>
              <span>Esc 닫기</span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
